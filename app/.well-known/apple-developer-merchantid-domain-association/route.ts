import { NextResponse } from "next/server";

/**
 * Apple Pay domain verification.
 *
 * Apple will not let a domain present the Apple Pay sheet until it serves the
 * association file Apple issues, unchanged, at exactly this path. CyberSource
 * hands the file over during Apple Pay enrolment.
 *
 * Served from an environment variable rather than committed to `public/`
 * because the value is per-domain and rotates: pasting it into Vercel keeps
 * production, preview and any future domain from silently sharing one file.
 *
 * Unset means 404 — the honest answer. An empty 200 would make Apple's
 * verification fail with a far more confusing error.
 *
 * The Apple Pay CODE is already built and gated behind
 * NETCOMMERCE_CYBERSOURCE_APPLE_PAY_ENABLED. This route removes the last
 * blocker that lives in the repository; the rest is enrolment in the
 * CyberSource Business Center.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const association = process.env.APPLE_PAY_DOMAIN_ASSOCIATION?.trim();
  if (!association) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
  return new NextResponse(association, {
    status: 200,
    headers: {
      // Apple fetches this as a plain file and compares it byte for byte.
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
