/**
 * "Send anyway" for a held arrival guide.
 *
 * Runner: node --experimental-strip-types --test lib/whatsapp/arrival-guide-override.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendArrivalGuideOverrideNote,
  assessArrivalGuideOverride,
  validateOverrideReason,
} from "./arrival-guide-override.ts";
import { decideArrivalGuideRelease } from "./arrival-guide-gate.ts";

const HELD = {
  status: "confirmed",
  gateEnabled: true,
  whatsappConfirmationSentAt: null,
  amountPaid: 0,
  amountTotal: 1000,
  depositAmount: 300,
};

test("a genuinely held guide can be released", () => {
  assert.deepEqual(assessArrivalGuideOverride(HELD, decideArrivalGuideRelease), { available: true });
});

test("the override is not offered when the gate is off — nothing is held", () => {
  const r = assessArrivalGuideOverride({ ...HELD, gateEnabled: false }, decideArrivalGuideRelease);
  assert.deepEqual(r, { available: false, reason: "gate_disabled" });
});

test("the override is not offered once the guide has actually gone out", () => {
  const r = assessArrivalGuideOverride(
    { ...HELD, whatsappConfirmationSentAt: "2026-08-12T09:00:00Z" },
    decideArrivalGuideRelease,
  );
  assert.deepEqual(r, { available: false, reason: "already_sent" });
});

test("the override is not offered once the deposit is met", () => {
  const r = assessArrivalGuideOverride({ ...HELD, amountPaid: 300 }, decideArrivalGuideRelease);
  assert.deepEqual(r, { available: false, reason: "not_held" });
});

test("only a confirmed booking has a guide to release", () => {
  for (const status of ["pending", "cancelled", null, ""]) {
    const r = assessArrivalGuideOverride({ ...HELD, status }, decideArrivalGuideRelease);
    assert.deepEqual(r, { available: false, reason: "booking_not_confirmed" });
  }
});

test("availability agrees with the gate rather than second-guessing it", () => {
  // No deposit and no total: the gate refuses to hold on a guess, so there is
  // nothing to override either.
  const r = assessArrivalGuideOverride(
    { ...HELD, depositAmount: null, amountTotal: null },
    decideArrivalGuideRelease,
  );
  assert.deepEqual(r, { available: false, reason: "not_held" });
});

test("an override without a written reason is refused", () => {
  for (const raw of ["", "   ", "ok", null, undefined, 42, {}]) {
    assert.deepEqual(validateOverrideReason(raw), { ok: false, error: "reason_required" });
  }
  assert.deepEqual(validateOverrideReason("  bank transfer confirmed  "), {
    ok: true,
    reason: "bank transfer confirmed",
  });
});

test("the note appends and never erases an earlier decision", () => {
  const first = appendArrivalGuideOverrideNote("Deposit chased 2026-08-01", {
    reason: "arriving tonight",
    by: "david@stayoraya.com",
    atIso: "2026-08-12T10:00:00.000Z",
  });
  assert.match(first, /Deposit chased 2026-08-01/);
  assert.match(first, /arriving tonight/);
  assert.match(first, /david@stayoraya\.com/);
  assert.match(first, /sent before the deposit/);

  const second = appendArrivalGuideOverrideNote(first, {
    reason: "second release",
    by: null,
    atIso: "2026-08-13T10:00:00.000Z",
  });
  assert.match(second, /arriving tonight/);
  assert.match(second, /second release/);
  assert.match(second, /· ops ·/);
  assert.equal(second.split("\n").length, 3);
});

test("an empty note history does not produce a leading blank line", () => {
  const note = appendArrivalGuideOverrideNote(null, {
    reason: "friend of the family",
    by: "ops",
    atIso: "2026-08-12T10:00:00.000Z",
  });
  assert.equal(note.startsWith("["), true);
});
