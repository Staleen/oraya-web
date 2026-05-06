"use client";
import { useEffect, useState } from "react";
import BookingsTable from "@/components/admin/BookingsTable";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { GOLD, LATO, MUTED, PLAYFAIR, WHITE } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";

export default function AdminBookingsPage() {
  const { bookings, setBookings, members, loading, error, setError, loadData } = useAdminData();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "confirmed" | "cancelled">("all");
  const [villaFilter, setVillaFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [emailWarnings, setEmailWarnings] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    function syncViewport() {
      setIsMobile(window.innerWidth <= 768);
    }
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  async function updateStatus(id: string, status: "confirmed" | "cancelled") {
    const label = status === "confirmed" ? "confirm" : "cancel";
    if (!confirm(`Are you sure you want to ${label} this booking?`)) return;

    setError("");
    setUpdatingId(id);

    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        ...adminApiFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const d = (await res.json().catch(() => ({}))) as { error?: string; email_sent?: boolean; booking?: Record<string, unknown> };
      if (!res.ok) {
        setError(d.error ?? "Failed to update status.");
        return;
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
      />
    </>
  );
}
