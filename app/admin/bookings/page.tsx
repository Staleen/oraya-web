"use client";
import { useEffect, useState } from "react";
import BookingsTable from "@/components/admin/BookingsTable";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { formatBookingRef } from "@/components/admin/bookings/booking-ref";
import { GOLD, LATO, MUTED, PLAYFAIR, WHITE } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";

export default function AdminBookingsPage() {
  const { bookings, setBookings, members, loading, error, setError, loadData } = useAdminData();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed" | "cancelled">("all");
  const [villaFilter, setVillaFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [emailWarnings, setEmailWarnings] = useState<Record<string, string>>({});
  // Audit B-4: persistent guest-send failure notices. Unlike the per-card
  // emailWarnings, these stay visible when the booking changes section and
  // only go away when the operator dismisses them.
  const [sendWarnings, setSendWarnings] = useState<Array<{ id: number; text: string }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function reportSendWarning(text: string) {
    setSendWarnings((prev) => [...prev, { id: Date.now() + Math.random(), text }]);
  }

  useEffect(() => {
    function syncViewport() {
      setIsMobile(window.innerWidth <= 768);
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  async function updateStatus(id: string, status: "confirmed" | "cancelled") {
    // Audit B-3: the confirm direction is gated by the ConfirmDialog in
    // BookingsTable (which names the guest email + WhatsApp sends), so only
    // the cancel direction keeps the native confirm prompt here.
    if (status === "cancelled" && !confirm("Are you sure you want to cancel this booking?")) return;

    setError("");
    setUpdatingId(id);

    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        ...adminApiFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        email_sent?: boolean;
        booking?: Record<string, unknown>;
        whatsapp?: { dispatched: boolean; reason?: string } | null;
      };
      if (!res.ok) {
        setError(d.error ?? "Failed to update status.");
        return;
      }
      const ref = formatBookingRef(id) ?? id;
      if (d.email_sent === false) {
        reportSendWarning(`Booking ${ref}: status changed to ${status}, but the guest email was NOT sent.`);
      }
      if (status === "confirmed" && d.whatsapp && d.whatsapp.dispatched === false && d.whatsapp.reason !== "already_claimed") {
        reportSendWarning(
          `Booking ${ref}: the WhatsApp Arrival Guide was NOT sent (${d.whatsapp.reason ?? "unknown reason"}). Use "Copy Arrival Guide link" to send it manually.`,
        );
      }
      setEmailWarnings((prev) => {
        const next = { ...prev };
        if (d.email_sent === false) next[id] = "Booking updated but email was not sent";
        else delete next[id];
        return next;
      });
      if (d.booking) {
        setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...d.booking } : b)));
      }
      loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setUpdatingId(null);
    }
  }

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
    <>
      <div style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontFamily: PLAYFAIR, fontSize: isMobile ? "2.1rem" : "2.6rem", color: WHITE, margin: "0 0 8px" }}>
          Bookings
        </p>
        <p style={{ fontFamily: LATO, fontSize: isMobile ? "14px" : "16px", color: MUTED, margin: 0, lineHeight: 1.6 }}>
          Manage booking requests, approvals, and guest follow-up from one operations queue.
        </p>
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "10px 0 0" }}>
          Action-first booking operations
        </p>
      </div>
      {sendWarnings.length > 0 && (
        <div style={{ display: "grid", gap: "8px", marginBottom: "1.5rem" }}>
          {sendWarnings.map((warning) => (
            <div
              key={warning.id}
              role="alert"
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
                border: "0.5px solid rgba(224,112,112,0.34)",
                backgroundColor: "rgba(224,112,112,0.10)",
                padding: "10px 14px",
              }}
            >
              <p style={{ fontFamily: LATO, fontSize: "12px", color: "#f4b3b3", margin: 0, lineHeight: 1.6 }}>
                {warning.text}
              </p>
              <button
                type="button"
                aria-label="Dismiss warning"
                onClick={() => setSendWarnings((prev) => prev.filter((w) => w.id !== warning.id))}
                style={{
                  fontFamily: LATO,
                  fontSize: "14px",
                  color: WHITE,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
          Error: {error}
        </p>
      )}
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
        reportSendWarning={reportSendWarning}
      />
    </>
  );
}
