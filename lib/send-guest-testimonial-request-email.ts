import { Resend } from "resend";
import { transactionalEmailFooterTextSuffix } from "@/lib/transactional-email-footer";

const FROM_EMAIL = "Oraya <bookings@stayoraya.com>";
const REPLY_TO = "hello@stayoraya.com";

export async function sendGuestTestimonialRequestEmail(params: { to: string; guestName: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[send-guest-testimonial-request-email] RESEND_API_KEY missing — skip send");
    throw new Error("Email is not configured.");
  }

  const name = params.guestName?.trim() || "Guest";
  const textBody = [
    `Hi ${name},`,
    "",
    "We hope you enjoyed your stay with Oraya.",
    "",
    "If you're happy to share a short feedback, we'd love to include it as part of our guest experiences.",
    "",
    "You can reply directly to this email.",
    "",
    "Thank you,",
    "Oraya",
    "",
    ...transactionalEmailFooterTextSuffix(),
  ].join("\n");

  const htmlBody = `
<!DOCTYPE html><html><body style="margin:0;padding:24px;background-color:#1f2b38;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;">
<tr><td style="color:#eae3d9;font-size:15px;line-height:1.7;">
<p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
<p style="margin:0 0 16px;">We hope you enjoyed your stay with Oraya.</p>
<p style="margin:0 0 16px;">If you&apos;re happy to share a short feedback, we&apos;d love to include it as part of our guest experiences.</p>
<p style="margin:0 0 16px;">You can reply directly to this email.</p>
<p style="margin:0 0 8px;">Thank you,<br/>Oraya</p>
</td></tr></table>
</body></html>`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.to,
    replyTo: REPLY_TO,
    subject: "Thank you for staying with Oraya",
    text: textBody,
    html: htmlBody,
  });

  if (error) {
    console.error("[send-guest-testimonial-request-email] Resend error:", error);
    throw new Error(typeof error === "object" && error && "message" in error ? String((error as { message: string }).message) : "Resend error");
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
