const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function formatIsoDateOnly(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE_RE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1) return null;

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return null;

  return `${MONTH_LABELS[month - 1]} ${day}`;
}

export function formatLeadDateValue(
  normalizedDate: string | null | undefined,
  rawText: string | null | undefined,
): string {
  const normalized = formatIsoDateOnly(normalizedDate);
  if (normalized) return normalized;
  const fallback = rawText?.trim();
  return fallback || "—";
}

export function hasLeadDateValue(
  normalizedDate: string | null | undefined,
  rawText: string | null | undefined,
): boolean {
  return formatLeadDateValue(normalizedDate, rawText) !== "—";
}

export function formatLeadDateRange(input: {
  normalized_check_in: string | null;
  normalized_check_out: string | null;
  check_in_text: string | null;
  check_out_text: string | null;
}): string {
  const checkIn = formatLeadDateValue(input.normalized_check_in, input.check_in_text);
  const checkOut = formatLeadDateValue(input.normalized_check_out, input.check_out_text);
  if (checkIn === "—" && checkOut === "—") return "—";
  return `${checkIn} → ${checkOut}`;
}
