import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import {
  GUEST_TESTIMONIALS_SETTINGS_KEY,
  type GuestTestimonialRecord,
} from "@/lib/guest-testimonials";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/setup/testimonials]";

/**
 * Owner-only write for the guest testimonials shown on the public site.
 *
 * Guarded by compare-and-set on the raw stored value, like every other Setup
 * screen. Without it, this whole list is one settings row: two people editing
 * different testimonials would each save the entire array, and the second save
 * would silently erase the first one's work with no error anywhere.
 */
export async function PUT(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let rows: GuestTestimonialRecord[];
  let expectedRaw: string | null | undefined;
  try {
    const body = (await request.json()) as { testimonials?: unknown; expected_raw?: unknown };
    expectedRaw = typeof body.expected_raw === "string" || body.expected_raw === null
      ? (body.expected_raw as string | null)
      : undefined;
    if (!Array.isArray(body.testimonials)) throw new Error("Invalid testimonials.");
    rows = body.testimonials.map((item, index) => {
      if (!item || typeof item !== "object") throw new Error("Invalid testimonial.");
      const t = item as Record<string, unknown>;
      const guestLabel = typeof t.guest_label === "string" ? t.guest_label.trim() : "";
      const quote = typeof t.quote === "string" ? t.quote.trim() : "";
      // An approved testimonial must actually have words — otherwise the site
      // would render an empty quote card.
      if (t.approved === true && (!guestLabel || !quote)) {
        throw new Error("A testimonial can't be shown on the website without a guest and a quote.");
      }
      return {
        guest_label: guestLabel,
        villa: typeof t.villa === "string" ? t.villa.trim() : "",
        quote,
        reference_url: typeof t.reference_url === "string" && t.reference_url.trim() ? t.reference_url.trim() : null,
        approved: t.approved === true,
        display_order: typeof t.display_order === "number" && Number.isFinite(t.display_order) ? t.display_order : index,
      };
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request." },
      { status: 400 },
    );
  }

  const value = JSON.stringify(rows);
  const conflict = () =>
    NextResponse.json(
      {
        error: "Someone else changed the testimonials while you were editing. Reload to see where they stand, then make your change again.",
        code: "changed_elsewhere",
      },
      { status: 409 },
    );

  // Read what is stored now. A caller that sent expected_raw is claiming to
  // have edited that exact value; anything else means their draft was built
  // from a version that no longer exists.
  const { data: current, error: readError } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", GUEST_TESTIMONIALS_SETTINGS_KEY)
    .maybeSingle();

  if (readError) {
    console.error(`${LOG_TAG} pre-save read failed:`, readError.message);
    return NextResponse.json({ error: "Testimonials could not be saved." }, { status: 503 });
  }

  const storedRaw = (current?.value as string | null | undefined) ?? null;
  if (expectedRaw !== undefined && storedRaw !== expectedRaw) return conflict();

  // Compare-and-set. Two shapes, because a row that does not exist yet cannot
  // be matched by value: insert when absent, guarded update when present.
  if (storedRaw === null) {
    const { error: insertError } = await supabaseAdmin
      .from("settings")
      .insert({ key: GUEST_TESTIMONIALS_SETTINGS_KEY, value });
    if (insertError) {
      // Unique violation means someone created the row between the read and
      // this write — the same lost-update this guard exists to prevent.
      if (insertError.code === "23505") return conflict();
      console.error(`${LOG_TAG} save failed:`, insertError.message);
      return NextResponse.json({ error: "Testimonials could not be saved." }, { status: 503 });
    }
  } else {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("settings")
      .update({ value })
      .eq("key", GUEST_TESTIMONIALS_SETTINGS_KEY)
      .eq("value", storedRaw)
      .select("key")
      .maybeSingle();
    if (updateError) {
      console.error(`${LOG_TAG} save failed:`, updateError.message);
      return NextResponse.json({ error: "Testimonials could not be saved." }, { status: 503 });
    }
    if (!updated) return conflict();
  }

  return NextResponse.json({
    ok: true, testimonials: rows, testimonials_raw: value, saved_by: auth.staff.full_name,
  });
}
