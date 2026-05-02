import { Resend } from "resend";
import { LOGO_URL, SITE_URL } from "@/lib/brand";
import { createActionToken } from "@/lib/booking-action-token";

const GOLD = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED = "#8a8070";
const WHITE = "#FFFFFF";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";
const REPLY_TO = "bookings@stayoraya.com";
const CURRENCY = "USD";

type PaymentEmailVariant = "requested" | "received" | "reminder";

export interface BookingPaymentEmailPayload {
  to: string;
  name: string;
  villa: string;
  check_in: string;
  check_out: string;
  booking_id: string;
  payment_status?: string | null;
  deposit_amount?: number | string | null;
  amount_paid?: number | string | null;
  payment_due_at?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  pricing_subtotal?: number | string | null;
  pricing_snapshot?: { subtotal?: number | string | null } | null;
  addons_snapshot?: Array<{ price?: number | null }> | null;
}

function fmtDate(iso: string): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
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

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoney(value: number | null): string {
  if (value === null) return "Not available";
  return `${CURRENCY} ${Math.round(value).toLocaleString("en-US")}`;
}

function sumAddonPrices(addons: Array<{ price?: number | null }> | null | undefined): number | null {
  if (!addons || addons.length === 0) return 0;
  let total = 0;
  for (const addon of addons) {
    if (typeof addon.price !== "number") return null;
    total += addon.price;
  }
  return total;
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

function renderShell(subject: string, eyebrow: string, heading: string, intro: string, sections: string, ctaLabel: string, viewUrl: string): string {
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
                ${escapeHtml(eyebrow)}
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
            <td align="center" style="padding-bottom:28px;">
              <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.3;"></div>
            </td>
          </tr>
          ${sections}
          <tr>
            <td align="center" style="padding-top:28px;">
              <a href="${viewUrl}"
                 style="display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:11px;letter-spacing:2.5px;text-transform:uppercase;
                        color:#2E2E2E;background-color:${GOLD};text-decoration:none;padding:14px 32px;">
                ${escapeHtml(ctaLabel)}
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
}

function renderSummaryCard(rows: Array<[string, string]>): string {
  return `
    <tr>
      <td style="border:0.5px solid rgba(197,164,109,0.2);padding:28px;">
        <p style="margin:0 0 20px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
          Booking Summary
        </p>
        ${rows.map(([label, value]) => `
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
    </tr>`;
}

function renderPaymentCard(title: string, lines: Array<[string, string]>, extraHtml: string): string {
  return `
    <tr>
      <td style="padding-top:16px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;background-color:rgba(197,164,109,0.04);">
              <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
                ${escapeHtml(title)}
              </p>
              ${lines.map(([label, value]) => `
                <table width="100%" cellpadding="0" cellspacing="0" style="border-top:0.5px solid rgba(255,255,255,0.05);">
                  <tr>
                    <td style="padding:10px 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">
                      ${escapeHtml(label)}
                    </td>
                    <td align="right" style="padding:10px 0 0;font-size:13px;color:${WHITE};font-weight:300;">
                      ${escapeHtml(value)}
                    </td>
                  </tr>
                </table>
              `).join("")}
              ${extraHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function createViewUrl(bookingId: string, checkOut: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
  const { token } = createActionToken(bookingId, "view", {
    expiresAt: checkOutExpiryUnix(checkOut),
  });
  return `${base}/booking/view/${encodeURIComponent(token)}`;
}

async function sendPaymentEmail(
  variant: PaymentEmailVariant,
  payload: BookingPaymentEmailPayload
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[sendPaymentEmail:${variant}] RESEND_API_KEY not set - skipping email.`);
    return;
  }

  const resend = new Resend(apiKey);
  const firstName = payload.name.split(" ")[0] || "Guest";
  const viewUrl = createViewUrl(payload.booking_id, payload.check_out);
  const staySubtotal = parseAmount(payload.pricing_snapshot?.subtotal ?? payload.pricing_subtotal);
  const addonsTotal = sumAddonPrices(payload.addons_snapshot);
  const estimatedTotal = staySubtotal !== null && addonsTotal !== null
    ? staySubtotal + addonsTotal
    : null;
  const depositAmount = parseAmount(payload.deposit_amount);
  const amountPaid = parseAmount(payload.amount_paid);
  const remainingBalance = estimatedTotal !== null && amountPaid !== null
    ? Math.max(0, estimatedTotal - amountPaid)
    : null;

  const summaryRows: Array<[string, string]> = [
    ["Villa", payload.villa],
    ["Dates", `${fmtDate(payload.check_in)} to ${fmtDate(payload.check_out)}`],
    ["Estimated total", formatMoney(estimatedTotal)],
  ];

  let subject = "";
  let eyebrow = "";
  let heading = "";
  let intro = "";
  let paymentTitle = "";
  let paymentLines: Array<[string, string]> = [];
  let paymentExtra = "";

  if (variant === "requested") {
    subject = "Payment requested for your Oraya booking";
    eyebrow = "Payment requested";
    heading = `A payment request has been prepared<br/><em>for your stay, ${escapeHtml(firstName)}.</em>`;
    intro = "Please review the requested deposit below and use the secure booking link for the latest booking and payment instructions.";
    paymentTitle = "Deposit requested";
    paymentLines = [
      ["Deposit amount", formatMoney(depositAmount)],
      ["Due date", formatDateTime(payload.payment_due_at) ?? "Not provided"],
    ];
    paymentExtra = `
      <div style="padding-top:14px;">
        <p style="margin:0 0 10px;font-size:12px;line-height:1.75;color:${WHITE};">
          Please complete payment using one of the available methods and send the reference to Oraya.
        </p>
        <p style="margin:0 0 6px;font-size:12px;line-height:1.7;color:${MUTED};">
          Whish: Send payment via Whish using the details provided by Oraya.
        </p>
        <p style="margin:0 0 6px;font-size:12px;line-height:1.7;color:${MUTED};">
          Bank transfer: Use the bank transfer details provided by Oraya.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.7;color:${MUTED};">
          Cash: Cash payment can be arranged directly with Oraya.
        </p>
      </div>`;
  } else if (variant === "received") {
    const fullyPaid = payload.payment_status === "paid_in_full" || (remainingBalance !== null && remainingBalance <= 0);
    subject = "Payment received — your booking is secured";
    eyebrow = "Payment received";
    heading = fullyPaid
      ? `Your payment has been received<br/><em>in full, ${escapeHtml(firstName)}.</em>`
      : `Your payment has been received<br/><em>and your booking is secured.</em>`;
    intro = fullyPaid
      ? "Thank you. We have recorded your payment in full for this stay."
      : "Thank you. We have recorded your payment and noted the remaining balance for this stay.";
    paymentTitle = fullyPaid ? "Booking fully paid" : "Payment received";
    paymentLines = [
      ["Amount received", formatMoney(amountPaid)],
      ...(remainingBalance !== null && remainingBalance > 0 ? [["Remaining balance", formatMoney(remainingBalance)] as [string, string]] : []),
      ...(payload.payment_method ? [["Method", payload.payment_method.replaceAll("_", " ")] as [string, string]] : []),
      ...(payload.payment_reference ? [["Reference", payload.payment_reference] as [string, string]] : []),
    ];
  } else {
    subject = "Reminder: payment pending for your Oraya booking";
    eyebrow = "Payment reminder";
    heading = `A friendly reminder<br/><em>for your Oraya booking.</em>`;
    intro = "This is a reminder that payment is still pending for your stay. Please review the requested amount and due date below.";
    paymentTitle = "Payment pending";
    paymentLines = [
      ["Deposit amount", formatMoney(depositAmount)],
      ["Due date", formatDateTime(payload.payment_due_at) ?? "Not provided"],
    ];
    paymentExtra = `
      <div style="padding-top:14px;">
        <p style="margin:0 0 10px;font-size:12px;line-height:1.75;color:${WHITE};">
          Please complete payment using one of the available methods and send the reference to Oraya.
        </p>
        <p style="margin:0 0 6px;font-size:12px;line-height:1.7;color:${MUTED};">
          Whish: Send payment via Whish using the details provided by Oraya.
        </p>
        <p style="margin:0 0 6px;font-size:12px;line-height:1.7;color:${MUTED};">
          Bank transfer: Use the bank transfer details provided by Oraya.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.7;color:${MUTED};">
          Cash: Cash payment can be arranged directly with Oraya.
        </p>
      </div>`;
  }

  const html = renderShell(
    subject,
    eyebrow,
    heading,
    intro,
    [renderSummaryCard(summaryRows), renderPaymentCard(paymentTitle, paymentLines, paymentExtra)].join(""),
    "View your booking",
    viewUrl
  );

  const text = [
    subject,
    "",
    `Hello ${firstName},`,
    "",
    intro,
    "",
    ...summaryRows.map(([label, value]) => `${label}: ${value}`),
    "",
    `${paymentTitle}:`,
    ...paymentLines.map(([label, value]) => `${label}: ${value}`),
    ...(variant !== "received"
      ? [
          "",
          "Payment instructions:",
          "Whish: Send payment via Whish using the details provided by Oraya.",
          "Bank transfer: Use the bank transfer details provided by Oraya.",
          "Cash: Cash payment can be arranged directly with Oraya.",
        ]
      : []),
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
    console.error(`[sendPaymentEmail:${variant}] Resend error:`, error);
  } else {
    console.log(`[sendPaymentEmail:${variant}] email sent -> ${payload.to} (${subject})`);
  }
}

export async function sendBookingPaymentRequestedEmail(payload: BookingPaymentEmailPayload): Promise<void> {
  await sendPaymentEmail("requested", payload);
}

export async function sendBookingPaymentReceivedEmail(payload: BookingPaymentEmailPayload): Promise<void> {
  await sendPaymentEmail("received", payload);
}

export async function sendBookingPaymentReminderEmail(payload: BookingPaymentEmailPayload): Promise<void> {
  await sendPaymentEmail("reminder", payload);
}
