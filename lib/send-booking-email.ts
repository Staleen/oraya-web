import { Resend } from "resend";

const GOLD = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED = "#8a8070";

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

export interface BookingEmailPayload {
  to:        string;
  name:      string;
  status:    "confirmed" | "cancelled";
  villa:     string;
  check_in:  string;
  check_out: string;
  booking_id: string;
}

export async function sendBookingEmail(payload: BookingEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendBookingEmail] RESEND_API_KEY not set — skipping email.");
    return;
  }

  const resend = new Resend(apiKey);

  const isConfirmed = payload.status === "confirmed";
  const subject = isConfirmed
    ? "Oraya — Booking Confirmed"
    : "Oraya — Booking Cancelled";

  const statusLabel  = isConfirmed ? "Confirmed" : "Cancelled";
  const statusColor  = isConfirmed ? "#6fcf8a" : "#e07070";
  const ref          = payload.booking_id.slice(0, 8).toUpperCase();
  const firstName    = payload.name.split(" ")[0];

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "reservations@oraya.com";

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

          <!-- Logo wordmark -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:18px;letter-spacing:6px;text-transform:uppercase;color:${GOLD};font-weight:400;">
                ORAYA
              </p>
            </td>
          </tr>

          <!-- Gold rule -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.5;"></div>
            </td>
          </tr>

          <!-- Status eyebrow -->
          <tr>
            <td align="center" style="padding-bottom:12px;">
              <p style="margin:0;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${GOLD};">
                Booking ${statusLabel}
              </p>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:28px;font-weight:400;color:#ffffff;line-height:1.25;">
                ${isConfirmed
                  ? `Your stay is<br/><em>confirmed, ${firstName}.</em>`
                  : `Your booking<br/><em>has been cancelled.</em>`}
              </h1>
            </td>
          </tr>

          <!-- Subtext -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.8;max-width:400px;">
                ${isConfirmed
                  ? "We look forward to welcoming you. Please don't hesitate to reach out if you have any questions before your arrival."
                  : "Your booking request has been cancelled. If you believe this is an error, please contact us directly."}
              </p>
            </td>
          </tr>

          <!-- Gold rule -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <div style="width:40px;height:1px;background-color:${GOLD};opacity:0.3;"></div>
            </td>
          </tr>

          <!-- Booking details card -->
          <tr>
            <td style="border:0.5px solid rgba(197,164,109,0.2);padding:28px;">
              <p style="margin:0 0 20px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
                Booking Summary
              </p>

              ${[
                ["Villa",         payload.villa],
                ["Check-in",      fmtDate(payload.check_in)],
                ["Check-out",     fmtDate(payload.check_out)],
                ["Status",        `<span style="color:${statusColor};">${statusLabel}</span>`],
                ["Reference",     ref],
              ].map(([label, value]) => `
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border-bottom:0.5px solid rgba(255,255,255,0.05);">
                <tr>
                  <td style="padding:10px 0;font-size:11px;letter-spacing:1.5px;
                              text-transform:uppercase;color:${MUTED};">
                    ${label}
                  </td>
                  <td align="right" style="padding:10px 0;font-size:13px;
                                           color:#ffffff;font-weight:300;">
                    ${value}
                  </td>
                </tr>
              </table>`).join("")}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:32px;">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">
                Oraya · Luxury Boutique Villas · Lebanon
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from:    fromEmail,
    to:      payload.to,
    subject,
    html,
  });

  if (error) {
    console.error("[sendBookingEmail] Resend error:", error);
  } else {
    console.log(`[sendBookingEmail] email sent → ${payload.to} (${subject})`);
  }
}
