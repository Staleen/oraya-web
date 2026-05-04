import type { EventSetupEstimateLine, EventSetupEstimatePayload } from "@/lib/event-inquiry-message";

export type ProposalIncludedInput = {
  label: string;
  quantity?: number | null;
  admin_status?: string | null;
};

export type ProposalEmailLineItem = {
  label: string;
  quantity: number;
  unit_price: number;
  line_total: number;
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

/**
 * Merge guest inquiry estimate lines with admin-included proposal services for email / display.
 * Omits services marked `admin_status === "declined"`.
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
        ? Math.round(svc.quantity)
        : 1;
    const match = findEstimateLine(lines, label);
    if (match) {
      out.push({
        label: match.label,
        quantity: match.quantity,
        unit_price: match.unit_price,
        line_total: match.line_total,
      });
    } else {
      out.push({
        label,
        quantity: qty,
        unit_price: 0,
        line_total: 0,
      });
    }
  }

  return out;
}
