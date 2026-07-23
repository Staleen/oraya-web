/**
 * Remediation 1.4 — DB error classification used by the confirm write paths.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/db-errors.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { isExclusionViolation, isUniqueViolation } from "./db-errors.ts";

test("23P01 exclusion violations are recognized (supabase error shape)", () => {
  assert.equal(isExclusionViolation({ code: "23P01", message: "conflicting key value" }), true);
  assert.equal(isUniqueViolation({ code: "23505", message: "duplicate key value" }), true);
});

test("other errors and junk are not misclassified", () => {
  assert.equal(isExclusionViolation({ code: "23505" }), false);
  assert.equal(isExclusionViolation({ code: 23001 }), false); // non-string code
  assert.equal(isExclusionViolation({ message: "23P01" }), false); // code only
  assert.equal(isExclusionViolation(null), false);
  assert.equal(isExclusionViolation(undefined), false);
  assert.equal(isExclusionViolation("23P01"), false);
  assert.equal(isUniqueViolation({ code: "23P01" }), false);
});
