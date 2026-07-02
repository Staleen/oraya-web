#!/usr/bin/env node
/**
 * Phase 16A — deterministic finalization step for the Oraya Natural Stay
 * Intake v6 flow: binds the real WhatChimp custom-field id for
 * `oraya_bedroom_count` into every node that currently carries the documented
 * placeholder (`__ORAYA_BEDROOM_COUNT_FIELD_ID__`), i.e. the four bedroom
 * questions and the eight bedroom-capacity condition rows.
 *
 * The real id is created by the operator in the WhatChimp UI
 * (Custom Fields → New → name: oraya_bedroom_count, type: Text or Number)
 * and passed here — this script never invents an id.
 *
 * Usage:
 *   node scripts/bind-whatchimp-field.mjs <flow-file> <numeric-field-id> [-o <output-file>]
 *
 * Without -o the flow file is rewritten in place. Exit codes:
 * 0 = bound, 1 = nothing to bind, 2 = bad input.
 */

import { readFileSync, writeFileSync } from "node:fs";

const PLACEHOLDER = "__ORAYA_BEDROOM_COUNT_FIELD_ID__";

const args = process.argv.slice(2);
const outIdx = args.indexOf("-o");
const output = outIdx !== -1 ? args[outIdx + 1] : null;
const positional = args.filter((a, i) => i !== outIdx && i !== outIdx + 1);
const [flowPath, fieldId] = positional;

if (!flowPath || !fieldId) {
  console.error("usage: node scripts/bind-whatchimp-field.mjs <flow-file> <numeric-field-id> [-o <output-file>]");
  process.exit(2);
}
if (!/^\d+$/.test(fieldId)) {
  console.error(`field id "${fieldId}" is not numeric — pass the real WhatChimp custom-field id for oraya_bedroom_count (never invent one)`);
  process.exit(2);
}

let raw;
try {
  raw = readFileSync(flowPath, "utf8");
} catch (e) {
  console.error(`cannot read ${flowPath}: ${e.message}`);
  process.exit(2);
}
try {
  JSON.parse(raw);
} catch (e) {
  console.error(`${flowPath} is not valid JSON: ${e.message}`);
  process.exit(2);
}

const occurrences = raw.split(PLACEHOLDER).length - 1;
if (occurrences === 0) {
  console.error(`no occurrences of ${PLACEHOLDER} found in ${flowPath} — nothing to bind`);
  process.exit(1);
}

const bound = raw.split(PLACEHOLDER).join(fieldId);
JSON.parse(bound); // sanity: still valid JSON
writeFileSync(output ?? flowPath, bound, "utf8");
console.log(`bound ${occurrences} occurrence(s) of ${PLACEHOLDER} → ${fieldId} in ${output ?? flowPath}`);
console.log("next: node scripts/validate-whatchimp-flow.mjs " + (output ?? flowPath) + " --strict-binding");
console.log("note: --strict-binding validates against the manifest; update scripts/whatchimp/natural-intake-profile.json 'oraya_bedroom_count' to the same id first.");
