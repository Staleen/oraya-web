import { NextResponse } from "next/server";
import { runCalendarSync } from "@/lib/calendar/sync";
import { requireOps } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";

const LOG_TAG = "[api/ops/calendar-sync/run]";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Pull the external calendars again, now.
 *
 * Available to operators, not just owners: the person who needs this is
 * whoever is looking at a booking and doubting the availability in front of
 * them. Making them fetch an owner defeats the point.
 *
 * `runCalendarSync` is the same function the cron job and the legacy admin
 * button call — it is imported, never modified.
 *
 * One deliberate difference from the routes that already exist: a run that
 * changed nothing while feeds were failing is NOT reported as success. The
 * cron endpoint answers 200 with `sources_failed` buried in the body, which is
 * why a dashboard can look green while sync has been dead for days.
 *
 * What the summary can and cannot prove is worth stating, because it shaped
 * the condition below. `processed` counts only sources with a recognised
 * villa; a source with an unknown villa increments `failed` WITHOUT
 * incrementing `processed`. So `processed - failed` is not a success count and
 * can even go negative. The only two facts available are "how many failed" and
 * "how many blocks were written", so those are the only two this route
 * reasons about, and the message states them rather than diagnosing.
 */
export async function POST(request: Request) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;

  try {
    const summary = await runCalendarSync();
    const { processed, failed, upserted } = summary;

    console.log(
      `${LOG_TAG} run by ${auth.staff.id}: processed=${processed} failed=${failed} upserted=${upserted}`,
    );

    // Something failed AND nothing was written: whatever the operator is
    // looking at is exactly as old as it was a moment ago. Calling that
    // "synced" is the lie this route exists to avoid.
    if (failed > 0 && upserted === 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "sync_changed_nothing",
          error: `${failed === 1 ? "A calendar feed" : `${failed} calendar feeds`} could not be read and nothing was updated. What you see is as old as it was before — check the feeds below.`,
          sources_processed: processed,
          sources_failed: failed,
          blocks_upserted: upserted,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      sources_processed: processed,
      sources_failed: failed,
      blocks_upserted: upserted,
      // A partial failure still counts as a run, but the caller is told
      // plainly that part of the picture could not be refreshed.
      partial: failed > 0,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`${LOG_TAG} run failed:`, toErrorMessage(error));
    return NextResponse.json(
      { ok: false, error: "The sync could not run. Nothing was updated." },
      { status: 503 },
    );
  }
}
