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
  signOut: () => void;
}

const AdminDataContext = createContext<AdminDataContextValue | null>(null);

export function useAdminData() {
  const value = useContext(AdminDataContext);
  if (!value) throw new Error("useAdminData must be used within AdminDataProvider");
  return value;
}

type ToastItem = { id: number; text: string };

function AdminToastStack({ items }: { items: ToastItem[] }) {
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
          style={{
            pointerEvents: "none",
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
          {t.text}
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

  const bookingsRef = useRef<Booking[]>([]);
  const initialLoadFinishedRef = useRef(false);
  const silentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  const pushToast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  const loadData = useCallback(
    async (silent = false) => {
      const before = bookingsRef.current;
      if (!silent) setLoading(true);
      try {
        const r = await fetch("/api/admin/data", adminApiFetchInit);
        const text = await r.text();
        if (!silent) console.log("[admin] /api/admin/data raw response:", text);
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
        if (!silent) {
          console.log(
            `[admin] loaded ${(d.bookings as unknown[])?.length ?? 0} bookings, ${(d.members as unknown[])?.length ?? 0} members`,
          );
        }
        const nb = (d.bookings as Booking[]) ?? [];
        const ms = (d.members as Member[]) ?? [];
        const cs = (d.calendar_sources as CalendarSource[]) ?? [];

        setBookings(nb);
        setMembers(ms);
        setCalendarSources(cs);

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
      void loadData(true);
    }, 400);
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/data", adminApiFetchInit);
        if (cancelled) return;
        if (r.ok) {
          setAuthed(true);
        } else {
          setAuthed(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAuthed(false);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authed !== true) return;
    void loadData(false);
  }, [authed, loadData]);

  /** Background polling — reliable refresh without page reload (Realtime may not deliver under RLS). */
  useEffect(() => {
    if (authed !== true) return;
    const id = window.setInterval(() => void loadData(true), 45000);
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
    return () => {
      if (silentDebounceRef.current) clearTimeout(silentDebounceRef.current);
    };
  }, []);

  function signOut() {
    void fetch("/api/admin/logout", { ...adminApiFetchInit, method: "POST" });
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
    }),
    [authed, bookings, members, calendarSources, loading, error, loadData],
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
  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;

  return (
    <AdminDataContext.Provider value={value}>
      <AdminToastStack items={toasts} />
      {children}
    </AdminDataContext.Provider>
  );
}
