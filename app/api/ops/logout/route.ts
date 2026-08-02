import { NextResponse } from "next/server";
import { clearOpsSessionCookie } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  // X-3: the client awaits this, so it must report honestly rather than
  // optimistically. Clearing the cookie is the whole operation and cannot fail
  // server-side, so a 200 here genuinely means the session is over.
  const response = NextResponse.json({ ok: true });
  clearOpsSessionCookie(response);
  return response;
}
