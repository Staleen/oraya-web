import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  CHECKOUT_BEHAVIOUR_SETTING_KEY,
  DEFAULT_CHECKOUT_BEHAVIOUR,
  parseCheckoutBehaviour,
  type CheckoutBehaviour,
} from "@/lib/payments/checkout-behaviour";

/**
 * Read the operator's card-checkout settings.
 * Any failure returns the defaults, which reproduce today's live behaviour —
 * an unreadable row must never change how money is taken.
 */
export async function readCheckoutBehaviour(): Promise<CheckoutBehaviour> {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", CHECKOUT_BEHAVIOUR_SETTING_KEY)
      .maybeSingle<{ value: unknown }>();
    if (error) {
      console.error("[payments/checkout-behaviour] read failed", error.message);
      return { ...DEFAULT_CHECKOUT_BEHAVIOUR };
    }
    return parseCheckoutBehaviour(data?.value ?? null);
  } catch (error) {
    console.error("[payments/checkout-behaviour] read threw", error);
    return { ...DEFAULT_CHECKOUT_BEHAVIOUR };
  }
}
