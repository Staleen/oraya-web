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
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateFlow } from "./validate-whatchimp-flow.mjs";
import { evalCondition, interpolate, runScenario, buildScenarios } from "./simulate-whatchimp-flow.mjs";
import { compareFlows } from "./compare-whatchimp-roundtrip.mjs";

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

test("validator: direct Question → Condition transition is an error (loose-link guard)", () => {
  // Genuine WhatChimp exports only ever continue a question's final reply
  // into a Text or HTTP API node; a direct Question → Condition edge was
  // operator-observed rendering as a loose/disconnected line after import.
  const flow = baseFlow();
  flow.nodes["3"] = {
    id: 3,
    data: {
      uniqueId: "q3", question: "How many bedrooms would you like?", replyType: "Text",
      customField: "57699", customFieldSelectedOptionText: "oraya_check_in",
    },
    inputs: { userInputFlowSingleInput: { connections: [] } },
    outputs: { userInputFlowSingleOutputFinalReply: { connections: [] } },
    position: [0, 0],
    name: "User Input Flow Single",
  };
  flow.nodes["4"] = conditionNode(4, [{ fid: "57699", name: "oraya_check_in", value: "null" }]);
  flow.nodes["5"] = textNode(5, "passed your request to the Oraya team — not a confirmed booking");
  flow.nodes["1"].outputs.referenceOutput.connections = [];
  flow.nodes["2"].inputs.textInput.connections = [];
  link(flow, "1", "referenceOutput", "3", "userInputFlowSingleInput");
  link(flow, "3", "userInputFlowSingleOutputFinalReply", "4", "conditionInput");
  link(flow, "4", "conditionOutputTrue", "2", "textInput");
  link(flow, "4", "conditionOutputFalse", "5", "textInput");
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "unsupported direct question transition"), errors.join("\n"));
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

test("validator: single-parent-contract rejects a second connection on one input socket", () => {
  // Round trip #1 (2026-07-03): WhatChimp import keeps only the first
  // serialized connection per input socket. Any convergence is an error.
  const flow = baseFlow();
  flow.nodes["3"] = conditionNode(3, [{ fid: "57699", name: "oraya_check_in", value: "null" }]);
  flow.nodes["4"] = textNode(4, "passed your request to the Oraya team — not a confirmed booking");
  flow.nodes["1"].outputs.referenceOutput.connections = [];
  flow.nodes["2"].inputs.textInput.connections = [];
  link(flow, "1", "referenceOutput", "3", "conditionInput");
  link(flow, "3", "conditionOutputTrue", "2", "textInput");
  link(flow, "3", "conditionOutputFalse", "4", "textInput");
  link(flow, "4", "textOutput", "2", "textInput"); // second parent onto #2 — the convergence WhatChimp drops
  const errors = errorsOf(flow);
  assert.ok(hasError(errors, "single-parent-contract"), errors.join("\n"));
  assert.ok(hasError(errors, "keeps only the first"), errors.join("\n"));
});

test("validator: single-parent-contract rejects one escalation tail shared by two branches", () => {
  const flow = baseFlow();
  flow.nodes["3"] = conditionNode(3, [{ fid: "57699", name: "oraya_check_in", value: "null" }]);
  flow.nodes["4"] = textNode(4, "let me bring in our team — one branch");
  flow.nodes["5"] = textNode(5, "let me bring in our team — another branch");
  flow.nodes["1"].outputs.referenceOutput.connections = [];
  flow.nodes["2"].inputs.textInput.connections = [];
  link(flow, "1", "referenceOutput", "3", "conditionInput");
  link(flow, "3", "conditionOutputTrue", "4", "textInput");
  link(flow, "3", "conditionOutputFalse", "5", "textInput");
  link(flow, "4", "textOutput", "2", "textInput");
  link(flow, "5", "textOutput", "2", "textInput"); // shared terminal tail — two independent branches converge
  const errors = errorsOf(flow);
  assert.ok(errors.some((e) => e.includes("single-parent-contract") && e.includes("#2")), errors.join("\n"));
});

// ─── validator: real artifacts ──────────────────────────────────────────────

