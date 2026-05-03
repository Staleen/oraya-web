import { Resend } from "resend";
import { LOGO_URL, SITE_URL } from "@/lib/brand";
import { createActionToken } from "@/lib/booking-action-token";

const GOLD = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED = "#8a8070";
const WHITE = "#FFFFFF";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";
const REPLY_TO = "admin@stayoraya.com";
const CURRENCY = "USD";

export interface EventConfirmationEmailPayload {
  to: string;
  name: string;
  booking_id: string;
  villa: string;
  check_in: string;
  check_out: string;
  event_type?: string | null;
  proposal_total_amount?: number | string | null;
}

function fmtDate(iso: string): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoney(value: number | null): string {
  if (value === null) return "To be confirmed";
  return `${CURRENCY} ${Math.round(value).toLocaleString("en-US")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function checkOutExpiryUnix(checkOut: string): number {
  return Math.floor(new Date(`${checkOut}T23:59:59Z`).getTime() / 1000);
}

function createViewUrl(bookingId: string, checkOut: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
  const { token } = createActionToken(bookingId, "view", {
    expiresAt: checkOutExpiryUnix(checkOut),
  });
  return `${base}/booking/view/${encodeURIComponent(token)}`;
}

export async function sendEventConfirmationEmail(payload: EventConfirmationEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendEventConfirmationEmail] RESEND_API_KEY not set - skipping email.");
    return;
  }

  const resend = new Resend(apiKey);
  const firstName = payload.name.split(" ")[0] || "Guest";
  const viewUrl = createViewUrl(payload.booking_id, payload.check_out);
  const proposalTotal = parseAmount(payload.proposal_total_amount);
  const subject = "Your event booking has been confirmed";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${MIDNIGHT};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${MIDNIGHT};padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${LOGO_URL}" alt="Oraya" width="140" height="140" border="0"
                   style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.5;"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:12px;">
              <p style="margin:0;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${GOLD};">
                Event Confirmed
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:28px;font-weight:400;color:${WHITE};line-height:1.25;">
                Your event has been confirmed<br/><em>${escapeHtml(firstName)}.</em>
              </h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.8;max-width:420px;">
                Oraya has confirmed your event booking. Payment remains manual, and any requested deposit or balance details will be shared separately.
              </p>
            </td>
          </tr>
          <tr>
            <td style="border:0.5px solid rgba(197,164,109,0.2);padding:28px;">
              <p style="margin:0 0 20px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
                Event summary
              </p>
              ${[
                ["Villa", payload.villa],
                ["Dates", `${fmtDate(payload.check_in)} to ${fmtDate(payload.check_out)}`],
                ["Event type", payload.event_type || "Custom event"],
                ["Proposal total", formatMoney(proposalTotal)],
              ].map(([label, value]) => `
                <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:0.5px solid rgba(255,255,255,0.05);">
                  <tr>
                    <td style="padding:10px 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">
                      ${escapeHtml(label)}
                    </td>
                    <td align="right" style="padding:10px 0;font-size:13px;color:${WHITE};font-weight:300;">
                      ${escapeHtml(value)}
                    </td>
                  </tr>
                </table>
              `).join("")}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;">
              <a href="${viewUrl}"
                 style="display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:11px;letter-spacing:2.5px;text-transform:uppercase;
                        color:#2E2E2E;background-color:${GOLD};text-decoration:none;padding:14px 32px;">
                View your booking
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:32px;">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">
                Oraya - Luxury Boutique Villas - Lebanon
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    "",
    `Hello ${firstName},`,
    "",
    "Your event booking has been confirmed.",
    "Payment remains manual, and Oraya will share any requested deposit or balance details separately.",
    "",
    `Villa: ${payload.villa}`,
    `Dates: ${fmtDate(payload.check_in)} to ${fmtDate(payload.check_out)}`,
    `Event type: ${payload.event_type || "Custom event"}`,
    `Proposal total: ${formatMoney(proposalTotal)}`,
    "",
    `View your booking: ${viewUrl}`,
    "",
    "Oraya - Luxury Boutique Villas - Lebanon",
  ].join("\n");

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: payload.to,
    replyTo: REPLY_TO,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("[sendEventConfirmationEmail] Resend error:", error);
  } else {
    console.log(`[sendEventConfirmationEmail] email sent -> ${payload.to} (${subject})`);
  }
}
