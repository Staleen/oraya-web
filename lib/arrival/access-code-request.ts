/**
 * The arrival guide's dead end.
 *
 * Screens 3 and 4 tell the guest "Enter the gate PIN on the keypad" and
 * "Enter the front-door PIN" — then show a chip reading "provided by Oraya
 * before arrival". Nothing in Oraya sends a PIN. There is no PIN store, no
 * delivery step, and no operator screen that hands one over: an approved
 * access-code system is Phase 16D and has not shipped.
 *
 * So a guest standing at a dark gate reads an instruction they cannot follow
 * and a promise nobody kept. Reported 2026-08-12.
 *
 * This module does NOT invent access codes — storing and delivering door
 * credentials is exactly the decision Phase 16D exists to make properly.
 * It replaces the dead end with a working action: one tap that opens WhatsApp
 * with the booking already quoted, so the guest reaches a human in seconds
 * instead of reading a chip promising something already overdue.
 *
 * Pure — relative .ts imports so node:test can load it.
 */

export type AccessDoor = "gate" | "front_door";

export type AccessCodeRequestInput = {
  /** Base wa.me link for the Oraya concierge. */
  whatsappUrl: string;
  /** Public support reference, when the guide has one. */
  bookingReference: string | null | undefined;
  /** Which code the guest is standing in front of. */
  door: AccessDoor;
};

const DOOR_LABEL: Record<AccessDoor, string> = {
  gate: "gate",
  front_door: "front door",
};

/** What the chip should say. Never promises a delivery Oraya cannot make. */
export function accessCodeChipLabel(door: AccessDoor): string {
  return door === "gate" ? "Gate code — tap to get it now" : "Door code — tap to get it now";
}

/**
 * A wa.me link with the message pre-written.
 *
 * The reference is included so the operator can answer without a round of
 * "which booking is this?" — at a gate at night that round trip is the whole
 * problem.
 */
export function buildAccessCodeRequestUrl(input: AccessCodeRequestInput): string {
  const base = input.whatsappUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const ref = input.bookingReference?.trim();
  const message = ref
    ? `Hello Oraya — I'm at the villa and need the ${DOOR_LABEL[input.door]} code. Booking ${ref}.`
    : `Hello Oraya — I'm at the villa and need the ${DOOR_LABEL[input.door]} code.`;
  return `${base}?text=${encodeURIComponent(message)}`;
}
