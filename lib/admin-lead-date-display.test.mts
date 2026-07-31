import assert from "node:assert/strict";
import { test } from "node:test";

import { formatLeadDateRange, formatLeadDateValue } from "./admin-lead-date-display.ts";

test("normalized ISO dates take precedence over stale raw-text dates", () => {
  assert.equal(
    formatLeadDateRange({
      normalized_check_in: "2026-08-30",
      normalized_check_out: "2026-08-31",
      check_in_text: "stale check-in",
      check_out_text: "stale check-out",
    }),
    "Aug 30 → Aug 31",
  );
});

test("raw date text remains the fallback when normalized dates are absent", () => {
  assert.equal(
    formatLeadDateRange({
      normalized_check_in: null,
      normalized_check_out: null,
      check_in_text: "this Saturday",
      check_out_text: "  Sunday morning  ",
    }),
    "this Saturday → Sunday morning",
  );
});

test("missing normalized and raw dates retain the em-dash display", () => {
  assert.equal(formatLeadDateValue(null, null), "—");
  assert.equal(
    formatLeadDateRange({
      normalized_check_in: null,
      normalized_check_out: null,
      check_in_text: null,
      check_out_text: null,
    }),
    "—",
  );
});