const v55Path = path.join(repoRoot, "artifacts", "whatchimp", "Oraya_natural_intake_v5.5.input.txt");
const v6Path = path.join(repoRoot, "Oraya_natural_intake_v6.txt");
const roundtrip1Path = path.join(repoRoot, "artifacts", "whatchimp", "roundtrips", "Oraya_natural_intake_v6.roundtrip-1.saved-reexport.txt");
// the exact candidate that round trip #1 imported (byte-preserved fixture;
// the canonical Oraya_natural_intake_v6.txt has since moved to the hybrid
// architecture, so the historical pair must stay pinned)
const roundtrip1CandidatePath = path.join(repoRoot, "artifacts", "whatchimp", "roundtrips", "Oraya_natural_intake_v6.roundtrip-1.import-candidate.txt");
// the exact candidate whose redraw plan round trip #2 halted on (byte-preserved
// fixture; superseded by the corrected-rule Condition-clone-cascade candidate)
const roundtrip2HaltedPath = path.join(repoRoot, "artifacts", "whatchimp", "roundtrips", "Oraya_natural_intake_v6.roundtrip-2.halted-candidate.txt");
// the exact 181-node candidate whose redraw plan round trip #3 proved
// unexecutable (items #5/#22/#24 targeted already-connected Condition inputs;
// byte-preserved fixture — see roundtrips/ROUNDTRIP_3_FINDINGS.md)
const roundtrip3FailedPath = path.join(repoRoot, "artifacts", "whatchimp", "roundtrips", "Oraya_natural_intake_v6.roundtrip-3.failed-candidate.txt");
// the operator's authenticated saved/reopened export proving Interactive
// button schema + forward button convergence persistence (2026-07-04)
const buttonEvidencePath = path.join(repoRoot, "artifacts", "whatchimp", "roundtrips", "Oraya_natural_intake_v6.button-evidence.saved-reexport.txt");

test("validator: v5.5 operator export fails with semantic errors", { skip: !existsSync(v55Path) }, () => {
  const flow = JSON.parse(readFileSync(v55Path, "utf8"));
  const { errors } = validateFlow(flow, profile);
  assert.ok(errors.length >= 30, `expected the audited v5.5 defects, got ${errors.length} errors`);
  assert.ok(hasError(errors, "empty customField id"));
  assert.ok(hasError(errors, "dead-end API call"));
  assert.ok(hasError(errors, "no bedroom-selection control exists"));
});

// Interactive-controls candidate (2026-07-04, operator button evidence): the
// canonical candidate collects missing guest count / bedrooms / villa through
// Interactive controls whose buttons/rows save directly to the custom field
// (stored value = visible label) and route forward on the press. The ONLY
// serialized convergence is postback convergence — input sockets whose
// parents are ALL Inline Button / Rows nodes — declared exactly in the
// profile's `importGraphContract.approvedPostbackMerges`. There are ZERO
// operator redraws. The candidate must validate completely clean.

test("validator: generated v6 passes with zero errors and zero warnings", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const { errors, warnings } = validateFlow(flow, profile);
  assert.deepEqual(errors, [], errors.join("\n"));
  assert.deepEqual(warnings, [], warnings.join("\n"));
});

test("validator: canonical v6 passes strict binding (fully bound, no second binding step)", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const { errors, warnings } = validateFlow(flow, profile, { strictBinding: true });
  assert.deepEqual(errors, [], errors.join("\n"));
  assert.deepEqual(warnings, [], warnings.join("\n"));
});

