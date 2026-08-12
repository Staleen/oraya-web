/**
 * The two selection defects from KNOWN_BUGS #27, pinned.
 *
 * #27.1 — switching villa silently discarded a 21-night selection and its
 *         $5,850 estimate.
 * #27.2 — a check-in with no check-out survived leaving the calendar, and the
 *         next click was read as the check-out: a click meant as a fresh
 *         check-in produced a 4-night, $990 stay nobody chose.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/booking/stay-selection.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decideSelectionAfterVillaChange,
  describeSelectionOutcome,
  shouldClearOnLeavingCalendar,
} from "./stay-selection.ts";

const ALWAYS = () => true;
const NEVER = () => false;

/** Stand-in for the page's fmtDate — identity keeps assertions readable. */
const fmt = (iso: string) => iso;

// ── #27.1 — a villa change must not silently lose a range ──────────────────

test("a complete range survives a villa change when the new villa can host it", () => {
  const outcome = decideSelectionAfterVillaChange(
    { check_in: "2026-09-02", check_out: "2026-09-23" },
    ALWAYS,
  );
  assert.deepEqual(outcome, { kind: "kept", check_in: "2026-09-02", check_out: "2026-09-23" });
  assert.equal(describeSelectionOutcome(outcome, "Villa Byblos", fmt), "");
});

test("a range the new villa cannot host is cleared — and never silently", () => {
  const outcome = decideSelectionAfterVillaChange(
    { check_in: "2026-09-02", check_out: "2026-09-23" },
    NEVER,
  );
  assert.deepEqual(outcome, { kind: "cleared_unavailable", check_in: "2026-09-02", check_out: "2026-09-23" });

  const message = describeSelectionOutcome(outcome, "Villa Byblos", fmt);
  assert.notEqual(message, "", "clearing a range without saying so is the defect");
  // It has to name what changed: the villa, and the dates that went.
  assert.ok(message.includes("Villa Byblos"));
  assert.ok(message.includes("2026-09-02"));
  assert.ok(message.includes("2026-09-23"));
});

test("every outcome that loses dates produces a sentence", () => {
  for (const selection of [
    { check_in: "2026-09-02", check_out: "2026-09-23" },
    { check_in: "2026-09-02" },
  ]) {
    const outcome = decideSelectionAfterVillaChange(selection, NEVER);
    assert.notEqual(outcome.kind, "kept");
    assert.notEqual(describeSelectionOutcome(outcome, "Villa Mechmech", fmt), "");
  }
});

test("no selection is not an event", () => {
  assert.deepEqual(decideSelectionAfterVillaChange(null, ALWAYS), { kind: "none" });
  assert.deepEqual(decideSelectionAfterVillaChange(undefined, ALWAYS), { kind: "none" });
  assert.equal(describeSelectionOutcome({ kind: "none" }, "Villa Byblos", fmt), "");
});

test("availability is asked about the exact range, and only for a complete one", () => {
  const asked: Array<[string, string]> = [];
  decideSelectionAfterVillaChange({ check_in: "2026-09-02", check_out: "2026-09-05" }, (a, b) => {
    asked.push([a, b]);
    return true;
  });
  assert.deepEqual(asked, [["2026-09-02", "2026-09-05"]]);

  const notAsked: Array<[string, string]> = [];
  decideSelectionAfterVillaChange({ check_in: "2026-09-02" }, (a, b) => {
    notAsked.push([a, b]);
    return true;
  });
  assert.deepEqual(notAsked, [], "an incomplete range is dropped without consulting availability");
});

// ── #27.2 — an incomplete range cannot be completed by a later click ────────

test("an incomplete range does not survive leaving the calendar", () => {
  assert.equal(shouldClearOnLeavingCalendar({ check_in: "2026-09-22" }), true);
  assert.equal(shouldClearOnLeavingCalendar({ check_in: "2026-09-22", check_out: null }), true);
  assert.equal(shouldClearOnLeavingCalendar({ check_in: "2026-09-22", check_out: "" }), true);
});

test("a complete range does survive leaving the calendar", () => {
  assert.equal(shouldClearOnLeavingCalendar({ check_in: "2026-09-22", check_out: "2026-09-26" }), false);
});

test("nothing selected is nothing to clear", () => {
  assert.equal(shouldClearOnLeavingCalendar(null), false);
  assert.equal(shouldClearOnLeavingCalendar(undefined), false);
  assert.equal(shouldClearOnLeavingCalendar({ check_in: "" }), false);
});

test("the live case: 22 Sep pending, guest leaves, returns and clicks 26 Sep", () => {
  // Before the fix the pending 22 Sep absorbed the 26 Sep click and produced a
  // 4-night $990 stay. Leaving the calendar must drop the pending check-in, so
  // the later click can only be a fresh check-in.
  const pending = { check_in: "2026-09-22" };
  assert.equal(shouldClearOnLeavingCalendar(pending), true);

  const afterVillaChange = decideSelectionAfterVillaChange(pending, ALWAYS);
  assert.equal(afterVillaChange.kind, "cleared_incomplete");
  assert.ok(describeSelectionOutcome(afterVillaChange, "Villa Byblos", fmt).includes("check-out"));
});

test("a reversed or zero-night range counts as incomplete, not as a stay", () => {
  assert.equal(shouldClearOnLeavingCalendar({ check_in: "2026-09-22", check_out: "2026-09-22" }), true);
  assert.equal(shouldClearOnLeavingCalendar({ check_in: "2026-09-22", check_out: "2026-09-20" }), true);
  assert.equal(
    decideSelectionAfterVillaChange({ check_in: "2026-09-22", check_out: "2026-09-22" }, ALWAYS).kind,
    "cleared_incomplete",
  );
});
