import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import type { Addon } from "@/app/api/addons/route";

export const dynamic = "force-dynamic";

// POST — bulk upsert the full add-ons list into the addons table.
// Merges on `id` so rows that already exist are updated in-place.
export async function POST(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  let addons: Addon[];
  let explicitDeleteIds: Set<string>;
  try {
    const body = await request.json();
    if (!Array.isArray(body.addons)) {
      return NextResponse.json({ error: "addons must be an array." }, { status: 400 });
    }
    addons = body.addons;
    // Audit R-2: ids the admin UI reports as explicit operator removals.
    // Optional and backward-compatible — only consulted by the wipe guard below.
    explicitDeleteIds = new Set(
      Array.isArray(body.deleted_ids)
        ? body.deleted_ids.filter((id: unknown): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const now  = new Date().toISOString();
  const rows = addons.map(a => ({
    id:            a.id,
    label:         a.label,
    enabled:       a.enabled,
    currency:      a.currency,
    price:         a.price ?? null,
    pricing_model: a.pricing_model,
    updated_at:    now,
  }));

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("addons")
    .select("id");

  if (existingError) {
    console.error("[api/admin/addons] existing query error:", existingError);
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const incomingIds = new Set(rows.map((row) => row.id));
  const idsToDelete = (existingRows ?? [])
    .map((row) => row.id)
    .filter((id) => !incomingIds.has(id));

  // Audit R-2 guard: a payload that would delete EVERY existing add-on is the
  // signature of a degenerate save (e.g. the editor saving after a failed
  // load), not a normal edit. Refuse it — before any write — unless every
  // doomed id was explicitly listed for deletion. Partial removals (the normal
  // single-row Remove flow) are unaffected.
  const wipesEverything =
    idsToDelete.length > 0 && idsToDelete.length === (existingRows ?? []).length;
  if (wipesEverything && !idsToDelete.every((id) => explicitDeleteIds.has(id))) {
    console.error(
      `[api/admin/addons] refused implicit deletion of all ${idsToDelete.length} add-ons (explicit: ${explicitDeleteIds.size})`,
    );
    return NextResponse.json(
      {
        error:
          "Refusing to delete every add-on: the request omits all existing rows without explicitly marking them for deletion. Reload the rates page and try again.",
      },
      { status: 400 },
    );
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("addons")
      .upsert(rows, { onConflict: "id" });

    if (error) {
      console.error("[api/admin/addons] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from("addons")
      .delete()
      .in("id", idsToDelete);

    if (deleteError) {
      console.error("[api/admin/addons] delete error:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
