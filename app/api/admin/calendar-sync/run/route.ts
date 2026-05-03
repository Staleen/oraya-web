import { NextResponse } from "next/server";
import { runCalendarSync } from "@/lib/calendar/sync";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function POST(request: Request) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  try {
    const summary = await runCalendarSync();
    return NextResponse.json({
      ok: true,
      sources_processed: summary.processed,
      blocks_upserted: summary.upserted,
      sources_failed: summary.failed,
    });
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
