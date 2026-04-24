"use client";
import type { Member } from "./types";
import { MUTED, LATO, SURFACE, BORDER, thStyle, tdStyle, fmt } from "./theme";

export default function MembersTable({
  loading,
  members,
  deletingId,
  deleteMember,
}: {
  loading: boolean;
  members: Member[];
  deletingId: string | null;
  deleteMember: (id: string, name: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      {loading ? (
        <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>Loading...</p>
      ) : members.length === 0 ? (
        <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>No members yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: SURFACE, border: `0.5px solid ${BORDER}` }}>
          <thead>
            <tr>
              {["Name", "Email", "Phone", "Country", "Address", "Joined", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.id}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.02)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <td style={tdStyle}>{m.full_name || "-"}</td>
                <td style={{ ...tdStyle, color: MUTED }}>{m.email || "-"}</td>
                <td style={{ ...tdStyle, color: MUTED }}>{m.phone || "-"}</td>
                <td style={tdStyle}>{m.country || "-"}</td>
                <td style={{ ...tdStyle, color: MUTED }}>{m.address || "-"}</td>
                <td style={{ ...tdStyle, color: MUTED, fontSize: "11px" }}>{fmt(m.created_at)}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <button
                    onClick={() => deleteMember(m.id, m.full_name || m.email || m.id)}
                    disabled={deletingId === m.id}
                    style={{
                      fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px",
                      textTransform: "uppercase", color: "#e07070",
                      backgroundColor: "transparent",
                      border: "0.5px solid rgba(224,112,112,0.3)",
                      padding: "5px 12px", cursor: deletingId === m.id ? "not-allowed" : "pointer",
                      opacity: deletingId === m.id ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => { if (deletingId !== m.id) (e.currentTarget as HTMLElement).style.borderColor = "#e07070"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(224,112,112,0.3)"; }}
                  >
                    {deletingId === m.id ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
