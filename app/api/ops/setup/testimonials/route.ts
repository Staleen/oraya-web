import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import {
  GUEST_TESTIMONIALS_SETTINGS_KEY,
  type GuestTestimonialRecord,
} from "@/lib/guest-testimonials";

export const dynamic = "force-dynamic";
const LOG_TAG = "[api/ops/setup/testimonials]";

/** Owner-only write for the guest testimonials shown on the public site. */
export async function PUT(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  let rows: GuestTestimonialRecord[];
  try {
    const body = (await request.json()) as { testimonials?: unknown };
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

  const { error } = await supabaseAdmin
    .from("settings")
    .upsert({ key: GUEST_TESTIMONIALS_SETTINGS_KEY, value: JSON.stringify(rows) }, { onConflict: "key" });

  if (error) {
    console.error(`${LOG_TAG} save failed:`, error.message);
    return NextResponse.json({ error: "Testimonials could not be saved." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, testimonials: rows, saved_by: auth.staff.full_name });
}
