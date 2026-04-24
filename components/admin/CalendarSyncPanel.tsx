"use client";
import { formatBeirutRelative } from "@/lib/format-date";
import type { CalendarSource } from "./types";
import {
  GOLD, WHITE, CHARCOAL, MUTED, LATO, SURFACE, BORDER, thStyle, tdStyle,
} from "./theme";

const CALENDAR_EXPORTS = [
  { villa: "Villa Mechmech", slug: "mechmech" },
  { villa: "Villa Byblos", slug: "byblos" },
];

function formatSyncStatus(status: string | null) {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "syncing") return "Syncing";
  return "Never run";
}

function formatSyncError(lastError: string | null) {
  const value = lastError?.trim();
  if (!value) return "-";
  if (["-", "--", "...", "â€”", "â€¦", "—", "…"].includes(value)) return "-";
  return value;
}

export default function CalendarSyncPanel({
  calendarSources, syncingCalendars, syncMessage, isMobile, runCalendarSync,
}: {
  calendarSources: CalendarSource[];
  syncingCalendars: boolean;
  syncMessage: string;
  isMobile: boolean;
  runCalendarSync: () => void;
}) {
  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.75rem", marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
            Calendar Sync
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
            Export confirmed Oraya bookings per villa and review external feed sync status. Sync also runs automatically every 10 minutes.
          </p>
        </div>
        <button
          onClick={runCalendarSync}
          disabled={syncingCalendars}
          style={{
            fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
            textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
            border: "none", padding: "10px 20px", cursor: syncingCalendars ? "not-allowed" : "pointer",
            opacity: syncingCalendars ? 0.7 : 1,
          }}
        >
          {syncingCalendars ? "Syncing..." : "Run sync"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px", marginBottom: "1rem" }}>
        {CALENDAR_EXPORTS.map((item) => (
          <div key={item.slug} style={{ border: `0.5px solid ${BORDER}`, padding: "14px 16px" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 6px" }}>
              {item.villa}
            </p>
            <a
              href={`/api/calendar/${item.slug}.ics`}
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, textDecoration: "none", wordBreak: "break-all" }}
            >
              {`/api/calendar/${item.slug}.ics`}
            </a>
          </div>
        ))}
      </div>

      {syncMessage && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#6fcf8a", marginBottom: "1rem" }}>
          {syncMessage}
        </p>
      )}

      {calendarSources.length === 0 ? (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>
          No external calendar sources configured yet.
        </p>
      ) : isMobile ? (
        <div style={{ display: "grid", gap: "12px" }}>
          {calendarSources.map((source) => (
            <div key={source.id} style={{ border: `0.5px solid ${BORDER}`, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 6px" }}>
                    {source.villa}
                  </p>
                  <p style={{ fontFamily: "Playfair Display, Georgia, serif", fontSize: "1rem", color: WHITE, margin: 0 }}>
                    {source.source_name}
                  </p>
                </div>
                <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: source.last_sync_status === "success" ? "#6fcf8a" : source.last_sync_status === "failed" ? "#e07070" : MUTED }}>
                  {formatSyncStatus(source.last_sync_status)}
                </span>
              </div>
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 8px", wordBreak: "break-all" }}>
                {source.feed_url}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 6px" }}>
                {source.last_synced_at ? formatBeirutRelative(source.last_synced_at) : "-"}
              </p>
              {!source.is_enabled && (
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 6px" }}>
                  Disabled
                </p>
              )}
              <p style={{ fontFamily: LATO, fontSize: "11px", color: formatSyncError(source.last_error) === "-" ? MUTED : "#e0b070", margin: 0 }}>
                {formatSyncError(source.last_error)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", minWidth: isMobile ? "640px" : "100%", borderCollapse: "collapse", border: `0.5px solid ${BORDER}` }}>
            <thead>
              <tr>
                {["Villa", "Source", "Status", "Last sync", "Error"].map((heading) => (
                  <th key={heading} style={thStyle}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendarSources.map((source) => (
                <tr key={source.id}>
                  <td style={tdStyle}>{source.villa}</td>
                  <td style={tdStyle}>
                    <span style={{ display: "block", color: WHITE }}>{source.source_name}</span>
                    <span style={{ display: "block", fontSize: "11px", color: MUTED, marginTop: "4px", wordBreak: "break-all" }}>
                      {source.feed_url}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: source.last_sync_status === "success" ? "#6fcf8a" : source.last_sync_status === "failed" ? "#e07070" : MUTED }}>
                      {formatSyncStatus(source.last_sync_status)}
                    </span>
                    {!source.is_enabled && (
                      <span style={{ display: "block", fontSize: "11px", color: MUTED, marginTop: "4px" }}>
                        Disabled
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{source.last_synced_at ? formatBeirutRelative(source.last_synced_at) : "-"}</td>
                  <td style={{ ...tdStyle, color: formatSyncError(source.last_error) === "-" ? MUTED : "#e0b070" }}>
                    {formatSyncError(source.last_error)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
