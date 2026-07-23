/**
 * Remediation 5.3 — pure decision logic for Butler-prefill hydration on
 * /book, extracted verbatim from the page's applyButlerPrefill so the React
 * side is a thin useCallback with honest dependencies. Each helper takes the
 * CURRENT field value and returns the next value, or null for "leave as-is"
 * (mirroring the original functional-setState guards).
 */

export type ButlerPrefillLike = {
  villa?: string | null;
  sleeping_guests?: string | null;
  bedroom_count?: string | null;
  full_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
};

export type BedroomCountValue = "1" | "2" | "3";

/**
 * Villa may only be overridden when the guest hasn't picked one, or when the
 * current pick came from the ?villa= query param itself.
 */
export function nextVillaAfterPrefill(input: {
  currentVilla: string;
  normalizedPrefillVilla: string | null;
  queryVilla: string | null;
  knownVillas: readonly string[];
}): string | null {
  const { currentVilla, normalizedPrefillVilla, queryVilla, knownVillas } = input;
  if (!normalizedPrefillVilla || !knownVillas.includes(normalizedPrefillVilla)) return null;
  const canOverrideVilla = !currentVilla || (queryVilla !== null && currentVilla === queryVilla);
  if (!canOverrideVilla || currentVilla === normalizedPrefillVilla) return null;
  return normalizedPrefillVilla;
}

/** Sleeping guests only fills the untouched default ("2") or an empty field. */
export function nextSleepingGuestsAfterPrefill(
  currentSleepingGuests: string,
  prefill: ButlerPrefillLike,
): string | null {
  if (!prefill.sleeping_guests) return null;
  if (currentSleepingGuests !== "2" && currentSleepingGuests.trim() !== "") return null;
  return prefill.sleeping_guests;
}

/**
 * Bedrooms: an explicit prefill bedroom_count wins; otherwise derive from the
 * guest count. Either way only the untouched default ("1") is replaced.
 */
export function nextBedroomCountAfterPrefill(
  currentBedroomCount: string,
  prefill: ButlerPrefillLike,
): BedroomCountValue | null {
  if (currentBedroomCount !== "1") return null;
  const explicit: BedroomCountValue | null =
    prefill.bedroom_count === "1" || prefill.bedroom_count === "2" || prefill.bedroom_count === "3"
      ? prefill.bedroom_count
      : null;
  if (explicit) return explicit;
  if (!prefill.sleeping_guests) return null;
  const guestCount = parseInt(prefill.sleeping_guests, 10);
  return guestCount <= 2 ? "1" : guestCount <= 4 ? "2" : "3";
}

/** Full name only fills an empty field. */
export function nextFullNameAfterPrefill(
  currentFullName: string,
  prefill: ButlerPrefillLike,
): string | null {
  if (!prefill.full_name) return null;
  if (currentFullName.trim()) return null;
  return prefill.full_name;
}
