#!/usr/bin/env node
/**
 * Phase 16A — deterministic conversation simulator for the Oraya Natural Stay
 * Intake WhatChimp flow. Abstract-interprets the exported graph against
 * scripted guest answers and stubbed HTTP-API fixture responses — it NEVER
 * calls production Butler endpoints and requires no secrets.
 *
 * Usage:
 *   node scripts/simulate-whatchimp-flow.mjs <flow-file> [--profile <profile.json>]
 *
 * Models: custom-field state (including stale values from abandoned
 * attempts), question answers, quick-reply choices, HTTP-API fixture
 * responses applied through the documented response→field mappings
 * (`extracted_text.*` writes the literal string "null" for missing fields —
 * the current-attempt mechanism that prevents stale-field leakage),
 * condition evaluation, visited nodes, and terminal outcomes.
 *
 * Every scenario additionally auto-asserts the two global invariants:
 *   - the conversation terminates on a guest-safe approved Text message
 *     (never on an API node, condition node, question wrapper, or "Got it.");
 *   - the step budget is not exhausted (no runaway loops).
 *
 * VERIFICATION-LEVEL CONTRACT — what a passing scenario does and does not
 * prove (see artifacts/whatchimp/V6_DEPENDENCIES.md "Payload-persistence
 * contract"):
 *   1. custom field captured  — modeled here (field state assertions);
 *   2. API submission occurred — modeled here (the Lead Submit NODE fired);
 *   3. exact field included in the external API request body — NOT modeled:
 *      WhatChimp request bodies live outside the flow export, so e.g.
 *      `oraya_guest_followup` reaching `whatsapp_leads.raw_payload` requires
 *      the authenticated operator body edit plus the Supabase verification
 *      in the round-trip checklist. This simulator never claims level 3.
 *
 * Exit code 0 when all scenarios pass; 1 otherwise.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ─── engine ─────────────────────────────────────────────────────────────────

const MAX_STEPS = 300;

function outConnections(node, key) {
  return node.outputs?.[key]?.connections ?? [];
}

function firstOut(node) {
  for (const out of Object.values(node.outputs ?? {})) {
    if ((out.connections ?? []).length) return out.connections[0];
  }
  return null;
}

export function interpolate(text, fields) {
  return String(text).replace(/#([A-Za-z0-9_]+)#/g, (_, name) => fields.get(name) ?? "");
}

export function evalCondition(data, fields) {
  const rows = (data.custom_field_variable_selected_texts ?? []).map((name, i) => ({
    name,
    op: (data.custom_field_operator ?? [])[i],
    value: (data.custom_field_variable_value ?? [])[i],
  }));
  const results = rows.map((row) => {
    const actual = fields.get(row.name) ?? "";
    if (row.op === "equal") return actual === row.value;
    if (row.op === "contains") return actual.toLowerCase().includes(String(row.value).toLowerCase());
    throw new Error(`unsupported condition operator "${row.op}"`);
  });
  return data.any_match ? results.some(Boolean) : results.every(Boolean);
}

export function runScenario(flow, profile, scenario) {
  const nodes = flow.nodes;
  const failures = [];
  const fail = (msg) => failures.push(msg);

  const fields = new Map(Object.entries(scenario.staleFields ?? {}));
  const inputs = [...(scenario.inputs ?? [])];
  const fixtures = [...(scenario.fixtures ?? [])];
  const asked = [];
  const messages = [];
  const apiCalls = [];
  let leadSubmits = 0;

  const startId = Object.keys(nodes).find((id) => nodes[id].name === "Start Bot Flow");
  if (!startId) return { failures: ["no Start Bot Flow node"], asked, messages, fields, leadSubmits };

  let current = String(startId);
  let terminalText = null;
  let terminalNodeName = null;
  let steps = 0;

  while (current) {
    if (++steps > MAX_STEPS) {
      fail(`step budget exhausted at node #${current} (possible loop)`);
      break;
    }
    const node = nodes[current];
    if (!node) {
      fail(`walked onto missing node #${current}`);
      break;
    }
    const name = node.name;

    if (name === "Start Bot Flow" || name === "User Input Flow") {
      const next = firstOut(node);
      if (!next) { terminalNodeName = name; break; }
      current = String(next.node);
      continue;
    }

    if (name === "Text") {
      const text = interpolate(node.data?.textMessage ?? "", fields);
      messages.push(text);
      const next = firstOut(node);
      if (!next) {
        terminalText = text;
        terminalNodeName = name;
        break;
      }
      current = String(next.node);
      continue;
    }

    if (name === "User Input Flow Single") {
      const question = interpolate(node.data?.question ?? "", fields);
      asked.push(question);
      const input = inputs.shift();
      if (!input) {
        fail(`ran out of scripted answers at question "${question.slice(0, 80)}"`);
        break;
      }
      if (input.expect && !question.toLowerCase().includes(input.expect.toLowerCase())) {
        fail(`expected question containing "${input.expect}" but got "${question.slice(0, 120)}"`);
      }
      if (input.expectChoicesInclude) {
        const choices = node.data?.multipleChoices ?? [];
        for (const c of input.expectChoicesInclude) {
          if (!choices.includes(c)) fail(`question "${question.slice(0, 60)}" is missing expected choice "${c}" (has: ${choices.join(", ")})`);
        }
      }
      const fieldName = (node.data?.customFieldSelectedOptionText ?? "").trim();
      if (fieldName && fieldName !== "Please select") fields.set(fieldName, input.answer);
      const next = firstOut(node);
      if (!next) { terminalNodeName = name; terminalText = null; break; }
      current = String(next.node);
      continue;
    }

    if (name === "Condition") {
      let branch;
      try {
        branch = evalCondition(node.data ?? {}, fields) ? "conditionOutputTrue" : "conditionOutputFalse";
      } catch (e) {
        fail(`condition #${current}: ${e.message}`);
        break;
      }
      const conns = outConnections(node, branch);
      if (!conns.length) {
        fail(`condition #${current} has no destination on ${branch}`);
        terminalNodeName = name;
        break;
      }
      current = String(conns[0].node);
      continue;
    }

    if (name === "HTTP API") {
      const apiId = node.data?.httpApiId ?? "";
      apiCalls.push(apiId);
      const fixture = fixtures.shift();
      if (!fixture) {
        fail(`ran out of API fixtures at HTTP API #${current} (api ${apiId})`);
        break;
      }
      if (fixture.api !== apiId) {
        fail(`fixture order mismatch: expected api ${fixture.api}, flow called ${apiId} at node #${current}`);
      }
      if (profile.apis.leadSubmit.ids.includes(apiId)) leadSubmits += 1;
      const mapping = profile.apiFieldWrites?.[apiId] ?? {};
      for (const [respKey, fieldName] of Object.entries(mapping)) {
        if (respKey in (fixture.response ?? {})) {
          fields.set(fieldName, String(fixture.response[respKey]));
        } else if (apiId === profile.apis.initialNormalize.id || apiId === profile.apis.refine.id) {
          fail(`fixture for api ${apiId} is missing "${respKey}" — extracted_text fixtures must carry every mapped key (use "null" for missing)`);
        }
      }
      const next = firstOut(node);
      if (!next) { terminalNodeName = name; break; }
      current = String(next.node);
      continue;
    }

    if (name === "Interactive") {
      messages.push(interpolate(node.data?.textMessage ?? "", fields));
      const input = inputs.shift();
      if (!input) { fail(`ran out of scripted answers at interactive #${current}`); break; }
      const buttons = outConnections(node, "interactiveOutputButton")
        .map((c) => nodes[String(c.node)])
        .filter(Boolean);
      const chosen = buttons.find((b) => (b.data?.buttonText ?? "") === input.answer);
      if (!chosen) {
        fail(`interactive #${current} has no button "${input.answer}" (has: ${buttons.map((b) => b.data?.buttonText).join(", ")})`);
        break;
      }
      const next = firstOut(chosen);
      if (!next) { fail(`button "${input.answer}" has no destination`); break; }
      current = String(next.node);
      continue;
    }

    fail(`unsupported node type "${name}" at #${current}`);
    break;
  }

  // global invariants (scenarios 29 & 30 of the required list)
  if (terminalNodeName !== "Text") {
    fail(`conversation ended on a ${terminalNodeName ?? "missing"} node — must end on an approved guest-facing Text message`);
  } else {
    const approved = (profile.approvedTerminalSnippets ?? []).some((s) => (terminalText ?? "").includes(s));
    if (!approved) fail(`terminal message is not approved: "${(terminalText ?? "").slice(0, 120)}"`);
    if ((terminalText ?? "").trim() === "Got it.") fail(`terminal is a dead-end "Got it." acknowledgement`);
  }

  // scenario expectations
  const ex = scenario.expect ?? {};
  if (ex.terminalIncludes) {
    for (const s of [].concat(ex.terminalIncludes)) {
      if (!(terminalText ?? "").includes(s)) fail(`terminal message missing "${s}" (got: "${(terminalText ?? "").slice(0, 140)}")`);
    }
  }
  if (ex.leadSubmitted === true && leadSubmits < 1) fail("expected a lead submission, none happened");
  if (ex.leadSubmitted === false && leadSubmits > 0) fail(`expected no lead submission, got ${leadSubmits}`);
  for (const s of ex.askedIncludes ?? []) {
    if (!asked.some((q) => q.toLowerCase().includes(s.toLowerCase()))) fail(`expected a question containing "${s}" to be asked`);
  }
  for (const s of ex.askedExcludes ?? []) {
    if (asked.some((q) => q.toLowerCase().includes(s.toLowerCase()))) fail(`question containing "${s}" must NOT be asked in this scenario`);
  }
  for (const s of ex.messagesInclude ?? []) {
    if (!messages.some((m) => m.toLowerCase().includes(s.toLowerCase()))) fail(`expected a bot message containing "${s}"`);
  }
  for (const [fieldName, value] of Object.entries(ex.fieldEquals ?? {})) {
    if ((fields.get(fieldName) ?? "") !== value) fail(`field ${fieldName} = "${fields.get(fieldName) ?? ""}", expected "${value}"`);
  }
  if (inputs.length) fail(`${inputs.length} scripted answer(s) were never consumed`);
  if (fixtures.length) fail(`${fixtures.length} API fixture(s) were never consumed`);

  return { failures, asked, messages, fields, leadSubmits, terminalText, apiCalls };
}

// ─── fixtures / scenario helpers ────────────────────────────────────────────

/** extracted_text-style normalization fixture: every key present, "null" when missing. */
const norm = (checkIn, checkOut, villa, guests) => ({
  check_in: checkIn ?? "null",
  check_out: checkOut ?? "null",
  villa: villa ?? "null",
  guest_count: guests ?? "null",
});

