/**
 * The arrival guide told the guest to enter a PIN nothing ever sends.
 *
 * Runner: node --experimental-strip-types --test lib/arrival/access-code-request.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { accessCodeChipLabel, buildAccessCodeRequestUrl } from "./access-code-request.ts";

const WA = "https://wa.me/96171140041";

test("the link quotes the booking so the operator can answer immediately", () => {
  const url = buildAccessCodeRequestUrl({ whatsappUrl: WA, bookingReference: "ORY-1234", door: "gate" });
  assert.equal(url.startsWith("https://wa.me/96171140041?text="), true);
  const text = decodeURIComponent(url.split("?text=")[1]);
  assert.match(text, /gate code/);
  assert.match(text, /ORY-1234/);
});

test("the front door asks for the front door, not the gate", () => {
  const url = buildAccessCodeRequestUrl({ whatsappUrl: WA, bookingReference: null, door: "front_door" });
  const text = decodeURIComponent(url.split("?text=")[1]);
  assert.match(text, /front door code/);
  assert.doesNotMatch(text, /gate/);
});

test("a missing reference still produces a usable message", () => {
  for (const ref of [null, undefined, "   "]) {
    const url = buildAccessCodeRequestUrl({ whatsappUrl: WA, bookingReference: ref, door: "gate" });
    const text = decodeURIComponent(url.split("?text=")[1]);
    assert.match(text, /need the gate code/);
    assert.doesNotMatch(text, /Booking/);
  }
});

test("an existing query string on the base link is not duplicated", () => {
  const url = buildAccessCodeRequestUrl({
    whatsappUrl: "https://wa.me/96171140041?text=old",
    bookingReference: "ORY-1",
    door: "gate",
  });
  assert.equal(url.split("?text=").length, 2);
});

test("the chip never promises a delivery Oraya cannot make", () => {
  for (const door of ["gate", "front_door"] as const) {
    const label = accessCodeChipLabel(door);
    assert.match(label, /tap to get it now/);
    assert.doesNotMatch(label, /before arrival/);
  }
});

test("no code is ever embedded in the request link", () => {
  const url = decodeURIComponent(
    buildAccessCodeRequestUrl({ whatsappUrl: WA, bookingReference: "ORY-1234", door: "gate" }),
  );
  // Strip the two digit runs that are legitimately there — the concierge
  // number and the public booking reference. Anything left would be a code
  // this module has no business knowing.
  const residue = url.replace("96171140041", "").replace("ORY-1234", "");
  assert.doesNotMatch(residue, /\d/);
});
