import { NextResponse } from "next/server";
import { reapExpiredStepUpAttempts } from "@/lib/payments/payment-attempts-store";
import { verifyStepUpReturnToken } from "@/lib/payments/step-up";

export const dynamic = "force-dynamic";

/**
 * W7 slice 5 — where the cardholder's bank drops them after the challenge.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * This request arrives through the GUEST'S BROWSER, as a form POST from a page
 * Oraya does not own, on a route that by construction cannot require an Oraya
 * session. Every byte of it is attacker-controlled.
 *
 * So this route decides nothing about money. It does not call CyberSource, it
 * does not read the post-back body, it does not touch the attempt's status, and
 * it cannot mark anything paid. It is a doorbell: it tells the checkout page in
 * the parent window that the bank is finished, and the parent then asks Oraya's
 * completion route to look — server-side, with the authentication id read from
 * Oraya's own attempt row, behind a compare-and-set that a reaped or
 * already-validated attempt loses.
 *
 * The only thing it verifies is that the token in the path is one Oraya minted
 * for some attempt (HMAC). That proves the doorbell is Oraya's doorbell. It
 * proves nothing whatsoever about whether authentication succeeded.
 *
 * The body is deliberately never parsed, so there is no field here that could
 * be mistaken for authority later.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const attemptId = verifyStepUpReturnToken(token, process.env.ADMIN_SECRET ?? "");

  if (!attemptId) {
    // No attempt id in the log: the token is the handle the post-back rides on.
    console.error("[api/payments/3ds-return] rejected a post-back with an unrecognised token");
    return htmlResponse(false, 400);
  }

  /*
   * Opportunistic reaping, here rather than on the payment path. A guest whose
   * window closed while they were at their bank gets the parked attempt
   * released now, so the retry they are about to make is not refused by their
   * own abandoned challenge. CAS-guarded, so it cannot disturb an attempt that
   * is already being validated.
   */
  await reapExpiredStepUpAttempts();

  return htmlResponse(true, 200);
}

/** Some ACS implementations bounce back with GET. Same doorbell, same silence. */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  return POST(request, context);
}

/**
 * Rendered inside the bank's iframe. It posts one message to the parent window
 * — no state, no result, no token — and the parent takes it from there.
 *
 * `*` as the target origin is deliberate and safe: the message carries a fixed
 * literal and nothing else, so there is nothing in it to leak. The parent
 * verifies the shape before acting, and acting only ever means "ask the server".
 */
function htmlResponse(ok: boolean, status: number) {
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Verification complete</title></head>
<body style="margin:0;background:#1f2b38;color:#fff;font-family:system-ui,sans-serif">
<p style="padding:24px;font-size:14px">${ok ? "Verification complete. Returning to Oraya…" : "This verification link is not valid."}</p>
<script>
  try {
    window.parent.postMessage({ source: "oraya-3ds", done: ${ok ? "true" : "false"} }, "*");
  } catch (e) {}
</script>
</body></html>`;
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // It is framed by the bank's page by design, so no frame-ancestors deny;
      // but nothing here may be sniffed into another content type.
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
