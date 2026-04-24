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
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "2.5rem" }}>
      {[
        { label: "Total bookings", value: loading ? "-" : bookings.length },
        { label: "Pending",        value: loading ? "-" : bookings.filter((b) => b.status === "pending").length },
        { label: "Confirmed",      value: loading ? "-" : bookings.filter((b) => b.status === "confirmed").length },
        { label: "Total members",  value: loading ? "-" : members.length },
      ].map(({ label, value }) => (
        <div key={label} style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.5rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: MUTED, margin: "0 0 8px" }}>
            {label}
          </p>
          <p style={{ fontFamily: PLAYFAIR, fontSize: "2rem", color: GOLD, margin: 0, lineHeight: 1 }}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}
