import { Resend } from "resend";
import { LOGO_URL } from "@/lib/brand";
import { formatBeirutDateTime } from "@/lib/format-date";
import {
  extractEventInquiryGuestNotesLine,
  isEventInquiryPayload,
  parseEventSetupEstimateFromMessage,
  type EventSetupEstimatePayload,
} from "@/lib/event-inquiry-message";
import { transactionalEmailFooterHtmlBlock, transactionalEmailFooterTextSuffix } from "@/lib/transactional-email-footer";

const GOLD    = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED   = "#8a8070";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";
const REPLY_TO = "hello@stayoraya.com";
const WARN = "#e0b070";
const CURRENCY = "USD";

function fmtDate(iso: string): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAddonPrice(price: number | null) {
  if (typeof price !== "number") return "Price on request";
  return `$${price.toLocaleString("en-US")}`;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoney(value: number): string {
  return `${CURRENCY} ${Math.round(value).toLocaleString("en-US")}`;
}

function formatEventEstimateMoney(value: number): string {
  return `${CURRENCY} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildEventInquiryFinancialHtml(params: {
  eventEstimate: EventSetupEstimatePayload | null;
  staySubtotal: number | null;
  addonsTotal: number | null;
  addonRows: Array<{ label: string; price: number | null }>;
}): string {
  const { eventEstimate, staySubtotal, addonsTotal, addonRows } = params;
  const pk = eventEstimate?.pack_keys ?? [];
  const rec = eventEstimate?.recommended_subtotal;
  const upg = eventEstimate?.upgrades_subtotal;
  const showBreakdown =
    Boolean(eventEstimate) &&
    pk.length > 0 &&
    typeof rec === "number" &&
    typeof upg === "number";

  const estimateRows: [string, string][] = [];
  if (showBreakdown) {
    estimateRows.push(["Recommended setup (estimate)", formatEventEstimateMoney(rec!)]);
    if (upg! > 0) {
      estimateRows.push(["Optional upgrades selected (estimate)", formatEventEstimateMoney(upg!)]);
    }
  }
  estimateRows.push([
    "Estimated event setup total",
    eventEstimate ? formatEventEstimateMoney(eventEstimate.total) : "Not available",
  ]);

  const estimateRowsHtml = estimateRows
    .map(
      ([label, value]) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:0.5px solid rgba(255,255,255,0.05);">
      <tr>
        <td style="padding:9px 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">
          ${escapeHtml(label)}
        </td>
        <td align="right" style="padding:9px 0 0;font-size:13px;color:#ffffff;font-weight:300;">
          ${escapeHtml(value)}
        </td>
      </tr>
    </table>`,
    )
    .join("");

  const lines = eventEstimate?.lines ?? [];
  const servicesTable =
    lines.length === 0
      ? ""
      : `
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;margin-top:16px;">
      <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
        Selected services
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:0.5px solid rgba(255,255,255,0.08);margin-bottom:8px;">
        <tr>
          <td style="padding:6px 0;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">Service</td>
          <td style="padding:6px 0;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">Qty</td>
          <td align="right" style="padding:6px 0;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">Unit</td>
          <td align="right" style="padding:6px 0;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">Subtotal</td>
        </tr>
      </table>
      ${lines
        .map(
          (row) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:0.5px solid rgba(255,255,255,0.05);">
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#ffffff;">${escapeHtml(row.label)}</td>
          <td style="padding:8px 0;font-size:12px;color:${MUTED};">×${escapeHtml(String(row.quantity))}</td>
          <td align="right" style="padding:8px 0;font-size:12px;color:${MUTED};">${escapeHtml(formatEventEstimateMoney(row.unit_price))}</td>
          <td align="right" style="padding:8px 0;font-size:13px;color:#ffffff;">${escapeHtml(formatEventEstimateMoney(row.line_total))}</td>
        </tr>
      </table>`,
        )
        .join("")}
    </td></tr></table>`;

  const stayRows: [string, string][] = [];
  if (staySubtotal !== null) {
    stayRows.push(["Villa nights (reference, non-binding)", formatMoney(staySubtotal)]);
  }
  if (addonRows.length > 0) {
    stayRows.push([
      "Villa add-ons total (reference)",
      addonsTotal !== null ? formatMoney(addonsTotal) : "Price on request",
    ]);
  }
  const stayRefHtml =
    stayRows.length === 0
      ? ""
      : `
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(255,255,255,0.12);padding:22px 24px;background-color:rgba(255,255,255,0.02);margin-top:16px;">
      <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${MUTED};">
        Host overnight stay reference
      </p>
      ${stayRows
        .map(
          ([label, value]) => `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:0.5px solid rgba(255,255,255,0.05);">
        <tr>
          <td style="padding:9px 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">
            ${escapeHtml(label)}
          </td>
          <td align="right" style="padding:9px 0 0;font-size:13px;color:#ffffff;font-weight:300;">
            ${escapeHtml(value)}
          </td>
        </tr>
      </table>`,
        )
        .join("")}
    </td></tr></table>`;

  return `
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;background-color:rgba(197,164,109,0.04);">
      <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
        Event setup (estimate)
      </p>
      <p style="margin:0 0 12px;font-size:11px;line-height:1.65;color:${MUTED};">
        Starting from · non-binding. Final proposal will be confirmed by Oraya after review.
      </p>
      ${estimateRowsHtml}
    </td></tr></table>
    ${servicesTable}
    ${stayRefHtml}`;
}

function sumAddonPrices(addons: Array<{ price: number | null }>): number | null {
  if (addons.length === 0) return 0;
  let total = 0;
  for (const addon of addons) {
    if (typeof addon.price !== "number") return null;
    total += addon.price;
  }
  return total;
}

function formatAdvanceNotice(hours: number | null | undefined) {
  if (!hours || hours <= 0) return null;
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `Requires ${days} ${days === 1 ? "day" : "days"} advance notice`;
  }
  return `Requires ${hours} ${hours === 1 ? "hour" : "hours"} advance notice`;
}

function addonIconGlyph(label: string): string {
  const l = label.toLowerCase();
  if (/pool|water|hydro|aqua|swim|heated/.test(l)) return "~~";
  if (/fire|flame|diesel|wood|hearth|stove/.test(l)) return "FL";
  if (/breakfast|lunch|dinner|food|meal|dining|catering|coffee|drink/.test(l)) return "DN";
  if (/bed|linen|bedding|mattress|pillow|sheet/.test(l)) return "BD";
  return "SV";
}

function addonIconHtml(label: string): string {
  return `
    <td width="36" valign="top" style="padding:14px 0 14px 14px;">
      <div style="width:26px;height:26px;border-radius:6px;background-color:rgba(197,164,109,0.12);
                  border:0.5px solid rgba(197,164,109,0.28);color:${GOLD};font-size:9px;
                  letter-spacing:1px;text-align:center;line-height:26px;font-weight:600;">
        ${escapeHtml(addonIconGlyph(label))}
      </div>
    </td>`;
}

function formatRule(mode: string | null | undefined): string | null {
  if (mode === "strict") return "Strict rule: may block booking if conditions are not met";
  if (mode === "soft") return "Soft rule: booking allowed but requires review";
  if (mode === "none") return "No operational restriction";
  return null;
}

function formatSameDayWarning(value: string | null | undefined): string | null {
  if (value === "same_day_checkout") return "Early check-in risk: same-day checkout";
  if (value === "same_day_checkin") return "Late checkout risk: same-day check-in";
  return null;
}

export interface BookingRequestEmailPayload {
  recipients:      string[];           // admin recipient addresses
  booking_id:      string;
  requester_name:  string;
  requester_email: string;
  requester_phone: string | null;
  villa:           string;
  check_in:        string;
  check_out:       string;
  sleeping_guests: number;
  day_visitors:    number;
  event_type:      string | null;
  message:         string | null;
  addons:          Array<{ label: string }>;
  addons_snapshot?: Array<{
    id: string;
    label: string;
    price: number | null;
    category: string | null;
    preparation_time_hours: number | null;
    enforcement_mode: string | null;
    requires_approval: boolean;
    status: "pending_approval" | "confirmed" | "at_risk" | "approved" | "declined";
    same_day_warning?: "same_day_checkout" | "same_day_checkin" | null;
  }> | null;
  pricing_subtotal?: number | string | null;
  pricing_snapshot?: { subtotal?: number | string | null } | null;
  created_at:      string;
  admin_url:       string;             // link to /admin - empty string = no button
  confirm_url?:    string;             // signed action link - confirm booking
  cancel_url?:     string;             // signed action link - cancel booking
}

export async function sendBookingRequestEmail(
  payload: BookingRequestEmailPayload
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendBookingRequestEmail] RESEND_API_KEY not set - skipping email.");
    return;
  }

  const resend    = new Resend(apiKey);
  const ref       = payload.booking_id.slice(0, 8).toUpperCase();
  const isEventInquiry = isEventInquiryPayload(payload.event_type, payload.message);
  // Bug 3: only show free-text guest notes — never the raw [Event Inquiry] / [EventSetupEstimate] block.
  const cleanGuestNote = isEventInquiry
    ? extractEventInquiryGuestNotesLine(payload.message)?.trim() ?? ""
    : (payload.message ?? "").trim();
  const noteText = cleanGuestNote || "No special request provided.";
  const addonRows = (payload.addons_snapshot && payload.addons_snapshot.length > 0
    ? payload.addons_snapshot
    : payload.addons.map((addon) => ({
        id: addon.label,
        label: addon.label,
        price: null,
        category: null,
        preparation_time_hours: null,
        enforcement_mode: null,
        requires_approval: false,
        status: "confirmed" as const,
        same_day_warning: null,
      }))
  );
  const snap = payload.pricing_snapshot as { adjusted_stay_subtotal?: unknown; subtotal?: unknown } | undefined;
  const staySubtotal = parseAmount(snap?.adjusted_stay_subtotal ?? snap?.subtotal ?? payload.pricing_subtotal);
  const addonsTotal = sumAddonPrices(addonRows);
  const estimatedTotal = staySubtotal !== null && addonsTotal !== null
    ? staySubtotal + addonsTotal
    : null;

  const eventEstimate = isEventInquiry ? parseEventSetupEstimateFromMessage(payload.message) : null;

  const rows: [string, string][] = isEventInquiry
    ? [
        ["Reference", ref],
        ["Name", payload.requester_name],
        ["Email", payload.requester_email],
        ...(payload.requester_phone ? [["Phone", payload.requester_phone] as [string, string]] : []),
        ["Event type", payload.event_type ?? "—"],
        ["Villa", payload.villa],
        ["Preferred dates", `${fmtDate(payload.check_in)} → ${fmtDate(payload.check_out)}`],
        ["Expected attendees", String(payload.day_visitors)],
        ["Overnight hosts", String(payload.sleeping_guests)],
        ["Submitted", formatBeirutDateTime(payload.created_at)],
      ]
    : [
        ["Reference", ref],
        ["Name", payload.requester_name],
        ["Email", payload.requester_email],
        ...(payload.requester_phone ? [["Phone", payload.requester_phone] as [string, string]] : []),
        ["Villa", payload.villa],
        ["Check-in", fmtDate(payload.check_in)],
        ["Check-out", fmtDate(payload.check_out)],
        ["Sleeping guests", String(payload.sleeping_guests)],
        ["Day visitors", String(payload.day_visitors)],
        ...(payload.event_type ? [["Event type", payload.event_type] as [string, string]] : []),
        ["Submitted", formatBeirutDateTime(payload.created_at)],
      ];

  const rowsHtml = rows.map(([label, value]) => `
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-bottom:0.5px solid rgba(255,255,255,0.05);">
      <tr>
        <td style="padding:9px 0;font-size:10px;letter-spacing:1.5px;
                   text-transform:uppercase;color:${MUTED};width:42%;">
          ${label}
        </td>
        <td style="padding:9px 0;font-size:13px;color:#ffffff;font-weight:300;">
          ${escapeHtml(value)}
        </td>
      </tr>
    </table>`).join("");

  const notesHtml = `
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;">
      <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
        Special Request / Notes
      </p>
      <p style="margin:0;font-size:13px;line-height:1.75;color:#ffffff;white-space:pre-line;">
        ${escapeHtml(noteText)}
      </p>
    </td></tr></table>`;

  const paymentRows: [string, string, boolean][] = [
    ["Stay subtotal", staySubtotal !== null ? formatMoney(staySubtotal) : "Not available", false],
    ["Add-ons total", addonsTotal !== null ? formatMoney(addonsTotal) : "Price on request", false],
    ["Total estimated", estimatedTotal !== null ? formatMoney(estimatedTotal) : "Not available", true],
  ];

  const paymentHtml = `
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;background-color:rgba(197,164,109,0.04);">
      <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
        Payment Summary
      </p>
      ${paymentRows.map(([label, value, isTotal]) => `
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-top:${isTotal ? "0.5px solid rgba(197,164,109,0.2)" : "0.5px solid rgba(255,255,255,0.05)"};">
          <tr>
            <td style="padding:${isTotal ? "12px" : "9px"} 0 0;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};">
              ${label}
            </td>
            <td align="right" style="padding:${isTotal ? "12px" : "9px"} 0 0;font-size:${isTotal ? "16px" : "13px"};color:${isTotal ? GOLD : "#ffffff"};font-weight:${isTotal ? "600" : "300"};">
              ${escapeHtml(value)}
            </td>
          </tr>
        </table>
      `).join("")}
    </td></tr></table>`;

  const eventInquiryPaymentHtml = buildEventInquiryFinancialHtml({
    eventEstimate,
    staySubtotal,
    addonsTotal,
    addonRows,
  });

  const topPaymentHtml = isEventInquiry ? eventInquiryPaymentHtml : paymentHtml;

  const addonSectionTitle = isEventInquiry ? "Villa add-ons" : "Add-ons";
  const addonSectionEmpty = isEventInquiry ? "No villa add-ons for this inquiry." : "No add-ons selected.";

  const addonsHtml = addonRows.length === 0
    ? `
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;">
        <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
          ${addonSectionTitle}
        </p>
        <p style="margin:0;font-size:13px;line-height:1.75;color:#ffffff;">
          ${addonSectionEmpty}
        </p>
      </td></tr></table>`
    : `
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;">
        <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
          ${addonSectionTitle}
        </p>
        ${addonRows.map((addon) => {
          const lines = [
            typeof addon.price === "number" ? formatAddonPrice(addon.price) : null,
            formatAdvanceNotice(addon.preparation_time_hours),
            addon.requires_approval ? "Requires manager approval" : null,
            formatRule(addon.enforcement_mode),
            formatSameDayWarning(addon.same_day_warning),
          ].filter((line): line is string => Boolean(line));

          return `
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border:0.5px solid rgba(255,255,255,0.07);background-color:rgba(255,255,255,0.025);margin-top:10px;border-radius:10px;">
              <tr>
                ${addonIconHtml(addon.label)}
                <td style="padding:14px 16px 14px 10px;">
                  <p style="margin:0 0 6px;font-size:14px;line-height:1.4;color:#ffffff;">
                    ${escapeHtml(addon.label)}
                  </p>
                  ${lines.map((line) => `
                    <p style="margin:0 0 4px;font-size:12px;line-height:1.65;color:${line.includes("Strict rule") || line.includes("Soft rule") || line.includes("Requires") ? WARN : MUTED};">
                      ${escapeHtml(line)}
                    </p>
                  `).join("")}
                </td>
              </tr>
            </table>`;
        }).join("")}
      </td></tr></table>`;

  // Action buttons - prefer signed confirm/cancel links; fall back to generic admin link
  const adminBtn = (payload.confirm_url || payload.cancel_url)
    ? `<tr><td align="center" style="padding-top:28px;">
         <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
           <tr>
             ${payload.confirm_url ? `
             <td style="padding-right:10px;">
               <a href="${payload.confirm_url}"
                  style="display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                         font-size:11px;letter-spacing:2.5px;text-transform:uppercase;
                         color:#2E2E2E;background-color:${GOLD};text-decoration:none;padding:14px 32px;">
                 Confirm
               </a>
             </td>` : ""}
             ${payload.cancel_url ? `
             <td>
               <a href="${payload.cancel_url}"
                  style="display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                         font-size:11px;letter-spacing:2.5px;text-transform:uppercase;
                         color:${GOLD};background-color:transparent;
                         border:0.5px solid ${GOLD};text-decoration:none;padding:14px 32px;">
                 Cancel
               </a>
             </td>` : ""}
           </tr>
         </table>
         ${payload.admin_url ? `
         <p style="margin:12px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                   font-size:10px;letter-spacing:1px;color:rgba(255,255,255,0.25);">
           or <a href="${payload.admin_url}"
                 style="color:rgba(197,164,109,0.6);text-decoration:underline;">open admin dashboard</a>
         </p>` : ""}
       </td></tr>`
    : payload.admin_url
      ? `<tr><td align="center" style="padding-top:28px;">
           <a href="${payload.admin_url}"
              style="display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                     font-size:11px;letter-spacing:2.5px;text-transform:uppercase;
                     color:#2E2E2E;background-color:${GOLD};text-decoration:none;padding:14px 32px;">
             Review in Admin
           </a>
         </td></tr>`
      : "";

  const emailTitle = isEventInquiry ? "New Event Inquiry" : "New Booking Request";
  const eyebrowText = isEventInquiry ? "New Event Inquiry Submitted" : "New Booking Request";
  const headingHtml = isEventInquiry
    ? `A new event inquiry has been<br/><em>submitted for review.</em>`
    : `A new booking request has been<br/><em>submitted for review.</em>`;
  const detailsCardLabel = isEventInquiry ? "Event inquiry" : "Booking Details";

  const subjectPrefix = isEventInquiry ? "Oraya - New event inquiry" : "Oraya - New Booking Request";
  const subject = `${subjectPrefix} [${ref}]`;

  const eventPaymentTextLines: string[] = isEventInquiry
    ? (() => {
        const lines: string[] = [];
        const pk = eventEstimate?.pack_keys ?? [];
        const rec = eventEstimate?.recommended_subtotal;
        const upg = eventEstimate?.upgrades_subtotal;
        if (eventEstimate && pk.length > 0 && typeof rec === "number" && typeof upg === "number") {
          lines.push(`Recommended setup (estimate): ${formatEventEstimateMoney(rec)}`);
          if (upg > 0) {
            lines.push(`Optional upgrades selected (estimate): ${formatEventEstimateMoney(upg)}`);
          }
        }
        lines.push(
          `Estimated event setup total: ${
            eventEstimate ? formatEventEstimateMoney(eventEstimate.total) : "Not available"
          }`,
        );
        if (staySubtotal !== null) {
          lines.push(`Villa nights (reference, non-binding): ${formatMoney(staySubtotal)}`);
        }
        if (addonRows.length > 0) {
          lines.push(
            `Villa add-ons total (reference): ${
              addonsTotal !== null ? formatMoney(addonsTotal) : "Price on request"
            }`,
          );
        }
        if (eventEstimate?.lines?.length) {
          lines.push("", "Selected services:");
          for (const row of eventEstimate.lines) {
            lines.push(
              `  - ${row.label} ×${row.quantity} @ ${formatEventEstimateMoney(row.unit_price)} → ${formatEventEstimateMoney(row.line_total)}`,
            );
          }
        }
        return lines;
      })()
    : [];

  const paymentSummaryLabel = isEventInquiry ? "Event setup (estimate):" : "Payment Summary:";
  const textIntro = isEventInquiry
    ? "A new event inquiry has been submitted for review."
    : "A new booking request has been submitted for review.";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${emailTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:${MIDNIGHT};
             font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background-color:${MIDNIGHT};padding:48px 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="${LOGO_URL}"
               alt="Oraya"
               width="140"
               height="140"
               border="0"
               style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;" />
        </td></tr>

        <!-- Rule -->
        <tr><td align="center" style="padding-bottom:28px;">
          <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.5;"></div>
        </td></tr>

        <!-- Eyebrow -->
        <tr><td align="center" style="padding-bottom:12px;">
          <p style="margin:0;font-size:10px;letter-spacing:4px;
                    text-transform:uppercase;color:${GOLD};">${eyebrowText}</p>
        </td></tr>

        <!-- Heading -->
        <tr><td align="center" style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:24px;font-weight:400;color:#ffffff;line-height:1.35;">
            ${headingHtml}
          </h1>
        </td></tr>

        <!-- Rule -->
        <tr><td align="center" style="padding-bottom:28px;">
          <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.3;"></div>
        </td></tr>

        <!-- Details card -->
        <tr><td style="border:0.5px solid rgba(197,164,109,0.2);padding:28px;">
          <p style="margin:0 0 20px;font-size:9px;letter-spacing:3px;
                    text-transform:uppercase;color:${GOLD};">${detailsCardLabel}</p>
          ${rowsHtml}
        </td></tr>

        <tr><td style="padding-top:16px;">${topPaymentHtml}</td></tr>

        <tr><td style="padding-top:16px;">${notesHtml}</td></tr>

        <tr><td style="padding-top:16px;">${addonsHtml}</td></tr>

        <!-- Admin link -->
        ${adminBtn}

        <!-- Footer -->
        <tr><td align="center" style="padding-top:28px;">
          ${transactionalEmailFooterHtmlBlock()}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    "",
    textIntro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value.replace(/<[^>]+>/g, "")}`),
    "",
    paymentSummaryLabel,
    ...(isEventInquiry ? eventPaymentTextLines : paymentRows.map(([label, value]) => `${label}: ${value}`)),
    "",
    `Special Request / Notes: ${noteText}`,
    "",
    `${addonSectionTitle}:`,
    ...(addonRows.length === 0
      ? [`- ${addonSectionEmpty}`]
      : addonRows.flatMap((addon) => {
          const lines = [
            `- ${addon.label}`,
            ...(typeof addon.price === "number" ? [`  Price: ${formatAddonPrice(addon.price)}`] : []),
            ...(formatAdvanceNotice(addon.preparation_time_hours) ? [`  ${formatAdvanceNotice(addon.preparation_time_hours)}`] : []),
            ...(addon.requires_approval ? ["  Requires manager approval"] : []),
            ...(formatRule(addon.enforcement_mode) ? [`  ${formatRule(addon.enforcement_mode)}`] : []),
            ...(formatSameDayWarning(addon.same_day_warning) ? [`  ${formatSameDayWarning(addon.same_day_warning)}`] : []),
          ];
          return lines;
        })),
    ...(payload.confirm_url ? ["", `Confirm: ${payload.confirm_url}`] : []),
    ...(payload.cancel_url ? [`Cancel: ${payload.cancel_url}`] : []),
    ...(payload.admin_url ? [`Admin: ${payload.admin_url}`] : []),
    "",
    ...transactionalEmailFooterTextSuffix(),
  ].join("\n");

  const { error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      payload.recipients,
    replyTo: REPLY_TO,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("[sendBookingRequestEmail] Resend error:", error);
  } else {
    console.log(`[sendBookingRequestEmail] sent -> ${payload.recipients.join(", ")}`);
  }
}
