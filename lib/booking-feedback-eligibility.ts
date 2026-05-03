/** Phase 15F.7 — matches admin “completed” band (UTC calendar date vs check_out, same as 15F.6 UI). */
export function isPastCheckoutForFeedbackEmail(checkOut: string | null | undefined): boolean {
  const co = checkOut?.trim();
  if (!co) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > co;
}

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function isFeedbackEmailCooldownActive(feedbackRequestedAt: string | null | undefined): boolean {
  if (!feedbackRequestedAt) return false;
  const t = new Date(feedbackRequestedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < COOLDOWN_MS;
}
