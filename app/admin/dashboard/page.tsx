"use client";
import { useEffect, useState } from "react";
import DashboardOperationsView from "@/components/admin/DashboardOperationsView";
import StatsStrip from "@/components/admin/StatsStrip";
import { parseVillaPricingSetting, VILLA_BASE_PRICING_KEY, type VillaBasePricing } from "@/lib/admin-pricing";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";

export default function AdminDashboardPage() {
  const { bookings, members, calendarSources, loading, error } = useAdminData();
  const [villaPricing, setVillaPricing] = useState<VillaBasePricing[]>(parseVillaPricingSetting(null));

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows = d.settings ?? [];
        const pricingRow = rows.find((row: { key: string; value: string }) => row.key === VILLA_BASE_PRICING_KEY);
        setVillaPricing(parseVillaPricingSetting(pricingRow?.value));
      })
      .catch((fetchError) => console.error("[admin] dashboard pricing fetch error:", fetchError));
  }, []);

  return (
    <>
      <StatsStrip bookings={bookings} members={members} loading={loading} />
      <DashboardOperationsView
        bookings={bookings}
        members={members}
        calendarSources={calendarSources}
        villaPricing={villaPricing}
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
