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

test("validator: v5.5 operator export fails with semantic errors", { skip: !existsSync(v55Path) }, () => {
  const flow = JSON.parse(readFileSync(v55Path, "utf8"));
  const { errors } = validateFlow(flow, profile);
  assert.ok(errors.length >= 30, `expected the audited v5.5 defects, got ${errors.length} errors`);
  assert.ok(hasError(errors, "empty customField id"));
  assert.ok(hasError(errors, "dead-end API call"));
  assert.ok(hasError(errors, "no bedroom-selection question exists"));
});

// Hybrid architecture (2026-07-03, Option A): the canonical candidate clones
// every small branch-local tail and keeps exactly the profile-declared hub
// merges (`importGraphContract.approvedHubMerges`), whose beyond-first edges
// the operator re-draws after import per artifacts/whatchimp/V6_REDRAW_CHECKLIST.md.
// ⛔ Round trip #2 (2026-07-03, roundtrips/ROUNDTRIP_2_FINDINGS.md): the live
// editor REFUSED to draw a Condition → Condition connection ("This will make
// an infinite loop…"). 11 of this candidate's 18 redraw edges are
// Condition → Condition, so the candidate now fails validation BY DESIGN with
// exactly those 11 `redraw-drawability` errors (plus 7 unproven-pair
// warnings) and everything else clean — it can no longer be validated as
// import-ready, mirroring the round-trip-#1 pattern.

test("validator: canonical v6 fails BY DESIGN with exactly the 11 editor-rejected Condition→Condition redraw edges and nothing else", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const { errors, warnings } = validateFlow(flow, profile);
  assert.equal(errors.length, 11, errors.join("\n"));
  assert.ok(errors.every((e) => e.startsWith("[redraw-drawability]") && e.includes("Condition → Condition")), errors.join("\n"));
  // the four hubs whose drawn edges the editor cannot create
  for (const hub of ["#440", "#470", "#660", "#690"]) {
    assert.ok(errors.some((e) => e.includes(`→ ${hub}:`)), `expected a rejected drawn edge into ${hub}\n${errors.join("\n")}`);
  }
  // every OTHER drawn edge is an unproven type pair until probed live
  assert.equal(warnings.length, 7, warnings.join("\n"));
  assert.ok(warnings.every((w) => w.startsWith("[redraw-drawability]") && w.includes("never been proven")), warnings.join("\n"));
});

test("validator: strict binding stays clean on the canonical v6 — the only errors are the redraw-drawability ones", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const { errors, warnings } = validateFlow(flow, profile, { strictBinding: true });
  assert.equal(errors.length, 11, errors.join("\n"));
  assert.ok(errors.every((e) => e.startsWith("[redraw-drawability]")), errors.join("\n"));
  assert.equal(warnings.length, 7, warnings.join("\n"));
});

test("redraw-drawability: generator halt markers, profile pairs, and validator findings all agree", { skip: !existsSync(v6Path) }, () => {
  // single source of evidence, three encodings — they must never drift
  assert.deepEqual(profile.importGraphContract.editorRejectedDrawPairs, [["Condition", "Condition"]]);
  assert.deepEqual(profile.importGraphContract.editorProvenDrawPairs, []);
  const checklist = readFileSync(path.join(repoRoot, "artifacts", "whatchimp", "V6_REDRAW_CHECKLIST.md"), "utf8");
  assert.ok(checklist.includes("⛔ HALTED — NOT APPROVED FOR HUMAN TESTING"), "checklist must carry the halt banner");
  assert.ok(checklist.includes("items #1, #2, #3, #4, #6, #7, #8, #12, #14, #15, #16"), "banner must name the 11 blocked items");
  const markerCount = checklist.split("⛔ NOT OPERATOR-DRAWABLE (Condition → Condition)").length - 1;
  assert.equal(markerCount, 11, "exactly the 11 Condition→Condition items must carry the per-item marker");
  assert.ok(checklist.includes("roundtrips/ROUNDTRIP_2_FINDINGS.md"), "checklist must point at the round-trip-#2 evidence");
  assert.ok(!checklist.includes("the WhatChimp editor supports drawing them"), "the disproven drawability claim must not reappear");
});

