import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import { resolveVillaFromSlug } from "@/lib/calendar/villas";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/media]";

/**
 * Owner-only media management for /ops — mirrors `/api/admin/media` rule for
 * rule (an ops session must never pass an admin guard):
 *
 * - Storage paths are allowlisted (`general` + known villa slugs) — arbitrary
 *   strings are refused before anything is written (ME-1).
 * - DELETE removes the DB row BEFORE the storage object, so a partial failure
 *   can only orphan a file, never leave live pages pointing at a dead image
 *   (ME-5). The orphan is reported, not swallowed.
 * - Reorder validates every entry and reports partial failures honestly (ME-2:
 *   the client force-refetches so the view snaps back to server truth).
 */

const BUCKET = "villa-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validBucketKey(villa: string): boolean {
  return villa === "general" || Boolean(resolveVillaFromSlug(villa));
}

export async function GET(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  const villa = new URL(request.url).searchParams.get("villa");
  if (!villa || !validBucketKey(villa)) {
    return NextResponse.json({ error: "Invalid gallery." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("villa_media")
    .select("*")
    .eq("villa", villa)
    .order("display_order", { ascending: true });

  if (error) {
    console.error(`${LOG_TAG} list failed:`, error.message);
    return NextResponse.json({ error: "Could not load the photos." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, media: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const villa = formData.get("villa") as string | null;
    const category = (formData.get("category") as string | null) ?? "other";

    if (!file || !villa) return NextResponse.json({ error: "Choose a photo first." }, { status: 400 });
    if (!validBucketKey(villa)) return NextResponse.json({ error: "Invalid gallery." }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `${file.name} is over 5 MB — resize it and try again.` }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `${file.name}: only JPG, PNG and WebP photos.` }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const storagePath = `${villa}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadErr) {
      console.error(`${LOG_TAG} upload failed:`, uploadErr.message);
      return NextResponse.json({ error: "The photo could not be uploaded." }, { status: 503 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

    const { data: maxRow } = await supabaseAdmin
      .from("villa_media")
      .select("display_order")
      .eq("villa", villa)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: row, error: dbErr } = await supabaseAdmin
      .from("villa_media")
      .insert({
        villa,
        category,
        file_url: publicUrl,
        file_name: storagePath,
        display_order: (maxRow?.display_order ?? 0) + 1,
      })
      .select()
      .single();

    if (dbErr) {
      // Nothing should reference a row that failed to exist — clean up.
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      console.error(`${LOG_TAG} insert failed:`, dbErr.message);
      return NextResponse.json({ error: "The photo could not be saved." }, { status: 503 });
    }

    return NextResponse.json({ ok: true, media: row });
  } catch (err) {
    console.error(`${LOG_TAG} POST error:`, err);
    return NextResponse.json({ error: "The upload failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  try {
    const { id, file_name } = (await request.json()) as { id?: string; file_name?: string };
    if (!id || !file_name) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    // ME-5 ordering: row first, so a failure can only orphan a file.
    const { error } = await supabaseAdmin.from("villa_media").delete().eq("id", id);
    if (error) {
      console.error(`${LOG_TAG} row delete failed:`, error.message);
      return NextResponse.json({ error: "The photo could not be removed." }, { status: 503 });
    }

    const { error: storageErr } = await supabaseAdmin.storage.from(BUCKET).remove([file_name]);
    if (storageErr) {
      console.error(`${LOG_TAG} orphaned storage object:`, file_name, storageErr);
      return NextResponse.json({
        ok: true,
        warning: "Removed from the site, but the stored file couldn't be deleted. Nothing guest-facing is affected.",
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`${LOG_TAG} DELETE error:`, err);
    return NextResponse.json({ error: "The photo could not be removed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      updates?: Array<{ id?: unknown; display_order?: unknown }>;
      id?: string;
      category?: string;
    };

    if (Array.isArray(body.updates)) {
      for (const entry of body.updates) {
        if (
          !entry || typeof entry !== "object" ||
          typeof entry.id !== "string" || !entry.id ||
          !Number.isInteger(entry.display_order) || (entry.display_order as number) < 0
        ) {
          return NextResponse.json({ error: "Invalid ordering request." }, { status: 400 });
        }
      }
      const results = await Promise.all(
        (body.updates as Array<{ id: string; display_order: number }>).map(({ id, display_order }) =>
          supabaseAdmin.from("villa_media").update({ display_order }).eq("id", id),
        ),
      );
      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        console.error(`${LOG_TAG} reorder failures:`, failed.map((r) => r.error?.message));
        return NextResponse.json(
          { error: `${failed.length} of ${results.length} photos didn't move. The list below is server truth.` },
          { status: 503 },
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body.id && typeof body.category === "string") {
      const { error } = await supabaseAdmin
        .from("villa_media")
        .update({ category: body.category })
        .eq("id", body.id);
      if (error) {
        console.error(`${LOG_TAG} category update failed:`, error.message);
        return NextResponse.json({ error: "That change didn't save." }, { status: 503 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  } catch (err) {
    console.error(`${LOG_TAG} PATCH error:`, err);
    return NextResponse.json({ error: "That change didn't save." }, { status: 500 });
  }
}
