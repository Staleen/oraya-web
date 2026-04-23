import { NextResponse } from "next/server";
import { runCalendarSync } from "@/lib/calendar/sync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const summary = await runCalendarSync();
    return NextResponse.json({
      ok: true,
      sources_processed: summary.processed,
      blocks_upserted: summary.upserted,
      sources_failed: summary.failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
