import { Resend } from "resend";
import { LOGO_URL } from "@/lib/brand";

const GOLD = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const WHITE = "#FFFFFF";
const MUTED = "#8a8070";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";

/**
 * Remediation 2 (A.2) — admin password recovery email. The destination is
 * ALWAYS the server-side ADMIN_RECOVERY_EMAIL constant (passed by the route,
 * never taken from user input). Throws on configuration/provider errors —
 * the calling route swallows everything into a generic response.
 */
export async function sendAdminRecoveryEmail(payload: {
  to: string;
  resetUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Oraya admin password reset</title></head>
<body style="margin:0;padding:0;background-color:${MIDNIGHT};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${MIDNIGHT};padding:48px 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td align="center" style="padding-bottom:28px;">
          <img src="${LOGO_URL}" alt="Oraya" width="120" height="120" border="0" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;" />
        </td></tr>
        <tr><td align="center" style="padding-bottom:16px;"><div style="width:40px;height:1px;background-color:${GOLD};opacity:0.5;"></div></td></tr>
        <tr><td align="center" style="padding-bottom:12px;">
          <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">Admin access</p>
        </td></tr>
        <tr><td align="center" style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:26px;font-weight:400;color:${WHITE};">Reset your admin password</h1>
        </td></tr>
        <tr><td align="center" style="padding-bottom:26px;">
          <p style="margin:0;font-size:14px;line-height:1.7;color:${MUTED};">
            A password reset was requested for the Oraya admin console.<br />
            This link works once and expires in 30 minutes.
          </p>
        </td></tr>
        <tr><td align="center" style="padding-bottom:30px;">
          <a href="${payload.resetUrl}" style="display:inline-block;background-color:${GOLD};color:${MIDNIGHT};font-size:12px;letter-spacing:2.5px;text-transform:uppercase;text-decoration:none;padding:15px 40px;">Set a new password</a>
        </td></tr>
        <tr><td align="center">
          <p style="margin:0;font-size:12px;line-height:1.7;color:${MUTED};">
            If you did not request this, you can ignore this email — your password stays unchanged.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text =
    "A password reset was requested for the Oraya admin console.\n\n" +
    "This link works once and expires in 30 minutes:\n" +
    `${payload.resetUrl}\n\n` +
    "If you did not request this, ignore this email — your password stays unchanged.";

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: payload.to,
    subject: "Oraya admin — password reset link",
    html,
    text,
  });

  if (error) {
    console.error("[sendAdminRecoveryEmail] Resend error:", error);
    throw new Error(error.message || "Failed to send email.");
  }
}
