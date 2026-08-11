/**
 * Which payment buttons Unified Checkout should offer.
 *
 * Apple Pay is modelled in the ledger as its own method for historical
 * reasons, so it has to be requested explicitly on the payment request.
 * Google Pay and Click to Pay are NOT separate methods — a guest paying with
 * either produces an ordinary card payment carrying a `wallet_presentation`.
 * Treating them as ledger methods would mean a migration and a new operator
 * choice for something that is really just a faster way to type a card number.
 *
 * So they ride with card: if card is on offer and the wallet is enrolled at
 * the provider, the button appears. Nothing to configure per booking.
 *
 * Enrolment state, 2026-08-12:
 *   Apple Pay    display name set, domain verification outstanding
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

  // Explicitly requested, because Apple Pay is a ledger method of its own.
  if (requestAllowedMethods.includes("apple_pay") && capabilities.apple_pay_enabled) {
    methods.push("apple_pay");
  }

  // Card-backed wallets. Never offered without card: they settle as a card
  // payment, so offering one where card is refused would contradict the
  // operator's own choice.
  if (cardAllowed && capabilities.google_pay_enabled) methods.push("google_pay");
  if (cardAllowed && capabilities.click_to_pay_enabled) methods.push("click_to_pay");

  return methods;
}
