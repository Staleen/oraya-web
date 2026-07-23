/**
 * Remediation 5.4 — the shared Oraya theme constants (CLAUDE.md canon),
 * promoted from components/admin/theme.ts so public pages stop re-declaring
 * them locally. Files whose local values deliberately differ (e.g. CSS-var
 * based theming on /book and /booking/view) keep their own constants.
 */
export const GOLD     = "#C5A46D";
export const WHITE    = "#FFFFFF";
export const BEIGE    = "#EAE3D9";
export const BEIGELIGHT = "#F5F1EB";
export const MIDNIGHT = "#1F2B38";
export const CHARCOAL = "#2E2E2E";
export const MUTED    = "#8a8070";
export const PLAYFAIR = "'Playfair Display', Georgia, serif";
export const LATO     = "'Lato', system-ui, sans-serif";
export const SURFACE  = "rgba(255,255,255,0.03)";
export const BORDER   = "rgba(197,164,109,0.12)";
