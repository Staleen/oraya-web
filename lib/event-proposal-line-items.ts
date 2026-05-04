import type { EventSetupEstimateLine, EventSetupEstimatePayload } from "@/lib/event-inquiry-message";

export type ProposalIncludedInput = {
  label: string;
  quantity?: number | null;
  unit_label?: string | null;
  admin_status?: string | null;
  /** Phase 15H — admin-set unit price; preferred over estimate match when present. */
  unit_price?: number | null;
  /** Phase 15H — admin-confirmed line total; preferred over computed when present. */
  line_total?: number | null;
  /** Phase 15H — line origin marker. Carried through for guest display. */
  source?: "requested" | "custom" | null;
  /** Phase 15H — admin-attached note; surfaced under the line when set. */
  notes?: string | null;
};

export type ProposalEmailLineItem = {
  label: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  unit_label?: string | null;
  source?: "requested" | "custom" | null;
  notes?: string | null;
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function findEstimateLine(
  lines: EventSetupEstimateLine[],
  label: string,
): EventSetupEstimateLine | undefined {
  const n = norm(label);
  return lines.find((row) => norm(row.label) === n || norm(row.label).includes(n) || n.includes(norm(row.label)));
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Build the line-item list for guest display + email.
 *
 * Phase 15H precedence (per line):
 *   1. Admin-set `unit_price` / `line_total` → use directly (source of truth for proposals).
 *   2. Otherwise, fall back to matching the guest inquiry estimate (legacy behaviour).
 *   3. Otherwise, render with $0 (guest sees a clearly missing price).
 *
 * Always omits services marked `admin_status === "declined"`.
 */
export function buildProposalEmailLineItems(
  included: ProposalIncludedInput[] | null | undefined,
  estimate: EventSetupEstimatePayload | null,
): ProposalEmailLineItem[] {
  const list = Array.isArray(included) ? included : [];
  const lines = estimate?.lines ?? [];
  const out: ProposalEmailLineItem[] = [];

  for (const svc of list) {
    if (svc.admin_status === "declined") continue;
    const label = svc.label?.trim();
    if (!label) continue;
    const qty =
      typeof svc.quantity === "number" && Number.isFinite(svc.quantity) && svc.quantity > 0
        ? svc.quantity
        : 1;

    // Phase 15H: admin-edited unit price wins. Falls back to estimate match for legacy proposals.
    if (isFiniteNonNegative(svc.unit_price) || isFiniteNonNegative(svc.line_total)) {
      const unit = isFiniteNonNegative(svc.unit_price) ? svc.unit_price : 0;
      const line = isFiniteNonNegative(svc.line_total) ? svc.line_total : unit * qty;
      out.push({
        label,
        quantity: qty,
        unit_price: unit,
        line_total: line,
        unit_label: svc.unit_label ?? null,
        source: svc.source ?? null,
        notes: svc.notes ?? null,
      });
      continue;
    }

    const match = findEstimateLine(lines, label);
    if (match) {
      out.push({
        label: match.label,
        quantity: match.quantity,
        unit_price: match.unit_price,
        line_total: match.line_total,
        unit_label: svc.unit_label ?? null,
        source: svc.source ?? null,
        notes: svc.notes ?? null,
      });
    } else {
      out.push({
        label,
        quantity: qty,
        unit_price: 0,
        line_total: 0,
        unit_label: svc.unit_label ?? null,
        source: svc.source ?? null,
        notes: svc.notes ?? null,
      });
    }
  }

  return out;
}

/** Sum of `line_total` across the (already-filtered) email/display line items. */
export function sumProposalLineItems(items: ProposalEmailLineItem[]): number {
  let total = 0;
  for (const item of items) {
    if (typeof item.line_total === "number" && Number.isFinite(item.line_total)) {
      total += item.line_total;
    }
  }
  return Math.round(total * 100) / 100;
}
