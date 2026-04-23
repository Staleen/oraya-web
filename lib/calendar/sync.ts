import { supabaseAdmin } from "@/lib/supabase-admin";
import { KNOWN_VILLAS } from "@/lib/calendar/villas";
import { parseIcalEvents } from "@/lib/calendar/ical";

interface ExternalCalendarSourceRow {
  id: string;
  villa: string;
  source_name: string;
  feed_url: string;
  is_enabled: boolean;
}

export interface CalendarSyncSummary {
  processed: number;
  failed: number;
  upserted: number;
}

async function syncSource(source: ExternalCalendarSourceRow): Promise<{ upserted: number }> {
  const nowIso = new Date().toISOString();
  const response = await fetch(source.feed_url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const text = await response.text();
  const events = parseIcalEvents(text);
  const seenUids = new Set(events.map((event) => event.uid));

  if (events.length > 0) {
    const rows = events.map((event) => ({
      villa: source.villa,
      source_id: source.id,
      external_uid: event.uid,
      starts_on: event.starts_on,
      ends_on: event.ends_on,
      summary: event.summary,
      is_active: true,
      last_seen_at: nowIso,
      updated_at: nowIso,
    }));

    const { error } = await supabaseAdmin
      .from("external_blocks")
      .upsert(rows, { onConflict: "source_id,external_uid" });

    if (error) throw error;
  }

  const { data: existingBlocks, error: existingError } = await supabaseAdmin
    .from("external_blocks")
    .select("id, external_uid")
    .eq("source_id", source.id);

  if (existingError) throw existingError;

  const staleIds = (existingBlocks ?? [])
    .filter((row) => !seenUids.has(row.external_uid))
    .map((row) => row.id);

  if (staleIds.length > 0) {
    const { error: staleError } = await supabaseAdmin
      .from("external_blocks")
      .update({ is_active: false, updated_at: nowIso })
      .in("id", staleIds);

    if (staleError) throw staleError;
  }

  const { error: sourceError } = await supabaseAdmin
    .from("external_calendar_sources")
    .update({
      last_synced_at: nowIso,
      last_sync_status: "success",
      last_error: null,
      updated_at: nowIso,
    })
    .eq("id", source.id);

  if (sourceError) throw sourceError;

  return { upserted: events.length };
}

export async function runCalendarSync(): Promise<CalendarSyncSummary> {
  const { data: sources, error } = await supabaseAdmin
    .from("external_calendar_sources")
    .select("id, villa, source_name, feed_url, is_enabled")
    .eq("is_enabled", true)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const summary: CalendarSyncSummary = { processed: 0, failed: 0, upserted: 0 };

  for (const source of (sources ?? []) as ExternalCalendarSourceRow[]) {
    if (!KNOWN_VILLAS.includes(source.villa)) {
      summary.failed++;
      await supabaseAdmin
        .from("external_calendar_sources")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "failed",
          last_error: `Unknown villa: ${source.villa}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", source.id);
      continue;
    }

    summary.processed++;
    try {
      const result = await syncSource(source);
      summary.upserted += result.upserted;
    } catch (syncError) {
      summary.failed++;
      const message = syncError instanceof Error ? syncError.message : String(syncError);
      await supabaseAdmin
        .from("external_calendar_sources")
        .update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: "failed",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", source.id);
    }
  }

  return summary;
}
