import { Resend } from "resend";
import { LOGO_URL, SITE_URL } from "@/lib/brand";
import { createActionToken } from "@/lib/booking-action-token";

const GOLD     = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED    = "#8a8070";

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
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
}

export async function sendBookingPendingEmail(payload: BookingPendingEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendBookingPendingEmail] RESEND_API_KEY not set — skipping email.");
    return;
  }

  const resend    = new Resend(apiKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "reservations@oraya.com";
  const base      = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;

  const { token } = createActionToken(payload.booking_id, "view", {
    expiresAt: checkOutExpiryUnix(payload.check_out),
  });
  const viewUrl = `${base}/booking/view/${encodeURIComponent(token)}`;

  const ref       = payload.booking_id.slice(0, 8).toUpperCase();
  const firstName = payload.name.split(" ")[0] || "Guest";
  const subject   = "Oraya — Booking Request Received";

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
                We've received your booking request and will confirm availability shortly. You can review your booking details using the link below at any time.
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

              ${[
                ["Villa",     payload.villa],
                ["Check-in",  fmtDate(payload.check_in)],
                ["Check-out", fmtDate(payload.check_out)],
                ["Status",    `<span style="color:${GOLD};">Pending</span>`],
                ["Reference", ref],
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

          <!-- View CTA -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <a href="${viewUrl}"
                 style="display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
                        font-size:11px;letter-spacing:2.5px;text-transform:uppercase;
                        color:#2E2E2E;background-color:${GOLD};text-decoration:none;padding:14px 32px;">
                View Your Booking
              </a>
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
    console.error("[sendBookingPendingEmail] Resend error:", error);
  } else {
    console.log(`[sendBookingPendingEmail] email sent → ${payload.to} (${subject})`);
  }
}
