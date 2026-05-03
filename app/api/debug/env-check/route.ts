/**
 * TEMPORARY — delete after debugging Vercel env visibility.
 * Booleans only; never returns secret values.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ADMIN_SECRET: Boolean(process.env.ADMIN_SECRET),
    BOOKING_ACTION_SECRET: Boolean(process.env.BOOKING_ACTION_SECRET),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}
