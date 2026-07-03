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
  let leadSubmits = 0; // successful Lead Submit calls (fixture not failed)
  let leadAttempts = 0; // Lead Submit nodes fired, success or failure
  // pre-API safety-link ordering: the guest must already HOLD the canonical
  // booking URL before any external call can fire (a platform halt on a
  // failed HTTP call must never leave the guest link-less).
  let canonicalShown = false;
  const noteShown = (text) => {
    if (profile.canonicalBookingUrl && text.includes(profile.canonicalBookingUrl)) canonicalShown = true;
  };

  const startId = Object.keys(nodes).find((id) => nodes[id].name === "Start Bot Flow");
  if (!startId) return { failures: ["no Start Bot Flow node"], asked, messages, fields, leadSubmits };

  let current = String(startId);
  let terminalText = null;
  let terminalNodeName = null;
  let steps = 0;
  const visited = []; // every node id the walk enters, in order

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
    visited.push(String(current));
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
      noteShown(text);
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
      noteShown(question);
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
      if (profile.canonicalBookingUrl && !canonicalShown) {
        fail(`HTTP API ${apiId} (node #${current}) fired before the guest was shown ${profile.canonicalBookingUrl} — a platform halt here would strand the guest`);
      }
      const fixture = fixtures.shift();
      if (!fixture) {
        fail(`ran out of API fixtures at HTTP API #${current} (api ${apiId})`);
        break;
      }
      if (fixture.api !== apiId) {
        fail(`fixture order mismatch: expected api ${fixture.api}, flow called ${apiId} at node #${current}`);
      }
      if (profile.apis.leadSubmit.ids.includes(apiId)) {
        leadAttempts += 1;
        if (!fixture.failed) leadSubmits += 1;
      }
      // fault injection: `failed: true` models an HTTP failure — WhatChimp
      // cannot branch on HTTP status, so the walk continues along the same
      // output edge but NO response mapping writes any field.
      if (!fixture.failed) {
        const mapping = profile.apiFieldWrites?.[apiId] ?? {};
        for (const [respKey, fieldName] of Object.entries(mapping)) {
          if (respKey in (fixture.response ?? {})) {
            fields.set(fieldName, String(fixture.response[respKey]));
          } else if (apiId === profile.apis.initialNormalize.id || apiId === profile.apis.refine.id) {
            fail(`fixture for api ${apiId} is missing "${respKey}" — extracted_text fixtures must carry every mapped key (use "null" for missing)`);
          }
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
    // no-dead-end actionable-outcome invariant: the INTERPOLATED terminal
    // (what the guest actually reads, with the current prefill-field state
    // substituted) must always contain the canonical fallback booking link,
    // and must state the accurate not-confirmed status. A lead-submission
    // acknowledgement without a booking continuation is invalid.
    if (profile.canonicalBookingUrl && !(terminalText ?? "").includes(profile.canonicalBookingUrl)) {
      fail(`terminal does not deliver the canonical booking continuation ${profile.canonicalBookingUrl}: "${(terminalText ?? "").slice(0, 140)}"`);
    }
    if (profile.terminalNotConfirmedPattern && !new RegExp(profile.terminalNotConfirmedPattern, "i").test(terminalText ?? "")) {
      fail(`terminal does not state the accurate not-confirmed status`);
    }
  }
  // canonical-domain hygiene on everything the guest was shown (interpolated)
  for (const shown of [...messages, ...asked]) {
    for (const pattern of profile.forbiddenDomainPatterns ?? []) {
      if (new RegExp(pattern, "i").test(shown)) {
        fail(`guest-facing output matches forbidden domain pattern "${pattern}": "${shown.slice(0, 100)}"`);
      }
    }
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
  if (ex.leadAttempted === true && leadAttempts < 1) fail("expected a Lead Submit node to fire, none did");
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
  // node-level path assertion: every id in each sequence must be visited IN
  // ORDER (ordered subsequence of the walk). This proves the expected
  // question nodes and their downstream nodes were actually entered — not
  // merely that some terminal was eventually reached.
  for (const seq of ex.visitsInOrder ?? []) {
    let idx = 0;
    for (const v of visited) {
      if (idx < seq.length && String(seq[idx]) === v) idx += 1;
    }
    if (idx < seq.length) {
      fail(`expected visit sequence [${seq.join(" → ")}] — node #${seq[idx]} was not visited in order (walk: ${visited.join(",")})`);
    }
  }

  return { failures, asked, messages, fields, leadSubmits, leadAttempts, terminalText, terminalNodeId: current, apiCalls, visited };
}

// ─── fixtures / scenario helpers ────────────────────────────────────────────

/** extracted_text-style normalization fixture: every key present, "null" when
 * missing. `guest_followup` is ALWAYS "null" — the backend never extracts an
 * overflow count; the mapping exists purely as the deterministic
 * current-attempt reset of `oraya_guest_followup`. */
const norm = (checkIn, checkOut, villa, guests) => ({
  check_in: checkIn ?? "null",
  check_out: checkOut ?? "null",
  villa: villa ?? "null",
  guest_count: guests ?? "null",
  guest_followup: "null",
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
        // full initial path, node by node: stay q → normalize → guest gate →
        // guest q → ack → supported gate → bedroom q → ack → capacity check →
        // villa-gate clone #758 (2-bedrooms-fit exit; corrected-rule cascade) →
        // villa q → ack → confirmation q → ack → Looks right →
        // handoff q → WhatsApp branch → name q → Lead Submit → terminal
        visitsInOrder: [[
          "400", "401", "440", "600", "601", "603", "602", "610", "611", "624", "612",
          "758", "480", "481", "604", "490", "491", "492", "493", "494",
          "70", "71", "72", "74", "75", "8", "9", "7",
        ]],
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
        // guest q → ack → supported gate (False) → exact-count q → team-review
        // text → BRANCH-LOCAL large-group escalation tail (name q → Lead
        // Submit → terminal) — the initial path's own clone
        visitsInOrder: [["600", "601", "603", "602", "466", "467", "468", "712", "713", "714", "715"]],
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
        // bedroom q → ack → capacity check → mismatch text → retry wrapper →
        // retry q → ack → retry capacity check → villa-gate clone #760 (retry
        // 2-bedrooms-fit exit; corrected-rule cascade) → confirmation → terminal
        visitsInOrder: [["611", "624", "612", "616", "617", "618", "625", "619", "760", "491", "7"]],
      },
    },
    {
      name: "S18 villa missing → asks villa before confirmation",
      inputs: [stay("July 10 to 11, 2 guests"), bedroom("1 bedroom"), { expect: "Which villa", answer: "Villa Byblos" }, confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", null, "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedIncludes: ["Which villa", "Does this look right"],
        // guest gate (known) → bedroom q → ack → capacity C1 (2 guests → OK
        // immediately) → villa gate → villa q → ack → confirmation → terminal
        visitsInOrder: [["440", "602", "611", "624", "612", "470", "481", "604", "491", "7"]],
      },
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
      expect: {
        leadSubmitted: true,
        askedIncludes: ["How would you like to continue"],
        // "Looks right" direction of the confirmation branch: confirmation q →
        // ack → branch condition (True) → handoff wrapper → handoff q →
        // WhatsApp branch → name q → Lead Submit → terminal
        visitsInOrder: [["491", "492", "493", "494", "70", "71", "72", "74", "75", "8", "9", "7"]],
      },
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
        // "Edit" direction of the confirmation branch, then the rebuilt Edit
        // flow with a complete replacement: confirmation q → ack → branch
        // condition (False) → Edit prompt → Edit q → fresh normalize →
        // date/guest gates (all satisfied; both-dates-known re-entry runs the
        // corrected-rule clone chain #761 → #762) → Edit bedroom q → ack →
        // capacity → Edit villa gate → Edit confirmation q → ack → second
        // branch (True) → the Edit path's OWN handoff clone → WhatsApp terminal
        visitsInOrder: [[
          "491", "492", "493", "495", "496", "497", "498", "650", "656", "761", "762",
          "670", "671", "684", "672", "690", "694", "695", "699", "696", "697", "740", "749",
        ]],
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
        // full Edit re-validation, node by node: Edit q → fresh normalize →
        // dates gate (missing) → Edit dates q → refine → both-dates gate →
        // guests gate (missing) → Edit guest q → ack → supported gate →
        // Edit bedroom q → ack → capacity → Edit villa gate (known) →
        // Edit confirmation q → ack → branch (True) → the Edit path's OWN
        // branch-local handoff clone → its WhatsApp terminal
        visitsInOrder: [[
          "497", "498", "650", "651", "652", "653", "654", "660", "661", "662", "664", "663",
          "670", "671", "684", "672", "690", "694", "695", "699", "696", "697", "740", "749",
        ]],
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
        // check-out escalation message → its OWN branch-local tail
        visitsInOrder: [["504", "700", "701", "702", "703"]],
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
    // ── hybrid-architecture branch-local clones (2026-07-03, Option A) ──────
    // Every duplicated tail is exercised on its own path, asserting the
    // branch-local node ids — not merely that some terminal was reached.
    {
      name: "S31 Edit → Finish on website → the Edit path's OWN website ending (cloned 7459 Lead Submit)",
      inputs: [
        stay("Mechmech July 10 to 11 for 2"),
        bedroom("1 bedroom"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "Villa Byblos August 1 to August 3 for 2 guests" },
        bedroom("1 bedroom"),
        { expect: "Does this look right", answer: "Looks right" },
        { expect: "How would you like to continue", answer: "Finish on website" },
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7466", response: norm("2026-08-01", "2026-08-03", "Villa Byblos", "2") },
        { api: "7459", response: { prefill_url: "https://stayoraya.com/book?h=EDITTOKEN42" } },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ["EDITTOKEN42", "not a confirmed booking"],
        // Edit confirmation (True) → Edit handoff clone → website branch →
        // cloned 7459 Lead Submit → cloned website terminal
        visitsInOrder: [["696", "697", "740", "741", "742", "743", "744"]],
      },
    },
    {
      name: "S32 Edit with check-out missing → Edit checkout follow-up → refine → continues to Edit confirmation",
      inputs: [
        stay("Mechmech July 10 to 11 for 2"),
        bedroom("1 bedroom"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "Villa Byblos from September 1 for 2" },
        { expect: "check-out date", answer: "September 3" },
        bedroom("1 bedroom"),
        { expect: "Does this look right", answer: "Looks right" },
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7466", response: norm("2026-09-01", null, "Villa Byblos", "2") },
        { api: "8101", response: norm("2026-09-01", "2026-09-03", "Villa Byblos", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        fieldEquals: { oraya_check_out: "2026-09-03" },
        // Edit q → normalize → check-in known → checkout gate → checkout q →
        // refine → both-dates gate → guest gate (known) → bedroom → villa
        // gate (known) → Edit confirmation → Edit handoff clone → terminal
        visitsInOrder: [[
          "497", "498", "650", "656", "657", "658", "659", "654", "660", "663",
          "670", "671", "684", "672", "690", "694", "695", "699", "696", "697", "740", "749",
        ]],
      },
    },
    {
      name: "S33 Edit with villa missing → Edit villa question → continues to Edit confirmation",
      inputs: [
        stay("Mechmech July 10 to 11 for 2"),
        bedroom("1 bedroom"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "August 1 to August 3 for 2, not sure which villa" },
        bedroom("1 bedroom"),
        { expect: "Which villa", answer: "Villa Byblos" },
        { expect: "Does this look right", answer: "Looks right" },
        ...whatsappTail,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7466", response: norm("2026-08-01", "2026-08-03", null, "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        fieldEquals: { oraya_villa: "Villa Byblos" },
        // Edit villa gate (missing) → Edit villa q → ack → Edit confirmation
        visitsInOrder: [["672", "690", "691", "692", "693", "694", "695", "699", "696", "697", "740", "749"]],
      },
    },
    {
      name: "S34 Edit that becomes an above-capacity group → the Edit path's OWN large-group review + escalation tail",
      inputs: [
        stay("Mechmech July 10 to 11 for 2"),
        bedroom("1 bedroom"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "actually the whole family is coming now" },
        guests("More than 8"),
        { expect: "How many guests exactly", answer: "12" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        messagesInclude: ["confirm the details with you personally"],
        fieldEquals: { oraya_guest_followup: "12" },
        // Edit guest q → ack → supported gate (False) → CLONED Edit
        // large-group review → its own escalation tail
        visitsInOrder: [["661", "662", "664", "663", "736", "737", "738", "732", "733", "734", "735"]],
      },
    },
    {
      name: "S35 Edit with unreadable dates → Edit date follow-up fails → the Edit path's OWN date-escalation tail",
      inputs: [
        stay("Mechmech July 10 to 11 for 2"),
        bedroom("1 bedroom"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "sometime whenever works" },
        { expect: "check-in and check-out dates", answer: "still whenever" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7466", response: norm(null, null, "Villa Mechmech", "2") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        messagesInclude: ["trouble reading the dates"],
        visitsInOrder: [["650", "651", "652", "653", "654", "655", "716", "717", "718", "719"]],
      },
    },
    {
      name: "S36 initial bedroom mismatch then 1 bedroom AGAIN → the retry's OWN needs-more escalation tail",
      inputs: [stay("Byblos July 10 to 11, 5 guests"), bedroom("1 bedroom"), bedroom("1 bedroom"), escName],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Byblos", "5") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...ESC_TERMINAL, "https://stayoraya.com/book"],
        messagesInclude: ["have our team help arrange"],
        fieldEquals: { oraya_guest_count: "5" },
        // retry ask → ack → C1(F) → C2(1 bedroom → True) → escalation text A →
        // its own tail
        visitsInOrder: [["618", "625", "619", "620", "626", "704", "705", "706", "707"]],
      },
    },
    {
      name: "S37 Edit bedroom mismatch then 1 bedroom AGAIN → the Edit retry's OWN needs-more escalation tail",
      inputs: [
        stay("Mechmech July 10 to 11 for 2"),
        bedroom("1 bedroom"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "same dates but we are 5 now" },
        bedroom("1 bedroom"),
        bedroom("1 bedroom"),
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "5") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...ESC_TERMINAL, "https://stayoraya.com/book"],
        messagesInclude: ["have our team help arrange"],
        visitsInOrder: [["671", "684", "672", "673", "676", "677", "678", "685", "679", "680", "686", "720", "721", "722", "723"]],
      },
    },
    {
      name: "S38 Edit bedroom mismatch then 2 bedrooms for 5 guests → the Edit retry's OTHER escalation tail",
      inputs: [
        stay("Mechmech July 10 to 11 for 2"),
        bedroom("1 bedroom"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "same dates but we are 5 now" },
        bedroom("1 bedroom"),
        bedroom("2 bedrooms"),
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "5") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...ESC_TERMINAL, "https://stayoraya.com/book"],
        messagesInclude: ["have our team help arrange"],
        visitsInOrder: [["678", "685", "679", "680", "681", "687", "724", "725", "726", "727"]],
      },
    },
    // ── fault-injection matrix (no-dead-end audit) ──────────────────────────
    // These prove that repository-detectable failure modes cannot strand the
    // guest: the walk always reaches an approved terminal whose interpolated
    // text carries the canonical /book continuation. What they CANNOT prove
    // (WhatChimp's live behavior when an HTTP call fails, real request
    // bodies) is listed in V6_DEPENDENCIES.md and the round-trip checklist.
    {
      name: "F01 normalize API failure (fresh subscriber) → flow continues, lead submitted, continuation link",
      inputs: [
        stay("Villa Mechmech July 10 to 11 for 4 guests"),
        { expect: "How many guests exactly", answer: "4" },
        escName,
      ],
      fixtures: [
        { api: "7466", failed: true, response: {} },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...ESC_TERMINAL, "https://stayoraya.com/book"],
        messagesInclude: ["confirm the details with you personally"],
      },
    },
    {
      name: "F02 refine API failure on both attempts → complete escalation with continuation link",
      inputs: [
        stay("Mechmech, 3 guests"),
        { expect: "check-in and check-out dates", answer: "July 10 to 15" },
        { expect: "check-in and check-out dates together", answer: "July 10 to July 15" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "3") },
        { api: "8101", failed: true, response: {} },
        { api: "8101", failed: true, response: {} },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...ESC_TERMINAL, "https://stayoraya.com/book"],
        messagesInclude: ["trouble reading the dates"],
      },
    },
    {
      name: "F03 WhatsApp Lead Submit failure → guest still gets canonical booking continuation",
      inputs: [stay("Mechmech July 10 to 11 for 2"), bedroom("1 bedroom"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "6961", failed: true, response: {} },
      ],
      expect: {
        leadAttempted: true,
        leadSubmitted: false,
        terminalIncludes: [NOT_CONFIRMED, "https://stayoraya.com/book"],
      },
    },
    {
      name: "F04 website-handoff Lead Submit failure → no prefill written, canonical fallback still delivered",
      inputs: [stay("Mechmech July 10 to 11 for 2"), bedroom("1 bedroom"), confirmYes, { expect: "How would you like to continue", answer: "Finish on website" }],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7459", failed: true, response: {} },
      ],
      expect: {
        leadAttempted: true,
        leadSubmitted: false,
        terminalIncludes: ["https://stayoraya.com/book", "not a confirmed booking"],
      },
    },
    {
      name: "F05 empty-string prefill_url → canonical fallback still delivered",
      inputs: [stay("Mechmech July 10 to 11 for 2"), bedroom("1 bedroom"), confirmYes, { expect: "How would you like to continue", answer: "Finish on website" }],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7459", response: { prefill_url: "" } },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ["https://stayoraya.com/book", "not a confirmed booking"] },
    },
    {
      name: "F06 malformed prefill_url → guest still holds the canonical fallback in the same message",
      inputs: [stay("Mechmech July 10 to 11 for 2"), bedroom("1 bedroom"), confirmYes, { expect: "How would you like to continue", answer: "Finish on website" }],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7459", response: { prefill_url: "book-now-please" } },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ["https://stayoraya.com/book", "not a confirmed booking"] },
    },
    {
      name: "F07 bedroom mismatch followed by another invalid choice → escalation with lead + continuation",
      inputs: [stay("Byblos July 10 to 11, 5 guests"), bedroom("1 bedroom"), bedroom("2 bedrooms"), escName],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Byblos", "5") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...ESC_TERMINAL, "https://stayoraya.com/book"],
        messagesInclude: ["have our team help arrange"],
        fieldEquals: { oraya_guest_count: "5" },
        // retry 2 bedrooms for 5 guests → C3 False → escalation text B → its
        // own branch-local tail
        visitsInOrder: [["618", "625", "619", "620", "621", "627", "708", "709", "710", "711"]],
      },
    },
    {
      name: "F08 repeated Edit (Edit → replacement → Edit again) → escalation with lead + continuation, no dead end",
      inputs: [
        stay("Mechmech July 10 to 11 for 3"),
        bedroom("3 bedrooms"),
        confirmEdit,
        { expect: "Your updated stay details", answer: "Villa Byblos August 1 to August 3 for 2 guests" },
        bedroom("1 bedroom"),
        { expect: "Does this look right", answer: "Edit" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "3") },
        { api: "7466", response: norm("2026-08-01", "2026-08-03", "Villa Byblos", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...ESC_TERMINAL, "https://stayoraya.com/book"],
        messagesInclude: ["fine-tune everything personally"],
        // second-Edit escalation text → its OWN branch-local tail
        visitsInOrder: [["695", "699", "696", "698", "728", "729", "730", "731"]],
      },
    },
    {
      name: "F09 stale guest-overflow \"12\" is RESET to \"null\" by the current attempt's normalization — a supported-count lead cannot carry it",
      staleFields: { ...STALE_ALL, oraya_guest_followup: "12" },
      inputs: [stay("Villa Mechmech August 5 to 7 for 2"), bedroom("1 bedroom"), confirmYes, ...whatsappTail],
      fixtures: [
        { api: "7466", response: norm("2026-08-05", "2026-08-07", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED],
        askedExcludes: ["How many guests exactly"],
        // the extracted_text.guest_followup → oraya_guest_followup mapping
        // deterministically overwrites the stale "12" with the literal
        // "null" on the current attempt's 7466 call, BEFORE any Lead Submit
        // node can fire — the submitted lead body reads "null", never "12".
        fieldEquals: { oraya_guest_count: "2", oraya_guest_followup: "null" },
      },
    },
    {
      name: "F11 escalation Lead Submit failure at the escalation API node → #643 still delivers the booking links",
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
        { api: "6961", failed: true, response: {} },
      ],
      expect: {
        leadAttempted: true,
        leadSubmitted: false,
        terminalIncludes: ["https://stayoraya.com/book", "not a confirmed booking"],
        messagesInclude: ["trouble reading the dates"],
      },
    },
    {
      name: "F10 free-text answers at every choice point (confirmation / handoff) never strand the guest",
      inputs: [
        stay("Mechmech July 10 to 11 for 2"),
        bedroom("1 bedroom"),
        // free text instead of "Looks right"/"Edit" → routes to the Edit path
        { expect: "Does this look right", answer: "hmm, can you repeat that?" },
        { expect: "Your updated stay details", answer: "Villa Mechmech July 10 to July 11 for 2 guests" },
        bedroom("1 bedroom"),
        { expect: "Does this look right", answer: "Looks right" },
        // free text instead of a handoff button → WhatsApp continuation branch
        { expect: "How would you like to continue", answer: "just keep chatting here please" },
        { expect: "full name", answer: "David Guest" },
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [NOT_CONFIRMED, "https://stayoraya.com/book"],
        askedIncludes: ["Your updated stay details"],
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
