"use client";
import DashboardOperationsView from "@/components/admin/DashboardOperationsView";
import StatsStrip from "@/components/admin/StatsStrip";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO, PLAYFAIR } from "@/components/admin/theme";

export default function AdminDashboardPage() {
  const { bookings, members, calendarSources, loading, error, loadData } = useAdminData();

  // Audit D-4 (#27): a failed load with no data must never read as a plausible
  // "everything is empty" dashboard — the zeros and empty sections below are
  // fetch failures, not truth, so the error leads the page.
  const dataEmpty = bookings.length === 0 && members.length === 0 && calendarSources.length === 0;
  const showLoadFailureBanner = Boolean(error) && !loading && dataEmpty;

  return (
    <>
      {showLoadFailureBanner && (
        <div
          role="alert"
          style={{
            border: "0.5px solid rgba(224,112,112,0.5)",
            backgroundColor: "rgba(224,112,112,0.12)",
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ fontFamily: PLAYFAIR, fontSize: "1.1rem", color: "#f4b3b3", margin: "0 0 6px" }}>
            Dashboard data failed to load
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: "#f4b3b3", margin: "0 0 10px", lineHeight: 1.6 }}>
            The sections below are empty because the data could not be fetched — not because there are no
            bookings. Do not treat the zeros as live numbers. Error: {error}
          </p>
          <button
            type="button"
            onClick={() => void loadData(false)}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "#f4b3b3",
              backgroundColor: "transparent",
              border: "0.5px solid rgba(224,112,112,0.5)",
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}
      <StatsStrip bookings={bookings} members={members} loading={loading} />
      <DashboardOperationsView
        bookings={bookings}
        members={members}
        calendarSources={calendarSources}
        loading={loading}
      />
      {error && !showLoadFailureBanner && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
          Error: {error}
        </p>
      )}
    </>
  );
}
