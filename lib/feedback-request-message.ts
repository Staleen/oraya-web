/**
 * Phase 15F.5 — Prepared feedback request copy for manual send (WhatsApp / email / clipboard).
 * No automatic delivery.
 */

export function buildStayFeedbackRequestMessage(guestName: string): string {
  const name = guestName.trim() || "Guest";
  return [
    `Hi ${name},`,
    "",
    "We hope you enjoyed your stay with Oraya.",
    "",
    "If you are happy to share a short feedback, we would love to include it as part of our guest experiences.",
    "",
    "You can reply directly to this message.",
    "",
    "Thank you,",
    "Oraya",
  ].join("\n");
}

export function buildEventFeedbackRequestMessage(guestName: string): string {
  const name = guestName.trim() || "Guest";
  return [
    `Hi ${name},`,
    "",
    "We hope your event experience with Oraya went well.",
    "",
    "If you are happy to share a short feedback, we would love to include it as part of our guest experiences.",
    "",
    "You can reply directly to this message.",
    "",
    "Thank you,",
    "Oraya",
  ].join("\n");
}

export function digitsForWhatsApp(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Returns wa.me URL or null if the number looks too short to be valid. */
export function buildWhatsAppFeedbackUrl(phone: string, message: string): string | null {
  const d = digitsForWhatsApp(phone);
  if (d.length < 8) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(message)}`;
}

export function buildMailtoFeedbackUrl(email: string, message: string): string {
  const e = email.trim();
  return `mailto:${e}?subject=${encodeURIComponent("Thank you from Oraya")}&body=${encodeURIComponent(message)}`;
}
