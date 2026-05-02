import { Resend } from "resend";
import { LOGO_URL, SITE_URL } from "@/lib/brand";
import { createActionToken } from "@/lib/booking-action-token";

const GOLD     = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED    = "#8a8070";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";
const REPLY_TO = "bookings@stayoraya.com";
const CURRENCY = "USD";

function fmtDate(iso: string) {
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

function formatAddonPrice(price: number | null | undefined): string {
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

function sumAddonPrices(addons: Array<{ price: number | null | undefined }>): number | null {
  if (addons.length === 0) return 0;
  let total = 0;
  for (const addon of addons) {
    if (typeof addon.price !== "number") return null;
    total += addon.price;
  }
  return total;
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

// Token expires at the end of the stay (UTC end-of-day on check_out).
function checkOutExpiryUnix(check_out: string): number {
  return Math.floor(new Date(`${check_out}T23:59:59Z`).getTime() / 1000);
}

export interface BookingPendingEmailPayload {
  to:         string;
  name:       string;
  villa:      string;
  check_in:   string;
  check_out:  string;
  booking_id: string;
  sleeping_guests?: number | null;
  day_visitors?: number | null;
  event_type?: string | null;
  message?: string | null;
  addons?: Array<{ label: string; price?: number | null }>;
  addons_snapshot?: Array<{
    label: string;
    price: number | null;
    requires_approval?: boolean;
    same_day_warning?: "same_day_checkout" | "same_day_checkin" | null;
  }> | null;
  pricing_subtotal?: number | string | null;
  pricing_snapshot?: { subtotal?: number | string | null } | null;
}

export async function sendBookingPendingEmail(payload: BookingPendingEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendBookingPendingEmail] RESEND_API_KEY not set - skipping email.");
    return;
  }

  const resend    = new Resend(apiKey);
  const base      = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;

  const { token } = createActionToken(payload.booking_id, "view", {
    expiresAt: checkOutExpiryUnix(payload.check_out),
  });
  const viewUrl = `${base}/booking/view/${encodeURIComponent(token)}`;

  const ref       = payload.booking_id.slice(0, 8).toUpperCase();
  const firstName = payload.name.split(" ")[0] || "Guest";
  const subject   = "Oraya - Booking Request Received";
  const addonRows = (payload.addons_snapshot && payload.addons_snapshot.length > 0
    ? payload.addons_snapshot
    : (payload.addons ?? []).map((addon) => ({
        label: addon.label,
        price: typeof addon.price === "number" ? addon.price : null,
        requires_approval: false,
        same_day_warning: null,
      }))
  );
  const staySubtotal = parseAmount(payload.pricing_snapshot?.subtotal ?? payload.pricing_subtotal);
  const addonsTotal = sumAddonPrices(addonRows);
  const estimatedTotal = staySubtotal !== null && addonsTotal !== null
    ? staySubtotal + addonsTotal
    : null;
  const summaryRows: Array<[string, string]> = [
    ["Villa", payload.villa],
    ["Dates", `${fmtDate(payload.check_in)} to ${fmtDate(payload.check_out)}`],
    ...(typeof payload.sleeping_guests === "number" ? [["Guests", String(payload.sleeping_guests)] as [string, string]] : []),
    ...(typeof payload.day_visitors === "number" ? [["Visitors", String(payload.day_visitors)] as [string, string]] : []),
    ...(payload.event_type ? [["Event type", payload.event_type] as [string, string]] : []),
    ["Status", "Pending"],
    ["Reference", ref],
  ];
  const addonsHtml = addonRows.length === 0
    ? `
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;">
        <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
          Add-ons
        </p>
        <p style="margin:0;font-size:13px;line-height:1.75;color:#ffffff;">No add-ons selected.</p>
      </td></tr></table>`
    : `
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;">
        <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
          Add-ons
        </p>
        ${addonRows.map((addon) => {
          const notes = [
            addon.requires_approval ? "Subject to confirmation" : null,
            addon.same_day_warning === "same_day_checkout" ? "Early check-in may depend on same-day checkout timing" : null,
            addon.same_day_warning === "same_day_checkin" ? "Late checkout may depend on same-day check-in timing" : null,
          ].filter((item): item is string => Boolean(item));
          return `
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border:0.5px solid rgba(255,255,255,0.07);background-color:rgba(255,255,255,0.025);margin-top:10px;border-radius:10px;">
              <tr>
                ${addonIconHtml(addon.label)}
                <td style="padding:14px 12px 14px 10px;">
                  <p style="margin:0 0 4px;font-size:14px;line-height:1.4;color:#ffffff;">
                    ${escapeHtml(addon.label)}
                  </p>
                  ${notes.map((note) => `
                    <p style="margin:0 0 3px;font-size:11px;line-height:1.55;color:${MUTED};">
                      ${escapeHtml(note)}
                    </p>
                  `).join("")}
                </td>
                <td align="right" valign="top" style="padding:14px 14px 14px 8px;font-size:12px;color:${GOLD};white-space:nowrap;">
                  ${escapeHtml(formatAddonPrice(addon.price))}
                </td>
              </tr>
            </table>`;
        }).join("")}
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

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${LOGO_URL}"
                   alt="Oraya"
                   width="140"
                   height="140"
                   border="0"
                   style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>

          <!-- Gold rule -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.5;"></div>
            </td>
          </tr>

          <!-- Eyebrow -->
          <tr>
            <td align="center" style="padding-bottom:12px;">
              <p style="margin:0;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${GOLD};">
                Booking Request Received
              </p>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:28px;font-weight:400;color:#ffffff;line-height:1.25;">
                Thank you,<br/><em>${firstName}.</em>
              </h1>
            </td>
          </tr>

          <!-- Subtext -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.8;max-width:400px;">
                This is a transactional email to confirm we received your booking request. We will review availability shortly. You can use the link below to review your booking details at any time.
              </p>
            </td>
          </tr>

          <!-- Gold rule -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.3;"></div>
            </td>
          </tr>

          <!-- Booking summary card -->
          <tr>
            <td style="border:0.5px solid rgba(197,164,109,0.2);padding:28px;">
              <p style="margin:0 0 20px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
                Booking Summary
              </p>

              ${summaryRows.map(([label, value]) => `
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border-bottom:0.5px solid rgba(255,255,255,0.05);">
                <tr>
                  <td style="padding:10px 0;font-size:11px;letter-spacing:1.5px;
                              text-transform:uppercase;color:${MUTED};">
                    ${label}
                  </td>
                  <td align="right" style="padding:10px 0;font-size:13px;
                                           color:${label === "Status" ? GOLD : "#ffffff"};font-weight:300;">
                    ${escapeHtml(value)}
                  </td>
                </tr>
              </table>`).join("")}
            </td>
          </tr>

          <tr><td style="padding-top:16px;">${addonsHtml}</td></tr>

          <tr><td style="padding-top:16px;">${paymentHtml}</td></tr>

          ${payload.message?.trim() ? `
          <tr><td style="padding-top:16px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;">
              <p style="margin:0 0 10px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
                Special Request / Notes
              </p>
              <p style="margin:0;font-size:13px;line-height:1.75;color:#ffffff;white-space:pre-line;">
                ${escapeHtml(payload.message.trim())}
              </p>
            </td></tr></table>
          </td></tr>` : ""}

          <!-- View CTA -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <a href="${viewUrl}"
                 style="display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:11px;letter-spacing:2.5px;text-transform:uppercase;
                        color:#2E2E2E;background-color:${GOLD};text-decoration:none;padding:14px 32px;">
                View Online Copy
              </a>
            </td>
          </tr>

          <!-- Footer -->
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
    "This is a transactional email to confirm we received your booking request.",
    "",
    ...summaryRows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Add-ons:",
    ...(addonRows.length === 0
      ? ["- No add-ons selected."]
      : addonRows.flatMap((addon) => [
          `- ${addon.label}: ${formatAddonPrice(addon.price)}`,
          ...(addon.requires_approval ? ["  Subject to confirmation"] : []),
        ])),
    "",
    "Payment Summary:",
    ...paymentRows.map(([label, value]) => `${label}: ${value}`),
    ...(payload.message?.trim() ? ["", `Special Request / Notes: ${payload.message.trim()}`] : []),
    "",
    `View online copy: ${viewUrl}`,
    "",
    "Oraya - Luxury Boutique Villas - Lebanon",
  ].join("\n");

  const { error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      payload.to,
    replyTo: REPLY_TO,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("[sendBookingPendingEmail] Resend error:", error);
  } else {
    console.log(`[sendBookingPendingEmail] email sent -> ${payload.to} (${subject})`);
  }
}
