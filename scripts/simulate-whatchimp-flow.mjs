#!/usr/bin/env node
/**
 * Phase 16A — deterministic conversation simulator for the Oraya Natural Stay
 * Intake WhatChimp flow (interactive-controls candidate). Abstract-interprets
 * the exported graph against scripted guest answers and stubbed HTTP-API
 * fixture responses — it NEVER calls production Butler endpoints and requires
 * no secrets.
 *
 * Models: custom-field state (including stale values from abandoned
 * attempts), question answers, Interactive controls (Inline Buttons and list
 * Keyboard → Sections → Rows chains — a click writes the control's linked
 * custom field with the control's LABEL, exactly like the operator's
 * authenticated schema, then follows the control's single forward
 * connection), HTTP-API fixture responses applied through the documented
 * response→field mappings (`extracted_text.*` writes the literal string
 * "null" for missing fields — the current-attempt mechanism that prevents
 * stale-field leakage), condition evaluation, visited nodes, clicked
 * controls, and terminal outcomes.
 *
 * Every scenario additionally auto-asserts the global invariants:
 *   - the conversation terminates on a guest-safe approved Text message
 *     (never on an API node, condition node, question wrapper, or "Got it.");
 *   - every clicked control writes its exact label, has NO Start-a-Flow
 *     metadata, and has exactly ONE forward transition (one press = one
 *     field assignment = one downstream step — no duplicate execution);
 *   - no Interactive carries a default-output connection (double execution);
 *   - the step budget is not exhausted (no runaway loops).
 *
 * KNOWN PLATFORM LIMIT (documented, not simulated): an Interactive waits for
 * a control press — a free-typed reply does not advance the flow. The
 * date-conversation questions remain free-text User Input Flow questions.
 *
 * VERIFICATION-LEVEL CONTRACT — what a passing scenario does and does not
 * prove (see artifacts/whatchimp/V6_DEPENDENCIES.md "Payload-persistence
 * contract"):
 *   1. custom field captured  — modeled here (field state assertions);
 *   2. API submission occurred — modeled here (the Lead Submit NODE fired);
 *   3. exact field included in the external API request body — NOT modeled:
 *      WhatChimp request bodies live outside the flow export. This simulator
 *      never claims level 3, and it cannot prove the live platform stores a
 *      control's label into its linked field — that is the human click-through
 *      checklist (artifacts/whatchimp/V6_REDRAW_CHECKLIST.md).
 *
 * Usage:
 *   node scripts/simulate-whatchimp-flow.mjs <flow-file> [--profile <profile.json>]
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

/** All controls of an Interactive: Inline Buttons on interactiveOutputButton
 * plus list Rows reached through Keyboard → Sections → sectionOutputRows. */
export function controlsOfInteractive(nodes, node) {
  const controls = [];
  for (const c of outConnections(node, "interactiveOutputButton")) {
    const b = nodes[String(c.node)];
    if (b) controls.push(b);
  }
  for (const c of outConnections(node, "interactiveOutputListMessage")) {
    const kb = nodes[String(c.node)];
    for (const s of outConnections(kb ?? {}, "quickReplyOutput")) {
      const sec = nodes[String(s.node)];
      for (const r of outConnections(sec ?? {}, "sectionOutputRows")) {
        const row = nodes[String(r.node)];
        if (row) controls.push(row);
      }
    }
  }
  return controls;
}

