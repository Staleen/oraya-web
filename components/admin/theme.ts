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

/* ---------------------------------------------------------------------------
 * V1 — Admin design tokens
 *
 * Before this block the admin had 9 constants and 262 hardcoded hex literals
 * across ~30 components, including SIX different reds and SIX different golds,
 * because theme.ts defined no semantic colour at all. Every new component
 * invented its own. These tokens are the single source; new admin UI must use
 * them instead of literals.
 *
 * Values mirror the guest-side dark theme (DESIGN_SYSTEM.md + app/globals.css)
 * so the admin and the guest site read as one product. Spacing follows the same
 * 8px base; type follows the same Playfair-for-brand / Lato-for-UI split.
 * ------------------------------------------------------------------------- */

/** Gold ramp — consolidates #c5a46d, #e2ab5a, #f0bd67, #e7b66d, #c9b27f, #d99644. */
export const GOLD_BRIGHT = "#E2AB5A";
export const GOLD_SOFT   = "#C9B27F";
/** Guest-side `.oraya-cta-gold-hover` warms solid gold to this on hover. */
export const GOLD_HOVER  = "#D4B98A";
/** Label/icon fill on a solid gold button (navy, per DESIGN_SYSTEM §6). */
export const ON_GOLD     = MIDNIGHT;

/** Surfaces — layered over the MIDNIGHT shell. */
export const SURFACE_RAISED = "rgba(255,255,255,0.05)";
export const SURFACE_SUNKEN = "rgba(0,0,0,0.14)";
export const SURFACE_HOVER  = "rgba(255,255,255,0.07)";

/** Borders. */
export const BORDER_STRONG = "rgba(197,164,109,0.28)";
export const BORDER_FAINT  = "rgba(255,255,255,0.06)";

/** Text roles. Do NOT use CHARCOAL on the admin shell — ~1.1:1 contrast (ME-9). */
export const TEXT_PRIMARY   = "rgba(255,255,255,0.92)";
export const TEXT_SECONDARY = "rgba(255,255,255,0.75)";
export const TEXT_MUTED     = "rgba(255,255,255,0.55)";
export const TEXT_FAINT     = "rgba(255,255,255,0.38)";

/** Semantic colours — these did not exist, which is the root of X-8. */
export const SUCCESS        = "#6FCF8A";
export const SUCCESS_BG     = "rgba(111,207,138,0.10)";
export const SUCCESS_BORDER = "rgba(111,207,138,0.30)";
export const DANGER         = "#E07070";
/** Lighter danger for text on dark surfaces — keeps contrast readable. */
export const DANGER_TEXT    = "#F2A7A7";
export const DANGER_BG      = "rgba(224,112,112,0.10)";
export const DANGER_BORDER  = "rgba(224,112,112,0.32)";
export const WARNING        = "#E0B070";
export const WARNING_BG     = "rgba(224,176,112,0.10)";
export const WARNING_BORDER = "rgba(224,176,112,0.30)";
export const INFO           = "#7ECFCF";
export const INFO_BG        = "rgba(126,207,207,0.10)";
export const INFO_BORDER    = "rgba(126,207,207,0.30)";

/** Spacing — 8px base (DESIGN_SYSTEM §4). Avoid arbitrary values. */
export const SPACE = {
  xxs: "4px",
  xs:  "8px",
  sm:  "16px",
  md:  "24px",
  lg:  "32px",
  xl:  "48px",
  xxl: "64px",
} as const;

/** Type scale (DESIGN_SYSTEM §3). */
export const FONT_SIZE = {
  micro:  "9px",
  label:  "11px",
  small:  "12px",
  body:   "13px",
  bodyLg: "14px",
  h3:     "16px",
  h2:     "20px",
  h1:     "28px",
} as const;

export const TRACKING = { label: "2px", cta: "1.5px" } as const;

/**
 * Radii. The old admin was uniformly sharp-cornered, which is a large part of
 * why it reads as dated; a small radius modernises it without losing the
 * editorial feel.
 */
export const RADIUS = { sm: "4px", md: "8px", lg: "12px", pill: "999px" } as const;

export const FOCUS_RING = "0 0 0 2px rgba(197,164,109,0.55)";
export const SHADOW_CARD = "0 1px 2px rgba(0,0,0,0.20)";
export const SHADOW_RAISED = "0 8px 28px rgba(0,0,0,0.35)";

/** One breakpoint. X-4: seven components disagree on <=768 vs <768 today. */
export const BREAKPOINT_MOBILE = 768;

export const TRANSITION = "180ms ease";

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