test("editor invariant: zero redraws, postback-only convergence, one inbound TOTAL per Condition, no Start-a-Flow controls", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const nodes = flow.nodes;
  // profile encodes the corrected 2026-07-03/04 evidence
  assert.equal(profile.importGraphContract.maxInboundPerCondition, 1);
  assert.deepEqual(profile.importGraphContract.postbackSourceNames, ["Inline Button", "Rows"]);
  const postback = new Set(profile.importGraphContract.postbackSourceNames);
  // every beyond-first serialized edge comes from a postback control (the
  // operator-proven convergence class) — there is NOTHING for an operator to
  // redraw after import
  for (const [id, node] of Object.entries(nodes)) {
    for (const [inKey, inp] of Object.entries(node.inputs ?? {})) {
      const conns = inp.connections ?? [];
      if (conns.length <= 1) continue;
      assert.notEqual(node.name, "Condition", `convergence on Condition #${id} — never allowed (one inbound TOTAL)`);
      for (const c of conns) {
        const srcName = nodes[String(c.node)].name;
        assert.ok(postback.has(srcName), `merge edge #${c.node} (${srcName}) → #${id}:${inKey} is not postback convergence — would be silently dropped by the import with no redraw plan to repair it`);
      }
    }
  }
  // no Condition anywhere carries more than one inbound connection of ANY type
  for (const [id, node] of Object.entries(nodes)) {
    if (node.name !== "Condition") continue;
    let inbound = 0;
    for (const inp of Object.values(node.inputs ?? {})) inbound += (inp.connections ?? []).length;
    assert.ok(inbound <= 1, `Condition #${id} has ${inbound} inbound connections (editor limit: 1 TOTAL)`);
  }
  // no control anywhere carries Start-a-Flow metadata, and every control has
  // exactly one forward transition (one press = one assignment = one step)
  for (const [id, node] of Object.entries(nodes)) {
    if (node.name !== "Inline Button" && node.name !== "Rows") continue;
    assert.ok(!("value" in node.data) && !("postback_text" in node.data), `control #${id} carries Start-a-Flow metadata (value/postback_text)`);
    const fwdKey = node.name === "Rows" ? "rowOutput" : "buttonOutput";
    assert.equal((node.outputs?.[fwdKey]?.connections ?? []).length, 1, `control #${id} must have exactly one forward connection`);
  }
  // no Interactive carries a default-output connection (duplicate execution)
  for (const [id, node] of Object.entries(nodes)) {
    if (node.name !== "Interactive") continue;
    assert.equal((node.outputs?.interactiveOutput?.connections ?? []).length, 0, `Interactive #${id} default output must stay empty`);
  }
  // checklist reflects the architecture: zero redraws, click-through matrix,
  // button-evidence pointer intact
  const checklist = readFileSync(path.join(repoRoot, "artifacts", "whatchimp", "V6_REDRAW_CHECKLIST.md"), "utf8");
  assert.ok(checklist.includes("ZERO connections to draw"), "checklist must state there is nothing to redraw");
  assert.ok(checklist.includes("button-evidence.saved-reexport.txt"), "checklist must point at the button-convergence evidence fixture");
  assert.ok(!checklist.includes("input socket (`conditionInput`)"), "no checklist item may target a Condition input");
});

test("artifact: postback merges match the profile's approvedPostbackMerges exactly (no undeclared convergence)", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const inbound = new Map(Object.keys(flow.nodes).map((id) => [id, 0]));
  for (const node of Object.values(flow.nodes)) {
    for (const out of Object.values(node.outputs ?? {})) {
      for (const c of out.connections ?? []) inbound.set(String(c.node), (inbound.get(String(c.node)) ?? 0) + 1);
    }
  }
  const hubs = {};
  for (const [id, count] of inbound) if (count > 1) hubs[id] = count;
  assert.deepEqual(hubs, profile.importGraphContract.approvedPostbackMerges);
  // every merge parent is an Inline Button / Rows control
  for (const id of Object.keys(hubs)) {
    for (const inp of Object.values(flow.nodes[id].inputs ?? {})) {
      for (const c of inp.connections ?? []) {
        const src = flow.nodes[String(c.node)];
        assert.ok(src.name === "Inline Button" || src.name === "Rows", `hub #${id} parent #${c.node} is a ${src.name}`);
      }
    }
  }
});

