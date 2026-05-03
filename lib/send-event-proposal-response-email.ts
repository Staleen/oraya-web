import { Resend } from "resend";
import { LOGO_URL } from "@/lib/brand";

const GOLD = "#C5A46D";
const MIDNIGHT = "#1F2B38";
const MUTED = "#8a8070";
const WHITE = "#FFFFFF";
const FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>";
const REPLY_TO = "bookings@stayoraya.com";
const ADMIN_TO = "bookings@stayoraya.com";
const CURRENCY = "USD";

type ProposalResponseStatus = "accepted" | "declined";

export interface EventProposalResponseEmailPayload {
  status: ProposalResponseStatus;
  guest_name: string;
  event_type?: string | null;
  check_in: string;
  check_out: string;
  proposal_total_amount?: number | string | null;
}

function fmtDate(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoney(value: number | null) {
  if (value === null) return "Not set";
  return `${CURRENCY} ${Math.round(value).toLocaleString("en-US")}`;
}

function renderShell(subject: string, eyebrow: string, heading: string, intro: string, rows: Array<[string, string]>) {
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
            <td style="border:0.5px solid rgba(197,164,109,0.2);padding:28px;">
              <p style="margin:0 0 20px;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:${GOLD};">
                Proposal response
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

export async function sendEventProposalResponseEmail(payload: EventProposalResponseEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendEventProposalResponseEmail] RESEND_API_KEY not set - skipping email.");
    return;
  }

  const resend = new Resend(apiKey);
  const subject = payload.status === "accepted" ? "Event proposal accepted" : "Event proposal declined";
  const eyebrow = payload.status === "accepted" ? "Proposal accepted" : "Proposal declined";
  const heading =
    payload.status === "accepted"
      ? "A guest accepted an event proposal."
      : "A guest declined an event proposal.";
  const intro =
    payload.status === "accepted"
      ? "A guest has accepted the current event proposal. Review the inquiry and proceed with confirmation and payment manually."
      : "A guest has declined the current event proposal. Review the inquiry and revise or close the request manually.";
  const rows: Array<[string, string]> = [
    ["Guest", payload.guest_name || "Guest"],
    ["Event type", payload.event_type || "Custom event"],
    ["Dates", `${fmtDate(payload.check_in)} to ${fmtDate(payload.check_out)}`],
    ["Proposal total", formatMoney(parseAmount(payload.proposal_total_amount))],
  ];
  const html = renderShell(subject, eyebrow, heading, intro, rows);
  const text = [
    subject,
    "",
    intro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Oraya - Luxury Boutique Villas - Lebanon",
  ].join("\n");

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_TO,
    replyTo: REPLY_TO,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("[sendEventProposalResponseEmail] Resend error:", error);
  } else {
    console.log(`[sendEventProposalResponseEmail] email sent -> ${ADMIN_TO} (${subject})`);
  }
}
