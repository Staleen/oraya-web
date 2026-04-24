"use client";
import DashboardOperationsView from "@/components/admin/DashboardOperationsView";
import StatsStrip from "@/components/admin/StatsStrip";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";

export default function AdminDashboardPage() {
  const { bookings, members, calendarSources, loading, error } = useAdminData();

  return (
    <>
      <StatsStrip bookings={bookings} members={members} loading={loading} />
      <DashboardOperationsView
        bookings={bookings}
        members={members}
        calendarSources={calendarSources}
        loading={loading}
      />
      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
          Error: {error}
        </p>
      )}
    </>
  );
}