export function controlLabel(control) {
  return (control.name === "Rows" ? control.data?.title : control.data?.buttonText) ?? "";
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
  const clicks = []; // { node, label, field } — every control press
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
      const text = interpolate(node.data?.textMessage ?? "", fields);
      messages.push(text);
      noteShown(text);
      // duplicate-execution guard: the default output must stay empty — the
      // press-driven control transition is the ONLY continuation.
      const defaultOut = outConnections(node, "interactiveOutput");
      if (defaultOut.length) {
        fail(`interactive #${current} has ${defaultOut.length} default interactiveOutput connection(s) — a press would execute the next stage twice`);
      }
      const controls = controlsOfInteractive(nodes, node);
      if (!controls.length) {
        fail(`interactive #${current} has no controls`);
        break;
      }
      const input = inputs.shift();
      if (!input) {
        fail(`ran out of scripted answers at interactive "${text.slice(0, 60)}"`);
        break;
      }
      if (input.expect && !text.toLowerCase().includes(input.expect.toLowerCase())) {
        fail(`expected interactive containing "${input.expect}" but got "${text.slice(0, 120)}"`);
      }
      if (input.expectChoicesInclude) {
        for (const c of input.expectChoicesInclude) {
          if (!controls.some((b) => controlLabel(b) === c)) {
            fail(`interactive "${text.slice(0, 60)}" is missing expected choice "${c}" (has: ${controls.map(controlLabel).join(", ")})`);
          }
        }
      }
      const chosen = controls.find((b) => controlLabel(b) === input.answer);
      if (!chosen) {
        fail(`interactive #${current} has no control "${input.answer}" (has: ${controls.map(controlLabel).join(", ")})`);
        break;
      }
      const d = chosen.data ?? {};
      if ("value" in d || "postback_text" in d) {
        fail(`control "${input.answer}" (#${chosen.id}) carries Start-a-Flow metadata — an intake answer control must never start a flow`);
      }
      // the click writes the control's linked field with the control's LABEL
      const fieldName = (d.customFieldSelectedOptionText ?? "").trim();
      if (fieldName && fieldName !== "Select") fields.set(fieldName, controlLabel(chosen));
      clicks.push({ node: String(chosen.id), label: controlLabel(chosen), field: fieldName });
      visited.push(String(chosen.id));
      const fwdKey = chosen.name === "Rows" ? "rowOutput" : "buttonOutput";
      const fwd = outConnections(chosen, fwdKey);
      if (fwd.length !== 1) {
        fail(`control "${input.answer}" (#${chosen.id}) has ${fwd.length} forward connection(s) on ${fwdKey} — exactly one press-driven transition is required`);
        break;
      }
      current = String(fwd[0].node);
      continue;
    }

    fail(`unsupported node type "${name}" at #${current}`);
    break;
  }

  // global invariants
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
  for (const s of ex.terminalExcludes ?? []) {
    if ((terminalText ?? "").includes(s)) fail(`terminal message must NOT contain "${s}" (got: "${(terminalText ?? "").slice(0, 140)}")`);
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
  for (const s of ex.messagesExclude ?? []) {
    if (messages.some((m) => m.toLowerCase().includes(s.toLowerCase()))) fail(`bot message containing "${s}" must NOT be shown in this scenario`);
  }
  for (const [fieldName, value] of Object.entries(ex.fieldEquals ?? {})) {
    if ((fields.get(fieldName) ?? "") !== value) fail(`field ${fieldName} = "${fields.get(fieldName) ?? ""}", expected "${value}"`);
  }
  if (inputs.length) fail(`${inputs.length} scripted answer(s) were never consumed`);
  if (fixtures.length) fail(`${fixtures.length} API fixture(s) were never consumed`);
  // node-level path assertion: every id in each sequence must be visited IN
  // ORDER (ordered subsequence of the walk). This proves the expected
  // control nodes and their downstream nodes were actually entered — not
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

  return { failures, asked, messages, fields, leadSubmits, leadAttempts, terminalText, terminalNodeId: current, apiCalls, visited, clicks };
}

// ─── fixtures / scenario helpers ────────────────────────────────────────────

/** extracted_text-style normalization fixture: every key present, "null" when
 * missing. `guest_followup` is ALWAYS "null" — the backend never extracts an
 * overflow count; the mapping exists purely as the deterministic
 * current-attempt reset of `oraya_guest_followup`. */
const norm = (checkIn, checkOut, villa, guests, bedrooms) => ({
  check_in: checkIn ?? "null",
  check_out: checkOut ?? "null",
  villa: villa ?? "null",
  guest_count: guests ?? "null",
  guest_followup: "null",
  bedroom_count: bedrooms ?? "null",
});

const stay = (answer) => ({ expect: "tell me what you already know", answer });
const guestClick = (answer) => ({ expect: "How many guests will be staying overnight", answer });
const bedroomClick = (answer) => ({ expect: "How many bedrooms would you like", answer });
const villaClick = (answer) => ({ expect: "Which villa would you prefer", answer });
const escName = { expect: "full name", answer: "David Guest" };
const NOT_CONFIRMED = "not a confirmed booking";
const ESC_TERMINAL = ["passed your request to the Oraya team", "not a confirmed booking yet"];
const SUMMARY_TERMINAL = ["team will review availability and follow up", "not a confirmed booking yet"];

const STALE_ALL = {
  oraya_check_in: "2026-07-10",
  oraya_check_out: "2026-07-11",
  oraya_villa: "Villa Mechmech",
  oraya_guest_count: "3",
  oraya_bedroom_count: "3 bedrooms",
  oraya_stay_followup: "july 10 to july 11",
  oraya_guest_followup: "12",
};

// ─── the scenario matrix ────────────────────────────────────────────────────

