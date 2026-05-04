/** Structured event setup estimate appended to booking `message` (no schema change). */

export const EVENT_SETUP_ESTIMATE_PREFIX = "[EventSetupEstimate]";

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
