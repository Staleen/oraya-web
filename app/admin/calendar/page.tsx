"use client";
import { useEffect, useState } from "react";
import CalendarSyncPanel from "@/components/admin/CalendarSyncPanel";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";

export default function AdminCalendarPage() {
  const { calendarSources, error, setError, loadData } = useAdminData();
  const [isMobile, setIsMobile] = useState(false);
  const [syncingCalendars, setSyncingCalendars] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    function syncViewport() {
      setIsMobile(window.innerWidth <= 768);
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  async function runCalendarSync() {
    setSyncingCalendars(true);
    setSyncMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/calendar-sync/run", { ...adminApiFetchInit, method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Calendar sync failed.");
      } else {
        setSyncMessage(`Synced ${data.sources_processed} source(s), upserted ${data.blocks_upserted} block(s), ${data.sources_failed} failed.`);
        loadData(true);
      }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      setError(message);
    } finally {
      setSyncingCalendars(false);
    }
  }

  return (
    <>
      <CalendarSyncPanel
        calendarSources={calendarSources}
        syncingCalendars={syncingCalendars}
        syncMessage={syncMessage}
        isMobile={isMobile}
        runCalendarSync={runCalendarSync}
      />
      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: 0 }}>
          Error: {error}
        </p>
      )}
    </>
  );
}
