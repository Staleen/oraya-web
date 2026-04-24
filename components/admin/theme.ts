// Shared constants + style objects for admin components.
// Extracted verbatim from the original app/admin/page.tsx — do not tune
// values here without propagating them everywhere the admin UI is rendered.

import type { CSSProperties } from "react";

export const GOLD     = "#C5A46D";
export const WHITE    = "#FFFFFF";
export const MIDNIGHT = "#1F2B38";
export const CHARCOAL = "#2E2E2E";
export const MUTED    = "#8a8070";
export const PLAYFAIR = "'Playfair Display', Georgia, serif";
export const LATO     = "'Lato', system-ui, sans-serif";
export const SURFACE  = "rgba(255,255,255,0.03)";
export const BORDER   = "rgba(197,164,109,0.12)";

export const SESSION_KEY = "oraya_admin_auth";

export const thStyle: CSSProperties = {
  fontFamily: LATO, fontSize: "9px", letterSpacing: "2px",
  textTransform: "uppercase", color: GOLD, padding: "12px 16px",
  textAlign: "left", borderBottom: `0.5px solid ${BORDER}`, whiteSpace: "nowrap",
};

export const tdStyle: CSSProperties = {
  fontFamily: LATO, fontSize: "13px", fontWeight: 300,
  color: "rgba(255,255,255,0.75)", padding: "14px 16px",
  borderBottom: `0.5px solid rgba(255,255,255,0.04)`, verticalAlign: "middle",
};

export const fieldStyle: CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(197,164,109,0.25)",
  padding: "12px 14px",
  fontFamily: LATO, fontSize: "14px", color: WHITE,
  outline: "none", boxSizing: "border-box",
};

// Date-only stay-date formatter — parses YYYY-MM-DD by string split so the
// rendered calendar date never shifts across a timezone boundary. Do NOT
// replace with `new Date()`-based formatting.
export function fmt(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}
