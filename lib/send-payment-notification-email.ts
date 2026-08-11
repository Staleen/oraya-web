import { Resend } from "resend";
import type { CheckoutSetupFailureAlert } from "./payments/checkout-setup-alert.ts";
import { LOGO_URL } from "@/lib/brand";
import { reportMissingResendKey } from "@/lib/email-config";
import {
  transactionalEmailFooterHtmlBlock,
  transactionalEmailFooterTextSuffix,
} from "@/lib/transactional-email-footer";

/**
 * Phase 16B M2 — the two messages a recorded payment produces.
 *
 *  1. sendStandalonePaymentReceiptEmail — a guest receipt for money that is
 *     NOT attached to a booking (an Ops payment link the operator did not
 *     link). Booking-linked receipts keep using the existing
 *     sendBookingPaymentReceivedEmail template via lib/payments/ledger-receipt.
 *  2. sendOperatorMoneyAlertEmail — the operator's "money landed" (or "a
 *     payment failed / needs review") alert.
 *
 * Safe fields only. No PAN, no tokens, no provider payloads, no secrets — the
 * provider reference is the Business Center search id and nothing more.
 *
 * Neither function throws: a notification must never fail a payment.
 */

const GOLD = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const WHITE = "#FFFFFF";
const MUTED = "#8a8070";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";
const REPLY_TO = "hello@stayoraya.com";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMoney(amount: number, currency: string): string {
  if (currency === "LBP") return `${Math.round(amount).toLocaleString("en-US")} LBP`;
  return `$${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function describePaymentMethod(method: string): string {
  switch (method) {
    case "card": return "Debit / Credit Card";
    case "cash": return "Cash";
    case "bank_transfer": return "Bank transfer";
    case "wallet": return "Wallet";
    case "transfer": return "Transfer";
    default: return method.replaceAll("_", " ");
  }
}

function row(label: string, value: string): string {
  return `<tr>
  <td style="padding:6px 0;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</td>
  <td style="padding:6px 0;font-size:14px;color:${WHITE};text-align:right;">${escapeHtml(value)}</td>
</tr>`;
}

function shell(title: string, eyebrow: string, bodyRows: string, lead: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:${MIDNIGHT};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${MIDNIGHT};padding:48px 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td align="center" style="padding-bottom:28px;">
          <img src="${LOGO_URL}" alt="Oraya" width="120" height="120" border="0" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;" />
        </td></tr>
        <tr><td align="center" style="padding-bottom:16px;"><div style="width:40px;height:1px;background-color:${GOLD};opacity:0.5;"></div></td></tr>
        <tr><td align="center" style="padding-bottom:12px;">
          <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">${escapeHtml(eyebrow)}</p>
        </td></tr>
        <tr><td align="center" style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:26px;font-weight:400;color:${WHITE};">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <p style="margin:0;font-size:14px;line-height:1.7;color:rgba(255,255,255,0.72);">${escapeHtml(lead)}</p>
        </td></tr>
        <tr><td style="padding-bottom:28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(197,164,109,0.25);border-bottom:1px solid rgba(197,164,109,0.25);padding:6px 0;">
            ${bodyRows}
          </table>
        </td></tr>
        <tr><td align="center">${transactionalEmailFooterHtmlBlock()}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export type PaymentReceiptPayload = {
  to: string;
  name: string | null;
  amount: number;
  currency: string;
  method: string;
  description: string | null;
  reference: string | null;
};

/** Guest receipt for a payment with no booking attached. Never throws. */
export async function sendStandalonePaymentReceiptEmail(
  payload: PaymentReceiptPayload,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    reportMissingResendKey("sendStandalonePaymentReceiptEmail");
    return false;
  }
  const amount = formatMoney(payload.amount, payload.currency);
  const rows = [
    row("Amount received", amount),
    row("Paid by", describePaymentMethod(payload.method)),
    payload.description ? row("For", payload.description) : "",
    payload.reference ? row("Reference", payload.reference) : "",
  ].join("");
  const html = shell(
    "Payment received",
    "Receipt",
    rows,
    `Thank you${payload.name ? `, ${payload.name}` : ""}. We have received your payment of ${amount}.`,
  );
  const text = [
    "Payment received",
    "",
    `Thank you${payload.name ? `, ${payload.name}` : ""}. We have received your payment of ${amount}.`,
    `Paid by: ${describePaymentMethod(payload.method)}`,
    payload.description ? `For: ${payload.description}` : "",
    payload.reference ? `Reference: ${payload.reference}` : "",
    "",
    ...transactionalEmailFooterTextSuffix(),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: payload.to,
      subject: `Payment received — ${amount}`,
      html,
      text,
    });
    if (error) {
      console.error("[sendStandalonePaymentReceiptEmail] Resend error:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[sendStandalonePaymentReceiptEmail] send failed:", error);
    return false;
  }
}

export type OperatorMoneyAlertPayload = {
  to: string[];
  outcome: "recorded" | "failed" | "ambiguous";
  amount: number;
  currency: string;
  method: string;
  /** Guest or payer name — safe. */
  subject_name: string | null;
  /** Villa + dates when the money belongs to a booking. */
  villa: string | null;
  check_in: string | null;
  check_out: string | null;
  /** Public 8-character booking reference, never the UUID. */
  booking_reference: string | null;
  description: string | null;
  reference: string | null;
  source: string;
};

/** Operator alert for every recorded, failed, or ambiguous payment. Never throws. */
export async function sendOperatorMoneyAlertEmail(
  payload: OperatorMoneyAlertPayload,
): Promise<boolean> {
  if (payload.to.length === 0) return false;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    reportMissingResendKey("sendOperatorMoneyAlertEmail");
    return false;
  }
  const amount = formatMoney(payload.amount, payload.currency);
  const heading =
    payload.outcome === "recorded"
      ? "Money received"
      : payload.outcome === "failed"
        ? "Payment failed"
        : "Payment needs review";
  const lead =
    payload.outcome === "recorded"
      ? `${amount} was recorded in Oraya.`
      : payload.outcome === "failed"
        ? `A payment of ${amount} was not completed. No money was taken.`
        : `A payment of ${amount} could not be confirmed. Check Business Center before doing anything — do not retry it.`;
  const stay =
    payload.check_in && payload.check_out
      ? `${payload.check_in} → ${payload.check_out}`
      : null;
  const rows = [
    row("Amount", amount),
    row("Method", describePaymentMethod(payload.method)),
    payload.subject_name ? row("From", payload.subject_name) : "",
    payload.villa ? row("Villa", payload.villa) : "",
    stay ? row("Stay", stay) : "",
    payload.booking_reference ? row("Booking", payload.booking_reference) : "",
    payload.description ? row("For", payload.description) : "",
    payload.reference ? row("Reference", payload.reference) : "",
    row("Seen by", payload.source),
  ].join("");
  const html = shell(heading, "Oraya operations", rows, lead);
  const text = [
    heading,
    "",
    lead,
    `Method: ${describePaymentMethod(payload.method)}`,
    payload.subject_name ? `From: ${payload.subject_name}` : "",
    payload.villa ? `Villa: ${payload.villa}` : "",
    stay ? `Stay: ${stay}` : "",
    payload.booking_reference ? `Booking: ${payload.booking_reference}` : "",
    payload.description ? `For: ${payload.description}` : "",
    payload.reference ? `Reference: ${payload.reference}` : "",
    `Seen by: ${payload.source}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: payload.to,
      subject: `${heading} — ${amount}${payload.villa ? ` · ${payload.villa}` : ""}`,
      html,
      text,
    });
    if (error) {
      console.error("[sendOperatorMoneyAlertEmail] Resend error:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[sendOperatorMoneyAlertEmail] send failed:", error);
    return false;
  }
}

/**
 * The guest asked to pay and no checkout could be opened.
 *
 * Deliberately NOT a money alert: no payment was attempted at the bank, so
 * calling it "failed" would put a phantom attempt in the operator's mental
 * ledger. This is a sales failure with an outstanding promise attached.
 */
export async function sendOperatorCheckoutSetupFailureEmail(payload: {
  to: string[];
  alert: CheckoutSetupFailureAlert;
}): Promise<boolean> {
  if (payload.to.length === 0) return false;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    reportMissingResendKey("sendOperatorCheckoutSetupFailureEmail");
    return false;
  }
  const [lead, ...rest] = payload.alert.lines;
  const body = rest
    .map(
      (line) =>
        `<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:${WHITE};">${escapeHtml(line)}</p>`,
    )
    .join("");
  const html = shell("Guest could not pay", "Oraya operations", body, lead ?? "");

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: payload.to,
      subject: payload.alert.subject,
      html,
      text: payload.alert.lines.join("\n"),
    });
    if (error) {
      console.error("[sendOperatorCheckoutSetupFailureEmail] Resend error:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[sendOperatorCheckoutSetupFailureEmail] send failed:", error);
    return false;
  }
}