test("artifact: hub merges match the profile's approvedHubMerges exactly (no undeclared convergence)", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const inbound = new Map(Object.keys(flow.nodes).map((id) => [id, 0]));
  for (const node of Object.values(flow.nodes)) {
    for (const out of Object.values(node.outputs ?? {})) {
      for (const c of out.connections ?? []) inbound.set(String(c.node), (inbound.get(String(c.node)) ?? 0) + 1);
    }
  }
  const hubs = {};
  for (const [id, count] of inbound) if (count > 1) hubs[id] = count;
  assert.deepEqual(hubs, profile.importGraphContract.approvedHubMerges);
  // the operator redraw workload is the sum of beyond-first hub edges
  const redrawEdges = Object.values(hubs).reduce((sum, c) => sum + (c - 1), 0);
  assert.equal(redrawEdges, 18, "operator redraw checklist must contain exactly 18 connections");
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

test("mutation: replacing the real bedroom field id 69114 fails strict binding", { skip: !existsSync(v6Path) }, () => {
  const flow = JSON.parse(readFileSync(v6Path, "utf8"));
  const bedroomQ = Object.values(flow.nodes).find(
    (n) => n.name === "User Input Flow Single" && n.data?.customFieldSelectedOptionText === "oraya_bedroom_count",
  );
  bedroomQ.data.customField = "99999";
  const { errors } = validateFlow(flow, profile, { strictBinding: true });
  assert.ok(hasError(errors, "is not in the dependency manifest"), errors.join("\n"));
});

test("artifact: canonical v6 is fully bound — placeholder-free, exact bedroom bindings, export-proven question transitions", { skip: !existsSync(v6Path) }, () => {
  const raw = readFileSync(v6Path, "utf8");
  assert.ok(!raw.includes("__ORAYA_BEDROOM_COUNT_FIELD_ID__"), "placeholder string must not remain in the delivery file");
  assert.ok(!raw.includes("__ORAYA"), "no placeholder prefix may remain in the delivery file");
  const flow = JSON.parse(raw);
  const { errors } = validateFlow(flow, profile, { strictBinding: true });
  // the only findings are the by-design redraw-drawability ones (round trip #2)
  assert.ok(errors.every((e) => e.startsWith("[redraw-drawability]")), errors.join("\n"));
  // exact bedroom bindings: 4 questions on "69114", 8 condition rows on
  // "custom_69114" (each row serializes the id in both the variable and the
  // selected-values array — 16 array entries).
  let bedroomQuestions = 0;
  let bedroomRowEntries = 0;
  for (const n of Object.values(flow.nodes)) {
    if (n.name === "User Input Flow Single" && n.data?.customFieldSelectedOptionText === "oraya_bedroom_count") {
      assert.equal(n.data.customField, "69114", "bedroom question customField must be exactly 69114");
      bedroomQuestions += 1;
    }
    if (n.name === "Condition") {
      for (const arr of [n.data?.custom_field_variable ?? [], n.data?.custom_field_variable_selected_values ?? []]) {
        arr.forEach((f, i) => {
          if ((n.data?.custom_field_variable_selected_texts ?? [])[i] === "oraya_bedroom_count") {
            assert.equal(f, "custom_69114", "bedroom condition rows must reference exactly custom_69114");
            bedroomRowEntries += 1;
          }
        });
      }
    }
  }
  assert.equal(bedroomQuestions, 4, "expected the 4 bedroom questions (initial/retry × initial/Edit)");
  assert.equal(bedroomRowEntries, 16, "expected 16 bedroom condition-row id entries (8 rows × 2 serialized arrays)");
  // every question node continues into exactly one Text or HTTP API node —
  // the only transitions genuine WhatChimp exports contain.
  for (const [id, n] of Object.entries(flow.nodes)) {
    if (n.name !== "User Input Flow Single") continue;
    const edges = [];
    for (const out of Object.values(n.outputs ?? {})) for (const c of out.connections ?? []) edges.push(c);
    assert.equal(edges.length, 1, `question #${id} must have exactly one continuation`);
    const dst = flow.nodes[String(edges[0].node)];
    assert.ok(dst?.name === "Text" || dst?.name === "HTTP API",
      `question #${id} continues into ${dst?.name} — only Text / HTTP API are export-proven`);
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
  // the import stripped the hub merges down to one parent each — with the
  // hybrid contract declared in the profile, that reads as hub-count drift
  // (the exact signature of an unrepaired import)
  assert.ok(
    errors.some((e) => e.startsWith("[single-parent-contract]") && e.includes("declared operator-redrawn hub")),
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
