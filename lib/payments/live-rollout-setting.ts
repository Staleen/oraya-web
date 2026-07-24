import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  PAYMENTS_LIVE_ENABLED_SETTINGS_KEY,
  type PaymentsLiveSettingReadResult,
} from "@/lib/payments/live-rollout";

/**
 * Plan 4 Phase 3 (3.1) — server-side reader for the live rollout switch.
 * A read error reports `{ ok: false }` so the readiness decision fails
 * CLOSED; a missing row reads as `{ ok: true, value: null }` (switch OFF).
 */
export async function readPaymentsLiveSetting(): Promise<PaymentsLiveSettingReadResult> {
  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", PAYMENTS_LIVE_ENABLED_SETTINGS_KEY)
    .maybeSingle<{ value: unknown }>();

  if (error) {
    console.error("[payments/live-rollout] settings read failed — failing closed:", error);
    return { ok: false };
  }
  if (!data) {
    return { ok: true, value: null };
  }
  return { ok: true, value: typeof data.value === "string" ? data.value : null };
}
