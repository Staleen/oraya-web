"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import PasswordGate from "@/components/admin/PasswordGate";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";
import { BORDER, GOLD, MIDNIGHT, SESSION_KEY } from "@/components/admin/theme";
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
      {children}
    </AdminDataContext.Provider>
  );
}