test("generator: a clean run reproduces the committed artifact AND redraw checklist byte-for-byte", { skip: !existsSync(v6Path) }, async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const os = await import("node:os");
  const dir = mkdtempSync(path.join(os.tmpdir(), "oraya-v6-gen-"));
  try {
    const outFlow = path.join(dir, "v6.txt");
    const outRedraw = path.join(dir, "redraw.md");
    execFileSync(process.execPath, [
      path.join(here, "generate-whatchimp-v6.mjs"),
      path.join(repoRoot, "artifacts", "whatchimp", "Oraya_natural_intake_v5.5.input.txt"),
      outFlow,
      outRedraw,
    ]);
    assert.equal(readFileSync(outFlow, "utf8"), readFileSync(v6Path, "utf8"), "artifact bytes must be reproducible");
    assert.equal(
      readFileSync(outRedraw, "utf8"),
      readFileSync(path.join(repoRoot, "artifacts", "whatchimp", "V6_REDRAW_CHECKLIST.md"), "utf8"),
      "redraw checklist bytes must be reproducible",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mutation: removing a branch-local tail continuation creates an unintended-terminal failure", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  // sever an escalation tail's Lead Submit → final-message edge (#642 → #643)
  flow.nodes["642"].outputs.httpApiOutput.connections = [];
  flow.nodes["643"].inputs.textInput.connections = [];
  const { errors } = validateFlow(flow, profile);
  assert.ok(hasError(errors, "dead-end API call"), errors.join("\n"));
  assert.ok(hasError(errors, "is not reachable from the start node"), errors.join("\n"));
});

test("mutation: replacing the real bedroom field id 69114 on a bedroom button fails validation", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const bedroomBtn = Object.values(flow.nodes).find(
    (n) => n.name === "Inline Button" && n.data?.customFieldSelectedOptionText === "oraya_bedroom_count",
  );
  bedroomBtn.data.customFieldId = "custom_99999";
  const { errors } = validateFlow(flow, profile, { strictBinding: true });
  assert.ok(hasError(errors, "is not in the dependency manifest"), errors.join("\n"));
});

test("artifact: canonical v6 is fully bound — strict-clean, placeholder-free, exact bedroom bindings, export-proven question transitions", { skip: !existsSync(v6Path) }, () => {
  const raw = readFileSync(v6Path, "utf8");
  assert.ok(!raw.includes("__ORAYA_BEDROOM_COUNT_FIELD_ID__"), "placeholder string must not remain in the delivery file");
  assert.ok(!raw.includes("__ORAYA"), "no placeholder prefix may remain in the delivery file");
  const flow = JSON.parse(raw);
  const { errors, warnings } = validateFlow(flow, profile, { strictBinding: true });
  assert.deepEqual(errors, [], errors.join("\n"));
  assert.deepEqual(warnings, [], warnings.join("\n"));
  // exact interactive-control bindings (the stored value IS the label):
  //   - 18 bedroom Inline Buttons on custom_69114 (3 buttons × 6 stages);
  //   - 2 villa Inline Buttons on custom_57698 with exact canonical labels;
  //   - 35 guest Rows on custom_57693 (7 rows × 5 list stages);
  //   - zero bedroom UIF questions and zero bedroom condition rows remain
  //     (no WhatsApp-side capacity validation — the website validates).
  const controls = Object.values(flow.nodes).filter((n) => n.name === "Inline Button" || n.name === "Rows");
  const byField = (f) => controls.filter((n) => n.data?.customFieldSelectedOptionText === f);
  const bedroomButtons = byField("oraya_bedroom_count");
  assert.equal(bedroomButtons.length, 18, "expected 18 bedroom buttons (3 × 6 stages)");
  for (const b of bedroomButtons) {
    assert.equal(b.data.customFieldId, "custom_69114", "bedroom buttons must reference exactly custom_69114");
    assert.ok(["1 bedroom", "2 bedrooms", "3 bedrooms"].includes(b.data.buttonText), `unexpected bedroom label "${b.data.buttonText}"`);
  }
  const villaButtons = byField("oraya_villa");
  assert.equal(villaButtons.length, 2, "expected exactly 2 villa buttons");
  assert.deepEqual(villaButtons.map((b) => b.data.buttonText).sort(), ["Villa Byblos", "Villa Mechmech"], "villa buttons must carry the exact canonical values");
  for (const b of villaButtons) assert.equal(b.data.customFieldId, "custom_57698");
  const guestRows = byField("oraya_guest_count");
  assert.equal(guestRows.length, 35, "expected 35 guest rows (7 × 5 list stages)");
  for (const r of guestRows) {
    assert.equal(r.name, "Rows", "guest choices must be list rows (WhatsApp caps reply buttons at 3)");
    assert.equal(r.data.customFieldId, "custom_57693");
    assert.ok(["1", "2", "3", "4", "5", "6", "More than 6"].includes(r.data.title), `unexpected guest label "${r.data.title}"`);
  }
  for (const n of Object.values(flow.nodes)) {
    if (n.name === "User Input Flow Single") {
      assert.notEqual(n.data?.customFieldSelectedOptionText, "oraya_bedroom_count", "no bedroom UIF question may remain");
    }
    if (n.name === "Condition") {
      assert.ok(!(n.data?.custom_field_variable_selected_texts ?? []).includes("oraya_bedroom_count"), "no Condition may reference the bedroom field (no WhatsApp capacity validation)");
    }
  }
  // every remaining question node continues into exactly one Text or HTTP API
  // node — the only transitions genuine WhatChimp exports contain.
  for (const [id, n] of Object.entries(flow.nodes)) {
    if (n.name !== "User Input Flow Single") continue;
    const edges = [];
    for (const out of Object.values(n.outputs ?? {})) for (const c of out.connections ?? []) edges.push(c);
    assert.equal(edges.length, 1, `question #${id} must have exactly one continuation`);
    const dst = flow.nodes[String(edges[0].node)];
    assert.ok(dst?.name === "Text" || dst?.name === "HTTP API",
      `question #${id} continues into ${dst?.name} — only Text / HTTP API are export-proven`);
  }
  // the removed stages stay removed: no confirmation question, no handoff
  // choice, no Edit re-capture, and no full-name ask outside escalation tails
  for (const n of Object.values(flow.nodes)) {
    if (n.name !== "User Input Flow Single") continue;
    const f = n.data?.customFieldSelectedOptionText;
    assert.ok(f !== "oraya_dates_confirmed_text" && f !== "oraya_handoff_required", `removed stage question still present (${f})`);
  }
  // the full scenario suite (incl. node-level visitation assertions) passes
  // against the canonical fully-bound artifact.
  for (const scenario of buildScenarios()) {
    const result = runScenario(flow, profile, scenario);
    assert.deepEqual(result.failures, [], `${scenario.name}:\n${result.failures.join("\n")}`);
  }
});