export function buildScenarios() {
  return [
    // ── extraction skips the corresponding Interactive question ─────────────
    {
      name: "S01 everything extracted (villa+dates+3 guests) → only bedrooms asked → lead → summary",
      inputs: [stay("Villa Mechmech July 10 to July 11 for 3 guests"), bedroomClick("2 bedrooms")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "3") },
        { api: "6961", response: { prefill_url: "https://stayoraya.com/book?h=TESTTOKEN123" } },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Check-in: 2026-07-10", "Check-out: 2026-07-11", "Villa: Villa Mechmech", "Overnight guests: 3", "Bedrooms: 2 bedrooms", "TESTTOKEN123"],
        askedExcludes: ["full name", "How would you like to continue"],
        messagesExclude: ["How many guests will be staying overnight", "Which villa would you prefer", "Does this look right"],
        fieldEquals: { oraya_guest_count: "3", oraya_bedroom_count: "2 bedrooms" },
        // stay q → normalize → date gates → guest gate (known) → supported
        // gate (True) → bedroom stage b1 → bedroom-ack → villa gate (known)
        // → Lead Submit B → summary B
        visitsInOrder: [["400", "401", "410", "411", "440", "602", "875", "877", "930", "470", "941", "942"]],
      },
    },
    {
      name: "S02 everything extracted → bedroom \"1 bedroom\" writes the exact label",
      inputs: [stay("Byblos July 10 to 11, 2 guests"), { ...bedroomClick("1 bedroom"), expectChoicesInclude: ["1 bedroom", "2 bedrooms", "3 bedrooms"] }],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Byblos", "2") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, fieldEquals: { oraya_bedroom_count: "1 bedroom" } },
    },
    {
      name: "S03 everything extracted → bedroom \"3 bedrooms\" writes the exact label (no capacity re-ask for 2 guests)",
      inputs: [stay("Mechmech July 10 to 11 for 2"), bedroomClick("3 bedrooms")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, fieldEquals: { oraya_bedroom_count: "3 bedrooms" }, messagesExclude: ["won’t quite fit"] },
    },
    {
      name: "S04 villa missing → villa Interactive asked → \"Villa Mechmech\" button writes the exact canonical value",
      inputs: [stay("July 10 to July 12 for 4 guests"), bedroomClick("2 bedrooms"), { ...villaClick("Villa Mechmech"), expectChoicesInclude: ["Villa Mechmech", "Villa Byblos"] }],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-12", null, "4") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Villa: Villa Mechmech"],
        fieldEquals: { oraya_villa: "Villa Mechmech" },
        // bedroom b1 → ack → villa gate (missing) → villa Interactive → button
        // #936 → villa-ack → Lead Submit A → summary A
        visitsInOrder: [["602", "875", "930", "470", "935", "936", "938", "939", "940"]],
      },
    },
    {
      name: "S05 villa missing → \"Villa Byblos\" button writes the exact canonical value",
      inputs: [stay("July 10 to July 12 for 4 guests"), bedroomClick("3 bedrooms"), villaClick("Villa Byblos")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-12", null, "4") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Villa: Villa Byblos"],
        fieldEquals: { oraya_villa: "Villa Byblos" },
        visitsInOrder: [["935", "937", "938", "939", "940"]],
      },
    },

    // ── guest list: every row of the initial stage writes its exact value ───
    {
      name: "S06 guests missing → list row \"1\" writes 1 and advances once",
      inputs: [stay("Mechmech July 10 to 11"), { ...guestClick("1"), expectChoicesInclude: ["1", "2", "3", "4", "5", "6", "More than 6"] }, bedroomClick("1 bedroom")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Overnight guests: 1"],
        fieldEquals: { oraya_guest_count: "1" },
        // guest gate (missing) → guest list stage g0 → row #803 → guest-ack →
        // bedroom stage b0 → bedroom-ack → villa gate (known) → completion B
        visitsInOrder: [["440", "800", "803", "860", "870", "871", "930", "470", "941", "942"]],
      },
    },
    {
      name: "S07 guest row \"2\" → bedroom b0 \"2 bedrooms\" → villa asked",
      inputs: [stay("July 10 to 11"), guestClick("2"), bedroomClick("2 bedrooms"), villaClick("Villa Mechmech")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", null, null) },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, fieldEquals: { oraya_guest_count: "2", oraya_villa: "Villa Mechmech" }, visitsInOrder: [["800", "804", "860", "870", "872", "930", "470", "935"]] },
    },
    {
      name: "S08 guest row \"3\" → bedroom b0 \"3 bedrooms\"",
      inputs: [stay("Byblos July 10 to 11"), guestClick("3"), bedroomClick("3 bedrooms")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Byblos", null) },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, fieldEquals: { oraya_guest_count: "3" }, visitsInOrder: [["805", "860", "873", "930"]] },
    },
    {
      name: "S09 guest row \"4\" writes 4",
      inputs: [stay("Mechmech July 10 to 11"), guestClick("4"), bedroomClick("2 bedrooms")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, fieldEquals: { oraya_guest_count: "4" }, visitsInOrder: [["806", "860"]] },
    },
    {
      name: "S10 guest row \"5\" writes 5",
      inputs: [stay("Mechmech July 10 to 11"), guestClick("5"), bedroomClick("3 bedrooms")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, fieldEquals: { oraya_guest_count: "5" }, visitsInOrder: [["807", "860"]] },
    },
    {
      name: "S11 guest row \"6\" writes 6 — no bedroom-capacity re-ask exists in WhatsApp",
      inputs: [stay("Mechmech July 10 to 11"), guestClick("6"), bedroomClick("1 bedroom")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Overnight guests: 6", "Bedrooms: 1 bedroom"],
        fieldEquals: { oraya_guest_count: "6", oraya_bedroom_count: "1 bedroom" },
        messagesExclude: ["won’t quite fit"],
        visitsInOrder: [["808", "860", "870", "871", "930"]],
      },
    },

    // ── More than 6 exits the stay path ──────────────────────────────────────
    {
      name: "S12 guest row \"More than 6\" → exact-count ask → team review → escalation lead; no villa/bedroom questions",
      inputs: [stay("Mechmech July 10 to 11, big group"), guestClick("More than 6"), { expect: "How many guests exactly", answer: "12" }, escName],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        messagesExclude: ["How many bedrooms would you like", "Which villa would you prefer"],
        fieldEquals: { oraya_guest_count: "More than 6", oraya_guest_followup: "12" },
        // overflow row → large-group review subtree → its escalation tail
        visitsInOrder: [["800", "809", "466", "467", "468", "712", "713", "714", "715"]],
      },
    },
    {
      name: "S13 EXTRACTED unsupported count (7) → per-branch team review → escalation lead; no stay questions",
      inputs: [stay("Mechmech July 10 to 11 for 7 guests"), escName],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "7") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        messagesInclude: ["group of 7", "confirm the details with you personally"],
        messagesExclude: ["How many guests will be staying overnight", "How many bedrooms", "Which villa"],
        fieldEquals: { oraya_guest_count: "7" },
        // supported gate (False) → initial extracted-overflow preface → tail
        visitsInOrder: [["440", "602", "963", "970", "971", "972", "973"]],
      },
    },
    {
      name: "S14 EXTRACTED unsupported count (12) → same event/human-support outcome",
      inputs: [stay("a villa for 12 people July 10 to 11"), escName],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", null, "12") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ESC_TERMINAL, fieldEquals: { oraya_guest_count: "12" }, visitsInOrder: [["602", "963", "973"]] },
    },

    // ── date-recovery branches: guest stage / bedroom stage / overflow ───────
    {
      name: "R01 both dates missing → recovered on follow-up → guest stage g1 row \"2\"",
      inputs: [stay("Mechmech for us"), { expect: "check-in and check-out dates", answer: "July 10 to July 12" }, guestClick("2"), bedroomClick("1 bedroom")],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", null) },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: SUMMARY_TERMINAL,
        fieldEquals: { oraya_check_in: "2026-07-10", oraya_guest_count: "2" },
        // follow-up → refine → recovered gate (False) → guest-known clone 750
        // (True: missing) → guest stage g1 → row → shared guest-ack → b0
        visitsInOrder: [["420", "421", "422", "430", "750", "810", "814", "860", "870"]],
      },
    },
    {
      name: "R02 dates recovered on follow-up, guests extracted (5) → bedroom stage b2 directly",
      inputs: [stay("Mechmech for 5 guests"), { expect: "check-in and check-out dates", answer: "July 10 to July 12" }, bedroomClick("2 bedrooms")],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "5") },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Mechmech", "5") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: SUMMARY_TERMINAL,
        messagesExclude: ["How many guests will be staying overnight"],
        // 750 False → supported clone 751 True → bedroom stage b2
        visitsInOrder: [["430", "750", "751", "880", "882", "930"]],
      },
    },
    {
      name: "R03 dates recovered on follow-up, guests extracted UNSUPPORTED (9) → overflow tail e2",
      inputs: [stay("Mechmech for 9 guests"), { expect: "check-in and check-out dates", answer: "July 10 to July 12" }, escName],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "9") },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Mechmech", "9") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ESC_TERMINAL, visitsInOrder: [["750", "751", "964", "974", "977"]] },
    },
    {
      name: "R04 dates unreadable once → retry recovers → guest stage g2 row \"More than 6\"",
      inputs: [
        stay("Mechmech please"),
        { expect: "check-in and check-out dates", answer: "whenever is fine" },
        { expect: "check-in and check-out dates together", answer: "July 10 to July 15" },
        guestClick("More than 6"),
        { expect: "How many guests exactly", answer: "10" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", null) },
        { api: "8101", response: norm(null, null, "Villa Mechmech", null) },
        { api: "8101", response: norm("2026-07-10", "2026-07-15", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        messagesInclude: ["couldn’t read those dates clearly"],
        fieldEquals: { oraya_guest_followup: "10", oraya_guest_count: "More than 6" },
        // retry refine → recovered gate 436 (False) → clone 752 → g2 → overflow row → 466
        visitsInOrder: [["432", "434", "435", "436", "752", "820", "829", "466", "467", "468", "712"]],
      },
    },
    {
      name: "R05 retry recovers, guests extracted (4) → bedroom stage b3 directly",
      inputs: [
        stay("Mechmech, 4 guests"),
        { expect: "check-in and check-out dates", answer: "whenever" },
        { expect: "check-in and check-out dates together", answer: "July 10 to July 15" },
        bedroomClick("3 bedrooms"),
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "4") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "4") },
        { api: "8101", response: norm("2026-07-10", "2026-07-15", "Villa Mechmech", "4") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, visitsInOrder: [["436", "752", "753", "885", "888", "930"]] },
    },
    {
      name: "R06 retry recovers, guests extracted UNSUPPORTED (8) → overflow tail e3",
      inputs: [
        stay("Mechmech, 8 of us"),
        { expect: "check-in and check-out dates", answer: "whenever" },
        { expect: "check-in and check-out dates together", answer: "July 10 to July 15" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "8") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "8") },
        { api: "8101", response: norm("2026-07-10", "2026-07-15", "Villa Mechmech", "8") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ESC_TERMINAL, fieldEquals: { oraya_guest_count: "8" }, visitsInOrder: [["753", "965", "978", "981"]] },
    },
    {
      name: "R07 check-out missing → recovered on follow-up → guest stage g3 row \"6\"",
      inputs: [stay("Mechmech from July 10"), { expect: "check-out date", answer: "July 12" }, guestClick("6"), bedroomClick("3 bedrooms")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", null, "Villa Mechmech", null) },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: SUMMARY_TERMINAL,
        fieldEquals: { oraya_check_out: "2026-07-12", oraya_guest_count: "6" },
        visitsInOrder: [["425", "426", "427", "501", "754", "830", "838", "860", "870"]],
      },
    },
    {
      name: "R08 check-out recovered, guests extracted (3) → bedroom stage b4 directly",
      inputs: [stay("Byblos from July 20 for 3"), { expect: "check-out date", answer: "July 23" }, bedroomClick("1 bedroom")],
      fixtures: [
        { api: "7466", response: norm("2026-07-20", null, "Villa Byblos", "3") },
        { api: "8101", response: norm("2026-07-20", "2026-07-23", "Villa Byblos", "3") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, visitsInOrder: [["501", "754", "755", "890", "891", "930"]] },
    },
    {
      name: "R09 check-out recovered, guests extracted UNSUPPORTED (8) → overflow tail e4",
      inputs: [stay("Byblos from July 20, 8 guests"), { expect: "check-out date", answer: "July 23" }, escName],
      fixtures: [
        { api: "7466", response: norm("2026-07-20", null, "Villa Byblos", "8") },
        { api: "8101", response: norm("2026-07-20", "2026-07-23", "Villa Byblos", "8") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ESC_TERMINAL, visitsInOrder: [["755", "966", "982", "985"]] },
    },
    {
      name: "R10 check-out unreadable once → retry recovers → guest stage g4 row \"5\"",
      inputs: [
        stay("Byblos from July 20"),
        { expect: "check-out date", answer: "soonish" },
        { expect: "check-in and check-out dates together", answer: "July 20 to July 23" },
        guestClick("5"),
        bedroomClick("2 bedrooms"),
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-20", null, "Villa Byblos", null) },
        { api: "8101", response: norm("2026-07-20", null, "Villa Byblos", null) },
        { api: "8101", response: norm("2026-07-20", "2026-07-23", "Villa Byblos", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: SUMMARY_TERMINAL,
        fieldEquals: { oraya_guest_count: "5" },
        visitsInOrder: [["503", "507", "506", "505", "756", "840", "847", "860", "870"]],
      },
    },
    {
      name: "R11 check-out retry recovers, guests extracted (1) → bedroom stage b5 directly",
      inputs: [
        stay("Byblos from July 20, just me"),
        { expect: "check-out date", answer: "soonish" },
        { expect: "check-in and check-out dates together", answer: "July 20 to July 23" },
        bedroomClick("2 bedrooms"),
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-20", null, "Villa Byblos", "1") },
        { api: "8101", response: norm("2026-07-20", null, "Villa Byblos", "1") },
        { api: "8101", response: norm("2026-07-20", "2026-07-23", "Villa Byblos", "1") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, visitsInOrder: [["505", "756", "757", "895", "897", "930"]] },
    },
    {
      name: "R12 check-out retry recovers, guests extracted UNSUPPORTED (11) → overflow tail e5",
      inputs: [
        stay("Byblos from July 20 for 11"),
        { expect: "check-out date", answer: "soonish" },
        { expect: "check-in and check-out dates together", answer: "July 20 to July 23" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-20", null, "Villa Byblos", "11") },
        { api: "8101", response: norm("2026-07-20", null, "Villa Byblos", "11") },
        { api: "8101", response: norm("2026-07-20", "2026-07-23", "Villa Byblos", "11") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: ESC_TERMINAL, visitsInOrder: [["757", "967", "986", "989"]] },
    },

    // ── failed FINAL date retry: the intake continues with dates pending ─────
    // (the date-escalation tails are gone — no name question, no escalation;
    // the guest picks dates on /book via the secure link in the undated summary)
    {
      name: "D01 unreadable dates twice → intake continues (guest row \"2\" → bedrooms → villa) → UNDATED summary, no name ask",
      inputs: [
        stay("a villa please"),
        { expect: "check-in and check-out dates", answer: "whenever" },
        { expect: "check-in and check-out dates together", answer: "still whenever" },
        guestClick("2"),
        bedroomClick("1 bedroom"),
        villaClick("Villa Byblos"),
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, null, null) },
        { api: "8101", response: norm(null, null, null, null) },
        { api: "8101", response: norm(null, null, null, null) },
        { api: "6961", response: { prefill_url: "https://stayoraya.com/book?h=TESTTOKEN123" } },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Dates: Please choose them using the secure link below", "Villa: Villa Byblos", "Overnight guests: 2", "TESTTOKEN123"],
        terminalExcludes: ["null", "Check-in:", "Check-out:"],
        askedExcludes: ["full name"],
        messagesInclude: ["pick your exact dates on our secure booking page"],
        messagesExclude: ["trouble reading the dates", "passed your request"],
        fieldEquals: { oraya_guest_count: "2", oraya_bedroom_count: "1 bedroom", oraya_villa: "Villa Byblos" },
        // final retry fails → transitional #438 → dates-pending guest gate 758
        // (missing) → guest stage 900 → row "2" → shared spine → villa asked →
        // Lead Submit A → date branch 943 (True: unresolved) → undated summary
        visitsInOrder: [["435", "436", "438", "758", "900", "904", "860", "870", "871", "930", "470", "935", "937", "938", "939", "943", "945"]],
      },
    },
    {
      name: "D02 unreadable check-out twice (check-in WAS captured) → bedroom stage → UNDATED summary shows neither date",
      inputs: [
        stay("Mechmech from July 10 for 3"),
        { expect: "check-out date", answer: "soonish" },
        { expect: "check-in and check-out dates together", answer: "still soonish" },
        bedroomClick("2 bedrooms"),
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", null, "Villa Mechmech", "3") },
        { api: "8101", response: norm("2026-07-10", null, "Villa Mechmech", "3") },
        { api: "8101", response: norm("2026-07-10", null, "Villa Mechmech", "3") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Dates: Please choose them using the secure link below", "Overnight guests: 3"],
        // the captured check-in must NOT render on its own — a half-date pair
        // is misleading; the guest sets both dates on /book
        terminalExcludes: ["2026-07-10", "null", "Check-in:", "Check-out:"],
        askedExcludes: ["full name", "check-in and check-out dates together?"],
        // 505 True → transitional #504 → gate 760 (guests known) → supported
        // clone 761 (True) → bedroom stage 925 → completion B → undated summary
        visitsInOrder: [["506", "505", "504", "760", "761", "925", "927", "930", "470", "941", "944", "946"]],
      },
    },
    {
      name: "D03 check-out fails twice, guests missing → guest stage on the dates-pending path → UNDATED summary",
      inputs: [
        stay("Mechmech from July 10"),
        { expect: "check-out date", answer: "no idea" },
        { expect: "check-in and check-out dates together", answer: "really no idea" },
        guestClick("5"),
        bedroomClick("3 bedrooms"),
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", null, "Villa Mechmech", null) },
        { api: "8101", response: norm("2026-07-10", null, "Villa Mechmech", null) },
        { api: "8101", response: norm("2026-07-10", null, "Villa Mechmech", null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Dates: Please choose them using the secure link below", "Overnight guests: 5"],
        terminalExcludes: ["null", "2026-07-10"],
        askedExcludes: ["full name"],
        fieldEquals: { oraya_guest_count: "5" },
        visitsInOrder: [["504", "760", "910", "917", "860", "870", "873", "930", "470", "941", "944", "946"]],
      },
    },
    {
      name: "D04 both dates fail, guests extracted (4) → bedroom stage on the dates-pending path → UNDATED summary",
      inputs: [
        stay("Mechmech for 4 of us"),
        { expect: "check-in and check-out dates", answer: "whenever" },
        { expect: "check-in and check-out dates together", answer: "still whenever" },
        bedroomClick("3 bedrooms"),
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "4") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "4") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "4") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Dates: Please choose them using the secure link below", "Overnight guests: 4"],
        terminalExcludes: ["null"],
        askedExcludes: ["full name", "How many guests will be staying overnight"],
        // gate 758 (guests known: False) → supported clone 759 (True) →
        // bedroom stage 920 → completion B → undated summary
        visitsInOrder: [["436", "438", "758", "759", "920", "923", "930", "470", "941", "944", "946"]],
      },
    },
    {
      name: "D05 both dates fail + extracted UNSUPPORTED count (12) → large-group review tail (existing human outcome)",
      inputs: [
        stay("a villa for 12 people"),
        { expect: "check-in and check-out dates", answer: "whenever" },
        { expect: "check-in and check-out dates together", answer: "still whenever" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, null, "12") },
        { api: "8101", response: norm(null, null, null, "12") },
        { api: "8101", response: norm(null, null, null, "12") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        fieldEquals: { oraya_guest_count: "12" },
        visitsInOrder: [["438", "758", "759", "968", "990", "991", "992", "993"]],
      },
    },
    {
      name: "D06 check-out fails + extracted UNSUPPORTED count (7) → large-group review tail on the check-out path",
      inputs: [
        stay("Mechmech from July 10 for 7"),
        { expect: "check-out date", answer: "dunno" },
        { expect: "check-in and check-out dates together", answer: "still dunno" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", null, "Villa Mechmech", "7") },
        { api: "8101", response: norm("2026-07-10", null, "Villa Mechmech", "7") },
        { api: "8101", response: norm("2026-07-10", null, "Villa Mechmech", "7") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        fieldEquals: { oraya_guest_count: "7" },
        visitsInOrder: [["504", "760", "761", "969", "994", "995", "996", "997"]],
      },
    },
    {
      name: "D07 dates pending + clicked \"More than 6\" → shared overflow ack → exact-count → large-group tail",
      inputs: [
        stay("a villa please"),
        { expect: "check-in and check-out dates", answer: "whenever" },
        { expect: "check-in and check-out dates together", answer: "still whenever" },
        guestClick("More than 6"),
        { expect: "How many guests exactly", answer: "10" },
        escName,
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, null, null) },
        { api: "8101", response: norm(null, null, null, null) },
        { api: "8101", response: norm(null, null, null, null) },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        fieldEquals: { oraya_guest_followup: "10", oraya_guest_count: "More than 6" },
        visitsInOrder: [["758", "900", "909", "865", "466", "467", "468", "712", "715"]],
      },
    },

    // ── live acceptance + blank-value robustness (runtime finding 2026-07-04:
    // a misbound response mapping delivered "" instead of "null", slipping
    // past the missing-checks into a dated summary with a blank check-out) ───
    {
      name: "L01 live acceptance: \"mechmech july 10 to july 11 for 4 people 2 bedrooms\" → both dates + guests + bedrooms + villa + secure link",
      inputs: [stay("mechmech july 10 to july 11 for 4 people 2 bedrooms"), bedroomClick("2 bedrooms")],
      fixtures: [
        // exactly what the FIXED extractor returns for the live message
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "4", "2 bedrooms") },
        { api: "6961", response: { prefill_url: "https://stayoraya.com/book?h=TESTTOKEN123" } },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Check-in: 2026-07-10", "Check-out: 2026-07-11", "Villa: Villa Mechmech", "Overnight guests: 4", "Bedrooms: 2 bedrooms", "TESTTOKEN123"],
        askedExcludes: ["full name", "check-out date"],
        fieldEquals: { oraya_check_out: "2026-07-11", oraya_bedroom_count: "2 bedrooms" },
        visitsInOrder: [["400", "401", "410", "411", "440", "602", "875", "877", "930", "470", "941", "944", "942"]],
      },
    },
    {
      name: "B01 misbound mapping writes \"\" for check-out → read as MISSING → check-out follow-up → recovered dated summary",
      inputs: [stay("mechmech july 10 for 4 people 2 bedrooms"), { expect: "check-out date", answer: "july 11" }, bedroomClick("2 bedrooms")],
      fixtures: [
        { api: "7466", response: { ...norm("2026-07-10", null, "Villa Mechmech", "4", "2 bedrooms"), check_out: "" } },
        { api: "8101", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "4", "2 bedrooms") },
        { api: "6961", response: { prefill_url: "https://stayoraya.com/book?h=TESTTOKEN123" } },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Check-in: 2026-07-10", "Check-out: 2026-07-11", "TESTTOKEN123"],
        askedIncludes: ["check-out date"],
        askedExcludes: ["full name"],
        visitsInOrder: [["401", "410", "411", "425", "426", "427", "501", "754", "755", "890", "892", "930", "470", "941", "944", "942"]],
      },
    },
    {
      name: "B02 \"\" check-out persists through follow-up + retry → UNDATED summary; captured check-in never renders alone",
      inputs: [
        stay("mechmech july 10 to july 11 for 4 people 2 bedrooms"),
        { expect: "check-out date", answer: "july 11" },
        { expect: "check-in and check-out dates together", answer: "july 10 to july 11" },
        bedroomClick("2 bedrooms"),
      ],
      fixtures: [
        { api: "7466", response: { ...norm("2026-07-10", null, "Villa Mechmech", "4", "2 bedrooms"), check_out: "" } },
        { api: "8101", response: { ...norm("2026-07-10", null, "Villa Mechmech", "4", "2 bedrooms"), check_out: "" } },
        { api: "8101", response: { ...norm("2026-07-10", null, "Villa Mechmech", "4", "2 bedrooms"), check_out: "" } },
        { api: "6961", response: { prefill_url: "https://stayoraya.com/book?h=TESTTOKEN123" } },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Dates: Please choose them using the secure link below", "TESTTOKEN123"],
        terminalExcludes: ["2026-07-10", "null", "Check-in:", "Check-out:"],
        askedExcludes: ["full name"],
        visitsInOrder: [["506", "505", "504", "760", "761", "925", "927", "930", "470", "941", "944", "946"]],
      },
    },
    {
      name: "B03 whitespace-only date values → read as MISSING → both-dates follow-up → recovered dated summary",
      inputs: [
        stay("mechmech for 4 people"),
        { expect: "check-in and check-out dates", answer: "july 10 to july 12" },
        bedroomClick("1 bedroom"),
      ],
      fixtures: [
        { api: "7466", response: { ...norm(null, null, "Villa Mechmech", "4"), check_in: " ", check_out: " " } },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Mechmech", "4") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Check-in: 2026-07-10", "Check-out: 2026-07-12"],
        askedExcludes: ["full name"],
        visitsInOrder: [["401", "410", "420", "421", "422", "430", "750", "751", "880", "881", "930", "470", "941", "944", "942"]],
      },
    },

    // ── stale-field safety (returning subscriber) ────────────────────────────
    {
      name: "T01 returning subscriber, stale villa/dates/guests → new attempt overwrites via extracted_text and asks only what is missing",
      staleFields: STALE_ALL,
      inputs: [stay("July 20 to July 25 for 4 guests"), bedroomClick("2 bedrooms"), villaClick("Villa Byblos")],
      fixtures: [
        { api: "7466", response: norm("2026-07-20", "2026-07-25", null, "4") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: [...SUMMARY_TERMINAL, "Check-in: 2026-07-20", "Villa: Villa Byblos", "Overnight guests: 4"],
        fieldEquals: { oraya_villa: "Villa Byblos", oraya_guest_followup: "null" },
      },
    },
    {
      name: "T02 stale guest overflow (12) from an abandoned attempt → deterministically reset to \"null\" on the new attempt",
      staleFields: STALE_ALL,
      inputs: [stay("Villa Mechmech August 5 to August 7 for 2"), bedroomClick("1 bedroom")],
      fixtures: [
        { api: "7466", response: norm("2026-08-05", "2026-08-07", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: SUMMARY_TERMINAL,
        messagesExclude: ["How many guests exactly"],
        fieldEquals: { oraya_guest_count: "2", oraya_guest_followup: "null" },
      },
    },

    // ── fault injection (HTTP failures write no fields; walk continues) ──────
    {
      name: "F01 initial normalization fails → BLANK fields read as MISSING → date follow-up + retry, then the safe human outcome",
      inputs: [
        stay("Villa Mechmech July 10 to 11 for 3"),
        { expect: "check-in and check-out dates", answer: "July 10 to July 11" },
        { expect: "check-in and check-out dates together", answer: "July 10 to July 11" },
        escName,
      ],
      fixtures: [
        { api: "7466", failed: true, response: {} },
        { api: "8101", failed: true, response: {} },
        { api: "8101", failed: true, response: {} },
        { api: "6961", response: {} },
      ],
      expect: {
        leadSubmitted: true,
        terminalIncludes: ESC_TERMINAL,
        // presence contract: unwritten fields ("") contain no "-" and are
        // MISSING, so total API failure now asks the date follow-up + retry
        // (previously "" slipped past the "null" checks as a phantom date),
        // then continues the dates-pending branch; the blank guest field
        // fails the supported-count gate → large-group review tail (name +
        // lead + booking links). The opening question already delivered
        // https://stayoraya.com/book (pre-API safety invariant).
        visitsInOrder: [["400", "401", "410", "420", "421", "422", "430", "432", "434", "435", "436", "438", "758", "759", "968", "990", "991", "992", "993"]],
      },
    },
    {
      name: "F02 refine fails once → retry ask still recovers on the second refine",
      inputs: [
        stay("Mechmech, 2 guests"),
        { expect: "check-in and check-out dates", answer: "July 10 to July 12" },
        { expect: "check-in and check-out dates together", answer: "July 10 to July 12" },
        bedroomClick("1 bedroom"),
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "2") },
        { api: "8101", failed: true, response: {} },
        { api: "8101", response: norm("2026-07-10", "2026-07-12", "Villa Mechmech", "2") },
        { api: "6961", response: {} },
      ],
      expect: { leadSubmitted: true, terminalIncludes: SUMMARY_TERMINAL, fieldEquals: { oraya_check_in: "2026-07-10" } },
    },
    {
      name: "F03 completion Lead Submit fails → summary still delivers the canonical fallback link (prefill slot empty)",
      inputs: [stay("Villa Mechmech July 10 to July 11 for 3 guests"), bedroomClick("2 bedrooms")],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", "Villa Mechmech", "3") },
        { api: "6961", failed: true, response: {} },
      ],
      expect: {
        leadAttempted: true,
        leadSubmitted: false,
        terminalIncludes: ["https://stayoraya.com/book", ...SUMMARY_TERMINAL],
      },
    },
    {
      name: "F04 escalation Lead Submit fails → escalation terminal still delivers the booking links",
      inputs: [stay("a villa for 7 people July 10 to 11"), escName],
      fixtures: [
        { api: "7466", response: norm("2026-07-10", "2026-07-11", null, "7") },
        { api: "6961", failed: true, response: {} },
      ],
      expect: {
        leadAttempted: true,
        leadSubmitted: false,
        terminalIncludes: ["https://stayoraya.com/book", "not a confirmed booking"],
        messagesInclude: ["confirm the details with you personally"],
      },
    },
    {
      name: "F05 dates-pending Lead Submit fails → undated summary still delivers the canonical fallback link",
      inputs: [
        stay("Mechmech for 4 of us"),
        { expect: "check-in and check-out dates", answer: "whenever" },
        { expect: "check-in and check-out dates together", answer: "still whenever" },
        bedroomClick("2 bedrooms"),
      ],
      fixtures: [
        { api: "7466", response: norm(null, null, "Villa Mechmech", "4") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "4") },
        { api: "8101", response: norm(null, null, "Villa Mechmech", "4") },
        { api: "6961", failed: true, response: {} },
      ],
      expect: {
        leadAttempted: true,
        leadSubmitted: false,
        terminalIncludes: ["https://stayoraya.com/book", "Dates: Please choose them using the secure link below", "not a confirmed booking"],
        terminalExcludes: ["null"],
        askedExcludes: ["full name"],
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

  let flow, profile;
  try {
    profile = JSON.parse(readFileSync(profilePath, "utf8"));
    flow = JSON.parse(readFileSync(flowPath, "utf8"));
  } catch (e) {
    console.error(`cannot read input: ${e.message}`);
    process.exit(2);
  }

  const scenarios = buildScenarios();
  let passed = 0;
  for (const scenario of scenarios) {
    const result = runScenario(flow, profile, scenario);
    if (result.failures.length === 0) {
      passed += 1;
      console.log(`PASS  ${scenario.name}`);
    } else {
      console.log(`FAIL  ${scenario.name}`);
      for (const f of result.failures) console.log(`      - ${f}`);
    }
  }
  console.log(`\n${passed} passed, ${scenarios.length - passed} failed (of ${scenarios.length})`);
  process.exit(passed === scenarios.length ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
