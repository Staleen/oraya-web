"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import PasswordGate from "@/components/admin/PasswordGate";
import { SESSION_KEY } from "@/components/admin/theme";
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

export default function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const ok = sessionStorage.getItem(SESSION_KEY) === "1";
    setAuthed(ok);
  }, []);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/admin/data", { cache: "no-store" });
      const text = await r.text();
      console.log("[admin] /api/admin/data raw response:", text);
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response (${r.status}): ${text.slice(0, 200)}`);
      }
      if (d.error) {
        console.error("[admin] data error from API:", d.error);
        setError(d.error as string);
        return;
      }
      console.log(`[admin] loaded ${(d.bookings as unknown[])?.length ?? 0} bookings, ${(d.members as unknown[])?.length ?? 0} members`);
      setBookings((d.bookings as Booking[]) ?? []);
      setMembers((d.members as Member[]) ?? []);
      setCalendarSources((d.calendar_sources as CalendarSource[]) ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[admin] fetch error:", msg);
      setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (authed !== true) return;
    loadData();
  }, [authed]);

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
  }

  const value = useMemo<AdminDataContextValue>(() => ({
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
  }), [authed, bookings, members, calendarSources, loading, error]);

  if (authed === null) return null;
  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  );
}