// ─── round trip #1 regression fixtures (authenticated evidence, 2026-07-03) ──

test("round trip #1: comparator detects the exact WhatChimp import normalization on the preserved evidence", { skip: !existsSync(roundtrip1CandidatePath) || !existsSync(roundtrip1Path) }, () => {
  const candidate = JSON.parse(readFileSync(roundtrip1CandidatePath, "utf8"));
  const reexport = JSON.parse(readFileSync(roundtrip1Path, "utf8"));
  const r = compareFlows(candidate, reexport, { ignoreFields: profile.roundTripIgnoreFields });
  // all nodes survived; nothing was semantically edited
  assert.equal(r.counts.candidateNodes, 118);
  assert.equal(r.counts.reexportNodes, 118);
  assert.deepEqual(r.deletedNodes, []);
  assert.deepEqual(r.addedNodes, []);
  assert.deepEqual(r.changedNodes, [], JSON.stringify(r.changedNodes));
  assert.deepEqual(r.customFieldChanges, []);
  assert.deepEqual(r.apiIdChanges, []);
  // exactly 32 complete reciprocal edges were silently removed, none added
  assert.equal(r.counts.candidateEdges, 149);
  assert.equal(r.counts.reexportEdges, 117);
  assert.equal(r.lostEdges.length, 32);
  assert.deepEqual(r.gainedEdges, []);
  // single-parent normalization pattern: every lost edge targeted a
  // multi-parent destination; all 16 multi-parent nodes were reduced to
  // exactly one surviving parent — the first-listed serialized connection
  assert.ok(r.lostEdges.every((e) => e.destCandidateParents.length > 1));
  assert.equal(r.multiParent.candidate.length, 16);
  assert.equal(r.multiParent.reexport.length, 0);
  assert.equal(r.reducedToSingle.length, 16);
  assert.ok(r.reducedToSingle.every((m) => m.kept === 1 && m.firstListedSurvived), JSON.stringify(r.reducedToSingle));
  // the drops created exactly 16 unintended terminals
  assert.equal(r.unexpectedTerminals.length, 16);
  assert.equal(r.preserved, false);
});

