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

function normalizeSyncError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const trimmed = raw.trim();

  if (!trimmed) return null;

  const collapsed = trimmed
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!collapsed) return null;
  if (collapsed === "-" || collapsed === "--" || collapsed === "...") return null;

  return collapsed;
}

/** Remediation 2.2 — outbound feed fetch hardening. */
const FEED_FETCH_TIMEOUT_MS = 10_000;
const FEED_MAX_BYTES = 5 * 1024 * 1024; // 5 MB is far beyond any sane iCal feed

async function syncSource(source: ExternalCalendarSourceRow): Promise<{ upserted: number }> {
  const nowIso = new Date().toISOString();

  let feedUrl: URL;
  try {
    feedUrl = new URL(source.feed_url);
  } catch {
    throw new Error("Feed URL is not a valid URL");
  }
  if (feedUrl.protocol !== "https:") {
    throw new Error("Feed URL must use https");
  }

  const response = await fetch(feedUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > FEED_MAX_BYTES) {
    throw new Error("Feed response too large");
  }

  const text = await response.text();
  if (text.length > FEED_MAX_BYTES) {
    throw new Error("Feed response too large");
  }
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
      const message = normalizeSyncError(syncError);
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
