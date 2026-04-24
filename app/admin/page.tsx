"use client";
import { useEffect, useState } from "react";
import OrayaEmblem from "@/components/OrayaEmblem";
import MediaManager from "@/components/MediaManager";
import AddonsEditor from "@/components/admin/AddonsEditor";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import BookingsTable from "@/components/admin/BookingsTable";
import CalendarSyncPanel from "@/components/admin/CalendarSyncPanel";
import MembersTable from "@/components/admin/MembersTable";
import SettingsSections from "@/components/admin/SettingsSections";
import StatsStrip from "@/components/admin/StatsStrip";
import { BORDER, GOLD, MUTED, PLAYFAIR, WHITE, LATO } from "@/components/admin/theme";
import type { Addon } from "@/components/admin/types";

export default function AdminPage() {
  const {
    authed,
    bookings,
    setBookings,
    members,
    setMembers,
    calendarSources,
    loading,
    error,
    setError,
    loadData,
    signOut,
  } = useAdminData();
  const [tab, setTab] = useState<"bookings" | "members">("bookings");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed" | "cancelled">("all");
  const [villaFilter, setVillaFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [emailWarnings, setEmailWarnings] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(false);

  const [whatsappNum, setWhatsappNum] = useState("");
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonsSaving, setAddonsSaving] = useState(false);
  const [addonsSaved, setAddonsSaved] = useState(false);

  const [notifEmails, setNotifEmails] = useState("");
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
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

  useEffect(() => {
    if (authed !== true) return;

    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows = d.settings ?? [];
        const wa = rows.find((s: { key: string; value: string }) => s.key === "whatsapp_number");
        if (wa) setWhatsappNum(wa.value);
        const ne = rows.find((s: { key: string; value: string }) => s.key === "notification_emails");
        if (ne) setNotifEmails(ne.value);
      })
      .catch((e) => console.error("[admin] settings fetch error:", e));

    fetch("/api/addons", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.addons)) setAddons(d.addons); })
      .catch((e) => console.error("[admin] addons fetch error:", e));
  }, [authed]);

  async function saveWhatsapp() {
    setWhatsappSaving(true);
    setWhatsappSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "whatsapp_number", value: whatsappNum }),
    });
    setWhatsappSaving(false);
    if (res.ok) {
      setWhatsappSaved(true);
      setTimeout(() => setWhatsappSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save.");
    }
  }

  async function savePassword() {
    if (!newPassword.trim()) return;
    setPwSaving(true);
    setPwSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "admin_password", value: newPassword }),
    });
    setPwSaving(false);
    if (res.ok) {
      setPwSaved(true);
      setNewPassword("");
      setTimeout(() => setPwSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save password.");
    }
  }

  async function saveNotifEmails() {
    setNotifSaving(true);
    setNotifSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "notification_emails", value: notifEmails }),
    });
    setNotifSaving(false);
    if (res.ok) {
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save notification emails.");
    }
  }

  function updateAddon(id: string, patch: Partial<Addon>) {
    setAddons((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a));
    setAddonsSaved(false);
  }

  async function saveAddons() {
    setAddonsSaving(true);
    setAddonsSaved(false);
    const res = await fetch("/api/admin/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addons }),
    });
    setAddonsSaving(false);
    if (res.ok) {
      setAddonsSaved(true);
      setTimeout(() => setAddonsSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save add-ons.");
    }
  }

  async function deleteMember(id: string, name: string) {
    if (!confirm(`Delete member "${name}"? This will permanently remove their account and they will not be able to sign in again.`)) return;
    setDeletingId(id);
    const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to delete member.");
    }
  }

  async function updateStatus(id: string, status: "confirmed" | "cancelled") {
    const label = status === "confirmed" ? "confirm" : "cancel";
    if (!confirm(`Are you sure you want to ${label} this booking?`)) return;

    setError("");
    setUpdatingId(id);

    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const d = await res.json();
    setUpdatingId(null);

    if (!res.ok) {
      setError(d.error ?? "Failed to update status.");
    } else {
      setEmailWarnings((prev) => {
        const next = { ...prev };
        if (d.email_sent === false) next[id] = "Booking updated but email was not sent";
        else delete next[id];
        return next;
      });
      if (d.booking) {
        setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: d.booking.status } : b)));
      }
      loadData(true);
    }
  }

  async function runCalendarSync() {
    setSyncingCalendars(true);
    setSyncMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/calendar-sync/run", { method: "POST" });
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

  const tabBtn = (t: "bookings" | "members", label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{
        fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px",
        textTransform: "uppercase", color: tab === t ? GOLD : MUTED,
        backgroundColor: "transparent", border: "none",
        borderBottom: tab === t ? `1px solid ${GOLD}` : "1px solid transparent",
        padding: "10px 0", cursor: "pointer", marginRight: "2rem",
      }}
    >
      {label}
    </button>
  );

  const villaOptions = Array.from(new Set(bookings.map((b) => b.villa))).sort();
  const filteredBookings = bookings.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (villaFilter !== "all" && b.villa !== villaFilter) return false;
    if (dateFilter && b.check_in !== dateFilter) return false;
    return true;
  });

  function clearFilters() {
    setStatusFilter("all");
    setVillaFilter("all");
    setDateFilter("");
  }

  return (
    <main style={{ backgroundColor: "#1F2B38", minHeight: "100vh", padding: "0" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1.25rem 2.5rem", borderBottom: `0.5px solid ${BORDER}`,
        backgroundColor: "rgba(31,43,56,0.98)", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <a href="/" style={{ display: "block", width: "32px", cursor: "pointer" }}><OrayaEmblem /></a>
          <div>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
              Oraya
            </p>
            <p style={{ fontFamily: PLAYFAIR, fontSize: "15px", color: WHITE, margin: 0, lineHeight: 1.2 }}>
              Admin dashboard
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <a
            href="/"
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
          >
            Back to site
          </a>
          <button
            onClick={signOut}
            style={{
              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase", color: MUTED, backgroundColor: "transparent",
              border: "none", cursor: "pointer", padding: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#e07070"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = MUTED; }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ padding: "2.5rem" }}>
        <SettingsSections
          whatsappNum={whatsappNum}
          setWhatsappNum={(value) => { setWhatsappNum(value); setWhatsappSaved(false); }}
          whatsappSaving={whatsappSaving}
          whatsappSaved={whatsappSaved}
          saveWhatsapp={saveWhatsapp}
          newPassword={newPassword}
          setNewPassword={(value) => { setNewPassword(value); setPwSaved(false); }}
          pwSaving={pwSaving}
          pwSaved={pwSaved}
          savePassword={savePassword}
          notifEmails={notifEmails}
          setNotifEmails={(value) => { setNotifEmails(value); setNotifSaved(false); }}
          notifSaving={notifSaving}
          notifSaved={notifSaved}
          saveNotifEmails={saveNotifEmails}
        />

        <AddonsEditor
          addons={addons}
          addonsSaving={addonsSaving}
          addonsSaved={addonsSaved}
          updateAddon={updateAddon}
          saveAddons={saveAddons}
        />

        <MediaManager />

        <StatsStrip bookings={bookings} members={members} loading={loading} />

        <CalendarSyncPanel
          calendarSources={calendarSources}
          syncingCalendars={syncingCalendars}
          syncMessage={syncMessage}
          isMobile={isMobile}
          runCalendarSync={runCalendarSync}
        />

        {error && (
          <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
            Error: {error}
          </p>
        )}

        <div style={{ borderBottom: `0.5px solid ${BORDER}`, marginBottom: "1.5rem" }}>
          {tabBtn("bookings", `Bookings (${bookings.length})`)}
          {tabBtn("members", `Members (${members.length})`)}
        </div>

        {tab === "bookings" && (
          <BookingsTable
            loading={loading}
            filteredBookings={filteredBookings}
            members={members}
            isMobile={isMobile}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            villaFilter={villaFilter}
            setVillaFilter={setVillaFilter}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            clearFilters={clearFilters}
            villaOptions={villaOptions}
            updatingId={updatingId}
            updateStatus={updateStatus}
            emailWarnings={emailWarnings}
          />
        )}

        {tab === "members" && (
          <MembersTable
            loading={loading}
            members={members}
            deletingId={deletingId}
            deleteMember={deleteMember}
          />
        )}
      </div>
    </main>
  );
}
