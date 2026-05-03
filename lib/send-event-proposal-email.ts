import { Resend } from "resend";
import { LOGO_URL, SITE_URL } from "@/lib/brand";
import { createActionToken } from "@/lib/booking-action-token";
import { transactionalEmailFooterHtmlBlock, transactionalEmailFooterTextSuffix } from "@/lib/transactional-email-footer";

const GOLD = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED = "#8a8070";
const WHITE = "#FFFFFF";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";
const REPLY_TO = "hello@stayoraya.com";
const CURRENCY = "USD";

export interface EventProposalEmailPayload {
  to: string;
  name: string;
  booking_id: string;
  villa: string;
  check_out: string;
  event_type?: string | null;
  proposal_total_amount?: number | string | null;
  proposal_deposit_amount?: number | string | null;
  proposal_valid_until?: string | null;
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

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Beirut",
  }).format(parsed);
}

function checkOutExpiryUnix(checkOut: string): number {
  return Math.floor(new Date(`${checkOut}T23:59:59Z`).getTime() / 1000);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createViewUrl(bookingId: string, checkOut: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
  const { token } = createActionToken(bookingId, "view", {
    expiresAt: checkOutExpiryUnix(checkOut),
  });
  return `${base}/booking/view/${encodeURIComponent(token)}`;
}

function renderShell(
  subject: string,
  heading: string,
  intro: string,
  proposalRows: Array<[string, string]>,
  viewUrl: string
): string {
  return `<!DOCTYPE html>
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
                Event proposal
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:28px;font-weight:400;color:${WHITE};line-height:1.25;">
                ${heading}
              </h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.8;max-width:420px;">
                ${intro}
              </p>
            </td>
          </tr>
          <tr>
            <td style="border:0.5px solid rgba(197,164,109,0.2);padding:28px;">
              <p style="margin:0 0 20px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
                Proposal summary
              </p>
              ${proposalRows
                .map(
                  ([label, value]) => `
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
              `
                )
                .join("")}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;">
              <a href="${viewUrl}"
                 style="display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:11px;letter-spacing:2.5px;text-transform:uppercase;
                        color:#2E2E2E;background-color:${GOLD};text-decoration:none;padding:14px 32px;">
                View proposal
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:32px;">
              ${transactionalEmailFooterHtmlBlock()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendEventProposalEmail(payload: EventProposalEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendEventProposalEmail] RESEND_API_KEY not set - skipping email.");
    return;
  }

  const resend = new Resend(apiKey);
  const firstName = payload.name.split(" ")[0] || "Guest";
  const proposalTotal = parseAmount(payload.proposal_total_amount);
  const proposalDeposit = parseAmount(payload.proposal_deposit_amount);
  const validUntil = formatDateTime(payload.proposal_valid_until);
  const viewUrl = createViewUrl(payload.booking_id, payload.check_out);
  const subject = "Your Oraya event proposal is ready";
  const heading = `Your event proposal is ready<br/><em>${escapeHtml(firstName)}.</em>`;
  const intro =
    "Oraya has reviewed your event inquiry and prepared a custom proposal. Open the secure link below to review the full proposal and next steps.";
  const proposalRows: Array<[string, string]> = [
    ["Event type", payload.event_type || "Custom event"],
    ["Villa", payload.villa],
    ["Proposal total", formatMoney(proposalTotal)],
    ["Deposit required", formatMoney(proposalDeposit)],
    ["Valid until", validUntil ?? "To be confirmed"],
  ];

  const html = renderShell(subject, heading, intro, proposalRows, viewUrl);
  const text = [
    subject,
    "",
    `Hello ${firstName},`,
    "",
    "Your Oraya event proposal is ready.",
    "",
    ...proposalRows.map(([label, value]) => `${label}: ${value}`),
    "",
    `View proposal: ${viewUrl}`,
    "",
    ...transactionalEmailFooterTextSuffix(),
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
    console.error("[sendEventProposalEmail] Resend error:", error);
  } else {
    console.log(`[sendEventProposalEmail] email sent -> ${payload.to} (${subject})`);
  }
}