const stay = (answer) => ({ expect: "tell me what you already know", answer });
const bedroom = (answer) => ({ expect: "How many bedrooms would you like", answer });
const guests = (answer) => ({ expect: "How many guests will be staying overnight", answer });
const confirmYes = { expect: "Does this look right", answer: "Looks right" };
const confirmEdit = { expect: "Does this look right", answer: "Edit" };
const whatsappTail = [
  { expect: "How would you like to continue", answer: "Continue on WhatsApp" },
  { expect: "full name", answer: "David Guest" },
];
const escName = { expect: "full name", answer: "David Guest" };
const NOT_CONFIRMED = "not confirmed yet";
const ESC_TERMINAL = ["passed your request to the Oraya team", "not a confirmed booking yet"];

const STALE_ALL = {
  oraya_check_in: "2026-07-10",
  oraya_check_out: "2026-07-11",
  oraya_villa: "Villa Mechmech",
  oraya_guest_count: "3",
  oraya_bedroom_count: "3 bedrooms",
  oraya_stay_followup: "july 10 to july 11",
  oraya_dates_confirmed_text: "Looks right",
};

// ─── the 30 required scenarios ──────────────────────────────────────────────

export function buildScenarios() {
  return [
    {
      name: "S01 complete request: Mechmech, valid dates, 3 guests, 3 bedrooms → confirmation → lead",
      inputs: [stay("Villa Mechmech July 10 to July 11 for 3 guests"), bedroom("3 bedrooms"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "3") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["Overnight guests: 3", "Bedrooms: 3 bedrooms"],
        askedExcludes: ["How many guests will be staying overnight", "Which villa"],
        fieldEquals: { oraya_guest_count: "3", oraya_bedroom_count: "3 bedrooms" },
      },
    },
    {
      name: "S02 3 guests: bedroom options include 2 and 3; selecting 3 succeeds (website handoff w/ prefill)",
      inputs: [
        stay("Mechmech July 10 to 11, 3 guests"),
        { expect: "How many bedrooms would you like", expectChoicesInclude: ["1 bedroom", "2 bedrooms", "3 bedrooms"], answer: "3 bedrooms" },
        confirmYes,
        { expect: "How would you like to continue", answer: "Finish on website" },
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "3") },
        { api: "7459", response: { prefill_url: "https://stayoraya.com/book?h=TESTTOKEN123" } },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ["TESTTOKEN123", "not a confirmed booking"] },
    },
    {
      name: "S03 villa only → asks dates, exact guests, bedrooms → confirmation",
      inputs: [
        stay("Villa Byblos please"),
        { expect: "check-in and check-out dates", answer: "July 10 to July 12" },
        guests("2"),
        bedroom("1 bedroom"),
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Byblos", null) },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Byblos", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedExcludes: ["Which villa"],
        fieldEquals: { oraya_villa: "Villa Byblos", oraya_guest_count: "2" },
      },
    },
    {
      name: "S04 dates only → asks exact guests, bedrooms, villa → confirmation",
      inputs: [
        stay("July 10 to July 12"),
        guests("4"),
        bedroom("2 bedrooms"),
        { expect: "Which villa", answer: "Villa Mechmech" },
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-12", null, null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["Which villa", "How many guests will be staying overnight", "How many bedrooms"],
        fieldEquals: { oraya_villa: "Villa Mechmech", oraya_guest_count: "4", oraya_bedroom_count: "2 bedrooms" },
      },
    },
    {
      name: "S05 check-in only → asks checkout; valid checkout continues",
      inputs: [
        stay("Villa Mechmech from July 10, 2 of us"),
        { expect: "check-out date", answer: "July 12" },
        bedroom("1 bedroom"),
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", null, "Villa Mechmech", "2") },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: [NOT_CONFIRMED], fieldEquals: { oraya_check_out: "2026-07-12" } },
    },
    {
      name: "S06 checkout missing → asks checkout and continues after valid answer (5 guests, 3 bedrooms)",
      inputs: [
        stay("Byblos July 20, five guests"),
        { expect: "check-out date", answer: "July 23" },
        bedroom("3 bedrooms"),
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-20", null, "Villa Byblos", "5") },
        { api: "8101", response: norm("2026-07-20", "2026-07-23", "Villa Byblos", "5") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: [NOT_CONFIRMED] },
    },
    {
      name: "S07 check-in missing (checkout supplied) → asks for the missing date state correctly",
      inputs: [
        stay("Villa Byblos until July 12 for 2"),
        { expect: "check-in and check-out dates", answer: "July 10 to July 12" },
        bedroom("2 bedrooms"),
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm(null, "2026-07-12", "Villa Byblos", "2") },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Byblos", "2") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: [NOT_CONFIRMED], fieldEquals: { oraya_check_in: "2026-07-10" } },
    },
    {
      name: "S08 both dates missing → asks for dates and refines",
      inputs: [
        stay("Mechmech for 2 guests"),
        { expect: "check-in and check-out dates", answer: "July 10 to July 12" },
        bedroom("1 bedroom"),
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "2") },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: [NOT_CONFIRMED] },
    },
    {
      name: "S09 unreadable date once → retries; valid second response continues",
      inputs: [
        stay("Mechmech, 3 guests"),
        { expect: "check-in and check-out dates", answer: "whenever is fine" },
        { expect: "check-in and check-out dates together", answer: "July 10 to July 15" },
        bedroom("2 bedrooms"),
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "3") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "3") },
        { api: "8101", response: norm("2026-07-10", "2026-07-15", "Villa Mechmech", "3") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        messagesInclude: ["couldn’t read those dates clearly"],
        fieldEquals: { oraya_check_in: "2026-07-10" },
      },
    },
    {
      name: "S10 unreadable dates twice → complete human escalation (name + lead + not-confirmed)",
      inputs: [
        stay("Mechmech, 3 guests"),
        { expect: "check-in and check-out dates", answer: "whenever" },
        { expect: "check-in and check-out dates together", answer: "still whenever" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "3") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "3") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "3") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        messagesInclude: ["trouble reading the dates"],
        fieldEquals: { oraya_full_name: "David Guest" },
      },
    },
    {
      name: "S11 one supported guest → asks bedroom preference; valid selection continues",
      inputs: [stay("July 10 to 11"), guests("1"), bedroom("1 bedroom"), { expect: "Which villa", answer: "Villa Byblos" }, confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", null, null) },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: [NOT_CONFIRMED], fieldEquals: { oraya_guest_count: "1", oraya_bedroom_count: "1 bedroom" } },
    },
    {
      name: "S12 two guests → same valid bedroom choices as the website (1/2/3 all offered)",
      inputs: [
        stay("July 10 to 11 Mechmech"),
        guests("2"),
        { expect: "How many bedrooms would you like", expectChoicesInclude: ["1 bedroom", "2 bedrooms", "3 bedrooms"], answer: "2 bedrooms" },
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: [NOT_CONFIRMED], fieldEquals: { oraya_bedroom_count: "2 bedrooms" } },
    },
    {
      name: "S13 three guests → permits 3 bedrooms (not forced into 2)",
      inputs: [stay("July 10 to 11 Mechmech for 3"), bedroom("3 bedrooms"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "3") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: [NOT_CONFIRMED], fieldEquals: { oraya_bedroom_count: "3 bedrooms" } },
    },
    {
      name: "S14 four guests → website capacity rules (1 bedroom rejected, 2 accepted)",
      inputs: [stay("July 10 to 11 Mechmech, 4 guests"), bedroom("1 bedroom"), bedroom("2 bedrooms"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "4") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        messagesInclude: ["won’t quite fit 4 overnight guests"],
        fieldEquals: { oraya_guest_count: "4", oraya_bedroom_count: "2 bedrooms" },
      },
    },
    {
      name: "S15 six guests → website capacity rules (2 bedrooms rejected, 3 accepted)",
      inputs: [stay("July 10 to 11 Byblos, 6 guests"), bedroom("2 bedrooms"), bedroom("3 bedrooms"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Byblos", "6") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        messagesInclude: ["won’t quite fit 6 overnight guests"],
        fieldEquals: { oraya_bedroom_count: "3 bedrooms" },
      },
    },
    {
      name: "S16 unsupported guest count (More than 8) → captures exact total → escalation submits lead",
      inputs: [
        stay("July 10 to 11 Mechmech, big group"),
        guests("More than 8"),
        { expect: "How many guests exactly", answer: "12" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        messagesInclude: ["confirm the details with you personally"],
        fieldEquals: { oraya_guest_followup: "12" },
      },
    },
    {
      name: "S17 insufficient bedroom selection → explains mismatch, re-asks, preserves exact guest count",
      inputs: [stay("July 10 to 11 Mechmech, 3 guests"), bedroom("1 bedroom"), bedroom("2 bedrooms"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "3") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        messagesInclude: ["won’t quite fit 3 overnight guests"],
        fieldEquals: { oraya_guest_count: "3", oraya_bedroom_count: "2 bedrooms" },
      },
    },
    {
      name: "S18 villa missing → asks villa before confirmation",
      inputs: [stay("July 10 to 11, 2 guests"), bedroom("1 bedroom"), { expect: "Which villa", answer: "Villa Byblos" }, confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", null, "2") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: [NOT_CONFIRMED], askedIncludes: ["Which villa", "Does this look right"] },
    },
    {
      name: "S19 villa selected → does not stop at \"Got it.\" → reaches confirmation",
      inputs: [stay("July 10 to 11, 2 guests"), bedroom("1 bedroom"), { expect: "Which villa", answer: "Villa Mechmech" }, confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", null, "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["Villa: Villa Mechmech"],
      },
    },
    {
      name: "S20 Looks right → reaches handoff choice",
      inputs: [stay("Mechmech July 10 to 11 for 2"), bedroom("1 bedroom"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, askedIncludes: ["How would you like to continue"] },
    },
    {
      name: "S21 Continue on WhatsApp → collects name, calls lead submit, ends not-confirmed",
      inputs: [stay("Mechmech July 10 to 11 for 2"), bedroom("1 bedroom"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["full name"],
        fieldEquals: { oraya_full_name: "David Guest" },
      },
    },
    {
      name: "S22a Finish on website → lead API called; prefill_url used when fixture provides it",
      inputs: [stay("Mechmech July 10 to 11 for 2"), bedroom("1 bedroom"), confirmYes, { expect: "How would you like to continue", answer: "Finish on website" }],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7459", response: { prefill_url: "https://stayoraya.com/book?h=SAFETOKEN99" } },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ["SAFETOKEN99", "not a confirmed booking"] },
    },
    {
      name: "S22b Finish on website → safe fallback when fixture provides no prefill_url",
      inputs: [stay("Mechmech July 10 to 11 for 2"), bedroom("1 bedroom"), confirmYes, { expect: "How would you like to continue", answer: "Finish on website" }],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7459", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ["https://stayoraya.com/book", "not a confirmed booking"] },
    },
    {
      name: "S23 Edit with complete replacement → resets attempt, re-normalizes, returns to confirmation",
      inputs: [
        stay("Mechmech July 10 to 11 for 3"),
        bedroom("3 bedrooms"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "Villa Byblos August 1 to August 3 for 2 guests" },
        bedroom("1 bedroom"),
        { expect: "Does this look right", answer: "Looks right" },
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "3") },
        { api: "7466", response: norm("2026-08-01", "2026-08-03", "Villa Byblos", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["Check-in: 2026-08-01", "Villa: Villa Byblos"],
        fieldEquals: { oraya_check_in: "2026-08-01", oraya_villa: "Villa Byblos", oraya_guest_count: "2" },
      },
    },
    {
      name: "S24 Edit with only \"Villa Byblos\" → no stale mixing; asks for missing details",
      inputs: [
        stay("Mechmech July 10 to 11 for 3"),
        bedroom("3 bedrooms"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "Villa Byblos" },
        { expect: "check-in and check-out dates", answer: "September 1 to September 3" },
        guests("2"),
        bedroom("1 bedroom"),
        { expect: "Does this look right", answer: "Looks right" },
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "3") },
        { api: "7466", response: norm(null, null, "Villa Byblos", null) },
        { api: "8101", response: norm("2026-09-01", "2026-09-03", "Villa Byblos", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["Check-in: 2026-09-01", "Villa: Villa Byblos", "Overnight guests: 2"],
        fieldEquals: { oraya_check_in: "2026-09-01", oraya_villa: "Villa Byblos", oraya_guest_count: "2" },
      },
    },
    {
      name: "S25 returning subscriber, stale villa → second attempt omitting villa must ask villa",
      staleFields: STALE_ALL,
      inputs: [stay("July 20 to July 25 for 4 guests"), bedroom("2 bedrooms"), { expect: "Which villa", answer: "Villa Byblos" }, confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-20", "2026-07-25", null, "4") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["Which villa"],
        fieldEquals: { oraya_villa: "Villa Byblos" },
      },
    },
    {
      name: "S26 returning subscriber, stale dates → second attempt omitting dates must ask dates",
      staleFields: STALE_ALL,
      inputs: [
        stay("Villa Mechmech for 2 guests"),
        { expect: "check-in and check-out dates", answer: "August 5 to August 7" },
        bedroom("1 bedroom"),
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "2") },
        { api: "8101", response: norm("2026-08-05", "2026-08-07", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["check-in and check-out dates"],
        fieldEquals: { oraya_check_in: "2026-08-05" },
      },
    },
    {
      name: "S27 returning subscriber, stale guest count → second attempt omitting guests must ask guests",
      staleFields: STALE_ALL,
      inputs: [
        stay("Villa Mechmech August 5 to 7"),
        { expect: "How many guests will be staying overnight", expectChoicesInclude: ["1", "2", "3", "4", "5", "6", "7", "8", "More than 8"], answer: "2" },
        bedroom("1 bedroom"),
        confirmYes,
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-08-05", "2026-08-07", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        fieldEquals: { oraya_guest_count: "2" },
      },
    },
    {
      name: "S28 returning subscriber, stale bedroom → bedroom is always re-asked; stale value never reused",
      staleFields: STALE_ALL,
      inputs: [stay("Villa Mechmech August 5 to 7 for 2"), bedroom("1 bedroom"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-08-05", "2026-08-07", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["How many bedrooms"],
        fieldEquals: { oraya_bedroom_count: "1 bedroom" },
      },
    },
    {
      name: "S29 checkout-branch double failure → complete escalation (second date-escalation path)",
      inputs: [
        stay("Villa Mechmech from July 10 for 2"),
        { expect: "check-out date", answer: "hmm not sure" },
        { expect: "check-in and check-out dates together", answer: "still not sure" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", null, "Villa Mechmech", "2") },
        { api: "8101", response: norm("2026-07-10", null, "Villa Mechmech", "2") },
        { api: "8101", response: norm("2026-07-10", null, "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        messagesInclude: ["trouble reading the dates"],
      },
    },
    {
      name: "S30 extracted oversize group (12 guests) → team review escalation, never silently accepted",
      inputs: [
        stay("we are 12 guests July 10 to 11 Mechmech"),
        { expect: "How many guests exactly", answer: "12" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "12") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        messagesInclude: ["confirm the details with you personally"],
        fieldEquals: { oraya_guest_followup: "12" },
      },
    },
  ];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const profileIdx = args.indexOf("--profile");
  const positional = args.filter((a, i) => !a.startsWith("--") && (profileIdx === -1 || i !== profileIdx + 1));
  const flowPath = positional[0];
  if (!flowPath) {
    console.error("usage: node scripts/simulate-whatchimp-flow.mjs <flow-file> [--profile <profile.json>]");
    process.exit(2);
  }
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const profilePath = profileIdx !== -1 ? args[profileIdx + 1] : path.join(scriptDir, "whatchimp", "natural-intake-profile.json");
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  const flow = JSON.parse(readFileSync(flowPath, "utf8"));

  const scenarios = buildScenarios();
  let passed = 0;
  let failed = 0;
  for (const scenario of scenarios) {
    const result = runScenario(flow, profile, scenario);
    if (result.failures.length === 0) {
      passed += 1;
      console.log(`PASS  ${scenario.name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${scenario.name}`);
      for (const f of result.failures) console.log(`      - ${f}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed (of ${scenarios.length})`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