test("round trip #1: comparator reports an identical re-export as preserved", { skip: !existsSync(v6Path) }, () => {
  const candidate = JSON.parse(readFileSync(v6Path, "utf8"));
  const clone = JSON.parse(readFileSync(v6Path, "utf8"));
  // regenerated ids and moved nodes are approved normalization, not failures
  clone.nodes["1"].data.xitFbpostbackId = "regenerated-by-whatchimp";
  clone.nodes["1"].position = [999, 999];
  const r = compareFlows(candidate, clone, { ignoreFields: profile.roundTripIgnoreFields });
  assert.equal(r.preserved, true, JSON.stringify(r));
  // but a genuinely dropped edge must flip the verdict
  const damaged = JSON.parse(readFileSync(v6Path, "utf8"));
  const anyOut = Object.values(damaged.nodes["440"].outputs).find((o) => o.connections.length);
  const removed = anyOut.connections.pop();
  for (const inp of Object.values(damaged.nodes[String(removed.node)].inputs)) {
    inp.connections = inp.connections.filter((c) => String(c.node) !== "440");
  }
  const r2 = compareFlows(candidate, damaged, { ignoreFields: profile.roundTripIgnoreFields });
  assert.equal(r2.preserved, false);
  assert.ok(r2.lostEdges.length >= 1);
});

test("round trip #1: the authenticated re-export fails validation for the expected structural reasons", { skip: !existsSync(roundtrip1Path) }, () => {
  const reexport = JSON.parse(readFileSync(roundtrip1Path, "utf8"));
  const { errors } = validateFlow(reexport, profile, { strictBinding: true });
  // the import stripped every merge down to one parent — under the current
  // postback-convergence contract that reads as hub-count drift (the exact
  // signature of an import that dropped convergence edges)
  assert.ok(
    errors.some((e) => e.startsWith("[single-parent-contract]") && e.includes("declared postback-convergence hub")),
    errors.join("\n"),
  );
  // … and the dropped edges dangled condition branches, dead-ended an API
  // node, and created unapproved terminals with no booking continuation
  assert.ok(hasError(errors, "no destination on conditionOutputTrue") || hasError(errors, "no destination on conditionOutputFalse"));
  assert.ok(hasError(errors, "dead-end API call"));
  assert.ok(hasError(errors, "unapproved terminal message"));
  assert.ok(hasError(errors, "lacks the required continuation element"));
  assert.ok(errors.length >= 90, `expected the audited round-trip damage, got ${errors.length} errors`);
});

// ─── round trip #2 regression fixture (halted 18-redraw candidate) ──────────

test("round trip #2: the halted 165-node candidate is pinned as historical evidence and is NOT the canonical candidate", { skip: !existsSync(roundtrip2HaltedPath) || !existsSync(v6Path) }, () => {
  const raw = readFileSync(roundtrip2HaltedPath);
  // byte-exact preservation of the candidate whose redraw plan the editor
  // refused at item #1 (11 of its 18 draws needed a second Condition-source
  // parent on a Condition — see roundtrips/ROUNDTRIP_2_FINDINGS.md)
  assert.equal(raw.length, 121537, "halted-candidate fixture byte size must not change");
  assert.equal(
    createHash("sha256").update(raw).digest("hex").toUpperCase(),
    "0066192D4487ED1AC8A95B00E22DEF8B754B1FB458E0025B178E8B125C913A39",
    "halted-candidate fixture bytes must not change",
  );
  assert.notEqual(raw.toString("utf8"), readFileSync(v6Path, "utf8"), "the halted candidate must never be the canonical import file");
  const flow = JSON.parse(raw.toString("utf8"));
  assert.equal(Object.keys(flow.nodes).length, 165);
  // under the corrected round-trip-#3 editor rule (one inbound TOTAL per
  // Condition, any source type) it fails validation: exactly the 14
  // beyond-limit inbound edges (#440: +4, #470: +3, #602: +1, #654: +1,
  // #660: +1, #663: +1, #690: +3) that made its redraw plan impossible
  const { errors } = validateFlow(flow, profile, { strictBinding: true });
  const condLimit = errors.filter((e) => e.startsWith("[condition-inbound-limit]"));
  assert.equal(condLimit.length, 14, errors.join("\n"));
  assert.ok(errors.length > condLimit.length, "the halted candidate must also fail the current hub census");
});

// ─── round trip #3 regression fixture (failed 181-node candidate) ────────────

