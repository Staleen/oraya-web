import { NextResponse } from "next/server";
import { APPLE_PAY_DOMAIN_ASSOCIATION } from "@/lib/payments/apple-pay-domain-association";

/**
 * Apple Pay domain verification.
 *
 * Apple fetches this path unauthenticated and compares the body byte for byte
 * before it will let the domain present the Apple Pay sheet.
 *
 * Served from a route handler, NOT from `public/.well-known/`: Next.js does
 * not serve dot-directories out of `public/`, so a file committed there 404s.
 * That is precisely how the first verification attempt failed on 2026-08-12 —
 * the file was in the repository, correct, and unreachable.
 *
 * Note for whoever debugs the next failure: apex `stayoraya.com` redirects to
 * `www.stayoraya.com`, and Apple does not follow redirects during
 * verification. Verify the host guests actually land on.
 */

export const dynamic = "force-static";

export function GET() {
  return new NextResponse(APPLE_PAY_DOMAIN_ASSOCIATION, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
