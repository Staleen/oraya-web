import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { KNOWN_VILLAS } from "@/lib/calendar/villas";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/calendar-sources]";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Calendar feed management (audit C-2 / plan G13).
 *
 * Until now, changing a rotated Airbnb feed URL meant running SQL by hand:
 * `external_calendar_sources` was read by the admin data route and written
 * only by the sync job. Owner-only here — a feed URL is a capability, not a
 * display value.
 *
 * The sync ITSELF is untouched (locked): this route only manages the source
 * rows the existing sync already reads.
 */

function validFeedUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    // Feeds are fetched server-side; only http(s) may ever be stored.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const villa = typeof body.villa === "string" ? body.villa : "";
  const sourceName = typeof body.source_name === "string" ? body.source_name.trim() : "";
  const feedUrl = validFeedUrl(body.feed_url);

  if (!KNOWN_VILLAS.includes(villa)) return NextResponse.json({ error: "Choose a villa." }, { status: 400 });
  if (!sourceName) return NextResponse.json({ error: "Give the feed a name (e.g. Airbnb)." }, { status: 400 });
  if (!feedUrl) return NextResponse.json({ error: "That doesn't look like a calendar link." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("external_calendar_sources")
    .insert({ villa, source_name: sourceName, feed_url: feedUrl, is_enabled: true })
    .select("id, villa, source_name, is_enabled, last_synced_at, last_sync_status, last_error")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That feed is already connected for this villa." }, { status: 409 });
    }
    console.error(`${LOG_TAG} insert failed:`, error.message);
    return NextResponse.json({ error: "The feed could not be added." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, source: data });
}

export async function PATCH(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(body, "source_name")) {
    const name = typeof body.source_name === "string" ? body.source_name.trim() : "";
    if (!name) return NextResponse.json({ error: "The feed needs a name." }, { status: 400 });
    patch.source_name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body, "feed_url")) {
    const url = validFeedUrl(body.feed_url);
    if (!url) return NextResponse.json({ error: "That doesn't look like a calendar link." }, { status: 400 });
    patch.feed_url = url;
    // A rotated URL invalidates the previous sync verdict.
    patch.last_sync_status = null;
    patch.last_error = null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "is_enabled")) {
    patch.is_enabled = body.is_enabled === true;
  }

  const { data, error } = await supabaseAdmin
    .from("external_calendar_sources")
    .update(patch)
    .eq("id", id)
    .select("id, villa, source_name, is_enabled, last_synced_at, last_sync_status, last_error")
    .maybeSingle();

  if (error) {
    console.error(`${LOG_TAG} update failed:`, error.message);
    return NextResponse.json({ error: "That change didn't save." }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: "That feed no longer exists." }, { status: 404 });

  return NextResponse.json({ ok: true, source: data });
}

export async function DELETE(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let id = "";
  try {
    const body = (await request.json()) as { id?: string };
    id = typeof body.id === "string" ? body.id : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // The blocks this feed created go with it (FK cascade), which is why the UI
  // says the dates become bookable again.
  const { error } = await supabaseAdmin.from("external_calendar_sources").delete().eq("id", id);
  if (error) {
    console.error(`${LOG_TAG} delete failed:`, error.message);
    return NextResponse.json({ error: "The feed could not be removed." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
