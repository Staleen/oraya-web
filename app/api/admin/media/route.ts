import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const maxDuration = 60;

// GET ?villa=mechmech
export async function GET(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const villa = request.nextUrl.searchParams.get("villa");
  if (!villa) return NextResponse.json({ error: "villa param required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("villa_media")
    .select("*")
    .eq("villa", villa)
    .order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data ?? [] });
}

// POST - upload a file
export async function POST(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const file     = formData.get("file")     as File   | null;
    const villa    = formData.get("villa")    as string | null;
    const category = (formData.get("category") as string | null) ?? "other";

    if (!file || !villa) return NextResponse.json({ error: "file and villa required" }, { status: 400 });

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: `${file.name} exceeds 5 MB limit` }, { status: 400 });
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: `${file.name}: only jpg, png, webp allowed` }, { status: 400 });
    }

    const ext         = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const unique      = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storagePath = `${villa}/${unique}.${ext}`;

    const bytes = await file.arrayBuffer();
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("villa-images")
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from("villa-images")
      .getPublicUrl(storagePath);

    // Get next display_order
    const { data: maxRow } = await supabaseAdmin
      .from("villa_media")
      .select("display_order")
      .eq("villa", villa)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxRow?.display_order ?? 0) + 1;

    const { data: row, error: dbErr } = await supabaseAdmin
      .from("villa_media")
      .insert({ villa, category, file_url: publicUrl, file_name: storagePath, display_order: nextOrder })
      .select()
      .single();

    if (dbErr) {
      await supabaseAdmin.storage.from("villa-images").remove([storagePath]);
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ media: row });
  } catch (err) {
    console.error("[api/admin/media] POST:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE - { id, file_name }
export async function DELETE(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  try {
    const { id, file_name } = await request.json();
    if (!id || !file_name) return NextResponse.json({ error: "id and file_name required" }, { status: 400 });

    await supabaseAdmin.storage.from("villa-images").remove([file_name]);

    const { error } = await supabaseAdmin.from("villa_media").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/media] DELETE:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH - reorder: { updates: [{id, display_order}] }
//       - category: { id, category }
export async function PATCH(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();

    if (Array.isArray(body.updates)) {
      await Promise.all(
        body.updates.map(({ id, display_order }: { id: string; display_order: number }) =>
          supabaseAdmin.from("villa_media").update({ display_order }).eq("id", id)
        )
      );
      return NextResponse.json({ ok: true });
    }

    if (body.id && body.category !== undefined) {
      const { error } = await supabaseAdmin
        .from("villa_media")
        .update({ category: body.category })
        .eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  } catch (err) {
    console.error("[api/admin/media] PATCH:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
