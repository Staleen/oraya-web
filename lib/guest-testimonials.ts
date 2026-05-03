/**
 * Phase 15F.4 — Guest testimonials stored in `settings` table, key `guest_testimonials`.
 * Value: JSON array of objects (no DB schema change).
 *
 * Example element:
 * {
 *   "guest_label": "A.D.",
 *   "villa": "Villa Mechmech",
 *   "quote": "…",
 *   "reference_url": "https://…" | null,
 *   "approved": false,
 *   "display_order": 0
 * }
 */

export const GUEST_TESTIMONIALS_SETTINGS_KEY = "guest_testimonials";

export interface GuestTestimonialRecord {
  guest_label: string;
  villa?: string;
  quote: string;
  reference_url?: string | null;
  approved?: boolean;
  display_order?: number;
}

export function parseGuestTestimonialsJson(raw: string | null | undefined): GuestTestimonialRecord[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is GuestTestimonialRecord => {
      if (!row || typeof row !== "object") return false;
      const r = row as GuestTestimonialRecord;
      return typeof r.guest_label === "string" && typeof r.quote === "string";
    });
  } catch {
    return [];
  }
}

/** Approved-only, sorted for public display (lower display_order first). */
export function getApprovedPublicTestimonials(rows: GuestTestimonialRecord[]): GuestTestimonialRecord[] {
  return rows
    .filter((r) => r.approved === true && r.quote.trim() !== "" && r.guest_label.trim() !== "")
    .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
}

/** Phase 15F.5 — append a draft row from pasted message (always unapproved). */
export function appendUnapprovedTestimonialFromPaste(
  rows: GuestTestimonialRecord[],
  quote: string,
  guestLabel?: string,
  villa?: string
): GuestTestimonialRecord[] {
  const q = quote.trim();
  if (!q) return rows;
  const maxOrder = rows.reduce(
    (m, r) =>
      Math.max(m, typeof r.display_order === "number" && Number.isFinite(r.display_order) ? r.display_order : -1),
    -1
  );
  const next: GuestTestimonialRecord = {
    guest_label: (guestLabel?.trim() || "Guest").trim() || "Guest",
    quote: q,
    reference_url: null,
    approved: false,
    display_order: maxOrder + 1,
  };
  const v = villa?.trim();
  if (v) next.villa = v;
  return [...rows, next];
}

export const GUEST_TESTIMONIALS_JSON_TEMPLATE = `[
  {
    "guest_label": "Initials or display name",
    "villa": "Villa Mechmech",
    "quote": "Short quote text after you have real guest permission.",
    "reference_url": null,
    "approved": false,
    "display_order": 0
  }
]`;
