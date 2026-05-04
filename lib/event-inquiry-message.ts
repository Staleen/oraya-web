/** Structured event setup estimate appended to booking `message` (no schema change). */

export const EVENT_INQUIRY_MARKER = "[Event Inquiry]";

export const EVENT_SETUP_ESTIMATE_PREFIX = "[EventSetupEstimate]";

/** Matches admin/API classification: canonical event type plus structured inquiry marker in notes. */
export function isEventInquiryPayload(
  eventType: string | null | undefined,
  message: string | null | undefined,
): boolean {
  return Boolean(eventType?.trim()) && typeof message === "string" && message.includes(EVENT_INQUIRY_MARKER);
}

export type EventSetupEstimateLine = {
  label: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  pricing_model: string;
};

export type EventSetupEstimatePayload = {
  version: 1;
  currency: string;
  total: number;
  lines: EventSetupEstimateLine[];
  /** Catalog keys included in the last "Add recommended" apply (for guest breakdown). */
  pack_keys?: string[];
  /** Subtotal for pack keys still selected (optional; older inquiries omit). */
  recommended_subtotal?: number;
  /** Subtotal for selected services not in the pack (optional). */
  upgrades_subtotal?: number;
};

export function parseEventSetupEstimateFromMessage(message: string | null | undefined): EventSetupEstimatePayload | null {
  if (typeof message !== "string" || !message.includes(EVENT_SETUP_ESTIMATE_PREFIX)) return null;
  const idx = message.indexOf(EVENT_SETUP_ESTIMATE_PREFIX);
  const rest = message.slice(idx + EVENT_SETUP_ESTIMATE_PREFIX.length).trim();
  const lineBreak = rest.indexOf("\n");
  const jsonPart = (lineBreak === -1 ? rest : rest.slice(0, lineBreak)).trim();
  try {
    const parsed = JSON.parse(jsonPart) as EventSetupEstimatePayload;
    if (parsed?.version !== 1 || typeof parsed.total !== "number" || !Array.isArray(parsed.lines)) return null;
    if (typeof parsed.currency !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Remove machine-readable estimate line for admin “notes” style display. */
export function stripEventSetupEstimateFromMessage(message: string | null | undefined): string {
  if (typeof message !== "string") return "";
  return message
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(EVENT_SETUP_ESTIMATE_PREFIX))
    .join("\n")
    .trim();
}
