import { Resend } from "resend";
import { LOGO_URL } from "@/lib/brand";
import { transactionalEmailFooterHtmlBlock, transactionalEmailFooterTextSuffix } from "@/lib/transactional-email-footer";

const GOLD = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED = "#8a8070";
const WHITE = "#FFFFFF";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";
const REPLY_TO = "hello@stayoraya.com";

export interface FeedbackRequestEmailPayload {
  to: string;
  guestName: string;
  /** When true, use “event experience” wording instead of “stay”. */
  isEvent: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildBodies(guestName: string, isEvent: boolean): { html: string; text: string } {
  const safeName = escapeHtml(guestName.trim() || "Guest");
  const experienceLine = isEvent
    ? "We hope you enjoyed your event experience with Oraya."
    : "We hope you enjoyed your stay with Oraya.";
  const experienceLineText = isEvent
    ? "We hope you enjoyed your event experience with Oraya."
    : "We hope you enjoyed your stay with Oraya.";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>How was your Oraya experience?</title>
</head>
<body style="margin:0;padding:0;background-color:${MIDNIGHT};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${MIDNIGHT};padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <img src="${LOGO_URL}" alt="Oraya" width="120" height="120" border="0"
                   style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:16px;">
              <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.5;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:20px;">
              <p style="margin:0 0 16px;font-size:15px;color:${WHITE};line-height:1.75;">
                Hi ${safeName},
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:${MUTED};line-height:1.75;">
                ${experienceLine}
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:${MUTED};line-height:1.75;">
                If you&apos;re happy to share a short feedback, we would love to include it as part of our guest experiences.
              </p>
              <p style="margin:0 0 16px;font-size:14px;color:${MUTED};line-height:1.75;">
                You can simply reply to this email.
              </p>
              <p style="margin:0;font-size:14px;color:${WHITE};line-height:1.75;">
                Thank you,<br/>Oraya
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;">
              ${transactionalEmailFooterHtmlBlock()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "How was your Oraya experience?",
    "",
    `Hi ${guestName.trim() || "Guest"},`,
    "",
    experienceLineText,
    "",
    "If you're happy to share a short feedback, we would love to include it as part of our guest experiences.",
    "",
    "You can simply reply to this email.",
    "",
    "Thank you,",
    "Oraya",
    "",
    ...transactionalEmailFooterTextSuffix(),
  ].join("\n");

  return { html, text };
}

/**
 * Sends the Phase 15F.7 manual feedback request (admin-triggered only).
 * Throws if Resend is not configured or the provider returns an error.
 */
export async function sendFeedbackRequestEmail(payload: FeedbackRequestEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const subject = "How was your Oraya experience?";
  const { html, text } = buildBodies(payload.guestName, payload.isEvent);
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: payload.to,
    replyTo: REPLY_TO,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("[sendFeedbackRequestEmail] Resend error:", error);
    throw new Error(error.message || "Failed to send email.");
  }
}
