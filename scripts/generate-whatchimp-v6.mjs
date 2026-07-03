#!/usr/bin/env node
/**
 * Phase 16A — deterministic generator for the Oraya Natural Stay Intake v6
 * WhatChimp flow. Reads the operator's v5.5 export (byte-preserved input
 * artifact) and applies the approved Phase 16A repairs:
 *
 *   1. Condition hygiene — removes blank comparison values and duplicated
 *      identical rows; every missing-field check is `field equal "null"`
 *      (the literal string the stale-field-safe `extracted_text.*` response
 *      mapping writes on every normalization call).
 *   2. Guest path — replaces the nested 1-3 / 4-6 / 7+ range structure with
 *      one exact-count question (1–8 + "More than 8"), mirroring the
 *      website's supported sleeping-guests range (min 1 / max 8).
 *   3. Bedroom path — new three-button bedroom question saved to
 *      oraya_bedroom_count (real WhatChimp field id 69114, operator-created;
 *      question nodes carry customField "69114", condition rows
 *      "custom_69114"), validated with the website's BEDROOM_CAPACITY rules
 *      (1→2, 2→4, 3→6; 7–8 guests need 3 bedrooms + extra bedding), one
 *      forward-cloned retry, then escalation.
 *   4. Villa / guest branches converge into confirmation; no "Got it."
 *      dead-ends remain.
 *   5. Complete human escalation — every escalation message flows into a
 *      shared name-capture → Lead Submit (API 6961) → safe final message.
 *   6. Complete Edit path — Edit re-captures oraya_stay_text (real field id),
 *      re-calls API 7466 as a fresh attempt, re-validates via forward-cloned
 *      date / guest / bedroom / villa steps, returns to a cloned
 *      confirmation, and either proceeds to the existing handoff choice
 *      (node 70) or escalates on a second Edit.
 *   7. Export-proven question transitions ONLY — in all 22 genuine WhatChimp
 *      exports surveyed (the operator's v5.5 + 21 platform-named exports;
 *      exact filenames, hashes, and per-file transition censuses in
 *      artifacts/whatchimp/V6_TRANSITION_EVIDENCE.md), a question's
 *      final-reply output feeds a Text or HTTP API node, never a
 *      Condition or a User Input Flow wrapper. Direct Question → Condition /
 *      Question → User Input Flow edges were operator-observed rendering as
 *      loose/disconnected lines after import (2026-07-03). Every such edge
 *      is therefore built as Question → acknowledgement Text → next node —
 *      the same device the operator's own v5.5 uses (#491 → #492 "Got it."
 *      → #493). Enforced by the validator's question-transition check.
 *
 * Usage:
 *   node scripts/generate-whatchimp-v6.mjs <v5.5-input> <v6-output>
 *
 * Node standard library only. Deterministic output (stable ids, stable
 * ordering) so re-runs produce identical bytes.
 */

import { readFileSync, writeFileSync } from "node:fs";

// Real WhatChimp custom-field id for oraya_bedroom_count, created by the
// operator and confirmed 2026-07-03. The generated artifact is fully bound —
// no placeholder remains and no second binding step is required.
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
  // No-dead-end invariant: every terminal must hand the guest an actionable
  // booking continuation — the secure prefill link when the Lead Submit
  // response mapping populated it, and ALWAYS the canonical fallback
  // https://stayoraya.com/book — plus an accurate not-confirmed status.
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
  // Acknowledgement texts inserted between a question and its Condition /
  // wrapper successor — the only question continuations genuine WhatChimp
  // exports contain are Question → Text and Question → HTTP API (the
  // operator's v5.5 uses the same device: #491 → #492 "Got it." → #493).
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