test("round trip #3: the failed 181-node candidate is pinned as historical evidence and is NOT the canonical candidate", { skip: !existsSync(roundtrip3FailedPath) || !existsSync(v6Path) }, () => {
  const raw = readFileSync(roundtrip3FailedPath);
  // byte-exact preservation of the candidate whose import raised the
  // infinite-loop warning and whose redraw items #5/#22/#24 the editor
  // refused: each needed a second inbound connection on a Condition that
  // already carried its serialized parent (#602, #654, #663) — see
  // roundtrips/ROUNDTRIP_3_FINDINGS.md
  assert.equal(raw.length, 141728, "failed-candidate fixture byte size must not change");
  assert.equal(
    createHash("sha256").update(raw).digest("hex").toUpperCase(),
    "AB456A895221A46DE289EDA054DB9142B4D3F7D0A1892A3FFBEAFF999346AB0C",
    "failed-candidate fixture bytes must not change",
  );
  assert.notEqual(raw.toString("utf8"), readFileSync(v6Path, "utf8"), "the failed candidate must never be the canonical import file");
  const flow = JSON.parse(raw.toString("utf8"));
  assert.equal(Object.keys(flow.nodes).length, 181);
  // under the corrected one-inbound-TOTAL rule it fails validation: exactly
  // the 3 beyond-limit inbound edges on Conditions (#602, #654, #663 — the
  // three hub draws round trip #3 could not execute)
  const { errors } = validateFlow(flow, profile, { strictBinding: true });
  const condLimit = errors.filter((e) => e.startsWith("[condition-inbound-limit]"));
  assert.equal(condLimit.length, 3, errors.join("\n"));
  for (const id of ["602", "654", "663"]) {
    assert.ok(condLimit.some((e) => e.includes(`#${id}`)), `expected a condition-inbound-limit error for Condition #${id}:\n${condLimit.join("\n")}`);
  }
  assert.ok(errors.length > condLimit.length, "the failed candidate must also fail the current hub census");
});

// ─── button-convergence evidence fixture (authenticated, 2026-07-04) ─────────

test("button evidence: the operator's saved/reopened export is pinned and carries the exact Interactive schema this candidate is built on", { skip: !existsSync(buttonEvidencePath) }, () => {
  const raw = readFileSync(buttonEvidencePath);
  assert.equal(raw.length, 148882, "button-evidence fixture byte size must not change");
  assert.equal(
    createHash("sha256").update(raw).digest("hex").toUpperCase(),
    "1D4A5E3DFC096F540037296D4E34551248D50F1F12BE64546B3F7E3B8A2C11EB",
    "button-evidence fixture bytes must not change",
  );
  const flow = JSON.parse(raw.toString("utf8"));
  // Interactive #775 with Inline Buttons #776/#783, both linked to
  // custom_57693/oraya_guest_count, both persisting after save/close/reopen,
  // both converging forward into User Input Flow #610
  const inter = flow.nodes["775"];
  assert.equal(inter.name, "Interactive");
  const btnIds = inter.outputs.interactiveOutputButton.connections.map((c) => String(c.node)).sort();
  assert.deepEqual(btnIds, ["776", "783"]);
  for (const id of ["776", "783"]) {
    const b = flow.nodes[id];
    assert.equal(b.name, "Inline Button");
    assert.equal(b.data.buttonType, "new_post_back");
    assert.equal(b.data.customFieldId, "custom_57693");
    assert.equal(b.data.customFieldSelectedOptionText, "oraya_guest_count");
    assert.deepEqual(b.outputs.buttonOutput.connections.map((c) => `${c.node}:${c.input}`), ["610:userInputFlowInput"]);
  }
  // #776 additionally demonstrates the BANNED construction this candidate's
  // contracts exist to prevent: Start-a-Flow metadata pointing at the parent
  // intake flow COMBINED with a direct connector (self-restart + duplicate
  // execution). #783 is the clean reference schema.
  assert.equal(flow.nodes["776"].data.postback_text, "Oraya Natural Stay Intake v6 - Start");
  assert.ok(typeof flow.nodes["776"].data.value === "string" && flow.nodes["776"].data.value.length > 0);
  assert.ok(!("value" in flow.nodes["783"].data) && !("postback_text" in flow.nodes["783"].data));
  // the fixture is evidence, not a candidate
  assert.notEqual(raw.toString("utf8"), readFileSync(v6Path, "utf8"), "the evidence export must never be the canonical import file");
});

// ─── simulator control coverage ──────────────────────────────────────────────

