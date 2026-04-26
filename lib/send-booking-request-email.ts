import { Resend } from "resend";
import { LOGO_URL } from "@/lib/brand";
import { formatBeirutDateTime } from "@/lib/format-date";

const GOLD    = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED   = "#8a8070";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";
const WARN = "#e0b070";

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
  const noteText = payload.message?.trim() ? payload.message.trim() : "No special request provided.";
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

  const rows: [string, string][] = [
    ["Reference",       ref],
    ["Name",            payload.requester_name],
    ["Email",           payload.requester_email],
    ...(payload.requester_phone ? [["Phone", payload.requester_phone] as [string, string]] : []),
    ["Villa",           payload.villa],
    ["Check-in",        fmtDate(payload.check_in)],
    ["Check-out",       fmtDate(payload.check_out)],
    ["Sleeping guests", String(payload.sleeping_guests)],
    ["Day visitors",    String(payload.day_visitors)],
    ...(payload.event_type ? [["Event type", payload.event_type] as [string, string]] : []),
    ["Submitted",       formatBeirutDateTime(payload.created_at)],
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
    <tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;">
      <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
        Special Request / Notes
      </p>
      <p style="margin:0;font-size:13px;line-height:1.75;color:#ffffff;white-space:pre-line;">
        ${escapeHtml(noteText)}
      </p>
    </td></tr>`;

  const addonsHtml = addonRows.length === 0
    ? `
      <tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;">
        <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
          Add-ons
        </p>
        <p style="margin:0;font-size:13px;line-height:1.75;color:#ffffff;">
          No add-ons selected.
        </p>
      </td></tr>`
    : `
      <tr><td style="border:0.5px solid rgba(197,164,109,0.18);padding:22px 24px;">
        <p style="margin:0 0 14px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
          Add-ons
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
      </td></tr>`;

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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>New Booking Request</title>
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
                    text-transform:uppercase;color:${GOLD};">New Booking Request</p>
        </td></tr>

        <!-- Heading -->
        <tr><td align="center" style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:24px;font-weight:400;color:#ffffff;line-height:1.35;">
            A new booking request has been<br/><em>submitted for review.</em>
          </h1>
        </td></tr>

        <!-- Rule -->
        <tr><td align="center" style="padding-bottom:28px;">
          <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.3;"></div>
        </td></tr>

        <!-- Details card -->
        <tr><td style="border:0.5px solid rgba(197,164,109,0.2);padding:28px;">
          <p style="margin:0 0 20px;font-size:9px;letter-spacing:3px;
                    text-transform:uppercase;color:${GOLD};">Booking Details</p>
          ${rowsHtml}
        </td></tr>

        <tr><td style="padding-top:16px;">${notesHtml}</td></tr>

        <tr><td style="padding-top:16px;">${addonsHtml}</td></tr>

        <!-- Admin link -->
        ${adminBtn}

        <!-- Footer -->
        <tr><td align="center" style="padding-top:28px;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">
            Oraya - Luxury Boutique Villas - Lebanon
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Oraya - New Booking Request [${ref}]`,
    "",
    "A new booking request has been submitted for review.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value.replace(/<[^>]+>/g, "")}`),
    "",
    `Special Request / Notes: ${noteText}`,
    "",
    "Add-ons:",
    ...(addonRows.length === 0
      ? ["- No add-ons selected."]
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
    "Oraya - Luxury Boutique Villas - Lebanon",
  ].join("\n");

  const { error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      payload.recipients,
    subject: `Oraya - New Booking Request [${ref}]`,
    html,
    text,
  });

  if (error) {
    console.error("[sendBookingRequestEmail] Resend error:", error);
  } else {
    console.log(`[sendBookingRequestEmail] sent -> ${payload.recipients.join(", ")}`);
  }
}
