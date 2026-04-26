"use client";
import type { Member } from "./types";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";
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
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      {loading ? (
        isMobile ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {[0, 1, 2].map((item) => (
              <div key={item} style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1rem", minHeight: "178px" }}>
                <SkeletonText width="58%" height="18px" style={{ marginBottom: "16px" }} />
                <SkeletonText width="86%" style={{ marginBottom: "10px" }} />
                <SkeletonText width="52%" style={{ marginBottom: "10px" }} />
                <SkeletonText width="42%" style={{ marginBottom: "10px" }} />
                <SkeletonText width="70%" style={{ marginBottom: "18px" }} />
                <SkeletonBlock width="86px" height="34px" />
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: "100%", minWidth: "100%", borderCollapse: "collapse", backgroundColor: SURFACE, border: `0.5px solid ${BORDER}` }}>
            <thead>
              <tr>
                {["Name", "Email", "Phone", "Country", "Address", "Joined", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((row) => (
                <tr key={row}>
                  {[0, 1, 2, 3, 4, 5, 6].map((cell) => (
                    <td key={cell} style={tdStyle}>
                      <SkeletonText width={cell === 6 ? "72px" : cell === 4 ? "140px" : "96px"} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : members.length === 0 ? (
        <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>No members yet.</p>
      ) : isMobile ? (
        <div style={{ display: "grid", gap: "12px" }}>
          {members.map((m) => (
            <div key={m.id} style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1rem" }}>
              <p style={{ fontFamily: "Playfair Display, Georgia, serif", fontSize: "1.15rem", color: "#FFFFFF", margin: "0 0 10px" }}>
                {m.full_name || "-"}
              </p>
              <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
                <p style={{ ...tdStyle, padding: 0, borderBottom: "none", color: MUTED }}>{m.email || "-"}</p>
                <p style={{ ...tdStyle, padding: 0, borderBottom: "none", color: MUTED }}>{m.phone || "-"}</p>
                <p style={{ ...tdStyle, padding: 0, borderBottom: "none" }}>{m.country || "-"}</p>
                <p style={{ ...tdStyle, padding: 0, borderBottom: "none", color: MUTED }}>{m.address || "-"}</p>
                <p style={{ ...tdStyle, padding: 0, borderBottom: "none", color: MUTED, fontSize: "11px" }}>{fmt(m.created_at)}</p>
              </div>
              <button
                onClick={() => deleteMember(m.id, m.full_name || m.email || m.id)}
                disabled={deletingId === m.id}
                style={{
                  fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px",
                  textTransform: "uppercase", color: "#e07070",
                  backgroundColor: "transparent",
                  border: "0.5px solid rgba(224,112,112,0.3)",
                  padding: "10px 14px", cursor: deletingId === m.id ? "not-allowed" : "pointer",
                  opacity: deletingId === m.id ? 0.5 : 1,
                }}
              >
                {deletingId === m.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <table style={{ width: "100%", minWidth: isMobile ? "720px" : "100%", borderCollapse: "collapse", backgroundColor: SURFACE, border: `0.5px solid ${BORDER}` }}>
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
