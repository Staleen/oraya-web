#!/usr/bin/env node
/**
 * Phase 16A — deterministic generator for the Oraya Natural Stay Intake v6
 * WhatChimp flow (INTERACTIVE-CONTROLS architecture, zero operator redraws).
 *
 * Reads the operator's v5.5 export (byte-preserved input artifact) and applies
 * the approved Phase 16A behavior:
 *
 *   1. Natural-language intake + date conversation: opening stay-text
 *      question (with the pre-API https://stayoraya.com/book safety link),
 *      one initial normalization call, ONE date follow-up (both dates, or
 *      check-out only when check-in exists) + ONE final retry through the
 *      refine API, and the Condition-clone cascade that keeps every
 *      Condition at exactly ONE inbound connection (round trip #3). A failed
 *      FINAL retry no longer escalates: the flow stops asking about dates
 *      and continues into the normal interactive intake with dates pending
 *      (no name question, no date-escalation tail); the guest picks dates on
 *      /book via the secure link in the undated summary.
 *   2. Missing STRUCTURED values are collected with WhatChimp Interactive
 *      controls whose buttons/rows save DIRECTLY to the custom field and
 *      route forward on the press (schema reference: the operator's
 *      authenticated saved/reopened export of 2026-07-04 — Interactive #775
 *      with Inline Buttons #776/#783 linked to custom_57693 /
 *      oraya_guest_count, both persisting and both converging forward into
 *      User Input Flow #610; fixture:
 *      roundtrips/Oraya_natural_intake_v6.button-evidence.saved-reexport.txt).
 *        - guest count: Interactive LIST (Keyboard → Sections → 7 Rows:
 *          1,2,3,4,5,6,More than 6 → custom_57693/oraya_guest_count).
 *          WhatsApp caps reply buttons at 3 per message, so the list is the
 *          smallest one-click control that presents the complete choice set
 *          (list-row schema reference: the operator's authenticated
 *          whatsapp-bot_1825051 exports, whose Rows carry the same
 *          customFieldId linkage — including custom_57698/oraya_villa).
 *        - bedrooms: Interactive + 3 Inline Buttons (1/2/3 bedrooms →
 *          custom_69114/oraya_bedroom_count).
 *        - villa: Interactive + 2 Inline Buttons (exact canonical
 *          "Villa Mechmech" / "Villa Byblos" → custom_57698/oraya_villa).
 *      The stored value is the control's visible label (buttonText / row
 *      title) — the exported schema carries NO separate value field — so
 *      every label below IS the exact downstream value; human verification
 *      must click every control and inspect the field (see the generated
 *      checklist).
 *   3. Values already extracted by normalization SKIP their Interactive
 *      question (guest/villa null-gates; bedrooms are never extracted and
 *      are always asked).
 *   4. "More than 6" (clicked) routes through ONE shared acknowledgement
 *      Text (#865) into the existing large-group exact-count → team review →
 *      escalation outcome. Round trip #4 (2026-07-04) proved the import
 *      silently DROPS direct Rows → User Input Flow connections while every
 *      control → Text merge (30/18/2-way) survives, so no control may target
 *      a User Input Flow directly. An EXTRACTED unsupported count
 *      (7, 8, 12, …) routes to a per-branch team-review escalation directly
 *      (we already hold the exact number). Neither asks villa or bedrooms,
 *      and nothing implies an event or booking is confirmed.
 *   5. Completion: once guest count (1–6), villa, and bedrooms are resolved,
 *      the flow submits the existing Lead Submit integration and shows a
 *      DATE-AWARE summary terminal: when both dates are resolved it displays
 *      them; when either is still "null" (failed final retry) the undated
 *      variant shows "Dates: Please choose them using the secure link
 *      below." instead — the literal "null" and misleading partial dates
 *      never render. Both variants say the Oraya team will review
 *      availability and follow up, state the accurate not-confirmed status,
 *      and carry the secure #oraya_prefill_url# slot plus the canonical
 *      fallback link. There is NO full-name question, NO "Continue on
 *      WhatsApp / Finish on website" choice, NO stay-summary confirmation
 *      question, and NO Edit loop. No bedroom-capacity validation happens in
 *      WhatsApp — the website's /book form remains the validation authority.
 *
 * IMPORT / EDITOR CONTRACTS enforced at generation time:
 *   - Round trip #1: WhatChimp's import keeps only the FIRST serialized
 *     connection per input socket (roundtrips/ROUNDTRIP_1_FINDINGS.md).
 *     The ONLY convergence this artifact serializes is postback convergence —
 *     input sockets whose parents are ALL Inline Button / Rows nodes —
 *     matching the operator evidence that normal forward button convergence
 *     persists. Import survival of SERIALIZED postback convergence is the
 *     remaining platform gate: the human checklist requires a fresh import
 *     with NO warning and NO loose connectors before any live testing.
 *     There are ZERO operator redraws.
 *   - Round trip #3: every Condition carries at most ONE inbound connection
 *     TOTAL (roundtrips/ROUNDTRIP_3_FINDINGS.md); the date-recovery
 *     Condition-clone cascade is kept.
 *   - Start-a-Flow ban: no button/row may carry Start-a-Flow metadata
 *     (`value` / `postback_text` — the operator evidence shows Inline Button
 *     #776 carrying BOTH a Start-a-Flow target for the parent flow AND a
 *     direct connector, which is exactly the self-restart + double-execution
 *     hazard). Every control here uses buttonType "new_post_back", ONE
 *     custom-field assignment, and exactly ONE forward connection; every
 *     Interactive's default `interactiveOutput` stays EMPTY so a press can
 *     never execute the next stage twice.
 *
 * Usage:
 *   node scripts/generate-whatchimp-v6.mjs <v5.5-input> <v6-output> [<import-checklist.md>]
 *
 * Node standard library only. Deterministic output (stable ids, stable
 * ordering) so re-runs produce identical bytes for artifact AND checklist.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  fullName: { id: "57759", name: "oraya_full_name" },
  bedroom: { id: BEDROOM_FIELD_ID, name: "oraya_bedroom_count" },
};

const API = {
  initial: { id: "7466", text: "Oraya Stay Intent - Production : POST" },
  refine: { id: "8101", text: "Oraya Stay Intent Refine - Production : POST" },
  leadSubmit: { id: "6961", text: "Oraya Lead Submit - Production : POST" },
};

// The stored value IS the visible label (see docblock §2). These labels are
// therefore the exact values downstream Conditions and the lead payload see.
const GUEST_STAY_CHOICES = ["1", "2", "3", "4", "5", "6"];
const GUEST_OVERFLOW_CHOICE = "More than 6";
const BEDROOM_CHOICES = ["1 bedroom", "2 bedrooms", "3 bedrooms"];
const VILLA_CHOICES = ["Villa Mechmech", "Villa Byblos"];

const COPY = {
  guestQuestion: "How many guests will be staying overnight?",
  guestListButton: "Choose guests",
  guestListSection: "Overnight guests",
  bedroomQuestion: "How many bedrooms would you like?",
  villaQuestion: "Which villa would you prefer?",
  guestAck: "Perfect, thank you 😊",
  overflowAck: "Got it 😊",
  datesPendingContinue:
    "No problem at all 😊 You can pick your exact dates on our secure booking page in a moment — let me get the rest of the details first.",
  escalationName: "So our team can follow up personally — may I have your full name?",
  continuationBlock:
    "\n\nYou can also continue your request online whenever you like:\n#oraya_prefill_url#\n\nIf that secure link is unavailable, please use:\nhttps://stayoraya.com/book",
  escalationFinal:
    "Thank you 😊 I’ve passed your request to the Oraya team — they’ll follow up with you right here on WhatsApp. Please note this is a request, not a confirmed booking yet.",
  extractedOverflowPreface:
    "For a group of #oraya_guest_count# I’ll have our team confirm the details with you personally 😊 — larger stays and events deserve a personal touch.",
  summary:
    "Thank you 😊 Here’s your stay request:\n\n📅 Check-in: #oraya_check_in#\n📅 Check-out: #oraya_check_out#\n🏡 Villa: #oraya_villa#\n👥 Overnight guests: #oraya_guest_count#\n🛏 Bedrooms: #oraya_bedroom_count#\n\nThe Oraya team will review availability and follow up with you right here on WhatsApp. Please note this is a request — not a confirmed booking yet.",
  // Shown when either date is still unresolved after the follow-up + retry:
  // no date hashtag may render (the fields hold the literal "null"), so the
  // dates line points at the secure link instead of showing captured values.
  summaryUndated:
    "Thank you 😊 Here’s your stay request:\n\n📅 Dates: Please choose them using the secure link below.\n🏡 Villa: #oraya_villa#\n👥 Overnight guests: #oraya_guest_count#\n🛏 Bedrooms: #oraya_bedroom_count#\n\nThe Oraya team will review availability and follow up with you right here on WhatsApp. Please note this is a request — not a confirmed booking yet.",
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

// Swap a Condition's True/False outputs IN PLACE, fixing every reciprocal
// input entry on the targets. Used when a condition's comparison polarity is
// inverted (missing-check → presence-check) so the inherited edge targets
// keep their meaning.
function swapConditionOutputs(nodes, id) {
  const node = nodes[String(id)];
  if (!node || node.name !== "Condition") throw new Error(`swapConditionOutputs: #${id} is not a Condition`);
  node.outputs ??= {};
  const t = node.outputs.conditionOutputTrue ?? { connections: [] };
  const f = node.outputs.conditionOutputFalse ?? { connections: [] };
  const trueTargets = (t.connections ?? []).map((c) => String(c.node));
  const falseTargets = (f.connections ?? []).map((c) => String(c.node));
  node.outputs.conditionOutputTrue = f;
  node.outputs.conditionOutputFalse = t;
  const fixReciprocal = (targetId, fromKey, toKey) => {
    for (const socket of Object.values(nodes[targetId]?.inputs ?? {})) {
      for (const e of socket.connections ?? []) {
        if (String(e.node) === String(id) && e.output === fromKey) e.output = toKey;
      }
    }
  };
  for (const tid of trueTargets) fixReciprocal(tid, "conditionOutputTrue", "conditionOutputFalse");
  for (const tid of falseTargets) fixReciprocal(tid, "conditionOutputFalse", "conditionOutputTrue");
}

// Semantically identical Condition clone (same rows, operators, match type) —
// guest-invisible by definition. Fresh deterministic uniqueId; caller wires
// the single serialized parent and the successor edges.
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

// ─── node factories (data shapes mirror the operator's authenticated exports) ─

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

// Interactive message node — exact data shape of the operator's authenticated
// #775 (2026-07-04 saved/reopened export). The default `interactiveOutput`
// stays EMPTY by contract: continuation happens only on a button/row press,
// so one press can never execute the next stage twice.
function interactiveNode(nodes, id, textMessage, position) {
  addNode(nodes, id, "Interactive", {
    uniqueId: uid(),
    headerType: "text",
    headerText: "",
    mediaType: "",
    headerMediaUrl: "",
    headerMediaID: "",
    textMessage,
    footerText: "",
    original_file_name: "",
    delayReplyFor: 0,
    delaySec: 0,
    delayMin: 0,
    delayHour: 0,
    IsTypingOnDisplayChecked: false,
  }, position);
  const node = nodes[String(id)];
  node.inputs = { interactiveInput: { connections: [] } };
  node.outputs = {
    interactiveOutput: { connections: [] },
    interactiveOutputButton: { connections: [] },
    interactiveOutputListMessage: { connections: [] },
    interactiveOutputEcommerce: { connections: [] },
  };
}

// Inline Button — exact data shape of the operator's authenticated #783
// (plain postback button with a custom-field assignment and a single forward
// connector). Deliberately NO `value` / `postback_text` keys: those are the
// Start-a-Flow metadata (#776 evidence) and are banned in this artifact.
function inlineButtonNode(nodes, id, { label, field }, position) {
  addNode(nodes, id, "Inline Button", {
    postbackId: uid(),
    buttonText: label,
    buttonWebhookUrl: "",
    buttonType: "new_post_back",
    text: "Send Message",
    rowType: "static",
    customFieldIndex: "",
    customFieldIndexTitle: "",
    labelIds: [],
    labelIdTextsArray: [],
    labelIdsRemove: [],
    labelIdTextsArrayRemove: [],
    googleSheets: [],
    googleSheetsArray: [],
    sequenceIdValue: "",
    sequenceIdText: "Select a Sequence",
    sequenceIdValueRemove: "",
    sequenceIdTextRemove: "Select a Sequence",
    conversationGroupId: "",
    conversationGroupText: "Select Team Role",
    conversationUserId: "",
    conversationUserText: "Select Team Member",
    customFieldId: `custom_${field.id}`,
    customFieldSelectedOptionText: field.name,
    appointment_id: "",
    appointment_text: "Select",
    googleCalendar: "",
    saveGoogleMeetToCustomField: false,
    googleMeetCustomField: "",
    googleMeetCustomFieldSelectedOptionText: "Select",
    newPostbackId: uid(),
  }, position);
  const node = nodes[String(id)];
  node.inputs = { buttonInput: { connections: [] } };
  node.outputs = { buttonOutput: { connections: [] }, buttonOutputSequence: { connections: [] } };
}

// List-message chain nodes — exact data shapes of the operator's
// authenticated whatsapp-bot_1825051 export (Interactive → Keyboard →
// Sections → Rows; Rows carry the same custom-field linkage block, proven on
// this tenant with custom_57698/oraya_villa).
function keyboardNode(nodes, id, buttonText, position) {
  addNode(nodes, id, "Keyboard", { uniqueId: uid(), buttonText }, position);
  const node = nodes[String(id)];
  node.inputs = { quickReplyInput: { connections: [] } };
  node.outputs = { quickReplyOutput: { connections: [] } };
}

function sectionsNode(nodes, id, title, position) {
  addNode(nodes, id, "Sections", { title }, position);
  const node = nodes[String(id)];
  node.inputs = { sectionInput: { connections: [] } };
  node.outputs = { sectionOutputRows: { connections: [] } };
}

function rowNode(nodes, id, { label, field }, position) {
  addNode(nodes, id, "Rows", {
    postbackId: uid(),
    title: label,
    description: "",
    buttonWebhookUrl: "",
    labelIds: [],
    labelIdTextsArray: [],
    rowType: "static",
    customFieldIndex: "",
    customFieldIndexTitle: "",
    googleSheets: [],
    googleSheetsArray: [],
    labelIdsRemove: [],
    labelIdTextsArrayRemove: [],
    customFieldId: `custom_${field.id}`,
    customFieldSelectedOptionText: field.name,
    sequenceIdValue: "",
    sequenceIdText: "Select a Sequence",
    sequenceIdValueRemove: "",
    sequenceIdTextRemove: "Select a Sequence",
    conversationGroupId: "",
    conversationGroupText: "Select Team Role",
    conversationUserId: "",
    conversationUserText: "Select Team Member",
    googleCalendar: "",
    saveGoogleMeetToCustomField: false,
    googleMeetCustomField: "",
    googleMeetCustomFieldSelectedOptionText: "Select",
  }, position);
  const node = nodes[String(id)];
  node.inputs = { rowInput: { connections: [] } };
  node.outputs = { rowOutput: { connections: [] } };
}

// Guest-count list stage: Interactive → Keyboard → Sections → 7 Rows.
// Rows "1".."6" converge forward on `stayTargetId` (postback convergence);
// row "More than 6" routes to `overflowTargetId`. Occupies ids base..base+9.
function guestListStage(nodes, base, { stayTargetId, stayTargetInput, overflowTargetId, overflowTargetInput }, pos) {
  interactiveNode(nodes, base, COPY.guestQuestion, [pos[0], pos[1]]);
  keyboardNode(nodes, base + 1, COPY.guestListButton, [pos[0] + 230, pos[1]]);
  sectionsNode(nodes, base + 2, COPY.guestListSection, [pos[0] + 430, pos[1]]);
  connect(nodes, base, "interactiveOutputListMessage", base + 1, "quickReplyInput");
  connect(nodes, base + 1, "quickReplyOutput", base + 2, "sectionInput");
  GUEST_STAY_CHOICES.forEach((label, i) => {
    const rowId = base + 3 + i;
    rowNode(nodes, rowId, { label, field: FIELD.guestCount }, [pos[0] + 650, pos[1] - 300 + i * 100]);
    connect(nodes, base + 2, "sectionOutputRows", rowId, "rowInput");
    connect(nodes, rowId, "rowOutput", stayTargetId, stayTargetInput);
  });
  const overflowId = base + 9;
  rowNode(nodes, overflowId, { label: GUEST_OVERFLOW_CHOICE, field: FIELD.guestCount }, [pos[0] + 650, pos[1] + 320]);
  connect(nodes, base + 2, "sectionOutputRows", overflowId, "rowInput");
  connect(nodes, overflowId, "rowOutput", overflowTargetId, overflowTargetInput);
  return base;
}

// Bedroom button stage: Interactive → 3 Inline Buttons, all converging
// forward on `ackTargetId` (postback convergence). Occupies ids base..base+3.
function bedroomStage(nodes, base, { ackTargetId, ackTargetInput }, pos) {
  interactiveNode(nodes, base, COPY.bedroomQuestion, [pos[0], pos[1]]);
  BEDROOM_CHOICES.forEach((label, i) => {
    const btnId = base + 1 + i;
    inlineButtonNode(nodes, btnId, { label, field: FIELD.bedroom }, [pos[0] + 260, pos[1] - 130 + i * 130]);
    connect(nodes, base, "interactiveOutputButton", btnId, "buttonInput");
    connect(nodes, btnId, "buttonOutput", ackTargetId, ackTargetInput);
  });
  return base;
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

// ─── main transform ─────────────────────────────────────────────────────────

function generateV6(flow) {
  const nodes = flow.nodes;

  // 1. Remove the v5.5 structures this behavior replaces:
  //    - the nested guest-range Interactive tree (450–465);
  //    - the free-text villa question + its dead end (480–482) — replaced by
  //      the villa Interactive with exact-canonical buttons;
  //    - the confirmation / Edit loop (490–498);
  //    - the handoff choice, full-name questions, and both endings
  //      (70–75, 84, 7, 8, 9).
  for (const id of [
    450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 460, 461, 462, 463, 464, 465,
    480, 481, 482,
    490, 491, 492, 493, 494, 495, 496, 497, 498,
    70, 71, 72, 73, 74, 75, 84, 7, 8, 9,
  ]) {
    removeNode(nodes, id);
  }

  // 2. Condition hygiene → PRESENCE contract (live runtime finding
  // 2026-07-04): a misbound response mapping can deliver "" instead of the
  // literal "null", and "" passes every `= "null"` missing-check as if a
  // value existed — the observed blank dated summary. All date and villa
  // routing therefore tests PRESENCE: an ISO date always contains "-" and a
  // canonical villa always contains "Villa", while "", "null", whitespace,
  // and absent values never do. True = present.
  const CHECK_IN_PRESENT  = { field: FIELD.checkIn,  value: "-", op: "contains" };
  const CHECK_OUT_PRESENT = { field: FIELD.checkOut, value: "-", op: "contains" };
  const VILLA_PRESENT     = { field: FIELD.villa, value: "Villa", op: "contains" };
  // 410/411 carry inherited v5.5 edges wired for missing-check polarity —
  // flip the rows AND swap the outputs so the targets keep their meaning:
  // 410 True: check-in present → check-out gate; False → ask both dates.
  // 411 True: check-out present → guest gate;   False → ask check-out.
  setConditionRows(nodes, 410, [CHECK_IN_PRESENT]);
  swapConditionOutputs(nodes, 410);
  setConditionRows(nodes, 411, [CHECK_OUT_PRESENT]);
  swapConditionOutputs(nodes, 411);
  // 430/436/501/505 are flipped after the date-recovery cascade wires their
  // recovery edges (see the date-presence section below); 470 is built with
  // presence polarity directly in the completion section.

  // 3. Pre-API safety link: the opening intake question hands the guest the
  // canonical booking URL BEFORE the first HTTP API call can fire, so a
  // platform halt can never leave a conversation link-less.
  nodes["400"].data.question =
    nodes["400"].data.question +
    "\n\n(You can also complete your booking online at any time: https://stayoraya.com/book)";

  // ── supported-count gate for EXTRACTED guest counts ───────────────────────
  // Rows compare the exact stored values ("1".."6"); an extracted 7/8/12
  // lands on False. Clicked values never pass through this gate — the rows
  // route directly (see guestListStage).
  conditionNode(nodes, 602, GUEST_STAY_CHOICES.map((v) => ({ field: FIELD.guestCount, value: v })), [5720, -1900]);

  disconnectOutput(nodes, 440, "conditionOutputTrue");
  disconnectOutput(nodes, 440, "conditionOutputFalse");
  connect(nodes, 440, "conditionOutputFalse", 602, "conditionInput"); // #602's ONLY inbound

  // ── shared post-answer spine (postback-convergence targets) ───────────────
  // guest-ack Text: every stay-value row (1–6) of every guest list stage
  // converges here, then continues into the always-asked bedroom question.
  textNode(nodes, 860, COPY.guestAck, [6650, -1900]);
  // overflow-ack Text: every "More than 6" row converges HERE (control → Text
  // is the import-surviving merge class), then ONE serialized connection
  // continues into the large-group exact-count wrapper #466. Round trip #4
  // proved direct Rows → User Input Flow edges are dropped on import.
  textNode(nodes, 865, COPY.overflowAck, [5760, -3350]);
  connect(nodes, 865, "textOutput", 466, "userInputFlowInput");
  // bedroom-ack → villa gate: every bedroom button of every bedroom stage
  // converges here; the villa gate is a Condition and keeps ONE inbound.
  textNode(nodes, 930, "Noted 😊", [7400, -1700]);
  connect(nodes, 930, "textOutput", 470, "conditionInput");

  // villa question (asked only when normalization left oraya_villa = "null")
  interactiveNode(nodes, 935, COPY.villaQuestion, [7900, -1950]);
  VILLA_CHOICES.forEach((label, i) => {
    inlineButtonNode(nodes, 936 + i, { label, field: FIELD.villa }, [8160, -2020 + i * 140]);
    connect(nodes, 935, "interactiveOutputButton", 936 + i, "buttonInput");
  });
  textNode(nodes, 938, "Lovely choice 😊", [8420, -1950]);
  connect(nodes, 936, "buttonOutput", 938, "textInput");
  connect(nodes, 937, "buttonOutput", 938, "textInput");

  // Date-aware summaries: after Lead Submit, a single-inbound Condition picks
  // the dated or undated variant with PRESENCE semantics — a dated summary is
  // allowed ONLY when BOTH date fields hold a real ISO date (contain "-");
  // "", "null", and whitespace all select the undated summary, whose
  // choose-dates line replaces the date hashtags; /book (via the secure link)
  // is where the guest picks the dates.
  const BOTH_DATES_PRESENT = [CHECK_IN_PRESENT, CHECK_OUT_PRESENT];

  // completion A: villa just chosen → Lead Submit → date branch → summary
  apiNode(nodes, 939, API.leadSubmit, [8680, -1950]);
  conditionNode(nodes, 943, BOTH_DATES_PRESENT, [8810, -1950], { anyMatch: false });
  textNode(nodes, 940, COPY.summary + COPY.continuationBlock, [9070, -2080]);
  textNode(nodes, 945, COPY.summaryUndated + COPY.continuationBlock, [9070, -1850]);
  connect(nodes, 938, "textOutput", 939, "httpApiInput");
  connect(nodes, 939, "httpApiOutput", 943, "conditionInput"); // #943's ONLY inbound
  connect(nodes, 943, "conditionOutputTrue", 940, "textInput"); // both dates real → dated
  connect(nodes, 943, "conditionOutputFalse", 945, "textInput"); // anything else → undated

  // completion B: villa already known → Lead Submit → date branch → summary.
  // The villa gate #470 also uses presence polarity (contains "Villa").
  setConditionRows(nodes, 470, [VILLA_PRESENT]);
  apiNode(nodes, 941, API.leadSubmit, [8680, -1650]);
  conditionNode(nodes, 944, BOTH_DATES_PRESENT, [8810, -1650], { anyMatch: false });
  textNode(nodes, 942, COPY.summary + COPY.continuationBlock, [9070, -1620]);
  textNode(nodes, 946, COPY.summaryUndated + COPY.continuationBlock, [9070, -1420]);
  connect(nodes, 470, "conditionOutputTrue", 941, "httpApiInput"); // villa present → completion B
  connect(nodes, 470, "conditionOutputFalse", 935, "interactiveInput"); // villa missing → ask
  connect(nodes, 941, "httpApiOutput", 944, "conditionInput"); // #944's ONLY inbound
  connect(nodes, 944, "conditionOutputTrue", 942, "textInput"); // both dates real → dated
  connect(nodes, 944, "conditionOutputFalse", 946, "textInput"); // anything else → undated

  // ── date-recovery Condition-clone cascade (round trip #3 invariant) ───────
  // Each of the four date-recovery exits keeps its own "guest known?" clone
  // (440) chained to its own "supported count?" clone (602), all serialized
  // single-parent so the import keeps every link.
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
  }

  // ── date-presence flip for the follow-up / retry gates ────────────────────
  // 430/436/501/505 carried missing-check polarity (True = still missing →
  // retry or dates-pending; False = recovered → cascade clone, wired just
  // above). With PRESENCE rows (both dates contain "-") the branches swap:
  // True = recovered; False = retry / dates-pending — and "", "null", or
  // whitespace in EITHER field can never masquerade as a captured date.
  for (const id of [430, 436, 501, 505]) {
    setConditionRows(nodes, id, [CHECK_IN_PRESENT, CHECK_OUT_PRESENT], { anyMatch: false });
    swapConditionOutputs(nodes, id);
  }

  // ── failed FINAL date retry: continue the intake with dates pending ───────
  // Behavior decision 2026-07-04: after the one follow-up + one retry the
  // flow STOPS asking about dates — no name question, no date-escalation
  // tail. The transitional Text (#438 / #504, rewritten in place) hands off
  // into its own guest-known/supported-count clone chain, the normal
  // Interactive intake continues, and the summary switches to the undated
  // variant whose secure link lets the guest pick dates on /book.
  const datesPendingBranches = [
    { from: 438, g: 758, s: 759 }, // both-dates path (436 True)
    { from: 504, g: 760, s: 761 }, // check-out path (505 True)
  ];
  for (const { from, g, s } of datesPendingBranches) {
    const [px, py] = nodes[String(from)].position;
    nodes[String(from)].data.textMessage = COPY.datesPendingContinue;
    disconnectOutput(nodes, from, "textOutput");
    cloneCondition(nodes, 440, g, [px + 260, py + 120]);
    cloneCondition(nodes, 602, s, [px + 520, py + 120]);
    connect(nodes, from, "textOutput", g, "conditionInput"); // sole connection — import keeps it
    connect(nodes, g, "conditionOutputFalse", s, "conditionInput"); // sole connection — import keeps it
  }

  // ── guest list stages (one per guest-unknown entry; Conditions keep ONE
  // inbound, so each entry owns its stage; the stages' rows converge on the
  // shared spine via postback convergence) ──────────────────────────────────
  const guestStages = [
    { base: 800, entry: { id: 440, outKey: "conditionOutputTrue" }, pos: [5200, -2200] },
    { base: 810, entry: { id: 750, outKey: "conditionOutputTrue" }, pos: [4700, -3000] },
    { base: 820, entry: { id: 752, outKey: "conditionOutputTrue" }, pos: [5200, -3300] },
    { base: 830, entry: { id: 754, outKey: "conditionOutputTrue" }, pos: [4200, 900] },
    { base: 840, entry: { id: 756, outKey: "conditionOutputTrue" }, pos: [4700, 1200] },
    { base: 900, entry: { id: 758, outKey: "conditionOutputTrue" }, pos: [5400, -2700] }, // dates pending A
    { base: 910, entry: { id: 760, outKey: "conditionOutputTrue" }, pos: [5400, 1500] }, // dates pending B
  ];
  for (const { base, entry, pos } of guestStages) {
    guestListStage(nodes, base, {
      stayTargetId: 860, stayTargetInput: "textInput",
      overflowTargetId: 865, overflowTargetInput: "textInput",
    }, pos);
    connect(nodes, entry.id, entry.outKey, base, "interactiveInput");
  }

  // ── bedroom stages (always asked — bedrooms are never extracted) ──────────
  // b0: after a clicked guest count (shared guest-ack); b1–b5: after an
  // extracted, supported guest count (one per supported-gate clone).
  const bedroomStages = [
    { base: 870, entry: { id: 860, outKey: "textOutput" }, pos: [6900, -1900] },
    { base: 875, entry: { id: 602, outKey: "conditionOutputTrue" }, pos: [6900, -2200] },
    { base: 880, entry: { id: 751, outKey: "conditionOutputTrue" }, pos: [6900, -2500] },
    { base: 885, entry: { id: 753, outKey: "conditionOutputTrue" }, pos: [6900, -2800] },
    { base: 890, entry: { id: 755, outKey: "conditionOutputTrue" }, pos: [6900, 900] },
    { base: 895, entry: { id: 757, outKey: "conditionOutputTrue" }, pos: [6900, 1200] },
    { base: 920, entry: { id: 759, outKey: "conditionOutputTrue" }, pos: [6900, -3100] }, // dates pending A
    { base: 925, entry: { id: 761, outKey: "conditionOutputTrue" }, pos: [6900, 1500] }, // dates pending B
  ];
  for (const { base, entry, pos } of bedroomStages) {
    bedroomStage(nodes, base, { ackTargetId: 930, ackTargetInput: "textInput" }, pos);
    connect(nodes, entry.id, entry.outKey, base, "interactiveInput");
  }

  // ── extracted unsupported counts (7, 8, 12, …): per-branch team review ────
  // We already hold the exact extracted number, so there is no exact-count
  // re-ask — a review message leads straight into a branch-local escalation
  // tail (name → Lead Submit → safe ending).
  const overflowBranches = [
    { from: 602, preface: 963, tail: [970, 971, 972, 973], label: "initial" },
    { from: 751, preface: 964, tail: [974, 975, 976, 977], label: "dates recovery A" },
    { from: 753, preface: 965, tail: [978, 979, 980, 981], label: "dates recovery B" },
    { from: 755, preface: 966, tail: [982, 983, 984, 985], label: "check-out recovery A" },
    { from: 757, preface: 967, tail: [986, 987, 988, 989], label: "check-out recovery B" },
    { from: 759, preface: 968, tail: [990, 991, 992, 993], label: "dates pending A" },
    { from: 761, preface: 969, tail: [994, 995, 996, 997], label: "dates pending B" },
  ];
  for (const { from, preface, tail, label } of overflowBranches) {
    const [px, py] = nodes[String(from)].position;
    textNode(nodes, preface, COPY.extractedOverflowPreface, [px + 260, py + 260]);
    connect(nodes, from, "conditionOutputFalse", preface, "textInput");
    escalationTail(nodes, tail, `Oraya v6 - Escalation: extracted large group (${label})`, [px + 520, py + 260]);
    connect(nodes, preface, "textOutput", tail[0], "userInputFlowInput");
  }

  // ── clicked-large-group escalation tail (existing outcome, preserved) ─────
  // The date-escalation tails (640–643 / 700–703) are GONE: a failed final
  // date retry continues the intake with dates pending instead of escalating.
  escalationTail(nodes, [712, 713, 714, 715], "Oraya v6 - Escalation: large group", [5760, -3600]);
  connect(nodes, 468, "textOutput", 712, "userInputFlowInput");

  // Start-node title and every inherited campaign label reflect the revision.
  nodes["1"].data.title = "Oraya Natural Stay Intake v6 - Start";
  for (const node of Object.values(nodes)) {
    if (typeof node.data?.campaignName === "string") {
      node.data.campaignName = node.data.campaignName.replace(/v5\.\d+/g, "v6");
    }
  }

  return flow;
}

// ─── generation gates ───────────────────────────────────────────────────────

// Postback convergence: the ONLY multi-parent input sockets allowed are those
// whose parents are ALL Inline Button / Rows nodes (operator evidence,
// 2026-07-04: editor-drawn button convergence into #610 persisted through
// save/close/reopen/export). Everything else is single-parent (round trip #1).
// The exact expected merge map is asserted so the artifact can never drift.
const APPROVED_POSTBACK_MERGES = {
  860: 42, // guest-ack ← 6 stay rows × 7 guest list stages
  865: 7,  // overflow-ack ← the 7 "More than 6" rows (round trip #4: direct
           //   Rows → User Input Flow #466 was dropped on import; the shared
           //   Text carries the single serialized edge into #466 instead)
  930: 24, // bedroom-ack ← 3 buttons × 8 bedroom stages
  938: 2,  // villa-ack ← both villa buttons
};

const POSTBACK_SOURCE_NAMES = new Set(["Inline Button", "Rows"]);

// Editor invariant (round trip #3, 2026-07-03): each destination Condition
// may carry at most ONE inbound connection TOTAL, regardless of source type.
const MAX_INBOUND_PER_CONDITION = 1;

// Approved control labels per field (the stored value IS the label).
const APPROVED_CONTROL_LABELS = {
  [FIELD.guestCount.name]: [...GUEST_STAY_CHOICES, GUEST_OVERFLOW_CHOICE],
  [FIELD.bedroom.name]: BEDROOM_CHOICES,
  [FIELD.villa.name]: VILLA_CHOICES,
};

function assertGraphContracts(flow) {
  const nodes = flow.nodes;
  const problems = [];

  // (a) convergence census: postback-only, exact approved map
  const merges = {};
  for (const [id, node] of Object.entries(nodes)) {
    for (const [inKey, inp] of Object.entries(node.inputs ?? {})) {
      const conns = inp.connections ?? [];
      if (conns.length <= 1) continue;
      merges[id] = conns.length;
      for (const c of conns) {
        const src = nodes[String(c.node)];
        if (!POSTBACK_SOURCE_NAMES.has(src?.name)) {
          problems.push(`input #${id}:${inKey} has ${conns.length} parents but #${c.node} is a ${src?.name} — only Inline Button / Rows convergence is evidence-approved; everything else must stay single-parent`);
        }
      }
    }
  }
  const expected = Object.fromEntries(Object.entries(APPROVED_POSTBACK_MERGES).map(([k, v]) => [String(k), v]));
  if (JSON.stringify(Object.fromEntries(Object.entries(merges).sort())) !== JSON.stringify(Object.fromEntries(Object.entries(expected).sort()))) {
    problems.push(`postback-merge census drift — graph ${JSON.stringify(merges)} vs approved ${JSON.stringify(expected)}`);
  }

  // (b) Conditions: one inbound TOTAL
  for (const [id, node] of Object.entries(nodes)) {
    if (node.name !== "Condition") continue;
    let inbound = 0;
    for (const inp of Object.values(node.inputs ?? {})) inbound += (inp.connections ?? []).length;
    if (inbound > MAX_INBOUND_PER_CONDITION) {
      problems.push(`Condition #${id} has ${inbound} inbound connections — the editor allows at most ${MAX_INBOUND_PER_CONDITION} of any type (round trip #3)`);
    }
  }

  // (c) interactive-control contract
  for (const [id, node] of Object.entries(nodes)) {
    if (node.name === "Interactive") {
      const def = node.outputs?.interactiveOutput?.connections ?? [];
      if (def.length) problems.push(`Interactive #${id} has ${def.length} default interactiveOutput connection(s) — a press would execute the next stage twice`);
      const btn = node.outputs?.interactiveOutputButton?.connections ?? [];
      const list = node.outputs?.interactiveOutputListMessage?.connections ?? [];
      if ((btn.length > 0) === (list.length > 0)) {
        problems.push(`Interactive #${id} must use exactly one control family (buttons XOR list) — has ${btn.length} buttons, ${list.length} list connections`);
      }
    }
    if (node.name === "Inline Button" || node.name === "Rows") {
      const d = node.data ?? {};
      if ("value" in d || "postback_text" in d) {
        problems.push(`${node.name} #${id} carries Start-a-Flow metadata (value/postback_text) — banned: a flow may never be started from an intake answer control`);
      }
      if (node.name === "Inline Button" && d.buttonType !== "new_post_back") {
        problems.push(`Inline Button #${id} buttonType "${d.buttonType}" — expected "new_post_back"`);
      }
      const fieldName = d.customFieldSelectedOptionText ?? "";
      const allowed = APPROVED_CONTROL_LABELS[fieldName];
      if (!allowed) {
        problems.push(`${node.name} #${id} is bound to unexpected field "${fieldName}"`);
      } else {
        const label = node.name === "Rows" ? d.title : d.buttonText;
        if (!allowed.includes(label)) {
          problems.push(`${node.name} #${id} label "${label}" is not an approved value for ${fieldName} [${allowed.join(", ")}]`);
        }
      }
      const fwdKey = node.name === "Rows" ? "rowOutput" : "buttonOutput";
      const fwd = node.outputs?.[fwdKey]?.connections ?? [];
      if (fwd.length !== 1) {
        problems.push(`${node.name} #${id} has ${fwd.length} forward connection(s) on ${fwdKey} — exactly one is required (one press = one field assignment = one transition)`);
      }
      const fwdTarget = fwd[0] ? nodes[String(fwd[0].node)] : null;
      if (fwdTarget?.name === "Condition") {
        problems.push(`${node.name} #${id} routes into Condition #${fwd[0].node} — Conditions accept one inbound TOTAL; route through a Text/wrapper instead`);
      }
      if (fwdTarget?.name === "User Input Flow" || fwdTarget?.name === "User Input Flow Single") {
        problems.push(`${node.name} #${id} routes into ${fwdTarget.name} #${fwd[0].node} — WhatChimp import DROPS serialized Rows/Inline Button → User Input Flow connections (round trip #4, 2026-07-04); route through a shared acknowledgement Text`);
      }
    }
  }

  if (problems.length) {
    throw new Error(`graph contract violation(s):\n  - ${problems.join("\n  - ")}`);
  }
}

// ─── post-import verification checklist (replaces the redraw checklist) ─────

function controlsOf(nodes, interactiveId) {
  const node = nodes[String(interactiveId)];
  const buttons = (node.outputs?.interactiveOutputButton?.connections ?? []).map((c) => nodes[String(c.node)]);
  const rows = [];
  for (const kb of (node.outputs?.interactiveOutputListMessage?.connections ?? []).map((c) => nodes[String(c.node)])) {
    for (const sec of (kb.outputs?.quickReplyOutput?.connections ?? []).map((c) => nodes[String(c.node)])) {
      for (const row of (sec.outputs?.sectionOutputRows?.connections ?? []).map((c) => nodes[String(c.node)])) rows.push(row);
    }
  }
  return [...buttons, ...rows];
}

function renderImportChecklist(flow, artifactSha256) {
  const nodes = flow.nodes;
  const lines = [];
  lines.push("# Oraya Natural Stay Intake v6 — post-import verification checklist (interactive candidate)");
  lines.push("");
  lines.push("**Machine-generated by `scripts/generate-whatchimp-v6.mjs` — do not edit by hand; it is regenerated with the artifact.**");
  lines.push("");
  lines.push(`**Applies to exactly:** \`Oraya_natural_intake_v6.txt\` with SHA-256 \`${artifactSha256}\`. If your file's hash differs, regenerate this checklist.`);
  lines.push("");
  lines.push("**There are ZERO connections to draw.** This candidate serializes convergence ONLY where every parent is an Inline Button / list Row AND the target is a Text (field-binding schema evidence: `roundtrips/Oraya_natural_intake_v6.button-evidence.saved-reexport.txt`). Round trip #4 (2026-07-04, fixture `roundtrips/Oraya_natural_intake_v6.roundtrip-4.saved-reexport.txt`) proved a fresh import PRESERVES serialized control → Text convergence at 30-way, 18-way, and 2-way fan-in but silently DROPS direct Rows → User Input Flow connections — which is why every \"More than 6\" row now routes through the shared acknowledgement Text before the large-group wrapper. **Inspect the five \"More than 6\" connectors explicitly** — they are the repaired class; if anything arrives loose, STOP and report; do not draw around it.");
  lines.push("");
  lines.push("## 1. Import verification (fresh disposable bot)");
  lines.push("");
  lines.push("- [ ] Import `Oraya_natural_intake_v6.txt` into a **fresh disposable test bot** — the import and the first open must show **no warning** (any \"infinite loop\" or similar message = stop and report).");
  lines.push("- [ ] Visually confirm **no loose connectors**: every Interactive's buttons/rows carry a forward line, the shared acknowledgement Texts receive all their inbound lines, and no node dangles.");
  lines.push("");
  lines.push("## 2. Click-through — every control writes its exact value and advances exactly once");
  lines.push("");
  lines.push("For each control below: tap it in a test conversation, then open the subscriber's custom fields and confirm the stated field holds the EXACT stated value (the stored value must equal the visible label — the export schema carries no separate value field, so this is the platform behavior being verified). Each press must advance the conversation exactly once (no duplicate next message, no restart of the intake flow).");
  lines.push("");
  const interactives = Object.entries(nodes).filter(([, n]) => n.name === "Interactive");
  for (const [id, n] of interactives) {
    lines.push(`### Interactive \`#${id}\` — "${(n.data?.textMessage ?? "").toString().replace(/\s+/g, " ").slice(0, 70)}"`);
    for (const control of controlsOf(nodes, id)) {
      const d = control.data ?? {};
      const label = control.name === "Rows" ? d.title : d.buttonText;
      const fwd = control.name === "Rows" ? control.outputs?.rowOutput?.connections?.[0] : control.outputs?.buttonOutput?.connections?.[0];
      const dst = fwd ? nodes[String(fwd.node)] : null;
      lines.push(`- [ ] \`#${control.id}\` ${control.name} **"${label}"** → writes \`${d.customFieldSelectedOptionText}\` (\`${d.customFieldId}\`) = \`${label}\`; advances once into #${fwd?.node} ${dst?.name ?? "?"}.`);
    }
    lines.push("");
  }
  lines.push("## 3. Persistence + export verification");
  lines.push("");
  lines.push("- [ ] Save → close the editor completely → reopen: every connection from steps 1–2 must still be present; re-click at least one control per Interactive.");
  lines.push("- [ ] Export the flow and verify mechanically (both must succeed):");
  lines.push("");
  lines.push("```");
  lines.push("node scripts/compare-whatchimp-roundtrip.mjs Oraya_natural_intake_v6.txt <re-export>   # must print PRESERVED, exit 0");
  lines.push("node scripts/validate-whatchimp-flow.mjs <re-export> --strict-binding                  # must report 0 errors, exit 0");
  lines.push("```");
  lines.push("");
  lines.push("- [ ] Run one complete conversation to the final summary and confirm the saved lead (dates, guests, bedrooms, villa) in `/admin/leads` + Supabase `whatsapp_leads.raw_payload`.");
  lines.push("");
  lines.push("If ANY control is refused, mis-writes its field, double-advances, restarts the flow, or loses its line after save/reopen — **stop and report immediately**; that is new platform evidence. Do not insert nodes or draw around it. Production stays untouched.");
  lines.push("");
  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const [input, output, checklistOut] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: node scripts/generate-whatchimp-v6.mjs <v5.5-input> <v6-output> [<import-checklist.md>]");
    process.exit(2);
  }
  const flow = JSON.parse(readFileSync(input, "utf8"));
  const v6 = generateV6(flow);
  // Operator-preferred visual layout (the 2026-07-04 hand-tuned export,
  // pinned at roundtrips/Oraya_natural_intake_v6.roundtrip-5.layout-baseline.txt):
  // every node present in the committed layout map adopts that position.
  // Positions are cosmetic — logic, bindings, and edges come from this
  // generator alone; nodes absent from the map keep their computed position.
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const layout = JSON.parse(readFileSync(path.join(scriptDir, "whatchimp", "v6-layout.json"), "utf8"));
  for (const [id, position] of Object.entries(layout)) {
    if (v6.nodes[id]) v6.nodes[id].position = position;
  }
  assertGraphContracts(v6);
  const serialized = JSON.stringify(v6);
  writeFileSync(output, serialized, "utf8");
  const sha = createHash("sha256").update(serialized, "utf8").digest("hex").toUpperCase();
  if (checklistOut) {
    writeFileSync(checklistOut, renderImportChecklist(v6, sha), "utf8");
  }
  const nodeCount = Object.keys(v6.nodes).length;
  let edges = 0;
  let interactives = 0;
  let controls = 0;
  for (const n of Object.values(v6.nodes)) {
    if (n.name === "Interactive") interactives += 1;
    if (n.name === "Inline Button" || n.name === "Rows") controls += 1;
    for (const o of Object.values(n.outputs ?? {})) edges += (o.connections ?? []).length;
  }
  console.log(`wrote ${output}: ${nodeCount} nodes, ${edges} output connections, ${interactives} Interactive, ${controls} buttons/rows, 0 operator redraws${checklistOut ? `, checklist ${checklistOut}` : ""}`);
  console.log(`artifact sha256: ${sha}`);
}

main();
