import { Resend } from "resend";
import { LOGO_URL } from "@/lib/brand";

const GOLD    = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED   = "#8a8070";

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const date   = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  const hh     = String(d.getHours()).padStart(2, "0");
  const mm     = String(d.getMinutes()).padStart(2, "0");
  const ss     = String(d.getSeconds()).padStart(2, "0");
  return `${date} ${hh}:${mm}:${ss}`;
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
  addons:          Array<{ label: string }>;
  created_at:      string;
  admin_url:       string;             // link to /admin — empty string = no button
  confirm_url?:    string;             // signed action link — confirm booking
  cancel_url?:     string;             // signed action link — cancel booking
}

export async function sendBookingRequestEmail(
  payload: BookingRequestEmailPayload
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendBookingRequestEmail] RESEND_API_KEY not set — skipping email.");
    return;
  }

  const resend    = new Resend(apiKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "reservations@oraya.com";
  const ref       = payload.booking_id.slice(0, 8).toUpperCase();
  const addonsList = payload.addons.length > 0
    ? payload.addons.map(a => a.label).join(", ")
    : "None";

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
    ["Add-ons",         addonsList],
    ["Submitted",       fmtDateTime(payload.created_at)],
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
          ${value}
        </td>
      </tr>
    </table>`).join("");

  // Action buttons — prefer signed confirm/cancel links; fall back to generic admin link
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
            A new request has been<br/><em>submitted for your review.</em>
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

        <!-- Admin link -->
        ${adminBtn}

        <!-- Footer -->
        <tr><td align="center" style="padding-top:28px;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">
            Oraya · Luxury Boutique Villas · Lebanon
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from:    fromEmail,
    to:      payload.recipients,
    subject: `Oraya — New Booking Request [${ref}]`,
    html,
  });

  if (error) {
    console.error("[sendBookingRequestEmail] Resend error:", error);
  } else {
    console.log(`[sendBookingRequestEmail] sent → ${payload.recipients.join(", ")}`);
  }
}
