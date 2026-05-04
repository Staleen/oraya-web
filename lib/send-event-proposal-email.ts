import { Resend } from "resend";
import { LOGO_URL, SITE_URL } from "@/lib/brand";
import { createActionToken } from "@/lib/booking-action-token";
import { transactionalEmailFooterHtmlBlock, transactionalEmailFooterTextSuffix } from "@/lib/transactional-email-footer";
import type { ProposalEmailLineItem } from "@/lib/event-proposal-line-items";
import { formatPaymentMethodLabel } from "@/lib/payment-method-labels";

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
  check_in: string;
  check_out: string;
  event_type?: string | null;
  proposal_total_amount?: number | string | null;
  proposal_deposit_amount?: number | string | null;
  proposal_valid_until?: string | null;
  proposal_payment_methods?: string[] | null;
  service_lines?: ProposalEmailLineItem[];
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

function renderPricingTableHtml(lines: ProposalEmailLineItem[]): string {
  if (lines.length === 0) return "";
  const header = `
    <tr>
      <th align="left" style="padding:8px 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};border-bottom:0.5px solid rgba(255,255,255,0.08);width:48%;">Service</th>
      <th align="right" style="padding:8px 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};border-bottom:0.5px solid rgba(255,255,255,0.08);width:10%;">Qty</th>
      <th align="right" style="padding:8px 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};border-bottom:0.5px solid rgba(255,255,255,0.08);width:21%;">Unit</th>
      <th align="right" style="padding:8px 6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};border-bottom:0.5px solid rgba(255,255,255,0.08);width:21%;">Subtotal</th>
    </tr>`;
  const body = lines
    .map(
      (row) => `
    <tr>
      <td style="padding:10px 6px;font-size:13px;line-height:1.45;color:${WHITE};border-bottom:0.5px solid rgba(255,255,255,0.05);word-break:break-word;">${escapeHtml(row.label)}</td>
      <td align="right" style="padding:10px 6px;font-size:13px;color:${WHITE};border-bottom:0.5px solid rgba(255,255,255,0.05);white-space:nowrap;">${row.quantity}</td>
      <td align="right" style="padding:10px 6px;font-size:13px;color:${WHITE};border-bottom:0.5px solid rgba(255,255,255,0.05);white-space:nowrap;">${formatMoney(row.unit_price)}</td>
      <td align="right" style="padding:10px 6px;font-size:13px;color:${GOLD};border-bottom:0.5px solid rgba(255,255,255,0.05);white-space:nowrap;">${formatMoney(row.line_total)}</td>
    </tr>`,
    )
    .join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px;table-layout:fixed;">
      ${header}
      ${body}
    </table>`;
}

function renderShell(
  subject: string,
  heading: string,
  intro: string,
  innerHtml: string,
  viewUrl: string,
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
                Proposal details
              </p>
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;">
              <a href="${viewUrl}"
                 style="display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:11px;letter-spacing:2.5px;text-transform:uppercase;
                        color:#2E2E2E;background-color:${GOLD};text-decoration:none;padding:14px 32px;">
                Review &amp; accept proposal
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
  const paymentDeadline = formatDateTime(payload.proposal_valid_until);
  const viewUrl = createViewUrl(payload.booking_id, payload.check_out);
  const subject = "Your Oraya event proposal is ready";
  const heading = `Your event proposal is ready<br/><em>${escapeHtml(firstName)}.</em>`;
  const intro =
    "Oraya has reviewed your event inquiry and prepared a custom proposal. Review the line items below, then open your secure link to accept or decline.";

  const lines = Array.isArray(payload.service_lines) && payload.service_lines.length > 0
    ? payload.service_lines
    : proposalTotal !== null
      ? [
          {
            label: "Event proposal (total)",
            quantity: 1,
            unit_price: proposalTotal,
            line_total: proposalTotal,
          },
        ]
      : [];

  const tableHtml = renderPricingTableHtml(lines);

  const methods = (payload.proposal_payment_methods ?? [])
    .map((m) => formatPaymentMethodLabel(m))
    .filter(Boolean);
  const methodsDisplay = methods.length > 0 ? methods.join(", ") : "To be confirmed";

  const balanceDue =
    proposalTotal !== null && proposalDeposit !== null && proposalTotal - proposalDeposit > 0
      ? proposalTotal - proposalDeposit
      : null;
  const summaryRowsHtml = `
    ${tableHtml}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr>
        <td style="padding:10px 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">Final event total</td>
        <td align="right" style="padding:10px 0;font-size:14px;color:${WHITE};">${escapeHtml(formatMoney(proposalTotal))}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">Deposit required</td>
        <td align="right" style="padding:10px 0;font-size:14px;color:${WHITE};">${escapeHtml(formatMoney(proposalDeposit))}</td>
      </tr>
      ${
        balanceDue !== null
          ? `<tr>
        <td style="padding:10px 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">Balance due</td>
        <td align="right" style="padding:10px 0;font-size:14px;color:${WHITE};">${escapeHtml(formatMoney(balanceDue))}</td>
      </tr>`
          : ""
      }
      <tr>
        <td style="padding:10px 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">Payment deadline</td>
        <td align="right" style="padding:10px 0;font-size:13px;color:${WHITE};">${escapeHtml(paymentDeadline ?? "To be confirmed")}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:12px 0 0;font-size:12px;color:${MUTED};line-height:1.65;">
          <span style="display:block;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};margin-bottom:6px;">Payment methods</span>
          ${escapeHtml(methodsDisplay)}
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:${MUTED};line-height:1.65;">
      Villa: <span style="color:${WHITE};">${escapeHtml(payload.villa)}</span>
      · Event date: <span style="color:${WHITE};">${escapeHtml(payload.check_in)}</span>
      · Type: <span style="color:${WHITE};">${escapeHtml(payload.event_type || "Custom event")}</span>
    </p>
  `;

  const html = renderShell(subject, heading, intro, summaryRowsHtml, viewUrl);

  const textLines: string[] = [
    subject,
    "",
    `Hello ${firstName},`,
    "",
    "Your Oraya event proposal is ready.",
    "",
    `Villa: ${payload.villa} | Event date: ${payload.check_in} | Type: ${payload.event_type || "Custom event"}`,
    "",
    "Services:",
    ...lines.map(
      (row) =>
        `  - ${row.label} | Qty ${row.quantity} | Unit ${formatMoney(row.unit_price)} | Subtotal ${formatMoney(row.line_total)}`,
    ),
    "",
    `Final event total: ${formatMoney(proposalTotal)}`,
    `Deposit required: ${formatMoney(proposalDeposit)}`,
    ...(balanceDue !== null ? [`Balance due: ${formatMoney(balanceDue)}`] : []),
    `Payment deadline: ${paymentDeadline ?? "To be confirmed"}`,
    `Payment methods: ${methodsDisplay}`,
    "",
    `Review and accept: ${viewUrl}`,
    "",
    ...transactionalEmailFooterTextSuffix(),
  ];

  const text = textLines.join("\n");

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
