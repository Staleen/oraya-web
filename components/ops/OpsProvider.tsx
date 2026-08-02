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

interface Ctx {
  status: Status;
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
        if (!r.ok) { setStatus("unreachable"); setLoading(false); return; }
        const body = (await r.json()) as { staff: Me };
        setMe(body.staff);
        await refresh();
      } catch {
        // A network blip is not a sign-out — never show the login form for it.
        if (!cancelled) { setStatus("unreachable"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    if (status !== "ready") return;
    const id = window.setInterval(() => { if (!pausedRef.current) void refresh(); }, POLL_MS);
    return () => clearInterval(id);
  }, [status, refresh]);

  const signIn = useCallback((who: Me) => { setMe(who); void refresh(); }, [refresh]);

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
    status, me, bookings, leads, calendarSources, loadError, loading,
    refresh, signIn, signOut, signOutError, pausePolling,
  }), [status, me, bookings, leads, calendarSources, loadError, loading, refresh, signIn, signOut, signOutError, pausePolling]);

  return <OpsCtx.Provider value={value}>{children}</OpsCtx.Provider>;
}
