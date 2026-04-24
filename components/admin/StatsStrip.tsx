"use client";
import type { Booking, Member } from "./types";
import { GOLD, MUTED, LATO, PLAYFAIR, SURFACE, BORDER } from "./theme";

export default function StatsStrip({
  bookings, members, loading,
}: {
  bookings: Booking[];
  members: Member[];
  loading: boolean;
}) {
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "2rem" }}>
      {[
        { label: "Total bookings", value: loading ? "-" : bookings.length },
        { label: "Pending",        value: loading ? "-" : bookings.filter((b) => b.status === "pending").length },
        { label: "Confirmed",      value: loading ? "-" : bookings.filter((b) => b.status === "confirmed").length },
        { label: "Total members",  value: loading ? "-" : members.length },
      ].map(({ label, value }) => (
        <div key={label} style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.5rem", minWidth: 0 }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: MUTED, margin: "0 0 8px" }}>
            {label}
          </p>
          <p style={{ fontFamily: PLAYFAIR, fontSize: isMobile ? "1.65rem" : "2rem", color: GOLD, margin: 0, lineHeight: 1 }}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}
