"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { QueueBooking, QueueLead } from "@/lib/ops-queue";
import type { StaffRole } from "@/lib/ops-auth";

export interface Me { id: string; email: string; full_name: string; role: StaffRole }
export interface CalendarSource {
  id: string; villa: string | null; source_name: string | null; is_enabled: boolean;
  last_synced_at: string | null; last_sync_status: string | null; last_error: string | null;
}

type Status = "checking" | "signed-out" | "unreachable" | "ready";

/**
 * Why the session check failed, in the server's own words where it gave them.
 * "Can't reach Oraya" is true for a dropped connection but actively misleading
 * for a 503 that told us exactly what was wrong — e.g. a missing ADMIN_SECRET.
 */
export type BlockedReason = { kind: "offline" } | { kind: "server"; message: string; status: number };

interface Ctx {
  status: Status;
  blocked: BlockedReason | null;
  me: Me | null;
  bookings: QueueBooking[];
  leads: QueueLead[];
  calendarSources: CalendarSource[];
  loadError: string;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (me: Me) => void;
  signOut: () => Promise<void>;
  signOutError: string;
  pausePolling: (paused: boolean) => void;
}

const OpsCtx = createContext<Ctx | null>(null);
export function useOps(): Ctx {
  const v = useContext(OpsCtx);
  if (!v) throw new Error("useOps must be used inside OpsProvider");
  return v;
}

const INIT: RequestInit = { credentials: "include", cache: "no-store" };
const POLL_MS = 45000;

export function OpsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [me, setMe] = useState<Me | null>(null);
  const [bookings, setBookings] = useState<QueueBooking[]>([]);
  const [leads, setLeads] = useState<QueueLead[]>([]);
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [signOutError, setSignOutError] = useState("");
  const [blocked, setBlocked] = useState<BlockedReason | null>(null);
  const pausedRef = useRef(false);

  const pausePolling = useCallback((p: boolean) => { pausedRef.current = p; }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ops/data", INIT);
      if (r.status === 401) { setStatus("signed-out"); setMe(null); return; }
      const body = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        // Keep whatever was already on screen; an error must not masquerade as
        // an empty day.
        setLoadError(typeof body.error === "string" ? body.error : "Could not load your work.");
        return;
      }
      setBookings((body.bookings as QueueBooking[]) ?? []);
      setLeads((body.leads as QueueLead[]) ?? []);
      setCalendarSources((body.calendar_sources as CalendarSource[]) ?? []);
      if (body.me) setMe(body.me as Me);
      setLoadError("");
      setStatus("ready");
    } catch {
      setLoadError("Couldn't reach Oraya. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/ops/me", INIT);
        if (cancelled) return;
        if (r.status === 401) { setStatus("signed-out"); setLoading(false); return; }
        if (!r.ok) {
          let message = "";
          try {
            const body = (await r.json()) as { error?: string };
            if (typeof body.error === "string") message = body.error;
          } catch {
            /* non-JSON error body — fall back to the generic wording */
          }
          setBlocked({ kind: "server", message, status: r.status });
          setStatus("unreachable");
          setLoading(false);
          return;
        }
        const body = (await r.json()) as { staff: Me };
        setMe(body.staff);
        await refresh();
      } catch {
        // A network blip is not a sign-out — never show the login form for it.
        if (!cancelled) { setBlocked({ kind: "offline" }); setStatus("unreachable"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    if (status !== "ready") return;
    const id = window.setInterval(() => { if (!pausedRef.current) void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, [status, refresh]);

  const signIn = useCallback((who: Me) => {
    // The login call already proved the session is valid, so authentication is
    // settled here. Leaving status at "signed-out" until the first data load
    // succeeded meant any failure in /api/ops/data silently returned the
    // person to the login form — looking exactly like a rejected password.
    setMe(who);
    setBlocked(null);
    setStatus("ready");
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    setSignOutError("");
    try {
      const r = await fetch("/api/ops/logout", { ...INIT, method: "POST" });
      if (!r.ok) { setSignOutError("Sign out failed — you may still be signed in. Try again."); return; }
    } catch {
      setSignOutError("Sign out couldn't reach the server — you may still be signed in. Try again.");
      return;
    }
    setMe(null); setBookings([]); setLeads([]); setCalendarSources([]);
    setStatus("signed-out");
  }, []);

  const value = useMemo<Ctx>(() => ({
    status, blocked, me, bookings, leads, calendarSources, loadError, loading,
    refresh, signIn, signOut, signOutError, pausePolling,
  }), [status, blocked, me, bookings, leads, calendarSources, loadError, loading, refresh, signIn, signOut, signOutError, pausePolling]);

  return <OpsCtx.Provider value={value}>{children}</OpsCtx.Provider>;
}
