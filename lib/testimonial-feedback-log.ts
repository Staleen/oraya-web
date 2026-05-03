/**
 * Phase 15F.5 — Dedup log for guest testimonial request emails (settings JSON, no schema).
 * Maps booking id → ISO timestamp when the feedback-request email was sent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const TESTIMONIAL_FEEDBACK_LOG_KEY = "testimonial_feedback_log";

export function parseTestimonialFeedbackLog(raw: string | null | undefined): Record<string, string> {
  if (!raw || !String(raw).trim()) return {};
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string" && v.trim()) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function fetchTestimonialFeedbackLog(db: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await db.from("settings").select("value").eq("key", TESTIMONIAL_FEEDBACK_LOG_KEY).maybeSingle();
  if (error) console.warn("[testimonial-feedback-log] fetch:", error);
  return parseTestimonialFeedbackLog(data?.value ?? null);
}

export async function persistTestimonialFeedbackLog(db: SupabaseClient, log: Record<string, string>): Promise<void> {
  const { error } = await db
    .from("settings")
    .upsert({ key: TESTIMONIAL_FEEDBACK_LOG_KEY, value: JSON.stringify(log) }, { onConflict: "key" });
  if (error) throw error;
}
