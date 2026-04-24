"use client";
import StatsStrip from "@/components/admin/StatsStrip";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";

export default function AdminDashboardPage() {
  const { bookings, members, loading, error } = useAdminData();

  return (
    <>
      <StatsStrip bookings={bookings} members={members} loading={loading} />
      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
          Error: {error}
        </p>
      )}
    </>
  );
}