function removeNode(nodes, id) {
  const node = nodes[String(id)];
  if (!node) throw new Error(`removeNode: missing node ${id}`);
  const scrub = (neighborId, side, key) => {
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

function questionNode(nodes, id, { question, field, choices = null, assignToLabels = null }, position) {
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
    ...(assignToLabels ? { assignToLabels: assignToLabels.ids, assignToLabelsSelectedOptionsTextArray: assignToLabels.texts } : {}),
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

// bedroom-capacity validation subtree (website BEDROOM_CAPACITY: 1→2, 2→4, 3→6).
// Wires: ok → okTargetId(+okInKey), mismatch → mismatchTextId (created by caller).
function bedroomValidation(nodes, baseId, { okTarget, mismatchTarget }, pos) {
  const [b3, g12, b2, g34] = [baseId, baseId + 1, baseId + 2, baseId + 3];
  conditionNode(nodes, b3, [{ field: FIELD.bedroom, value: "3 bedrooms" }], [pos[0], pos[1]]);
  conditionNode(nodes, g12, [
    { field: FIELD.guestCount, value: "1" },
    { field: FIELD.guestCount, value: "2" },
  ], [pos[0] + 260, pos[1]]);
  conditionNode(nodes, b2, [{ field: FIELD.bedroom, value: "2 bedrooms" }], [pos[0] + 520, pos[1]]);
  conditionNode(nodes, g34, [
    { field: FIELD.guestCount, value: "3" },
    { field: FIELD.guestCount, value: "4" },
  ], [pos[0] + 780, pos[1]]);
  connect(nodes, b3, "conditionOutputTrue", okTarget.id, okTarget.inKey);
  connect(nodes, b3, "conditionOutputFalse", g12, "conditionInput");
  connect(nodes, g12, "conditionOutputTrue", okTarget.id, okTarget.inKey);
  connect(nodes, g12, "conditionOutputFalse", b2, "conditionInput");
  connect(nodes, b2, "conditionOutputTrue", g34, "conditionInput");
  connect(nodes, b2, "conditionOutputFalse", mismatchTarget.id, mismatchTarget.inKey);
  connect(nodes, g34, "conditionOutputTrue", okTarget.id, okTarget.inKey);
  connect(nodes, g34, "conditionOutputFalse", mismatchTarget.id, mismatchTarget.inKey);
  return b3;
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
  // canonical booking URL BEFORE the first HTTP API call can fire, so even
  // if the WhatChimp runtime halts on an HTTP failure (unverified platform
  // behavior), the guest already holds an actionable booking continuation.
  nodes["400"].data.question =
    nodes["400"].data.question +
    "\n\n(You can also complete your booking online at any time: https://stayoraya.com/book)";

  // 4. Confirmation shows exact overnight guests + bedrooms.
  nodes["491"].data.question = COPY.confirmation;

  // ── primary guest path: one exact-count question ──────────────────────────
  wrapperNode(nodes, 600, "Oraya v6 - Guests", [5200, -1900]);
  questionNode(nodes, 601, { question: COPY.guestQuestion, field: FIELD.guestCount, choices: GUEST_CHOICES }, [5460, -1900]);
  conditionNode(nodes, 602, GUEST_CHOICES.slice(0, 8).map((v) => ({ field: FIELD.guestCount, value: v })), [5720, -1900]);

  disconnectOutput(nodes, 440, "conditionOutputTrue"); // was → removed range Interactive
  disconnectOutput(nodes, 440, "conditionOutputFalse"); // was → villa gate; guests-known path must still pass bedroom selection
  connect(nodes, 440, "conditionOutputTrue", 600, "userInputFlowInput");
  connect(nodes, 440, "conditionOutputFalse", 602, "conditionInput");
  connect(nodes, 600, "userInputFlowOutput", 601, "userInputFlowSingleInput");
  textNode(nodes, 603, COPY.guestAck, [5590, -1900]); // Question → Text → Condition (export-proven)
  connect(nodes, 601, "userInputFlowSingleOutputFinalReply", 603, "textInput");
  connect(nodes, 603, "textOutput", 602, "conditionInput");

  // ── primary bedroom path (always asked; never condition-skipped) ──────────
  wrapperNode(nodes, 610, "Oraya v6 - Bedrooms", [5200, -1600]);
  questionNode(nodes, 611, { question: COPY.bedroomQuestion, field: FIELD.bedroom, choices: BEDROOM_CHOICES }, [5460, -1600]);
  textNode(nodes, 616, COPY.bedroomMismatch, [6760, -1600]);
  wrapperNode(nodes, 617, "Oraya v6 - Bedrooms retry", [5200, -1300]);
  questionNode(nodes, 618, { question: COPY.bedroomQuestion, field: FIELD.bedroom, choices: BEDROOM_CHOICES }, [5460, -1300]);
  textNode(nodes, 623, COPY.bedroomEscalation, [6760, -1300]);

  connect(nodes, 602, "conditionOutputTrue", 610, "userInputFlowInput");
  connect(nodes, 602, "conditionOutputFalse", 466, "userInputFlowInput"); // large group: exact count → team review
  connect(nodes, 610, "userInputFlowOutput", 611, "userInputFlowSingleInput");
  connect(nodes, 616, "textOutput", 617, "userInputFlowInput");
  connect(nodes, 617, "userInputFlowOutput", 618, "userInputFlowSingleInput");

  const primaryValidation = bedroomValidation(nodes, 612, {
    okTarget: { id: 470, inKey: "conditionInput" },
    mismatchTarget: { id: 616, inKey: "textInput" },
  }, [5720, -1600]);
  textNode(nodes, 624, COPY.bedroomAck, [5590, -1600]); // Question → Text → Condition (export-proven)
  connect(nodes, 611, "userInputFlowSingleOutputFinalReply", 624, "textInput");
  connect(nodes, 624, "textOutput", primaryValidation, "conditionInput");
  const retryValidation = bedroomValidation(nodes, 619, {
    okTarget: { id: 470, inKey: "conditionInput" },
    mismatchTarget: { id: 623, inKey: "textInput" },
  }, [5720, -1300]);
  textNode(nodes, 625, COPY.bedroomAck, [5590, -1300]); // Question → Text → Condition (export-proven)
  connect(nodes, 618, "userInputFlowSingleOutputFinalReply", 625, "textInput");
  connect(nodes, 625, "textOutput", retryValidation, "conditionInput");

  // ── villa converges into confirmation ─────────────────────────────────────
  textNode(nodes, 604, COPY.villaAck, [7190, -1750]); // Question → Text → wrapper (export-proven)
  connect(nodes, 481, "userInputFlowSingleOutputFinalReply", 604, "textInput");
  connect(nodes, 604, "textOutput", 490, "userInputFlowInput");

  // ── shared human-escalation tail: name → Lead Submit → safe final ─────────
  wrapperNode(nodes, 640, "Oraya v6 - Escalation", [7300, -900]);
  questionNode(nodes, 641, { question: COPY.escalationName, field: FIELD.fullName }, [7560, -900]);
  apiNode(nodes, 642, API.leadSubmit, [7820, -900]);
  textNode(nodes, 643, COPY.escalationFinal + COPY.continuationBlock, [8080, -900]);
  connect(nodes, 640, "userInputFlowOutput", 641, "userInputFlowSingleInput");
  connect(nodes, 641, "userInputFlowSingleOutputFinalReply", 642, "httpApiInput");
  connect(nodes, 642, "httpApiOutput", 643, "textInput");

  // previously dead-end escalation messages now reach the complete tail
  connect(nodes, 438, "textOutput", 640, "userInputFlowInput");
  connect(nodes, 504, "textOutput", 640, "userInputFlowInput");
  connect(nodes, 468, "textOutput", 640, "userInputFlowInput");
  connect(nodes, 623, "textOutput", 640, "userInputFlowInput");

  // ── Edit path: fresh attempt → forward-cloned re-validation ───────────────
  // 498 (API 7466) previously dead-ended.
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

  connect(nodes, 498, "httpApiOutput", 650, "conditionInput");
  connect(nodes, 650, "conditionOutputTrue", 651, "userInputFlowInput");
  connect(nodes, 650, "conditionOutputFalse", 656, "conditionInput");
  connect(nodes, 651, "userInputFlowOutput", 652, "userInputFlowSingleInput");
  connect(nodes, 652, "userInputFlowSingleOutputFinalReply", 653, "httpApiInput");
  connect(nodes, 653, "httpApiOutput", 654, "conditionInput");
  connect(nodes, 654, "conditionOutputTrue", 655, "textInput");
  connect(nodes, 655, "textOutput", 640, "userInputFlowInput");
  connect(nodes, 656, "conditionOutputTrue", 657, "userInputFlowInput");
  connect(nodes, 657, "userInputFlowOutput", 658, "userInputFlowSingleInput");
  connect(nodes, 658, "userInputFlowSingleOutputFinalReply", 659, "httpApiInput");
  connect(nodes, 659, "httpApiOutput", 654, "conditionInput");

  // guests (Edit)
  conditionNode(nodes, 660, [{ field: FIELD.guestCount, value: "null" }], [3760, -400]);
  wrapperNode(nodes, 661, "Oraya v6 Edit - Guests", [4020, -520]);
  questionNode(nodes, 662, { question: COPY.guestQuestion, field: FIELD.guestCount, choices: GUEST_CHOICES }, [4280, -520]);
  conditionNode(nodes, 663, GUEST_CHOICES.slice(0, 8).map((v) => ({ field: FIELD.guestCount, value: v })), [4540, -400]);
  connect(nodes, 654, "conditionOutputFalse", 660, "conditionInput");
  connect(nodes, 656, "conditionOutputFalse", 660, "conditionInput");
  connect(nodes, 660, "conditionOutputTrue", 661, "userInputFlowInput");
  connect(nodes, 660, "conditionOutputFalse", 663, "conditionInput");
  connect(nodes, 661, "userInputFlowOutput", 662, "userInputFlowSingleInput");
  textNode(nodes, 664, COPY.guestAck, [4410, -520]); // Question → Text → Condition (export-proven)
  connect(nodes, 662, "userInputFlowSingleOutputFinalReply", 664, "textInput");
  connect(nodes, 664, "textOutput", 663, "conditionInput");
  connect(nodes, 663, "conditionOutputFalse", 466, "userInputFlowInput"); // shared large-group review

  // bedrooms (Edit) — same always-ask + capacity validation + one retry
  wrapperNode(nodes, 670, "Oraya v6 Edit - Bedrooms", [4800, -520]);
  questionNode(nodes, 671, { question: COPY.bedroomQuestion, field: FIELD.bedroom, choices: BEDROOM_CHOICES }, [5060, -520]);
  textNode(nodes, 676, COPY.bedroomMismatch, [6280, -520]);
  wrapperNode(nodes, 677, "Oraya v6 Edit - Bedrooms retry", [4800, -160]);
  questionNode(nodes, 678, { question: COPY.bedroomQuestion, field: FIELD.bedroom, choices: BEDROOM_CHOICES }, [5060, -160]);
  textNode(nodes, 683, COPY.bedroomEscalation, [6280, -160]);
  connect(nodes, 663, "conditionOutputTrue", 670, "userInputFlowInput");
  connect(nodes, 670, "userInputFlowOutput", 671, "userInputFlowSingleInput");
  connect(nodes, 676, "textOutput", 677, "userInputFlowInput");
  connect(nodes, 677, "userInputFlowOutput", 678, "userInputFlowSingleInput");
  connect(nodes, 683, "textOutput", 640, "userInputFlowInput");

  // villa + confirmation (Edit)
  conditionNode(nodes, 690, [{ field: FIELD.villa, value: "null" }], [6540, -400]);
  wrapperNode(nodes, 691, "Oraya v6 Edit - Villa", [6800, -520]);
  questionNode(nodes, 692, { question: COPY.villaQuestion, field: FIELD.villa, choices: ["Villa Mechmech", "Villa Byblos"] }, [7060, -520]);
  wrapperNode(nodes, 694, "Oraya v6 Edit - Confirm", [7320, -400]);
  questionNode(nodes, 695, { question: COPY.confirmation, field: FIELD.confirm, choices: ["Looks right", "Edit"] }, [7580, -400]);
  conditionNode(nodes, 696, [{ field: FIELD.confirm, op: "contains", value: "Looks right" }], [7840, -400]);
  wrapperNode(nodes, 697, "Oraya v6 Edit - Continue to handoff", [8100, -520]);
  textNode(nodes, 698, COPY.secondEditEscalation, [8100, -280]);

  const editBedroomOk = bedroomValidation(nodes, 672, {
    okTarget: { id: 690, inKey: "conditionInput" },
    mismatchTarget: { id: 676, inKey: "textInput" },
  }, [5320, -520]);
  textNode(nodes, 684, COPY.bedroomAck, [5190, -520]); // Question → Text → Condition (export-proven)
  connect(nodes, 671, "userInputFlowSingleOutputFinalReply", 684, "textInput");
  connect(nodes, 684, "textOutput", editBedroomOk, "conditionInput");
  const editBedroomRetryOk = bedroomValidation(nodes, 679, {
    okTarget: { id: 690, inKey: "conditionInput" },
    mismatchTarget: { id: 683, inKey: "textInput" },
  }, [5320, -160]);
  textNode(nodes, 685, COPY.bedroomAck, [5190, -160]); // Question → Text → Condition (export-proven)
  connect(nodes, 678, "userInputFlowSingleOutputFinalReply", 685, "textInput");
  connect(nodes, 685, "textOutput", editBedroomRetryOk, "conditionInput");

  connect(nodes, 690, "conditionOutputTrue", 691, "userInputFlowInput");
  connect(nodes, 690, "conditionOutputFalse", 694, "userInputFlowInput");
  connect(nodes, 691, "userInputFlowOutput", 692, "userInputFlowSingleInput");
  textNode(nodes, 693, COPY.villaAck, [7190, -520]); // Question → Text → wrapper (export-proven)
  connect(nodes, 692, "userInputFlowSingleOutputFinalReply", 693, "textInput");
  connect(nodes, 693, "textOutput", 694, "userInputFlowInput");
  connect(nodes, 694, "userInputFlowOutput", 695, "userInputFlowSingleInput");
  textNode(nodes, 699, COPY.confirmAck, [7710, -400]); // Question → Text → Condition (mirrors v5.5's #491→#492→#493)
  connect(nodes, 695, "userInputFlowSingleOutputFinalReply", 699, "textInput");
  connect(nodes, 699, "textOutput", 696, "conditionInput");
  connect(nodes, 696, "conditionOutputTrue", 697, "userInputFlowInput");
  connect(nodes, 696, "conditionOutputFalse", 698, "textInput");
  connect(nodes, 697, "userInputFlowOutput", 70, "userInputFlowSingleInput");
  connect(nodes, 698, "textOutput", 640, "userInputFlowInput");

  // No-dead-end invariant on the inherited WhatsApp-continuation terminal:
  // the v5.5 lead acknowledgement (#7) ended with team-follow-up wording
  // only. Append the same actionable continuation block the website-handoff
  // terminal already carries, so a guest is never stranded even if the
  // Lead Submit call failed or the team is slow to respond.
  nodes["7"].data.textMessage = nodes["7"].data.textMessage + COPY.continuationBlock;

  // Start-node title and every inherited campaign label reflect the new
  // revision — a re-imported flow must not advertise itself as v5.5.
  // (campaignName is a display label on "User Input Flow" wrappers with
  // userInputFlowIdValue "new"; renaming it has no binding side effects.)
  nodes["1"].data.title = "Oraya Natural Stay Intake v6 - Start";
  for (const node of Object.values(nodes)) {
    if (typeof node.data?.campaignName === "string") {
      node.data.campaignName = node.data.campaignName.replace(/v5\.\d+/g, "v6");
    }
  }

  return flow;
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: node scripts/generate-whatchimp-v6.mjs <v5.5-input> <v6-output>");
    process.exit(2);
  }
  const flow = JSON.parse(readFileSync(input, "utf8"));
  const v6 = generateV6(flow);
  writeFileSync(output, JSON.stringify(v6), "utf8");
  const nodeCount = Object.keys(v6.nodes).length;
  let edges = 0;
  for (const n of Object.values(v6.nodes)) {
    for (const o of Object.values(n.outputs ?? {})) edges += (o.connections ?? []).length;
  }
  console.log(`wrote ${output}: ${nodeCount} nodes, ${edges} output connections`);
}

main();
