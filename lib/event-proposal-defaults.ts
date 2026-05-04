/** Proposal deposit: 50% of total, rounded up to the nearest $100. */
export function computeProposalDepositFromTotal(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.ceil((total * 0.5) / 100) * 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Default proposal validity / payment deadline: 7 days before event check-in at end of day (local).
 * If that date is in the past, use today at end of day.
 * Returns `datetime-local` input value (YYYY-MM-DDTHH:mm).
 */
export function computeDefaultProposalValidUntilInputValue(checkInIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(checkInIso.trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const checkIn = new Date(y, mo, d, 12, 0, 0, 0);
  if (Number.isNaN(checkIn.getTime())) return "";
  const deadline = new Date(checkIn.getTime());
  deadline.setDate(deadline.getDate() - 7);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const pick = deadlineDay.getTime() < today.getTime() ? today : deadlineDay;
  const end = new Date(pick.getFullYear(), pick.getMonth(), pick.getDate(), 23, 59, 0, 0);
  return `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}T${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
}
