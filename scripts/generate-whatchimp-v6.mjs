#!/usr/bin/env node
/**
 * Phase 16A — deterministic generator for the Oraya Natural Stay Intake v6
 * WhatChimp flow (HYBRID single-parent architecture, round trip #2 candidate).
 *
 * Reads the operator's v5.5 export (byte-preserved input artifact) and applies
 * the approved Phase 16A repairs:
 *
 *   1. Condition hygiene — removes blank comparison values and duplicated
 *      identical rows; every missing-field check is `field equal "null"`.
 *   2. Guest path — one exact-count question (1–8 + "More than 8").
 *   3. Bedroom path — three-button bedroom question saved to
 *      oraya_bedroom_count (real field id 69114), validated with the
 *      website's BEDROOM_CAPACITY rules (1→2, 2→4, 3→6; 7–8 guests need
 *      3 bedrooms + extra bedding), one forward-cloned retry, then
 *      escalation. The capacity check is a 3-condition chain
 *      (OK / needs-more / 2-bedrooms-fit) with exactly two OK exits.
 *   4. Complete human escalation — every escalation message flows into its
 *      OWN branch-local name-capture → Lead Submit → final-message tail.
 *   5. Complete Edit path — fresh 7466 attempt, forward-cloned
 *      re-validation, its own confirmation, its OWN handoff subtree clone
 *      (website + WhatsApp endings), second Edit escalates.
 *   6. Export-proven question transitions only (Question → Text / HTTP API;
 *      see artifacts/whatchimp/V6_TRANSITION_EVIDENCE.md).
 *
 * HYBRID IMPORT CONTRACT (authenticated round trip #1, 2026-07-03 —
 * artifacts/whatchimp/roundtrips/ROUNDTRIP_1_FINDINGS.md): WhatChimp's
 * import keeps only the FIRST serialized connection per input socket and
 * silently drops the rest. A pure single-parent tree preserving this flow's
 * behavior is exactly 492,864 nodes, so the artifact instead:
 *   - clones every small branch-local tail (10 escalation tails, the Edit
 *     handoff endings, the Edit large-group subtree, per-exit bedroom-retry
 *     escalation texts), and
 *   - keeps the smallest irreducible set of central hub merges. Every hub
 *     edge beyond the first-listed one is silently dropped by the import and
 *     MUST be re-drawn by the operator in the WhatChimp editor after import.
 *     The exact machine-derived redraw list is emitted alongside the
 *     artifact (third CLI argument).
 *
 * CORRECTED EDITOR RULE (round trip #2 + operator probes, 2026-07-03 —
 * roundtrips/ROUNDTRIP_2_FINDINGS.md): the editor's "This will make an
 * infinite loop…" warning fires only when a connection would give a
 * destination Condition a SECOND Condition-source parent. The binding rule:
 *   each destination Condition may carry AT MOST ONE inbound edge whose
 *   source node type is Condition.
 * Live-proven manual operations: Condition→User Input Flow, Text→User Input
 * Flow, Condition→Text, Text→Condition, HTTP API→Condition, and
 * Condition→Condition when it is the destination's first/only
 * Condition-source parent. This generator therefore applies the
 * CONDITION-CLONE CASCADE: every Condition that would receive more than one
 * Condition-source parent keeps its happy-path Condition parent (plus all
 * non-Condition parents, drawn), and each extra Condition-source parent gets
 * a semantically identical clone whose single serialized connection the
 * import retains automatically. Conditions are guest-invisible, so guest
 * behavior is byte-identical. Generation FAILS if any redraw edge uses an
 * unproven operation or any Condition ends up with more than one
 * Condition-source parent.
 *   - The first-listed connection of every hub is chosen so that the
 *     UN-REPAIRED import still runs the complete happy path (all fields
 *     extracted → bedroom OK → confirmation → handoff), never fabricates a
 *     confirmation, and every conversation is shown the canonical
 *     https://stayoraya.com/book link in the opening question BEFORE any
 *     branch can dead-end.
 *
 * Usage:
 *   node scripts/generate-whatchimp-v6.mjs <v5.5-input> <v6-output> [<redraw-checklist.md>]
 *
 * Node standard library only. Deterministic output (stable ids, stable
 * ordering) so re-runs produce identical bytes for artifact AND checklist.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Real WhatChimp custom-field id for oraya_bedroom_count (operator-created,
// confirmed 2026-07-03). Emitted directly — no placeholder, no binding step.
const BEDROOM_FIELD_ID = "69114";

const FIELD = {
  stayText: { id: "67692", name: "oraya_stay_text" },
  followup: { id: "69090", name: "oraya_stay_followup" },
  guestFollowup: { id: "69091", name: "oraya_guest_followup" },
  checkIn: { id: "57699", name: "oraya_check_in" },
  checkOut: { id: "57692", name: "oraya_check_out" },
  guestCount: { id: "57693", name: "oraya_guest_count" },
  villa: { id: "57698", name: "oraya_villa" },
  confirm: { id: "58532", name: "oraya_dates_confirmed_text" },
  fullName: { id: "57759", name: "oraya_full_name" },
  bedroom: { id: BEDROOM_FIELD_ID, name: "oraya_bedroom_count" },
};

const API = {
  initial: { id: "7466", text: "Oraya Stay Intent - Production : POST" },
  refine: { id: "8101", text: "Oraya Stay Intent Refine - Production : POST" },
  leadSubmit: { id: "6961", text: "Oraya Lead Submit - Production : POST" },
};

const GUEST_CHOICES = ["1", "2", "3", "4", "5", "6", "7", "8", "More than 8"];
const BEDROOM_CHOICES = ["1 bedroom", "2 bedrooms", "3 bedrooms"];

const COPY = {
  guestQuestion: "How many guests will be staying overnight?",
  bedroomQuestion: "How many bedrooms would you like?",
  bedroomMismatch:
    "That bedroom setup won’t quite fit #oraya_guest_count# overnight guests — 1 bedroom sleeps up to 2, 2 bedrooms up to 4, and 3 bedrooms up to 6 (for 7–8 guests we prepare 3 bedrooms plus extra bedding). Which would you like? You’re always welcome to choose more bedrooms than you need. 😊",
  bedroomEscalation:
    "No trouble at all — let me have our team help arrange the right sleeping setup for your group personally. 😊",
  escalationName: "So our team can follow up personally — may I have your full name?",
  continuationBlock:
    "\n\nYou can also continue your request online whenever you like:\n#oraya_prefill_url#\n\nIf that secure link is unavailable, please use:\nhttps://stayoraya.com/book",
  escalationFinal:
    "Thank you 😊 I’ve passed your request to the Oraya team — they’ll follow up with you right here on WhatsApp. Please note this is a request, not a confirmed booking yet.",
  editDatesQuestion:
    "What are your check-in and check-out dates? You can write them naturally, e.g. “June 10 to June 15”.",
  editCheckoutQuestion: "And what check-out date would you like? e.g. “June 15”.",
  dateEscalation:
    "I’m having a little trouble reading the dates — let me bring in our team so nothing gets lost. 😊",
  villaQuestion: "Which villa would you prefer?",
  secondEditEscalation:
    "No problem — let me bring in our team so we can fine-tune everything personally. 😊",
  confirmation:
    "Here’s what I have for your stay so far 😊\n\n📅 Check-in: #oraya_check_in#\n📅 Check-out: #oraya_check_out#\n🏡 Villa: #oraya_villa#\n👥 Overnight guests: #oraya_guest_count#\n🛏 Bedrooms: #oraya_bedroom_count#\n\nDoes this look right?",
  guestAck: "Perfect, thank you 😊",
  bedroomAck: "Noted 😊",
  villaAck: "Lovely choice 😊",
  confirmAck: "Got it.",
};

// ─── deterministic id factory ───────────────────────────────────────────────

let uidCounter = 0;
function uid() {
  uidCounter += 1;
  return `6b46aa76${String(uidCounter).padStart(5, "0")}`;
}

// ─── graph helpers ──────────────────────────────────────────────────────────

function connect(nodes, fromId, outKey, toId, inKey) {
  const from = nodes[String(fromId)];
  const to = nodes[String(toId)];
  if (!from || !to) throw new Error(`connect: missing node ${fromId} or ${toId}`);
  from.outputs ??= {};
  from.outputs[outKey] ??= { connections: [] };
  from.outputs[outKey].connections.push({ node: Number(toId), input: inKey, data: [] });
  to.inputs ??= {};
  to.inputs[inKey] ??= { connections: [] };
  to.inputs[inKey].connections.push({ node: Number(fromId), output: outKey, data: [] });
}

// Hub edge: a merge connection BEYOND the destination's first-listed one.
// WhatChimp's import silently drops it; the operator re-draws it from the
// generated checklist. The kept (first) edge must already be wired.
function hubEdge(nodes, fromId, outKey, toId, inKey) {
  const existing = nodes[String(toId)]?.inputs?.[inKey]?.connections ?? [];
  if (existing.length === 0) {
    throw new Error(`hubEdge: the kept edge into #${toId}:${inKey} must be wired before hub edges`);
  }
  connect(nodes, fromId, outKey, toId, inKey);
}

// Detach one existing edge (both reciprocal sides). Throws if absent, so a
// refactor can never silently leave the graph in a half-wired state.
function detachEdge(nodes, fromId, outKey, toId, inKey) {
  const out = nodes[String(fromId)]?.outputs?.[outKey];
  const inp = nodes[String(toId)]?.inputs?.[inKey];
  const hadOut = (out?.connections ?? []).some((c) => String(c.node) === String(toId) && c.input === inKey);
  const hadIn = (inp?.connections ?? []).some((c) => String(c.node) === String(fromId) && c.output === outKey);
  if (!hadOut || !hadIn) throw new Error(`detachEdge: ${fromId}:${outKey} → ${toId}:${inKey} is not fully wired`);
  out.connections = out.connections.filter((c) => !(String(c.node) === String(toId) && c.input === inKey));
  inp.connections = inp.connections.filter((c) => !(String(c.node) === String(fromId) && c.output === outKey));
}

// Semantically identical Condition clone (same rows, operators, match type) —
// guest-invisible by definition. Fresh deterministic uniqueId; caller wires
// the single serialized parent and the (redrawn) successor edges.
function cloneCondition(nodes, srcId, newId, position) {
  const src = nodes[String(srcId)];
  if (!src || src.name !== "Condition") throw new Error(`cloneCondition: #${srcId} is not a Condition`);
  const data = JSON.parse(JSON.stringify(src.data));
  data.uniqueId = uid();
  addNode(nodes, newId, "Condition", data, position);
}

function removeNode(nodes, id) {
  const node = nodes[String(id)];
  if (!node) throw new Error(`removeNode: missing node ${id}`);
  const scrub = (neighborId, side) => {
    const neighbor = nodes[String(neighborId)];
    if (!neighbor) return;
    for (const socket of Object.values(neighbor[side] ?? {})) {
      socket.connections = (socket.connections ?? []).filter((c) => String(c.node) !== String(id));
    }
  };
  for (const out of Object.values(node.outputs ?? {})) {
    for (const c of out.connections ?? []) scrub(c.node, "inputs");
  }
  for (const inp of Object.values(node.inputs ?? {})) {
    for (const c of inp.connections ?? []) scrub(c.node, "outputs");
  }
  delete nodes[String(id)];
}

function disconnectOutput(nodes, id, outKey) {
  const node = nodes[String(id)];
  const out = node.outputs?.[outKey];
  if (!out) return;
  for (const c of out.connections ?? []) {
    const neighbor = nodes[String(c.node)];
    if (!neighbor) continue;
    for (const socket of Object.values(neighbor.inputs ?? {})) {
      socket.connections = (socket.connections ?? []).filter(
        (x) => !(String(x.node) === String(id) && x.output === outKey),
      );
    }
  }
  out.connections = [];
}

// ─── node factories (data shapes mirror the v5.5 export) ───────────────────

function addNode(nodes, id, name, data, position) {
  if (nodes[String(id)]) throw new Error(`addNode: id ${id} already exists`);
  nodes[String(id)] = { id: Number(id), data, inputs: {}, outputs: {}, position, name };
}

function wrapperNode(nodes, id, campaignName, position) {
  addNode(nodes, id, "User Input Flow", {
    uniqueId: uid(),
    userInputFlowIdValue: "new",
    userInputFlowIdText: "Add new input flow",
    campaignName,
  }, position);
}

function questionNode(nodes, id, { question, field, choices = null }, position) {
  const data = {
    uniqueId: uid(),
    questionType: choices ? "multiple" : "keyboard",
    question,
    ...(choices ? { multipleChoices: choices } : {}),
    replyType: "Text",
    replyTypeSelectedOptionText: "Text",
    emailQuickreply: false,
    phoneQuickreply: false,
    customField: field.id,
    customFieldSelectedOptionText: field.name,
    systemFieldSelectedOptionText: "Please select",
    saveGoogleMeetToCustomField: false,
    googleMeetCustomFieldSelectedOptionText: "Please select",
    validateImageWithAi: false,
    newPostbackId: uid(),
  };
  addNode(nodes, id, "User Input Flow Single", data, position);
}

function textNode(nodes, id, textMessage, position) {
  addNode(nodes, id, "Text", {
    uniqueId: uid(),
    textMessage,
    delayReplyFor: 0,
    delaySec: 0,
    delayMin: 0,
    delayHour: 0,
    IsTypingOnDisplayChecked: false,
  }, position);
}

function apiNode(nodes, id, api, position) {
  addNode(nodes, id, "HTTP API", {
    uniqueId: uid(),
    httpApiId: api.id,
    httpApiText: api.text,
  }, position);
}

function conditionRowsData(rows, { anyMatch }) {
  return {
    all_match: !anyMatch,
    any_match: anyMatch,
    system_field_variable: [""],
    system_field_variable_selected_texts: ["Select"],
    system_field_operator: [""],
    system_field_operator_selected_texts: ["Select"],
    system_field_variable_value: [""],
    system_field_gender: [""],
    system_field_gender_selected_texts: ["Select"],
    system_field_contact_group_id: [""],
    custom_field_variable: rows.map((r) => `custom_${r.field.id}`),
    custom_field_variable_selected_values: rows.map((r) => `custom_${r.field.id}`),
    custom_field_variable_selected_texts: rows.map((r) => r.field.name),
    custom_field_operator: rows.map((r) => r.op ?? "equal"),
    custom_field_operator_selected_texts: rows.map((r) => ((r.op ?? "equal") === "equal" ? "=" : "Contains")),
    custom_field_variable_value: rows.map((r) => r.value),
    uniqueId: uid(),
  };
}

function conditionNode(nodes, id, rows, position, { anyMatch = true } = {}) {
  addNode(nodes, id, "Condition", conditionRowsData(rows, { anyMatch }), position);
}

function setConditionRows(nodes, id, rows, { anyMatch = true } = {}) {
  const node = nodes[String(id)];
  const keep = node.data.uniqueId;
  node.data = { ...node.data, ...conditionRowsData(rows, { anyMatch }), uniqueId: keep };
}

// Bedroom-capacity check (website BEDROOM_CAPACITY: 1→2, 2→4, 3→6; 7–8
// guests need 3 bedrooms + extra bedding). Three chained conditions with
// exactly TWO capacity-OK exits and TWO mismatch exits:
//   C1 any[bedroom=3 bedrooms, guests=1, guests=2] — True → OK
//   C2 [bedroom=1 bedroom]                         — True → mismatch (needs more)
//   C3 any[guests=3, guests=4]                     — True → OK (2 bedrooms fit)
//                                                    False → mismatch (2 bedrooms, 5–8)
function bedroomValidation(nodes, [c1, c2, c3], pos) {
  conditionNode(nodes, c1, [
    { field: FIELD.bedroom, value: "3 bedrooms" },
    { field: FIELD.guestCount, value: "1" },
    { field: FIELD.guestCount, value: "2" },
  ], [pos[0], pos[1]]);
  conditionNode(nodes, c2, [{ field: FIELD.bedroom, value: "1 bedroom" }], [pos[0] + 260, pos[1]]);
  conditionNode(nodes, c3, [
    { field: FIELD.guestCount, value: "3" },
    { field: FIELD.guestCount, value: "4" },
  ], [pos[0] + 520, pos[1]]);
  connect(nodes, c1, "conditionOutputFalse", c2, "conditionInput");
  connect(nodes, c2, "conditionOutputFalse", c3, "conditionInput");
  return { c1, c2, c3 };
}

// Branch-local human-escalation tail: name capture → Lead Submit → final
// message with the secure prefill slot + canonical fallback. Cloned per
// escalation source (single-parent import contract; duplicated Lead Submit
// nodes are the documented trade-off).
function escalationTail(nodes, [w, q, a, t], campaignName, pos) {
  wrapperNode(nodes, w, campaignName, [pos[0], pos[1]]);
  questionNode(nodes, q, { question: COPY.escalationName, field: FIELD.fullName }, [pos[0] + 260, pos[1]]);
  apiNode(nodes, a, API.leadSubmit, [pos[0] + 520, pos[1]]);
  textNode(nodes, t, COPY.escalationFinal + COPY.continuationBlock, [pos[0] + 780, pos[1]]);
  connect(nodes, w, "userInputFlowOutput", q, "userInputFlowSingleInput");
  connect(nodes, q, "userInputFlowSingleOutputFinalReply", a, "httpApiInput");
  connect(nodes, a, "httpApiOutput", t, "textInput");
  return w;
}

// Deep-clone a self-contained subgraph under new ids. Internal edges are
// remapped; edges to nodes outside the map are dropped (the caller wires the
// clone's entry). uniqueId/newPostbackId are regenerated deterministically.
function cloneSubgraph(nodes, idMap, { offset = [0, 0], campaignSuffix = "" } = {}) {
  for (const [srcId, newId] of Object.entries(idMap)) {
    const src = nodes[String(srcId)];
    if (!src) throw new Error(`cloneSubgraph: missing source #${srcId}`);
    if (nodes[String(newId)]) throw new Error(`cloneSubgraph: id ${newId} already exists`);
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = Number(newId);
    copy.position = [src.position[0] + offset[0], src.position[1] + offset[1]];
    if (typeof copy.data.uniqueId === "string") copy.data.uniqueId = uid();
    if (typeof copy.data.newPostbackId === "string") copy.data.newPostbackId = uid();
    if (campaignSuffix && typeof copy.data.campaignName === "string") copy.data.campaignName += campaignSuffix;
    for (const side of ["inputs", "outputs"]) {
      for (const socket of Object.values(copy[side] ?? {})) {
        socket.connections = (socket.connections ?? [])
          .filter((c) => idMap[String(c.node)] !== undefined)
          .map((c) => ({ ...c, node: Number(idMap[String(c.node)]) }));
      }
    }
    nodes[String(newId)] = copy;
  }
}

// ─── main transform ─────────────────────────────────────────────────────────

function generateV6(flow) {
  const nodes = flow.nodes;

  // 1. Remove the nested guest-range structure and the villa "Got it." dead end.
  for (const id of [450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465, 482]) {
    removeNode(nodes, id);
  }

  // 2. Condition hygiene (blank values / duplicated rows → literal "null" checks).
  setConditionRows(nodes, 410, [{ field: FIELD.checkIn, value: "null" }]);
  setConditionRows(nodes, 411, [{ field: FIELD.checkOut, value: "null" }]);
  setConditionRows(nodes, 470, [{ field: FIELD.villa, value: "null" }]);
  setConditionRows(nodes, 501, [
    { field: FIELD.checkIn, value: "null" },
    { field: FIELD.checkOut, value: "null" },
  ]);

  // 3. Edit question binds the real oraya_stay_text field id.
  nodes["497"].data.customField = FIELD.stayText.id;

  // 3b. Pre-API safety link: the opening intake question hands the guest the
  // canonical booking URL BEFORE the first HTTP API call can fire — and,
  // under the hybrid import contract, BEFORE any temporarily-unrepaired
  // branch can dead-end. This is the structural website fallback that keeps
  // the un-repaired import guest-safe on a test bot.
  nodes["400"].data.question =
    nodes["400"].data.question +
    "\n\n(You can also complete your booking online at any time: https://stayoraya.com/book)";

  // 4. Confirmation shows exact overnight guests + bedrooms.
  nodes["491"].data.question = COPY.confirmation;

  // 5. No-dead-end invariant on the WhatsApp-continuation terminal (#7) —
  // appended BEFORE the Edit handoff subtree is cloned so both copies carry it.
  nodes["7"].data.textMessage = nodes["7"].data.textMessage + COPY.continuationBlock;

  // ── primary guest path: one exact-count question ──────────────────────────
  wrapperNode(nodes, 600, "Oraya v6 - Guests", [5200, -1900]);
  questionNode(nodes, 601, { question: COPY.guestQuestion, field: FIELD.guestCount, choices: GUEST_CHOICES }, [5460, -1900]);
  conditionNode(nodes, 602, GUEST_CHOICES.slice(0, 8).map((v) => ({ field: FIELD.guestCount, value: v })), [5720, -1900]);
  textNode(nodes, 603, COPY.guestAck, [5590, -1900]);

  disconnectOutput(nodes, 440, "conditionOutputTrue");
  disconnectOutput(nodes, 440, "conditionOutputFalse");
  connect(nodes, 440, "conditionOutputTrue", 600, "userInputFlowInput");
  connect(nodes, 440, "conditionOutputFalse", 602, "conditionInput"); // HUB 602 kept edge (guest already extracted)
  connect(nodes, 600, "userInputFlowOutput", 601, "userInputFlowSingleInput");
  connect(nodes, 601, "userInputFlowSingleOutputFinalReply", 603, "textInput");
  hubEdge(nodes, 603, "textOutput", 602, "conditionInput"); // redraw: guest just answered

  // ── primary bedroom path (always asked; never condition-skipped) ──────────
  wrapperNode(nodes, 610, "Oraya v6 - Bedrooms", [5200, -1600]);
  questionNode(nodes, 611, { question: COPY.bedroomQuestion, field: FIELD.bedroom, choices: BEDROOM_CHOICES }, [5460, -1600]);
  textNode(nodes, 624, COPY.bedroomAck, [5590, -1600]);
  textNode(nodes, 616, COPY.bedroomMismatch, [6760, -1600]);
  wrapperNode(nodes, 617, "Oraya v6 - Bedrooms retry", [5200, -1300]);
  questionNode(nodes, 618, { question: COPY.bedroomQuestion, field: FIELD.bedroom, choices: BEDROOM_CHOICES }, [5460, -1300]);
  textNode(nodes, 625, COPY.bedroomAck, [5590, -1300]);

  connect(nodes, 602, "conditionOutputTrue", 610, "userInputFlowInput");
  connect(nodes, 602, "conditionOutputFalse", 466, "userInputFlowInput"); // initial large group (branch-local)
  connect(nodes, 610, "userInputFlowOutput", 611, "userInputFlowSingleInput");
  connect(nodes, 611, "userInputFlowSingleOutputFinalReply", 624, "textInput");

  const primary = bedroomValidation(nodes, [612, 613, 614], [5720, -1600]);
  connect(nodes, 624, "textOutput", primary.c1, "conditionInput");
  connect(nodes, primary.c1, "conditionOutputTrue", 470, "conditionInput"); // #470's ONLY parent (happy path; other capacity-OK exits use clones 758-760)
  connect(nodes, primary.c2, "conditionOutputTrue", 616, "textInput"); // HUB 616 kept edge
  // primary.c3 True → villa check via clone #758 (corrected-rule fragmentation section)
  hubEdge(nodes, primary.c3, "conditionOutputFalse", 616, "textInput");

  connect(nodes, 616, "textOutput", 617, "userInputFlowInput");
  connect(nodes, 617, "userInputFlowOutput", 618, "userInputFlowSingleInput");
  connect(nodes, 618, "userInputFlowSingleOutputFinalReply", 625, "textInput");

  const retry = bedroomValidation(nodes, [619, 620, 621], [5720, -1300]);
  connect(nodes, 625, "textOutput", retry.c1, "conditionInput");
  // retry.c1 / retry.c3 True → villa check via clones #759 / #760 (fragmentation section)
  textNode(nodes, 626, COPY.bedroomEscalation, [6760, -1300]); // branch-local retry escalation A
  connect(nodes, retry.c2, "conditionOutputTrue", 626, "textInput");
  textNode(nodes, 627, COPY.bedroomEscalation, [6760, -1140]); // branch-local retry escalation B
  connect(nodes, retry.c3, "conditionOutputFalse", 627, "textInput");

  // ── villa converges into confirmation (hub) ───────────────────────────────
  textNode(nodes, 604, COPY.villaAck, [7190, -1750]);
  connect(nodes, 481, "userInputFlowSingleOutputFinalReply", 604, "textInput");
  hubEdge(nodes, 604, "textOutput", 490, "userInputFlowInput"); // 490's kept edge is v5.5's 470-False

  // ── branch-local escalation tails (initial paths) ─────────────────────────
  escalationTail(nodes, [640, 641, 642, 643], "Oraya v6 - Escalation: dates", [5100, -2560]);
  connect(nodes, 438, "textOutput", 640, "userInputFlowInput");
  escalationTail(nodes, [700, 701, 702, 703], "Oraya v6 - Escalation: dates (check-out path)", [4900, 636]);
  connect(nodes, 504, "textOutput", 700, "userInputFlowInput");
  escalationTail(nodes, [704, 705, 706, 707], "Oraya v6 - Escalation: bedroom fit A", [7020, -1300]);
  connect(nodes, 626, "textOutput", 704, "userInputFlowInput");
  escalationTail(nodes, [708, 709, 710, 711], "Oraya v6 - Escalation: bedroom fit B", [7020, -1140]);
  connect(nodes, 627, "textOutput", 708, "userInputFlowInput");
  escalationTail(nodes, [712, 713, 714, 715], "Oraya v6 - Escalation: large group", [5760, -3600]);
  connect(nodes, 468, "textOutput", 712, "userInputFlowInput");

  // ── Edit path: fresh attempt → forward-cloned re-validation ───────────────
  conditionNode(nodes, 650, [{ field: FIELD.checkIn, value: "null" }], [2200, -400]);
  wrapperNode(nodes, 651, "Oraya v6 Edit - Dates", [2460, -520]);
  questionNode(nodes, 652, { question: COPY.editDatesQuestion, field: FIELD.followup }, [2720, -520]);
  apiNode(nodes, 653, API.refine, [2980, -520]);
  conditionNode(nodes, 654, [
    { field: FIELD.checkIn, value: "null" },
    { field: FIELD.checkOut, value: "null" },
  ], [3240, -400]);
  textNode(nodes, 655, COPY.dateEscalation, [3500, -520]);
  conditionNode(nodes, 656, [{ field: FIELD.checkOut, value: "null" }], [2460, -280]);
  wrapperNode(nodes, 657, "Oraya v6 Edit - Checkout", [2720, -280]);
  questionNode(nodes, 658, { question: COPY.editCheckoutQuestion, field: FIELD.followup }, [2980, -280]);
  apiNode(nodes, 659, API.refine, [3240, -280]);
  conditionNode(nodes, 660, [{ field: FIELD.guestCount, value: "null" }], [3760, -400]);

  connect(nodes, 498, "httpApiOutput", 650, "conditionInput");
  connect(nodes, 650, "conditionOutputTrue", 651, "userInputFlowInput");
  connect(nodes, 650, "conditionOutputFalse", 656, "conditionInput");
  connect(nodes, 651, "userInputFlowOutput", 652, "userInputFlowSingleInput");
  connect(nodes, 652, "userInputFlowSingleOutputFinalReply", 653, "httpApiInput");
  connect(nodes, 653, "httpApiOutput", 654, "conditionInput"); // HUB 654 kept edge
  connect(nodes, 654, "conditionOutputTrue", 655, "textInput");
  connect(nodes, 654, "conditionOutputFalse", 660, "conditionInput"); // #660's ONLY parent (656 False re-enters via clone chain 761/762)
  connect(nodes, 656, "conditionOutputTrue", 657, "userInputFlowInput");
  // 656 False (both dates already known) → guest check via clones #761/#762 (fragmentation section)
  connect(nodes, 657, "userInputFlowOutput", 658, "userInputFlowSingleInput");
  connect(nodes, 658, "userInputFlowSingleOutputFinalReply", 659, "httpApiInput");
  hubEdge(nodes, 659, "httpApiOutput", 654, "conditionInput");
  escalationTail(nodes, [716, 717, 718, 719], "Oraya v6 Edit - Escalation: dates", [3760, -700]);
  connect(nodes, 655, "textOutput", 716, "userInputFlowInput");

  // guests (Edit)
  wrapperNode(nodes, 661, "Oraya v6 Edit - Guests", [4020, -520]);
  questionNode(nodes, 662, { question: COPY.guestQuestion, field: FIELD.guestCount, choices: GUEST_CHOICES }, [4280, -520]);
  conditionNode(nodes, 663, GUEST_CHOICES.slice(0, 8).map((v) => ({ field: FIELD.guestCount, value: v })), [4540, -400]);
  textNode(nodes, 664, COPY.guestAck, [4410, -520]);
  connect(nodes, 660, "conditionOutputTrue", 661, "userInputFlowInput");
  connect(nodes, 660, "conditionOutputFalse", 663, "conditionInput"); // HUB 663 kept edge
  connect(nodes, 661, "userInputFlowOutput", 662, "userInputFlowSingleInput");
  connect(nodes, 662, "userInputFlowSingleOutputFinalReply", 664, "textInput");
  hubEdge(nodes, 664, "textOutput", 663, "conditionInput");

  // Edit large group — branch-local clone of the initial 466/467/468 subtree
  cloneSubgraph(nodes, { 466: 736, 467: 737, 468: 738 }, { offset: [-910, 2817], campaignSuffix: " (Edit)" });
  connect(nodes, 663, "conditionOutputFalse", 736, "userInputFlowInput");
  escalationTail(nodes, [732, 733, 734, 735], "Oraya v6 Edit - Escalation: large group", [5320, 140]);
  connect(nodes, 738, "textOutput", 732, "userInputFlowInput");

  // bedrooms (Edit) — same always-ask + capacity validation + one retry
  wrapperNode(nodes, 670, "Oraya v6 Edit - Bedrooms", [4800, -520]);
  questionNode(nodes, 671, { question: COPY.bedroomQuestion, field: FIELD.bedroom, choices: BEDROOM_CHOICES }, [5060, -520]);
  textNode(nodes, 684, COPY.bedroomAck, [5190, -520]);
  textNode(nodes, 676, COPY.bedroomMismatch, [6280, -520]);
  wrapperNode(nodes, 677, "Oraya v6 Edit - Bedrooms retry", [4800, -160]);
  questionNode(nodes, 678, { question: COPY.bedroomQuestion, field: FIELD.bedroom, choices: BEDROOM_CHOICES }, [5060, -160]);
  textNode(nodes, 685, COPY.bedroomAck, [5190, -160]);
  conditionNode(nodes, 690, [{ field: FIELD.villa, value: "null" }], [6540, -400]);

  connect(nodes, 663, "conditionOutputTrue", 670, "userInputFlowInput");
  connect(nodes, 670, "userInputFlowOutput", 671, "userInputFlowSingleInput");
  connect(nodes, 671, "userInputFlowSingleOutputFinalReply", 684, "textInput");

  const editVal = bedroomValidation(nodes, [672, 673, 674], [5320, -520]);
  connect(nodes, 684, "textOutput", editVal.c1, "conditionInput");
  connect(nodes, editVal.c1, "conditionOutputTrue", 690, "conditionInput"); // #690's ONLY parent (other Edit capacity-OK exits use clones 763-765)
  connect(nodes, editVal.c2, "conditionOutputTrue", 676, "textInput"); // HUB 676 kept edge
  // editVal.c3 True → Edit villa check via clone #763 (fragmentation section)
  hubEdge(nodes, editVal.c3, "conditionOutputFalse", 676, "textInput");

  connect(nodes, 676, "textOutput", 677, "userInputFlowInput");
  connect(nodes, 677, "userInputFlowOutput", 678, "userInputFlowSingleInput");
  connect(nodes, 678, "userInputFlowSingleOutputFinalReply", 685, "textInput");

  const editRetry = bedroomValidation(nodes, [679, 680, 681], [5320, -160]);
  connect(nodes, 685, "textOutput", editRetry.c1, "conditionInput");
  // editRetry.c1 / editRetry.c3 True → Edit villa check via clones #764 / #765 (fragmentation section)
  textNode(nodes, 686, COPY.bedroomEscalation, [6280, -160]);
  connect(nodes, editRetry.c2, "conditionOutputTrue", 686, "textInput");
  textNode(nodes, 687, COPY.bedroomEscalation, [6280, -20]);
  connect(nodes, editRetry.c3, "conditionOutputFalse", 687, "textInput");
  escalationTail(nodes, [720, 721, 722, 723], "Oraya v6 Edit - Escalation: bedroom fit A", [6540, -160]);
  connect(nodes, 686, "textOutput", 720, "userInputFlowInput");
  escalationTail(nodes, [724, 725, 726, 727], "Oraya v6 Edit - Escalation: bedroom fit B", [6540, -20]);
  connect(nodes, 687, "textOutput", 724, "userInputFlowInput");

  // villa + confirmation (Edit)
  wrapperNode(nodes, 691, "Oraya v6 Edit - Villa", [6800, -520]);
  questionNode(nodes, 692, { question: COPY.villaQuestion, field: FIELD.villa, choices: ["Villa Mechmech", "Villa Byblos"] }, [7060, -520]);
  textNode(nodes, 693, COPY.villaAck, [7190, -520]);
  wrapperNode(nodes, 694, "Oraya v6 Edit - Confirm", [7320, -400]);
  questionNode(nodes, 695, { question: COPY.confirmation, field: FIELD.confirm, choices: ["Looks right", "Edit"] }, [7580, -400]);
  textNode(nodes, 699, COPY.confirmAck, [7710, -400]);
  conditionNode(nodes, 696, [{ field: FIELD.confirm, op: "contains", value: "Looks right" }], [7840, -400]);
  wrapperNode(nodes, 697, "Oraya v6 Edit - Continue to handoff", [8100, -520]);
  textNode(nodes, 698, COPY.secondEditEscalation, [8100, -280]);

  connect(nodes, 690, "conditionOutputTrue", 691, "userInputFlowInput");
  connect(nodes, 690, "conditionOutputFalse", 694, "userInputFlowInput"); // HUB 694 kept edge
  connect(nodes, 691, "userInputFlowOutput", 692, "userInputFlowSingleInput");
  connect(nodes, 692, "userInputFlowSingleOutputFinalReply", 693, "textInput");
  hubEdge(nodes, 693, "textOutput", 694, "userInputFlowInput");
  connect(nodes, 694, "userInputFlowOutput", 695, "userInputFlowSingleInput");
  connect(nodes, 695, "userInputFlowSingleOutputFinalReply", 699, "textInput");
  connect(nodes, 699, "textOutput", 696, "conditionInput");
  connect(nodes, 696, "conditionOutputTrue", 697, "userInputFlowInput");
  connect(nodes, 696, "conditionOutputFalse", 698, "textInput");
  escalationTail(nodes, [728, 729, 730, 731], "Oraya v6 Edit - Escalation: second edit", [8360, -280]);
  connect(nodes, 698, "textOutput", 728, "userInputFlowInput");

  // Edit handoff — branch-local clone of the complete initial handoff subtree
  // (choice question, WhatsApp ending with its own Lead Submit, website
  // ending with its own 7459 Lead Submit) so #70 keeps a single parent per path.
  cloneSubgraph(nodes, { 70: 740, 71: 741, 72: 742, 84: 743, 73: 744, 74: 745, 75: 746, 8: 747, 9: 748, 7: 749 }, {
    offset: [0, 1400],
    campaignSuffix: " (Edit)",
  });
  connect(nodes, 697, "userInputFlowOutput", 740, "userInputFlowSingleInput");

  // ── corrected-rule fragmentation (round trip #2 probes, 2026-07-03) ───────
  // Each destination Condition may carry at most ONE Condition-source parent
  // (the editor rejects a second with the infinite-loop warning). Every extra
  // Condition-source parent below gets a semantically identical clone whose
  // single serialized connection the import keeps automatically; convergence
  // then happens at guest-visible wrappers/Texts through live-proven draw
  // operations. Conditions are invisible routing logic — guest behavior is
  // byte-identical.

  // #440 "guest known?" + #602 "supported count?": the four date-recovery
  // exits (430/436/501/505 False) may not join #411's kept edge on #440, so
  // each recovery branch gets its own 440-clone → 602-clone chain (both
  // serialized single-parent, import-kept).
  const dateRecoverySplits = [
    { from: 430, g: 750, s: 751 },
    { from: 436, g: 752, s: 753 },
    { from: 501, g: 754, s: 755 },
    { from: 505, g: 756, s: 757 },
  ];
  for (const { from, g, s } of dateRecoverySplits) {
    const [px, py] = nodes[String(from)].position;
    detachEdge(nodes, from, "conditionOutputFalse", 440, "conditionInput");
    cloneCondition(nodes, 440, g, [px + 260, py + 120]);
    cloneCondition(nodes, 602, s, [px + 520, py + 120]);
    connect(nodes, from, "conditionOutputFalse", g, "conditionInput"); // sole connection — import keeps it
    connect(nodes, g, "conditionOutputFalse", s, "conditionInput"); // sole connection — import keeps it
    hubEdge(nodes, g, "conditionOutputTrue", 600, "userInputFlowInput");
    hubEdge(nodes, s, "conditionOutputTrue", 610, "userInputFlowInput");
    hubEdge(nodes, s, "conditionOutputFalse", 466, "userInputFlowInput");
  }

  // #470 "villa known?": capacity-OK exits beyond the kept #612 True.
  const villaSplits = [
    { from: primary.c3, clone: 758 },
    { from: retry.c1, clone: 759 },
    { from: retry.c3, clone: 760 },
  ];
  for (const { from, clone } of villaSplits) {
    const [px, py] = nodes[String(from)].position;
    cloneCondition(nodes, 470, clone, [px + 260, py + 120]);
    connect(nodes, from, "conditionOutputTrue", clone, "conditionInput"); // sole connection — import keeps it
    hubEdge(nodes, clone, "conditionOutputTrue", 480, "userInputFlowInput");
    hubEdge(nodes, clone, "conditionOutputFalse", 490, "userInputFlowInput");
  }

  // Edit both-dates-known re-entry: #656 False may not join #654's kept edge
  // on #660 — chain a 660-clone → 663-clone (both serialized single-parent).
  {
    const [px, py] = nodes["656"].position;
    cloneCondition(nodes, 660, 761, [px + 260, py + 120]);
    cloneCondition(nodes, 663, 762, [px + 520, py + 120]);
    connect(nodes, 656, "conditionOutputFalse", 761, "conditionInput"); // sole connection — import keeps it
    connect(nodes, 761, "conditionOutputFalse", 762, "conditionInput"); // sole connection — import keeps it
    hubEdge(nodes, 761, "conditionOutputTrue", 661, "userInputFlowInput");
    hubEdge(nodes, 762, "conditionOutputTrue", 670, "userInputFlowInput");
    hubEdge(nodes, 762, "conditionOutputFalse", 736, "userInputFlowInput");
  }

  // Edit #690 "villa known?": Edit capacity-OK exits beyond the kept #672 True.
  const editVillaSplits = [
    { from: editVal.c3, clone: 763 },
    { from: editRetry.c1, clone: 764 },
    { from: editRetry.c3, clone: 765 },
  ];
  for (const { from, clone } of editVillaSplits) {
    const [px, py] = nodes[String(from)].position;
    cloneCondition(nodes, 690, clone, [px + 260, py + 120]);
    connect(nodes, from, "conditionOutputTrue", clone, "conditionInput"); // sole connection — import keeps it
    hubEdge(nodes, clone, "conditionOutputTrue", 691, "userInputFlowInput");
    hubEdge(nodes, clone, "conditionOutputFalse", 694, "userInputFlowInput");
  }

  // Start-node title and every inherited campaign label reflect the revision.
  nodes["1"].data.title = "Oraya Natural Stay Intake v6 - Start";
  for (const node of Object.values(nodes)) {
    if (typeof node.data?.campaignName === "string") {
      node.data.campaignName = node.data.campaignName.replace(/v5\.\d+/g, "v6");
    }
  }

  return flow;
}

// ─── operator redraw plan (the hub edges the import will drop) ─────────────
// Declarative and machine-verified: buildRedrawPlan() asserts the plan covers
// EXACTLY every beyond-first connection in the generated graph — no more, no
// less — so the checklist can never drift from the artifact. Every entry uses
// a live-proven editor operation and NO entry is Condition → Condition
// (assertEditorContracts enforces both, plus the one-Condition-parent rule).

const REDRAW_PLAN = [
  // hub #600 — guest question (guest-unknown exits of the cloned "guest known?" checks)
  { from: 750, outKey: "conditionOutputTrue", to: 600, inKey: "userInputFlowInput", purpose: "Dates recovered after the FIRST full-dates follow-up, guest count still unknown — asks the guest question." },
  { from: 752, outKey: "conditionOutputTrue", to: 600, inKey: "userInputFlowInput", purpose: "Dates recovered after the SECOND full-dates follow-up, guest count still unknown — asks the guest question." },
  { from: 754, outKey: "conditionOutputTrue", to: 600, inKey: "userInputFlowInput", purpose: "Check-out recovered after the FIRST check-out follow-up, guest count still unknown — asks the guest question." },
  { from: 756, outKey: "conditionOutputTrue", to: 600, inKey: "userInputFlowInput", purpose: "Check-out recovered after the SECOND check-out follow-up, guest count still unknown — asks the guest question." },
  // hub #602 — supported-guest-count check (extraction path kept automatically)
  { from: 603, outKey: "textOutput", to: 602, inKey: "conditionInput", purpose: "Guest count the guest JUST answered continues into the supported-count check." },
  // hub #610 — bedroom question (supported-count OK exits of the cloned checks)
  { from: 751, outKey: "conditionOutputTrue", to: 610, inKey: "userInputFlowInput", purpose: "First full-dates recovery with a known, supported guest count — continues to the bedroom question." },
  { from: 753, outKey: "conditionOutputTrue", to: 610, inKey: "userInputFlowInput", purpose: "Second full-dates recovery with a known, supported guest count — continues to the bedroom question." },
  { from: 755, outKey: "conditionOutputTrue", to: 610, inKey: "userInputFlowInput", purpose: "First check-out recovery with a known, supported guest count — continues to the bedroom question." },
  { from: 757, outKey: "conditionOutputTrue", to: 610, inKey: "userInputFlowInput", purpose: "Second check-out recovery with a known, supported guest count — continues to the bedroom question." },
  // hub #466 — large-group exact-count review (More-than-8 exits of the cloned checks)
  { from: 751, outKey: "conditionOutputFalse", to: 466, inKey: "userInputFlowInput", purpose: "First full-dates recovery with more than 8 guests — exact-count team review." },
  { from: 753, outKey: "conditionOutputFalse", to: 466, inKey: "userInputFlowInput", purpose: "Second full-dates recovery with more than 8 guests — exact-count team review." },
  { from: 755, outKey: "conditionOutputFalse", to: 466, inKey: "userInputFlowInput", purpose: "First check-out recovery with more than 8 guests — exact-count team review." },
  { from: 757, outKey: "conditionOutputFalse", to: 466, inKey: "userInputFlowInput", purpose: "Second check-out recovery with more than 8 guests — exact-count team review." },
  // hub #480 — villa question (capacity-OK, villa-unknown exits of the cloned villa checks)
  { from: 758, outKey: "conditionOutputTrue", to: 480, inKey: "userInputFlowInput", purpose: "Bedroom OK — 2 bedrooms fit 3–4 guests (first ask) — villa still unknown, asks the villa question." },
  { from: 759, outKey: "conditionOutputTrue", to: 480, inKey: "userInputFlowInput", purpose: "Bedroom OK — 3 bedrooms or 1–2 guests (retry ask) — villa still unknown, asks the villa question." },
  { from: 760, outKey: "conditionOutputTrue", to: 480, inKey: "userInputFlowInput", purpose: "Bedroom OK — 2 bedrooms fit 3–4 guests (retry ask) — villa still unknown, asks the villa question." },
  // hub #616 — bedroom mismatch explanation
  { from: 614, outKey: "conditionOutputFalse", to: 616, inKey: "textInput", purpose: "Bedroom mismatch — 2 bedrooms with 5–8 guests (first ask) — shows the capacity explanation and re-ask." },
  // hub #490 — confirmation entry (villa-known exits + villa just chosen)
  { from: 758, outKey: "conditionOutputFalse", to: 490, inKey: "userInputFlowInput", purpose: "Bedroom OK (first ask), villa already known — continues to the confirmation summary." },
  { from: 759, outKey: "conditionOutputFalse", to: 490, inKey: "userInputFlowInput", purpose: "Bedroom OK (retry, 3 bedrooms or 1–2 guests), villa already known — continues to the confirmation summary." },
  { from: 760, outKey: "conditionOutputFalse", to: 490, inKey: "userInputFlowInput", purpose: "Bedroom OK (retry, 2 bedrooms fit 3–4), villa already known — continues to the confirmation summary." },
  { from: 604, outKey: "textOutput", to: 490, inKey: "userInputFlowInput", purpose: "Villa the guest JUST chose continues to the confirmation summary (the villa-already-known path is kept automatically)." },
  // hub #654 — Edit dates-complete check (first refine call kept automatically)
  { from: 659, outKey: "httpApiOutput", to: 654, inKey: "conditionInput", purpose: "Edit check-out refinement result continues into the dates-complete check." },
  // hub #661 — Edit guest question
  { from: 761, outKey: "conditionOutputTrue", to: 661, inKey: "userInputFlowInput", purpose: "Edit attempt that already has BOTH dates, guest count unknown — asks the Edit guest question." },
  // hub #663 — Edit supported-guest-count check
  { from: 664, outKey: "textOutput", to: 663, inKey: "conditionInput", purpose: "Edit guest count the guest JUST answered continues into the supported-count check." },
  // hub #670 — Edit bedroom question
  { from: 762, outKey: "conditionOutputTrue", to: 670, inKey: "userInputFlowInput", purpose: "Edit both-dates-known re-entry with a known, supported guest count — continues to the Edit bedroom question." },
  // hub #736 — Edit large-group exact-count review
  { from: 762, outKey: "conditionOutputFalse", to: 736, inKey: "userInputFlowInput", purpose: "Edit both-dates-known re-entry with more than 8 guests — Edit exact-count team review." },
  // hub #691 — Edit villa question
  { from: 763, outKey: "conditionOutputTrue", to: 691, inKey: "userInputFlowInput", purpose: "Edit bedroom OK — 2 bedrooms fit 3–4 guests (first ask) — villa still unknown, asks the Edit villa question." },
  { from: 764, outKey: "conditionOutputTrue", to: 691, inKey: "userInputFlowInput", purpose: "Edit bedroom OK — 3 bedrooms or 1–2 guests (retry ask) — villa still unknown, asks the Edit villa question." },
  { from: 765, outKey: "conditionOutputTrue", to: 691, inKey: "userInputFlowInput", purpose: "Edit bedroom OK — 2 bedrooms fit 3–4 guests (retry ask) — villa still unknown, asks the Edit villa question." },
  // hub #676 — Edit bedroom mismatch explanation
  { from: 674, outKey: "conditionOutputFalse", to: 676, inKey: "textInput", purpose: "Edit bedroom mismatch — 2 bedrooms with 5–8 guests (first ask) — shows the capacity explanation and re-ask." },
  // hub #694 — Edit confirmation entry
  { from: 763, outKey: "conditionOutputFalse", to: 694, inKey: "userInputFlowInput", purpose: "Edit bedroom OK (first ask), villa already known — continues to the updated confirmation summary." },
  { from: 764, outKey: "conditionOutputFalse", to: 694, inKey: "userInputFlowInput", purpose: "Edit bedroom OK (retry, 3 bedrooms or 1–2 guests), villa already known — continues to the updated confirmation summary." },
  { from: 765, outKey: "conditionOutputFalse", to: 694, inKey: "userInputFlowInput", purpose: "Edit bedroom OK (retry, 2 bedrooms fit 3–4), villa already known — continues to the updated confirmation summary." },
  { from: 693, outKey: "textOutput", to: 694, inKey: "userInputFlowInput", purpose: "Edit villa the guest JUST chose continues to the updated confirmation summary." },
];

const HUB_DESCRIPTIONS = {
  600: "guest-count question — merges the guest-unknown exits of the original and cloned \"guest known?\" checks",
  602: "supported-guest-count check (1–8 vs More than 8) — extraction path kept; the just-answered path is drawn",
  610: "bedroom question — merges every supported-guest-count OK exit",
  466: "large-group exact-count team review — merges every More-than-8 exit",
  480: "villa question — merges every capacity-OK, villa-unknown exit",
  616: "bedroom capacity explanation + re-ask",
  490: "confirmation summary entry — merges the villa-known exits and the villa-just-chosen path",
  654: "Edit \"both dates known?\" check — fed by both Edit refine API calls",
  661: "Edit guest-count question",
  663: "Edit supported-guest-count check",
  670: "Edit bedroom question",
  736: "Edit large-group exact-count team review",
  691: "Edit villa question — merges every Edit capacity-OK, villa-unknown exit",
  676: "Edit bedroom capacity explanation + re-ask",
  694: "Edit confirmation summary entry",
};

// Live-proven manual connection operations (operator probes on the
// authenticated editor, 2026-07-03 — roundtrips/ROUNDTRIP_2_FINDINGS.md
// addendum). Kept in sync with the profile's
// importGraphContract.editorProvenDrawPairs (tested). Generation FAILS if a
// redraw edge uses any pair outside this set.
const PROVEN_DRAW_PAIRS = new Set([
  "Condition → User Input Flow",
  "Text → User Input Flow",
  "Condition → Text",
  "Text → Condition",
  "HTTP API → Condition",
  // Condition → Condition is drawable ONLY when it creates the destination's
  // first/only Condition-source parent. assertEditorContracts additionally
  // enforces the structural one-Condition-parent rule AND the design target
  // of ZERO manually drawn Condition → Condition edges.
  "Condition → Condition",
]);

// Corrected editor rule (round trip #2, 2026-07-03): each destination
// Condition may carry at most ONE inbound edge whose source is a Condition —
// the editor rejects a second with "This will make an infinite loop…".
const MAX_CONDITION_SOURCE_PARENTS = 1;

function drawPairOf(nodes, e) {
  return `${nodes[String(e.from)].name} → ${nodes[String(e.to)].name}`;
}

function edgeKeyOf(e) {
  return `${e.from}:${e.outKey} -> ${e.to}:${e.inKey}`;
}

// Hard generation gates for the corrected editor rule: (a) every redraw uses
// a live-proven operation; (b) no redraw is Condition → Condition (fragment
// the destination instead); (c) no Condition anywhere in the FINAL expected
// graph (serialized + redrawn edges are the same set) carries more than one
// Condition-source parent.
function assertEditorContracts(flow, plan) {
  const nodes = flow.nodes;
  for (const e of plan) {
    const pair = drawPairOf(nodes, e);
    if (!PROVEN_DRAW_PAIRS.has(pair)) {
      throw new Error(`redraw edge ${edgeKeyOf(e)} uses UNPROVEN editor operation "${pair}" — refuse to generate`);
    }
    if (pair === "Condition → Condition") {
      throw new Error(`redraw edge ${edgeKeyOf(e)} is a manually drawn Condition → Condition — the plan targets zero of these; give the destination a per-parent clone instead`);
    }
  }
  for (const [id, node] of Object.entries(nodes)) {
    if (node.name !== "Condition") continue;
    const condParents = [];
    for (const inp of Object.values(node.inputs ?? {})) {
      for (const c of inp.connections ?? []) {
        if (nodes[String(c.node)]?.name === "Condition") condParents.push(`#${c.node}`);
      }
    }
    if (condParents.length > MAX_CONDITION_SOURCE_PARENTS) {
      throw new Error(`Condition #${id} has ${condParents.length} Condition-source parents [${condParents.join(", ")}] — the editor allows at most ${MAX_CONDITION_SOURCE_PARENTS}; refuse to generate`);
    }
  }
}

function buildRedrawPlan(flow) {
  // every beyond-first connection per input socket, straight from the graph
  const dropped = [];
  for (const [id, node] of Object.entries(flow.nodes)) {
    for (const [inKey, inp] of Object.entries(node.inputs ?? {})) {
      for (const c of (inp.connections ?? []).slice(1)) {
        dropped.push({ from: Number(c.node), outKey: c.output, to: Number(id), inKey });
      }
    }
  }
  const graphSet = new Set(dropped.map(edgeKeyOf));
  const planSet = new Set(REDRAW_PLAN.map(edgeKeyOf));
  const missing = [...graphSet].filter((k) => !planSet.has(k));
  const extra = [...planSet].filter((k) => !graphSet.has(k));
  if (missing.length || extra.length) {
    throw new Error(
      `redraw plan drift — beyond-first edges not in plan: [${missing.join(" | ")}]; plan edges not beyond-first in graph: [${extra.join(" | ")}]`,
    );
  }
  return REDRAW_PLAN;
}

function nodeDocLabel(nodes, id) {
  const n = nodes[String(id)];
  const d = n?.data ?? {};
  if (n.name === "Condition") {
    const rows = (d.custom_field_variable_selected_texts ?? []).map(
      (name, i) => `${name} ${d.custom_field_operator[i] === "equal" ? "=" : "contains"} "${d.custom_field_variable_value[i]}"`,
    );
    return `Condition diamond (${rows.join(d.any_match ? " OR " : " AND ")})`;
  }
  const text = (d.textMessage ?? d.question ?? d.httpApiText ?? d.campaignName ?? "").toString().replace(/\s+/g, " ");
  const kind = { "Text": "Message", "User Input Flow Single": "Question", "User Input Flow": "Flow wrapper", "HTTP API": "HTTP API" }[n.name] ?? n.name;
  return `${kind} "${text.slice(0, 70)}${text.length > 70 ? "…" : ""}"`;
}

const PORT_HUMAN = {
  conditionOutputTrue: "TRUE output",
  conditionOutputFalse: "FALSE output",
  textOutput: "output",
  userInputFlowOutput: "output",
  httpApiOutput: "output",
  userInputFlowSingleOutputFinalReply: "final-reply output",
};

function posOf(nodes, id) {
  const [x, y] = nodes[String(id)].position;
  return `(${Math.round(x)}, ${Math.round(y)})`;
}

function renderRedrawChecklist(flow, plan, artifactSha256) {
  const nodes = flow.nodes;
  const lines = [];
  lines.push("# Oraya Natural Stay Intake v6 — operator redraw checklist (hybrid import repair)");
  lines.push("");
  lines.push("**Machine-generated by `scripts/generate-whatchimp-v6.mjs` — do not edit by hand; it is regenerated with the artifact and verified against it by an exact set-equality assertion.**");
  lines.push("");
  lines.push(`**Applies to exactly:** \`Oraya_natural_intake_v6.txt\` with SHA-256 \`${artifactSha256}\`. If your file's hash differs, regenerate this checklist.`);
  lines.push("");
  lines.push("**Why this exists:** authenticated round trip #1 (2026-07-03) proved WhatChimp's import keeps only the FIRST serialized connection per input socket and silently drops the rest (evidence: `roundtrips/ROUNDTRIP_1_FINDINGS.md`). This candidate clones every branch-local tail AND every Condition that would otherwise receive a second Condition-source parent (round trip #2's corrected editor rule: at most ONE Condition-source parent per Condition — evidence and live probe results: `roundtrips/ROUNDTRIP_2_FINDINGS.md`), so the " + String(plan.length) + " remaining merge connections below are exactly what you re-draw after import. **Every item uses only a live-proven editor operation** (Condition → question flow, Text → question flow, Condition → Text, Text → Condition, HTTP API → Condition); none is Condition → Condition, and the generator refuses to emit this file otherwise. If the editor rejects ANY connection below, stop and report — do not insert nodes to work around it.");
  lines.push("");
  lines.push("**When:** on a fresh disposable TEST bot, immediately after importing the artifact and BEFORE any testing: draw all connections below, then Save → close the editor → reopen → export → verify (commands at the bottom).");
  lines.push("");
  lines.push("**Safety of the un-repaired import** (until you finish drawing): the complete happy path already works (all details extracted → bedroom OK → confirmation → handoff); no message ever claims a confirmed booking; the opening question always shows `https://stayoraya.com/book` before anything else, so no conversation is ever link-less. But the not-yet-drawn branches stop silently — never expose the bot to guests before the redraw + verification below. Production stays untouched.");
  lines.push("");
  lines.push(`## The ${plan.length} connections to draw`);
  lines.push("");
  lines.push("Each item: drag a line from the stated OUTPUT of the source node to the (single) INPUT socket of the destination node. Canvas coordinates are from the import file — nodes may shift slightly, so match by the quoted title/text.");
  lines.push("");
  plan.forEach((e, i) => {
    const dx = nodes[String(e.to)].position[0] - nodes[String(e.from)].position[0];
    const dy = nodes[String(e.to)].position[1] - nodes[String(e.from)].position[1];
    const dir = `${dy < -40 ? "above" : dy > 40 ? "below" : "level with"} and ${dx < -40 ? "left of" : dx > 40 ? "right of" : "near"} the source`;
    lines.push(`- [ ] **${i + 1}.** FROM \`#${e.from}\` ${nodeDocLabel(nodes, e.from)} — **${PORT_HUMAN[e.outKey] ?? e.outKey}** (\`${e.outKey}\`)`);
    lines.push(`      TO \`#${e.to}\` ${nodeDocLabel(nodes, e.to)} — input socket (\`${e.inKey}\`).`);
    lines.push(`      Purpose: ${e.purpose}`);
    lines.push(`      Where: source at canvas ≈ ${posOf(nodes, e.from)}; destination at ≈ ${posOf(nodes, e.to)} (${dir}).`);
    lines.push(`      Operation: ${drawPairOf(nodes, e).replace(" → ", " output → ")} input — live-proven editor operation (2026-07-03).`);
  });
  lines.push("");
  lines.push("## Hub-by-hub visual map");
  lines.push("");
  lines.push("One block per remaining merge point. The first line is the connection the import keeps automatically; every `draw #N` line is an item from the list above.");
  lines.push("");
  const byHub = new Map();
  plan.forEach((e, i) => {
    if (!byHub.has(e.to)) byHub.set(e.to, []);
    byHub.get(e.to).push({ ...e, seq: i + 1 });
  });
  for (const [hubId, items] of byHub) {
    const kept = Object.values(flow.nodes[String(hubId)].inputs)[0].connections[0];
    lines.push(`### Hub \`#${hubId}\` — ${HUB_DESCRIPTIONS[hubId] ?? nodeDocLabel(nodes, hubId)} ≈ ${posOf(nodes, hubId)}`);
    lines.push("```");
    lines.push(`  #${kept.node} ${PORT_HUMAN[kept.output] ?? kept.output}  ──────────────►  #${hubId}   (kept automatically by the import)`);
    for (const it of items) {
      lines.push(`  #${it.from} ${PORT_HUMAN[it.outKey] ?? it.outKey}  ── draw #${it.seq} ──►  #${hubId}`);
    }
    lines.push("```");
    lines.push("");
  }
  lines.push(`## Verify after drawing all ${plan.length}`);
  lines.push("");
  lines.push("Save → close the editor completely → reopen → export, then run BOTH (each must succeed):");
  lines.push("");
  lines.push("```");
  lines.push("node scripts/compare-whatchimp-roundtrip.mjs Oraya_natural_intake_v6.txt <re-export>   # must print PRESERVED, exit 0");
  lines.push("node scripts/validate-whatchimp-flow.mjs <re-export> --strict-binding                  # must report 0 errors, exit 0");
  lines.push("```");
  lines.push("");
  lines.push("If the comparator reports ANY lost edge or unexpected terminal, or the validator reports a `single-parent-contract` hub mismatch, a drawn connection is missing or wrong — fix it in the editor and re-export before any live testing (checklist section C).");
  lines.push("");
  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const [input, output, redrawOut] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: node scripts/generate-whatchimp-v6.mjs <v5.5-input> <v6-output> [<redraw-checklist.md>]");
    process.exit(2);
  }
  const flow = JSON.parse(readFileSync(input, "utf8"));
  const v6 = generateV6(flow);
  const plan = buildRedrawPlan(v6);
  assertEditorContracts(v6, plan);
  const serialized = JSON.stringify(v6);
  writeFileSync(output, serialized, "utf8");
  const sha = createHash("sha256").update(serialized, "utf8").digest("hex").toUpperCase();
  if (redrawOut) {
    writeFileSync(redrawOut, renderRedrawChecklist(v6, plan, sha), "utf8");
  }
  const nodeCount = Object.keys(v6.nodes).length;
  let edges = 0;
  for (const n of Object.values(v6.nodes)) {
    for (const o of Object.values(n.outputs ?? {})) edges += (o.connections ?? []).length;
  }
  console.log(`wrote ${output}: ${nodeCount} nodes, ${edges} output connections, ${plan.length} operator-redrawn hub edges${redrawOut ? `, checklist ${redrawOut}` : ""}`);
  console.log(`artifact sha256: ${sha}`);
}

main();