test("simulator: the scenario matrix clicks every control label and enters every Interactive stage", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const clickedNodes = new Set();
  const clickedLabelsByField = new Map();
  for (const scenario of buildScenarios()) {
    const result = runScenario(flow, profile, scenario);
    assert.deepEqual(result.failures, [], `${scenario.name}:\n${result.failures.join("\n")}`);
    for (const c of result.clicks) {
      clickedNodes.add(c.node);
      if (!clickedLabelsByField.has(c.field)) clickedLabelsByField.set(c.field, new Set());
      clickedLabelsByField.get(c.field).add(c.label);
    }
  }
  // every approved label of every interactive control field is clicked
  for (const [field, spec] of Object.entries(profile.interactiveControls)) {
    for (const label of spec.labels) {
      assert.ok(clickedLabelsByField.get(field)?.has(label), `label "${label}" of ${field} is never clicked by any scenario`);
    }
  }
  // every Interactive stage is entered (at least one of its controls clicked)
  for (const [id, n] of Object.entries(flow.nodes)) {
    if (n.name !== "Interactive") continue;
    const controls = [];
    for (const c of n.outputs?.interactiveOutputButton?.connections ?? []) controls.push(String(c.node));
    for (const kb of n.outputs?.interactiveOutputListMessage?.connections ?? []) {
      for (const sec of flow.nodes[String(kb.node)].outputs?.quickReplyOutput?.connections ?? []) {
        for (const row of flow.nodes[String(sec.node)].outputs?.sectionOutputRows?.connections ?? []) controls.push(String(row.node));
      }
    }
    assert.ok(controls.some((cid) => clickedNodes.has(cid)), `Interactive stage #${id} is never entered by any scenario`);
  }
});

test("operator docs: production WhatChimp API endpoints use direct www host", () => {
  // The bare production origin answers /api/butler/... POSTs with a 308
  // redirect that WhatChimp does not safely complete (operator-verified
  // 2026-07-03), so no current operator instruction may tell a WhatChimp
  // integration to POST to the bare API prefix. The direct
  // https://www.stayoraya.com/api/butler/... host, guest-facing
  // https://stayoraya.com/book links, and Vercel Preview API URLs all remain
  // allowed — only the exact bare API prefix is forbidden.
  const operatorDocs = [
    path.join("artifacts", "whatchimp", "V6_DEPENDENCIES.md"),
    path.join("artifacts", "whatchimp", "V6_ROUNDTRIP_CHECKLIST.md"),
    path.join("artifacts", "whatchimp", "V6_REDRAW_CHECKLIST.md"),
    path.join("docs", "system", "BUTLER_PLAYBOOK.md"),
  ];
  const bareApiPrefix = "https://stayoraya.com/api/butler/";
  const offenders = [];
  for (const doc of operatorDocs) {
    const lines = readFileSync(path.join(repoRoot, doc), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes(bareApiPrefix)) offenders.push(`${doc}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    "redirecting bare API prefix reintroduced in operator docs — the bare host returns 308 and WhatChimp does not " +
      "safely complete redirected POSTs; instruct https://www.stayoraya.com/api/butler/... instead:\n" +
      offenders.join("\n"),
  );
});

test("profile: every leadSubmit id maps prefill_url → oraya_prefill_url", () => {
  // Every Lead Submit integration the flow references (WhatsApp/escalation
  // 6961 today — the website-handoff 7459 is no longer referenced by this
  // flow — and any TEST clone that replaces it in a TEST profile) must write
  // the secure prefill URL into oraya_prefill_url, or the terminal messages'
  // #oraya_prefill_url# slot goes blank and only the canonical fallback
  // remains. The mapping and the canonical fallback are complementary — this
  // test guards the mapping; the validator's terminal-continuation and
  // canonical-domain checks guard the fallback.
  const ids = profile.apis.leadSubmit.ids;
  assert.ok(Array.isArray(ids) && ids.length >= 1, "leadSubmit must list the Lead Submit integration id(s)");
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
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  // sabotage: make the villa gate always take the "villa known" branch
  const villaGates = Object.values(flow.nodes).filter(
    (n) => n.name === "Condition" && (n.data.custom_field_variable_selected_texts ?? []).includes("oraya_villa"),
  );
  assert.ok(villaGates.length >= 1, "expected the villa gate");
  for (const gate of villaGates) gate.data.custom_field_variable_value = ["__never__"];
  const scenario = buildScenarios().find((s) => s.name.startsWith("T01"));
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
