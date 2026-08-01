"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PasswordGate from "@/components/admin/PasswordGate";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";
import { adminApiFetchInit } from "@/lib/admin-auth";
import { diffBookingsForToast } from "@/lib/admin-booking-diff";
import { supabase } from "@/lib/supabase";
import { BORDER, GOLD, LATO, MIDNIGHT } from "@/components/admin/theme";
import type { Booking, CalendarSource, Member } from "@/components/admin/types";

interface AdminDataContextValue {
  authed: boolean | null;
  setAuthed: React.Dispatch<React.SetStateAction<boolean | null>>;
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  calendarSources: CalendarSource[];
  setCalendarSources: React.Dispatch<React.SetStateAction<CalendarSource[]>>;
  loading: boolean;
  error: string;
  setError: React.Dispatch<React.SetStateAction<string>>;
  loadData: (silent?: boolean) => Promise<void>;
  /** X-3: awaited — resolves only after the logout request settles. */
  signOut: () => Promise<void>;
  /**
   * Remediation 5.2 — pause the 45s background poll (e.g. while a payment
   * edit is in flight) so a poll response can't clobber optimistic state.
   */
  setPollingPaused: (paused: boolean) => void;
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

export function useAdminData() {
  const value = useContext(AdminDataContext);
  if (!value) throw new Error("useAdminData must be used within AdminDataProvider");
  return value;
}

type ToastItem = { id: number; text: string };

/** X-6 — auto-dismiss delay; paused while a toast is hovered. */
const TOAST_TTL_MS = 4500;

function AdminToastStack({
  items,
  onDismiss,
  onHold,
  onResume,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
  onHold: (id: number) => void;
  onResume: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 10050,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxWidth: "min(420px, calc(100vw - 48px))",
        pointerEvents: "none",
      }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          onMouseEnter={() => onHold(t.id)}
          onMouseLeave={() => onResume(t.id)}
          style={{
            // X-6: the stack container keeps pointerEvents:"none" so it never
            // blocks the page; individual toasts opt back in so they can be
            // hovered (pausing auto-dismiss) and closed.
            pointerEvents: "auto",
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            border: `0.5px solid ${GOLD}`,
            backgroundColor: "rgba(31,43,56,0.96)",
            color: "#eae3d9",
            fontFamily: LATO,
            fontSize: "13px",
            fontWeight: 300,
            padding: "12px 16px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
            lineHeight: 1.45,
          }}
        >
          <span style={{ flex: 1 }}>{t.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            style={{
              background: "none",
              border: "none",
              color: GOLD,
              cursor: "pointer",
              fontFamily: LATO,
              fontSize: "16px",
              lineHeight: 1,
              padding: "0 2px",
              flexShrink: 0,
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

export default function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  /**
   * X-5 — distinguishes "the auth probe could not reach the server" from
   * "the server said 401". Only the latter means signed out.
   */
  const [probeFailed, setProbeFailed] = useState(false);
  const [probeNonce, setProbeNonce] = useState(0);

  const bookingsRef = useRef<Booking[]>([]);
  const initialLoadFinishedRef = useRef(false);
  const silentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollPausedRef = useRef(false);
  const toastTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const setPollingPaused = useCallback((paused: boolean) => {
    pollPausedRef.current = paused;
  }, []);

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  /** X-6 — auto-dismiss timers are held per toast so hover can pause them. */
  const armToastTimer = useCallback(
    (id: number) => {
      const existing = toastTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(() => {
        toastTimersRef.current.delete(id);
        removeToast(id);
      }, TOAST_TTL_MS);
      toastTimersRef.current.set(id, handle);
    },
    [removeToast],
  );

  const holdToastTimer = useCallback((id: number) => {
    const existing = toastTimersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      toastTimersRef.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback(
    (id: number) => {
      holdToastTimer(id);
      removeToast(id);
    },
    [holdToastTimer, removeToast],
  );

  const pushToast = useCallback(
    (text: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, text }]);
      armToastTimer(id);
    },
    [armToastTimer],
  );

  const loadData = useCallback(
    async (silent = false) => {
      const before = bookingsRef.current;
      if (!silent) setLoading(true);
      try {
        const r = await fetch("/api/admin/data", adminApiFetchInit);
        const text = await r.text();
        // Remediation 2.4: raw payload contains guest PII — dev-only logging.
        if (!silent && process.env.NODE_ENV !== "production") {
          console.log("[admin] /api/admin/data raw response:", text);
        }
        let d: Record<string, unknown>;
        try {
          d = JSON.parse(text);
        } catch {
          throw new Error(`Non-JSON response (${r.status}): ${text.slice(0, 200)}`);
        }
        if (d.error) {
          console.error("[admin] data error from API:", d.error);
          setError(d.error as string);
          if (r.status === 401) setAuthed(false);
          return;
        }
        // X-1 — the load succeeded, so any message left by an earlier failure is
        // now false. Without this, one transient poll failure pins an error
        // banner to every admin page until a full reload.
        setError("");
        if (!silent) {
          console.log(
            `[admin] loaded ${(d.bookings as unknown[])?.length ?? 0} bookings, ${(d.members as unknown[])?.length ?? 0} members`,
          );
        }
        const nb = (d.bookings as Booking[]) ?? [];
        const ms = (d.members as Member[]) ?? [];
        const cs = (d.calendar_sources as CalendarSource[]) ?? [];

        // Remediation 5.2 — skip state updates when the payload is deep-equal
        // to current state so the 45s poll doesn't re-render the admin views
        // for identical data. Returning `prev` makes React bail out.
        setBookings((prev) => (JSON.stringify(prev) === JSON.stringify(nb) ? prev : nb));
        setMembers((prev) => (JSON.stringify(prev) === JSON.stringify(ms) ? prev : ms));
        setCalendarSources((prev) => (JSON.stringify(prev) === JSON.stringify(cs) ? prev : cs));

        if (silent && initialLoadFinishedRef.current) {
          const msg = diffBookingsForToast(before, nb);
          if (msg) pushToast(msg);
        }
        initialLoadFinishedRef.current = true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[admin] fetch error:", msg);
        setError(msg);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [pushToast],
  );

  const scheduleSilentLoad = useCallback(() => {
    if (silentDebounceRef.current) clearTimeout(silentDebounceRef.current);
    silentDebounceRef.current = setTimeout(() => {
      silentDebounceRef.current = null;
      // X-2 — Realtime-triggered loads must honour the same pause as the 45s
      // poll. Without this, a silent load can resolve mid-edit and clobber
      // optimistic state — the exact race Remediation 5.2 exists to prevent.
      // Dropping the event is safe: the poll re-syncs once the pause lifts.
      if (pollPausedRef.current) return;
      void loadData(true);
    }, 400);
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/data", adminApiFetchInit);
        if (cancelled) return;
        setProbeFailed(false);
        if (r.ok) {
          setAuthed(true);
        } else {
          setAuthed(false);
          setLoading(false);
        }
      } catch {
        // X-5 — a network blip is not a sign-out. Falling through to
        // PasswordGate here would show "logged out" to an operator with a valid
        // session, and their password retry would fail just as confusingly.
        if (!cancelled) {
          setProbeFailed(true);
          setAuthed(false);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [probeNonce]);

  useEffect(() => {
    if (authed !== true) return;
    void loadData(false);
  }, [authed, loadData]);

  /** Background polling — reliable refresh without page reload (Realtime may not deliver under RLS). */
  useEffect(() => {
    if (authed !== true) return;
    const id = window.setInterval(() => {
      // Remediation 5.2 — hold the poll while an edit is in flight.
      if (pollPausedRef.current) return;
      void loadData(true);
    }, 45000);
    return () => clearInterval(id);
  }, [authed, loadData]);

  /** Supabase Realtime — best-effort; falls back to polling if unavailable or blocked by RLS. */
  useEffect(() => {
    if (authed !== true) return;
    const ch = supabase
      .channel("admin-bookings-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => scheduleSilentLoad(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[admin] Realtime subscribed to public.bookings (polling remains active as fallback)");
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "[admin] Realtime unavailable for bookings; using polling only. Enable `supabase_realtime` publication on `bookings` and Realtime in the Supabase project; note anonymous clients only receive events for rows allowed by RLS.",
          );
        }
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [authed, scheduleSilentLoad]);

  useEffect(() => {
    const toastTimers = toastTimersRef.current;
    return () => {
      if (silentDebounceRef.current) clearTimeout(silentDebounceRef.current);
      toastTimers.forEach((handle) => clearTimeout(handle));
      toastTimers.clear();
    };
  }, []);

  async function signOut() {
    // X-3 — the 7-day `oraya_admin` cookie is what actually ends the session.
    // Clearing local state before knowing the request succeeded tells the
    // operator they are signed out while the cookie may still authenticate the
    // next visit — dangerous on a shared machine. Stay signed in and report.
    try {
      const r = await fetch("/api/admin/logout", { ...adminApiFetchInit, method: "POST" });
      if (!r.ok) {
        setError("Sign out failed — you may still be signed in on this device. Try again.");
        return;
      }
    } catch {
      setError("Sign out could not reach the server — you may still be signed in on this device. Try again.");
      return;
    }
    setAuthed(false);
    setLoading(false);
    initialLoadFinishedRef.current = false;
    bookingsRef.current = [];
    setBookings([]);
    setMembers([]);
    setCalendarSources([]);
    setToasts([]);
  }

  const value = useMemo<AdminDataContextValue>(
    () => ({
      authed,
      setAuthed,
      bookings,
      setBookings,
      members,
      setMembers,
      calendarSources,
      setCalendarSources,
      loading,
      error,
      setError,
      loadData,
      signOut,
      setPollingPaused,
    }),
    [authed, bookings, members, calendarSources, loading, error, loadData, setPollingPaused],
  );

  if (authed === null) {
    return (
      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px" }}>
        <div style={{ width: "100%", maxWidth: "980px", margin: "0 auto" }} aria-hidden="true">
          <SkeletonText width="160px" height="10px" style={{ marginBottom: "18px" }} />
          <SkeletonBlock width="280px" height="42px" style={{ marginBottom: "28px" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "2rem" }}>
            {[0, 1, 2, 3].map((item) => (
              <div key={item} style={{ border: `0.5px solid ${BORDER}`, padding: "1.25rem", backgroundColor: "rgba(255,255,255,0.03)" }}>
                <SkeletonText width="70%" height="10px" style={{ marginBottom: "14px" }} />
                <SkeletonBlock width="56px" height="34px" style={{ borderColor: "rgba(197,164,109,0.12)" }} />
              </div>
            ))}
          </div>
          <SkeletonBlock height="360px" style={{ border: `0.5px solid ${BORDER}`, background: "linear-gradient(90deg, rgba(255,255,255,0.025), rgba(197,164,109,0.075), rgba(255,255,255,0.025))" }} />
          <SkeletonBlock width="40px" height="1px" style={{ background: GOLD, opacity: 0.35, marginTop: "24px" }} />
        </div>
      </main>
    );
  }
  if (!authed && probeFailed) {
    // X-5 — the probe threw (offline, DNS, proxy), so we do not know whether the
    // session is valid. Showing PasswordGate here would assert "signed out",
    // which is not established.
    return (
      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px" }}>
        <div
          role="alert"
          style={{
            width: "100%",
            maxWidth: "520px",
            margin: "0 auto",
            border: `0.5px solid ${BORDER}`,
            backgroundColor: "rgba(255,255,255,0.03)",
            padding: "32px",
          }}
        >
          <h1 style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 14px" }}>
            Can&apos;t reach the server
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "14px", fontWeight: 300, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, margin: "0 0 22px" }}>
            The admin could not contact Oraya to check your session. This is a connection problem — you have not been
            signed out. Check your network and try again.
          </p>
          <button
            type="button"
            onClick={() => {
              setProbeFailed(false);
              setAuthed(null);
              setLoading(true);
              setProbeNonce((n) => n + 1);
            }}
            style={{
              fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase",
              backgroundColor: GOLD, color: MIDNIGHT, border: "none", padding: "12px 24px", cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }
  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;

  return (
    <AdminDataContext.Provider value={value}>
      <AdminToastStack
        items={toasts}
        onDismiss={dismissToast}
        onHold={holdToastTimer}
        onResume={armToastTimer}
      />
      {children}
    </AdminDataContext.Provider>
  );
}
