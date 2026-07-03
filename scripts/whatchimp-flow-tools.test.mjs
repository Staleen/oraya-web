/**
 * Unit tests for the WhatChimp flow validator + simulator
 * (scripts/validate-whatchimp-flow.mjs / scripts/simulate-whatchimp-flow.mjs).
 *
 * Run: node --test scripts/whatchimp-flow-tools.test.mjs
 *
 * The synthetic-fixture tests prove the validator detects semantic defects a
 * parse/reachability check would miss (this is the regression guard against
 * another false completion report). The artifact tests pin the real v5.5
 * export as failing and the generated v6 as passing.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateFlow } from "./validate-whatchimp-flow.mjs";
import { evalCondition, interpolate, runScenario, buildScenarios } from "./simulate-whatchimp-flow.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..");
const profile = JSON.parse(readFileSync(path.join(here, "whatchimp", "natural-intake-profile.json"), "utf8"));

// ─── synthetic flow helpers ─────────────────────────────────────────────────

function textNode(id, textMessage) {
  return {
    id,
    data: { uniqueId: `t${id}`, textMessage },
    inputs: { textInput: { connections: [] } },
    outputs: { textOutput: { connections: [] } },
    position: [0, 0],
    name: "Text",
  };
}

function startNode(id) {
  return {
    id,
    data: { uniqueId: `s${id}`, title: "start" },
    inputs: {},
    outputs: { referenceOutput: { connections: [] } },
    position: [0, 0],
    name: "Start Bot Flow",
  };
}

function conditionNode(id, rows, anyMatch = true) {
  return {
    id,
    data: {
      uniqueId: `c${id}`,
      all_match: !anyMatch,
      any_match: anyMatch,
      custom_field_variable: rows.map((r) => `custom_${r.fid}`),
      custom_field_variable_selected_values: rows.map((r) => `custom_${r.fid}`),
      custom_field_variable_selected_texts: rows.map((r) => r.name),
      custom_field_operator: rows.map((r) => r.op ?? "equal"),
      custom_field_operator_selected_texts: rows.map(() => "="),
      custom_field_variable_value: rows.map((r) => r.value),
    },
    inputs: { conditionInput: { connections: [] } },
    outputs: {
      conditionOutputTrue: { connections: [] },
      conditionOutputFalse: { connections: [] },
    },
    position: [0, 0],
    name: "Condition",
  };
}

function link(flow, fromId, outKey, toId, inKey) {
  flow.nodes[fromId].outputs[outKey].connections.push({ node: Number(toId), input: inKey, data: [] });
  flow.nodes[toId].inputs[inKey].connections.push({ node: Number(fromId), output: outKey, data: [] });
}

const VALID_TERMINAL_TEXT =
  "You can continue your booking request on the Oraya website here: #oraya_prefill_url# — if that secure link is unavailable, please use: https://stayoraya.com/book — this is not a confirmed booking yet.";

function baseFlow() {
  const flow = { id: "xitFB@0.0.1", nodes: {} };
  flow.nodes["1"] = startNode(1);
  flow.nodes["2"] = textNode(2, VALID_TERMINAL_TEXT);
  link(flow, "1", "referenceOutput", "2", "textInput");
  return flow;
}

const errorsOf = (flow, opts) => validateFlow(flow, profile, opts).errors;
const hasError = (errors, snippet) => errors.some((e) => e.includes(snippet));

// ─── validator: semantic defect detection ───────────────────────────────────

test("validator: blank condition comparison value is an error", () => {
  const flow = baseFlow();
  flow.nodes["3"] = conditionNode(3, [{ fid: "57699", name: "oraya_check_in", value: "" }]);
  flow.nodes["4"] = textNode(4, "passed your request to the Oraya team — not a confirmed booking");
  // splice condition between 1 and 2
  flow.nodes["1"].outputs.referenceOutput.connections = [];
  flow.nodes["2"].inputs.textInput.connections = [];
  link(flow, "1", "referenceOutput", "3", "conditionInput");
  link(flow, "3", "conditionOutputTrue", "2", "textInput");
  link(flow, "3", "conditionOutputFalse", "4", "textInput");
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "prohibited blank comparison value"), errors.join("\n"));
});

test("validator: duplicated identical condition row is an error", () => {
  const flow = baseFlow();
  flow.nodes["3"] = conditionNode(3, [
    { fid: "57699", name: "oraya_check_in", value: "null" },
    { fid: "57699", name: "oraya_check_in", value: "null" },
  ]);
  flow.nodes["4"] = textNode(4, "passed your request to the Oraya team — not a confirmed booking");
  flow.nodes["1"].outputs.referenceOutput.connections = [];
  flow.nodes["2"].inputs.textInput.connections = [];
  link(flow, "1", "referenceOutput", "3", "conditionInput");
  link(flow, "3", "conditionOutputTrue", "2", "textInput");
  link(flow, "3", "conditionOutputFalse", "4", "textInput");
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "duplicates an identical earlier row"), errors.join("\n"));
});

test("validator: missing reciprocal input connection is an error", () => {
  const flow = baseFlow();
  // break reciprocity: output 1→2 exists, input side is emptied
  flow.nodes["2"].inputs.textInput.connections = [];
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "no reciprocal serialized input connection"), errors.join("\n"));
});

test("validator: graph cycle is an error", () => {
  const flow = baseFlow();
  flow.nodes["3"] = textNode(3, "loop text");
  link(flow, "2", "textOutput", "3", "textInput");
  link(flow, "3", "textOutput", "2", "textInput");
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "cycle detected"), errors.join("\n"));
});

test("validator: terminal \"Got it.\" acknowledgement is an error", () => {
  const flow = baseFlow();
  flow.nodes["2"].data.textMessage = "Got it.";
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "dead-end acknowledgement"), errors.join("\n"));
});

test("validator: team-follow-up-only terminal without a booking continuation is an error", () => {
  const flow = baseFlow();
  flow.nodes["2"].data.textMessage =
    "I've passed your request to the Oraya team — they'll follow up with you here. This is not a confirmed booking yet.";
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "lacks the required continuation element"), errors.join("\n"));
});

test("validator: terminal missing the not-confirmed status is an error", () => {
  const flow = baseFlow();
  flow.nodes["2"].data.textMessage =
    "You can continue your booking request on the Oraya website here: #oraya_prefill_url# or https://stayoraya.com/book — see you soon!";
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "not-confirmed booking status"), errors.join("\n"));
});

test("validator: wrong-domain guest-facing text is an error", () => {
  const flow = baseFlow();
  flow.nodes["2"].data.textMessage = VALID_TERMINAL_TEXT + " Also see www.stayoraya.com for photos.";
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "forbidden domain pattern"), errors.join("\n"));
});

test("validator: second destination on one condition output is an error", () => {
  const flow = baseFlow();
  flow.nodes["3"] = conditionNode(3, [{ fid: "57699", name: "oraya_check_in", value: "null" }]);
  flow.nodes["4"] = textNode(4, "passed your request to the Oraya team — not a confirmed booking");
  flow.nodes["1"].outputs.referenceOutput.connections = [];
  flow.nodes["2"].inputs.textInput.connections = [];
  link(flow, "1", "referenceOutput", "3", "conditionInput");
  link(flow, "3", "conditionOutputTrue", "2", "textInput");
  link(flow, "3", "conditionOutputTrue", "4", "textInput"); // ambiguous duplicate destination
  link(flow, "3", "conditionOutputFalse", "4", "textInput");
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "ambiguous execution order"), errors.join("\n"));
});

// ─── validator: real artifacts ──────────────────────────────────────────────

const v55Path = path.join(repoRoot, "artifacts", "whatchimp", "Oraya_natural_intake_v5.5.input.txt");
const v6Path = path.join(repoRoot, "Oraya_natural_intake_v6.txt");

test("validator: v5.5 operator export fails with semantic errors", { skip: !existsSync(v55Path) }, () => {
  const flow = JSON.parse(readFileSync(v55Path, "utf8"));
  const { errors } = validateFlow(flow, profile);
  assert.ok(errors.length >= 30, `expected the audited v5.5 defects, got ${errors.length} errors`);
  assert.ok(hasError(errors, "empty customField id"));
  assert.ok(hasError(errors, "dead-end API call"));
  assert.ok(hasError(errors, "no bedroom-selection question exists"));
});

test("validator: generated v6 passes with zero errors (placeholder warnings only)", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const { errors, warnings } = validateFlow(flow, profile);
  assert.deepEqual(errors, []);
  assert.ok(warnings.every((w) => w.includes("__ORAYA_BEDROOM_COUNT_FIELD_ID__")));
});

test("validator: v6 fails strict-binding until the real bedroom field id is bound", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const { errors } = validateFlow(flow, profile, { strictBinding: true });
  assert.ok(errors.length > 0);
});

test("profile: every leadSubmit id maps prefill_url → oraya_prefill_url", () => {
  // Both Lead Submit integrations (WhatsApp/escalation 6961 and website-handoff
  // 7459, and any TEST clone that replaces them in a TEST profile) must write
  // the secure prefill URL into oraya_prefill_url, or the terminal messages'
  // #oraya_prefill_url# slot goes blank and only the canonical fallback
  // remains. The mapping and the canonical fallback are complementary — this
  // test guards the mapping; the validator's terminal-continuation and
  // canonical-domain checks guard the fallback.
  const ids = profile.apis.leadSubmit.ids;
  assert.ok(Array.isArray(ids) && ids.length >= 2, "leadSubmit must list both Lead Submit integration ids");
  for (const id of ids) {
    assert.equal(
      profile.apiFieldWrites?.[id]?.prefill_url,
      "oraya_prefill_url",
      `leadSubmit id ${id} must map prefill_url → oraya_prefill_url in apiFieldWrites`,
    );
  }
});

// ─── simulator engine ───────────────────────────────────────────────────────

test("simulator: condition evaluation (equal / contains / any / all)", () => {
  const fields = new Map([["oraya_check_in", "null"], ["oraya_dates_confirmed_text", "Looks right to me"]]);
  const anyEq = {
    any_match: true,
    custom_field_variable_selected_texts: ["oraya_check_in", "oraya_check_out"],
    custom_field_operator: ["equal", "equal"],
    custom_field_variable_value: ["null", "null"],
  };
  assert.equal(evalCondition(anyEq, fields), true); // check_in matches; check_out unset ("") does not
  const allEq = { ...anyEq, any_match: false };
  assert.equal(evalCondition(allEq, fields), false);
  const contains = {
    any_match: true,
    custom_field_variable_selected_texts: ["oraya_dates_confirmed_text"],
    custom_field_operator: ["contains"],
    custom_field_variable_value: ["Looks right"],
  };
  assert.equal(evalCondition(contains, fields), true);
});

test("simulator: hashtag interpolation uses current field state", () => {
  const fields = new Map([["oraya_villa", "Villa Byblos"]]);
  assert.equal(interpolate("Villa: #oraya_villa# / #oraya_missing#", fields), "Villa: Villa Byblos / ");
});

test("simulator: stale-villa scenario fails on a flow that skips the villa ask", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(JSON.stringify(v6Path) && v6Path, "utf8"));
  // sabotage: make the villa gate always take the "villa known" branch
  const villaGate = Object.values(flow.nodes).find(
    (n) => n.name === "Condition" && (n.data.custom_field_variable_selected_texts ?? []).includes("oraya_villa"),
  );
  villaGate.data.custom_field_variable_value = ["__never__"];
  const scenario = buildScenarios().find((s) => s.name.startsWith("S25"));
  const result = runScenario(flow, profile, scenario);
  assert.ok(result.failures.length > 0, "sabotaged flow must fail the stale-villa scenario");
});

test("simulator: all scenarios (incl. fault injection) pass against the generated v6", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  for (const scenario of buildScenarios()) {
    const result = runScenario(flow, profile, scenario);
    assert.deepEqual(result.failures, [], `${scenario.name}:\n${result.failures.join("\n")}`);
  }
});

test("simulator: scenario matrix covers every terminal node of the flow", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const flowTerminals = new Set(
    Object.keys(flow.nodes).filter((id) =>
      Object.values(flow.nodes[id].outputs ?? {}).every((o) => (o.connections ?? []).length === 0),
    ),
  );
  const visitedTerminals = new Set();
  for (const scenario of buildScenarios()) {
    const result = runScenario(flow, profile, scenario);
    if (result.failures.length === 0) visitedTerminals.add(String(result.terminalNodeId));
  }
  assert.deepEqual([...flowTerminals].sort(), [...visitedTerminals].sort(),
    `every reachable terminal must be exercised by at least one scenario (flow: ${[...flowTerminals]}, visited: ${[...visitedTerminals]})`);
});
