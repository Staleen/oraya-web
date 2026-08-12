/**
 * Which payment buttons Unified Checkout should offer.
 *
 * None of the wallets are things an operator picks. Apple Pay, Google Pay and
 * Click to Pay are all ways of presenting a CARD — a guest paying with
 * either produces an ordinary card payment carrying a `wallet_presentation`.
 * Treating them as ledger methods would mean a migration and a new operator
 * choice for something that is really just a faster way to type a card number.
 *
 * So they ride with card: if card is on offer and the wallet is enrolled at
 * the provider, the button appears. Nothing to configure per booking.
 *
 * Enrolment state, 2026-08-12:
 *   Apple Pay    ENABLED, www.stayoraya.com verified with Apple
 *   Google Pay   ENABLED in the Business Center
 *   Click to Pay refused by CyberSource — the organization is not entitled
 *
 * Pure — relative .ts imports so node:test can load it.
 */

export type OnlineCheckoutMethod = "card" | "apple_pay" | "google_pay" | "click_to_pay";

export type ProviderWalletCapabilities = {
  apple_pay_enabled: boolean;
  google_pay_enabled: boolean;
  click_to_pay_enabled: boolean;
};

/**
 * Resolve the buttons to request.
 *
 * Order matters: it is the order Unified Checkout renders them in, and card
 * stays first because it is the only one every guest can definitely use.
 */
export function resolveOnlineCheckoutMethods(
  requestAllowedMethods: readonly string[],
  capabilities: ProviderWalletCapabilities,
): OnlineCheckoutMethod[] {
  const methods: OnlineCheckoutMethod[] = [];
  const cardAllowed = requestAllowedMethods.includes("card");

  if (cardAllowed) methods.push("card");

  // Card-backed wallets. Never offered without card: they settle as a card
  // payment, so offering one where card is refused would contradict the
  // operator's own choice.
  //
  // Apple Pay is in this group, NOT a method the operator picks. Unified
  // Checkout renders "Pay with Apple Pay" and the card form on one sheet, so
  // choosing between them is not a real choice. Treating it as one produced a
  // live dead end on 2026-08-12: a link created with allowed_methods
  // ["apple_pay"] and no card, which /pay then correctly refused with "Secure
  // card payment is not available for this request". The guest saw a broken
  // page because the operator picked the wallet instead of the rail beneath
  // it.
  //
  // A request that still carries a legacy "apple_pay" entry is honoured the
  // same way — as long as card is allowed. Historical rows keep their meaning.
  if (cardAllowed && capabilities.apple_pay_enabled) methods.push("apple_pay");
  if (cardAllowed && capabilities.google_pay_enabled) methods.push("google_pay");
  if (cardAllowed && capabilities.click_to_pay_enabled) methods.push("click_to_pay");

  return methods;
}
