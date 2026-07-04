#!/usr/bin/env node
/**
 * Phase 16A — deterministic semantic validator for the Oraya Natural Stay
 * Intake WhatChimp flow export.
 *
 * Usage:
 *   node scripts/validate-whatchimp-flow.mjs <flow-file> [--profile <profile.json>] [--strict-binding]
 *
 * Exit codes: 0 = no errors (warnings allowed), 1 = validation errors,
 * 2 = unusable input (unreadable file / invalid JSON / bad shape).
 *
 * The checks go far beyond "JSON parses and nodes are reachable" — they
 * enforce the natural-intake semantic contract described by the profile
 * manifest (scripts/whatchimp/natural-intake-profile.json): question/field
 * bindings, the interactive-control contract (buttons/rows save directly to
 * the correct custom field with approved labels, exactly one forward
 * transition per press, no Start-a-Flow metadata, no default-output
 * double execution — 2026-07-04 operator schema evidence), postback-only
 * convergence, API placement, condition-row hygiene, terminal-message
 * policy, guest→bedroom→villa→lead→summary path completeness, and
 * human-escalation completeness (name capture + lead submit + safe ending).
 *
 * `--strict-binding` turns any profile-listed placeholder field id into an
 * error — use it for WhatChimp round-trip validation. The canonical v6
 * artifact is generated fully bound (oraya_bedroom_count = 69114), so it
 * passes strict validation with no extra flags.
 *
 * Node standard library only. No new dependencies.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ─── flow accessors ─────────────────────────────────────────────────────────

export function outEdges(node) {
  const edges = [];
  for (const [outKey, out] of Object.entries(node.outputs ?? {})) {
    for (const conn of out.connections ?? []) {
      edges.push({ outKey, node: conn.node, input: conn.input });
    }
  }
  return edges;
}

export function inEdges(node) {
  const edges = [];
  for (const [inKey, inp] of Object.entries(node.inputs ?? {})) {
    for (const conn of inp.connections ?? []) {
      edges.push({ inKey, node: conn.node, output: conn.output });
    }
  }
  return edges;
}

function nodeLabel(id, node) {
  const d = node?.data ?? {};
  const text = (d.textMessage ?? d.question ?? d.httpApiText ?? "").toString().replace(/\s+/g, " ").slice(0, 60);
  return `#${id} ${node?.name ?? "?"}${text ? ` ("${text}")` : ""}`;
}

function fieldNameOf(node) {
  return (node.data?.customFieldSelectedOptionText ?? "").trim();
}

/** BFS successor set (excluding the start node itself unless reachable again). */
export function reachableFrom(nodes, startId) {
  const seen = new Set();
  const queue = [String(startId)];
  while (queue.length) {
    const id = queue.shift();
    for (const e of outEdges(nodes[id] ?? {})) {
      const next = String(e.node);
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// ─── main validation ────────────────────────────────────────────────────────

export function validateFlow(flow, profile, opts = {}) {
  const errors = [];
  const warnings = [];
  const err = (check, msg) => errors.push(`[${check}] ${msg}`);
  const warn = (check, msg) => warnings.push(`[${check}] ${msg}`);

  // 2. top-level shape
  if (typeof flow !== "object" || flow === null || Array.isArray(flow)) {
    err("shape", "top-level export is not an object");
    return { errors, warnings };
  }
  if (typeof flow.id !== "string" || !flow.id) err("shape", "top-level `id` missing or not a string");
  if (typeof flow.nodes !== "object" || flow.nodes === null || Array.isArray(flow.nodes)) {
    err("shape", "top-level `nodes` missing or not an object");
    return { errors, warnings };
  }

  const nodes = flow.nodes;
  const ids = Object.keys(nodes);

  // 3/4. node map keys match ids; ids unique
  const seenIds = new Set();
  for (const key of ids) {
    const node = nodes[key];
    if (String(node?.id) !== key) err("node-id", `node map key ${key} does not match node.id ${node?.id}`);
    if (seenIds.has(String(node?.id))) err("node-id", `duplicate node id ${node?.id}`);
    seenIds.add(String(node?.id));
    if (typeof node?.name !== "string" || !node.name) err("node-id", `node ${key} has no name`);
  }

  // 5. uniqueId / postbackId uniqueness where present
  for (const dupKey of ["uniqueId", "postbackId", "newPostbackId"]) {
    const seen = new Map();
    for (const id of ids) {
      const v = nodes[id]?.data?.[dupKey];
      if (typeof v !== "string" || !v) continue;
      if (seen.has(v)) err("unique-ids", `${dupKey} "${v}" duplicated on nodes #${seen.get(v)} and #${id}`);
      seen.set(v, id);
    }
  }

  // 6/7/8/9. edge integrity + reciprocity
  for (const id of ids) {
    const node = nodes[id];
    for (const e of outEdges(node)) {
      const target = nodes[String(e.node)];
      if (!target) {
        err("edges", `${nodeLabel(id, node)} output "${e.outKey}" targets missing node #${e.node}`);
        continue;
      }
      if (!target.inputs?.[e.input]) {
        err("edges", `${nodeLabel(id, node)} output "${e.outKey}" targets #${e.node} socket "${e.input}" which does not exist`);
        continue;
      }
      const reciprocal = (target.inputs[e.input].connections ?? []).some(
        (c) => String(c.node) === String(id) && c.output === e.outKey,
      );
      if (!reciprocal) {
        err("edges", `output ${id}:${e.outKey} → ${e.node}:${e.input} has no reciprocal serialized input connection`);
      }
    }
    for (const e of inEdges(node)) {
      const source = nodes[String(e.node)];
      if (!source) {
        err("edges", `${nodeLabel(id, node)} input "${e.inKey}" references missing node #${e.node}`);
        continue;
      }
      const reciprocal = (source.outputs?.[e.output]?.connections ?? []).some(
        (c) => String(c.node) === String(id) && c.input === e.inKey,
      );
      if (!reciprocal) {
        err("edges", `input ${id}:${e.inKey} ← ${e.node}:${e.output} has no reciprocal serialized output connection`);
      }
    }
  }

  // single destination per output socket (Interactive button/list fan-out and
  // Sections row fan-out are the only WhatChimp constructs that legitimately
  // drive multiple targets from one output) — a second connection on a
  // Condition/Text/question output makes the executed branch ambiguous and
  // silently bypasses inserted steps.
  for (const id of ids) {
    const node = nodes[id];
    if (node.name === "Interactive" || node.name === "Sections") continue;
    for (const [outKey, out] of Object.entries(node.outputs ?? {})) {
      if ((out.connections ?? []).length > 1) {
        err("edges", `${nodeLabel(id, node)} output "${outKey}" has ${out.connections.length} destinations — ambiguous execution order`);
      }
    }
  }

  // single-parent import contract (profile `importGraphContract`).
  // Authenticated round trip #1 (2026-07-03) proved WhatChimp's import keeps
  // only the FIRST serialized connection per input socket and silently drops
  // every other complete reciprocal edge: all 16 multi-parent nodes of the
  // v6 candidate were reduced to exactly one parent (first-listed survived in
  // 16/16), 32 edges were removed, and 16 unintended terminals appeared.
  // Evidence: artifacts/whatchimp/roundtrips/ROUNDTRIP_1_FINDINGS.md.
  // Any convergence in an import candidate is therefore a structural error.
  // Interactive-controls architecture (2026-07-04): the ONLY convergence an
  // import candidate may serialize is POSTBACK convergence — input sockets
  // whose parents are ALL Inline Button / Rows nodes. Operator evidence
  // (2026-07-04 saved/reopened export, fixture
  // roundtrips/Oraya_natural_intake_v6.button-evidence.saved-reexport.txt):
  // editor-created Inline Buttons linked to custom_57693/oraya_guest_count
  // persisted through save → close → reopen → export while BOTH converging
  // forward into the same next node. The approved merge map
  // (`approvedPostbackMerges`: node id → exact inbound count) is declared in
  // the profile; the validator (a) rejects any UNdeclared convergence,
  // (b) rejects a declared postback hub whose inbound count differs (exactly
  // what an import that dropped button edges looks like), and (c) rejects a
  // declared hub with any NON-postback parent.
  const contract = profile.importGraphContract;
  if (contract) {
    const maxIn = contract.maxInboundPerNode ?? 1;
    const rootName = contract.rootNodeName ?? "Start Bot Flow";
    const approvedPostbackHubs = contract.approvedPostbackMerges ?? {};
    const postbackNames = new Set(contract.postbackSourceNames ?? ["Inline Button", "Rows"]);
    for (const id of ids) {
      const node = nodes[id];
      const campaign = typeof node.data?.campaignName === "string" && node.data.campaignName
        ? ` [campaign "${node.data.campaignName}"]` : "";
      const parents = inEdges(node);
      if (node.name === rootName) {
        if (parents.length !== 0) {
          err("single-parent-contract", `${nodeLabel(id, node)} is the root node but has ${parents.length} inbound connection(s) [${parents.map((e) => `#${e.node}:${e.output}→${e.inKey}`).join(", ")}]`);
        }
        continue;
      }
      const declared = approvedPostbackHubs[id];
      if (declared !== undefined) {
        if (parents.length !== declared) {
          err("single-parent-contract", `${nodeLabel(id, node)}${campaign} is a declared postback-convergence hub with exactly ${declared} inbound connections but has ${parents.length} [${parents.map((e) => `#${e.node}:${e.output}→${e.inKey}`).join(", ")}] — if this is a WhatChimp re-export, the platform dropped button/row edges; stop and report (see artifacts/whatchimp/V6_REDRAW_CHECKLIST.md)`);
        }
        for (const e of parents) {
          const src = nodes[String(e.node)];
          if (!postbackNames.has(src?.name)) {
            err("single-parent-contract", `${nodeLabel(id, node)}${campaign} is a declared postback-convergence hub but parent #${e.node} is a ${src?.name} — only Inline Button / Rows convergence is evidence-approved`);
          }
        }
        continue;
      }
      let socketReported = false;
      for (const [inKey, inp] of Object.entries(node.inputs ?? {})) {
        const conns = inp.connections ?? [];
        if (conns.length > 1) {
          socketReported = true;
          err("single-parent-contract", `${nodeLabel(id, node)}${campaign} input socket "${inKey}" has ${conns.length} connections [${conns.map((c) => `#${c.node}:${c.output}`).join(", ")}] — WhatChimp import keeps only the first serialized connection per input socket (round trip #1, 2026-07-03); undeclared convergence must be cloned away or, when every parent is an Inline Button / Rows control, declared in approvedPostbackMerges`);
        }
      }
      if (!socketReported && parents.length > maxIn) {
        err("single-parent-contract", `${nodeLabel(id, node)}${campaign} has ${parents.length} inbound connections across sockets [${parents.map((e) => `#${e.node}:${e.output}→${e.inKey}`).join(", ")}] — exceeds the import contract maximum of ${maxIn}`);
      }
      // zero-inbound non-root nodes are reported by the start-node and
      // reachability checks below; one-sided and invalid-port edges by the
      // edge-integrity checks above. This rule adds the convergence ban.
    }
  }

  // Operator-drawability of the declared hub redraws (round trips #2 + #3,
  // 2026-07-03 — evidence: artifacts/whatchimp/roundtrips/
  // ROUNDTRIP_2_FINDINGS.md and ROUNDTRIP_3_FINDINGS.md). Round trip #3
  // proved a destination Condition accepts ONE inbound connection TOTAL of
  // any source type (the editor rejects a second with "This will make an
  // infinite loop…"), so NO operator redraw may target a Condition; earlier
  // probe results for Text→Condition / HTTP API→Condition applied only to
  // otherwise-unused Condition inputs. The profile carries:
  //   editorProvenDrawPairs — [sourceType, destType] operations proven live
  //     against already-connected destinations (anything else warns as
  //     unproven until probed);
  //   editorRejectedDrawPairs — pairs the editor refused unconditionally;
  //   maxInboundPerCondition — the total-inbound cap per Condition (1).
  if (contract?.approvedHubMerges) {
    const rejectedPairs = (contract.editorRejectedDrawPairs ?? []).map((p) => p.join(" → "));
    const provenPairs = (contract.editorProvenDrawPairs ?? []).map((p) => p.join(" → "));
    for (const id of Object.keys(contract.approvedHubMerges)) {
      const node = nodes[id];
      if (!node) continue;
      if (node.name === "Condition") {
        err("redraw-drawability", `hub ${nodeLabel(id, node)} is a Condition declared as an operator-redrawn merge — Conditions accept one inbound connection TOTAL (round trip #3), so a redraw can never target one; clone the Condition per parent instead`);
        continue;
      }
      for (const e of inEdges(node).slice(1)) {
        const src = nodes[e.node];
        const pair = `${src?.name} → ${node.name}`;
        if (rejectedPairs.includes(pair)) {
          err("redraw-drawability", `hub ${nodeLabel(id, node)}: operator-drawn edge #${e.node}:${e.output} → #${id}:${e.inKey} is ${pair} — the WhatChimp editor refuses this operation; the architecture must not require it`);
        } else if (!provenPairs.includes(pair)) {
          warn("redraw-drawability", `hub ${nodeLabel(id, node)}: operator-drawn edge #${e.node}:${e.output} → #${id}:${e.inKey} is ${pair} — drawability of this node-type pair has never been proven against an already-connected destination; probe it on a disposable bot before any candidate relies on it`);
        }
      }
    }
  }

  // Editor invariant (round trip #3, 2026-07-03): a destination Condition may
  // carry at most ONE inbound connection TOTAL, regardless of source node
  // type — attempting to draw a second is rejected by the editor with the
  // infinite-loop warning, so a graph that expects one is not
  // operator-repairable after import. Applies to the FULL expected graph
  // (serialized-kept and operator-drawn edges alike).
  if (contract) {
    const maxInbound = contract.maxInboundPerCondition ?? 1;
    for (const id of ids) {
      const node = nodes[id];
      if (node.name !== "Condition") continue;
      const parents = inEdges(node);
      if (parents.length > maxInbound) {
        for (const e of parents.slice(maxInbound)) {
          err("condition-inbound-limit", `${nodeLabel(id, node)} carries ${parents.length} inbound connections (edge #${e.node}:${e.output} → #${id}:${e.inKey} is beyond the editor limit of ${maxInbound} TOTAL, any source type) — the editor rejects extra connections into a Condition ("This will make an infinite loop…"); give each extra parent its own clone (see roundtrips/ROUNDTRIP_3_FINDINGS.md)`);
        }
      }
    }
  }

  // 10. exactly one start node, and it is the trigger
  const startIds = ids.filter((id) => inEdges(nodes[id]).length === 0);
  if (startIds.length !== 1) {
    err("start", `expected exactly 1 node with no incoming connection, found ${startIds.length}: ${startIds.join(", ")}`);
  } else if (nodes[startIds[0]].name !== "Start Bot Flow") {
    err("start", `start node #${startIds[0]} is "${nodes[startIds[0]].name}", expected "Start Bot Flow"`);
  }
  const startId = startIds[0];

  // 11. reachability
  if (startId) {
    const reachable = reachableFrom(nodes, startId);
    reachable.add(String(startId));
    for (const id of ids) {
      if (!reachable.has(id)) err("reachability", `${nodeLabel(id, nodes[id])} is not reachable from the start node`);
    }
  }

  // 12. no cycles (iterative DFS with colors)
  {
    const color = new Map(); // 0 white 1 gray 2 black
    const cycleFound = { value: false };
    const visit = (rootId) => {
      const stack = [[rootId, 0]];
      while (stack.length) {
        const [id, idx] = stack[stack.length - 1];
        if (idx === 0) color.set(id, 1);
        const edges = outEdges(nodes[id] ?? {});
        if (idx >= edges.length) {
          color.set(id, 2);
          stack.pop();
          continue;
        }
        stack[stack.length - 1][1]++;
        const next = String(edges[idx].node);
        if (!nodes[next]) continue;
        const c = color.get(next) ?? 0;
        if (c === 1) {
          err("cycles", `graph cycle detected via edge #${id} → #${next} (WhatChimp rejects backward connections)`);
          cycleFound.value = true;
        } else if (c === 0) {
          stack.push([next, 0]);
        }
      }
    };
    for (const id of ids) if ((color.get(id) ?? 0) === 0) visit(id);
  }

  // profile-derived lookups
  const fieldIdToName = new Map(Object.entries(profile.fields).map(([name, fid]) => [String(fid), name]));
  const placeholderIds = new Set(profile.placeholderFieldIds ?? []);
  const knownApiIds = new Set([
    profile.apis.initialNormalize.id,
    profile.apis.refine.id,
    ...profile.apis.leadSubmit.ids,
  ]);

  const questionNodes = ids.filter((id) => nodes[id].name === "User Input Flow Single");
  const apiNodes = ids.filter((id) => nodes[id].name === "HTTP API");
  const conditionNodes = ids.filter((id) => nodes[id].name === "Condition");
  const textNodes = ids.filter((id) => nodes[id].name === "Text");

  // 13. persistence questions: real custom-field ID + matching name + continuation
  for (const id of questionNodes) {
    const node = nodes[id];
    const cf = (node.data?.customField ?? "").toString().trim();
    const cfName = fieldNameOf(node);
    if (!cf) {
      err("question-binding", `${nodeLabel(id, node)} has an empty customField id${cfName ? ` (selected field name says "${cfName}")` : ""}`);
    } else if (placeholderIds.has(cf)) {
      const msg = `${nodeLabel(id, node)} uses the documented placeholder "${cf}" — bind the real WhatChimp field id before production import (scripts/bind-whatchimp-field.mjs)`;
      if (opts.strictBinding) err("question-binding", msg);
      else warn("question-binding", msg);
    } else if (!/^\d+$/.test(cf)) {
      err("question-binding", `${nodeLabel(id, node)} customField "${cf}" is not a numeric WhatChimp field id`);
    } else if (!fieldIdToName.has(cf)) {
      err("question-binding", `${nodeLabel(id, node)} customField "${cf}" is not in the dependency manifest`);
    } else if (fieldIdToName.get(cf) !== cfName) {
      err("question-binding", `${nodeLabel(id, node)} customField ${cf} is "${fieldIdToName.get(cf)}" in the manifest but the node's selected field name is "${cfName}" (silent field reuse)`);
    }
    if (cfName && !cf) {
      // already reported above; keep single error
    }
    if (outEdges(node).length === 0) {
      err("question-continuation", `${nodeLabel(id, node)} has no outgoing continuation`);
    }
  }

  // 13b. question transitions must match genuine WhatChimp exports.
  // All 22 genuine exports surveyed (operator's v5.5 + 21 platform-named
  // exports; evidence table with hashes and per-file censuses in
  // artifacts/whatchimp/V6_TRANSITION_EVIDENCE.md) show exactly two question
  // continuations: final-reply → Text and final-reply → HTTP API (plus the
  // chained-question port → another question). Direct Question → Condition / Question → User Input Flow
  // edges were operator-observed rendering as loose or disconnected lines
  // after import (2026-07-03) — rebuild them as Question → Text → next.
  for (const id of questionNodes) {
    const node = nodes[id];
    const edges = outEdges(node);
    if (edges.length > 1) {
      err("question-transition", `${nodeLabel(id, node)} has ${edges.length} outgoing connections — a question must have exactly one continuation path`);
    }
    for (const e of edges) {
      const dst = nodes[String(e.node)];
      const supported =
        (e.outKey === "userInputFlowSingleOutputFinalReply" && (dst?.name === "Text" || dst?.name === "HTTP API")) ||
        (e.outKey === "userInputFlowSingleOutput" && dst?.name === "User Input Flow Single");
      if (!supported) {
        err("question-transition", `${nodeLabel(id, node)} continues ${e.outKey} → ${nodeLabel(e.node, dst)} — unsupported direct question transition (genuine WhatChimp exports only show Question → Text / Question → HTTP API; insert an acknowledgement Text node)`);
      }
    }
  }

  // 13c. interactive-control contract (2026-07-04 operator schema evidence:
  // Interactive #775 + Inline Buttons #776/#783 — buttons carry the
  // custom-field assignment themselves and route forward on the press; the
  // stored value is the visible label; #776 additionally demonstrated the
  // Start-a-Flow metadata (`value`/`postback_text`) COMBINED with a direct
  // connector, which is the self-restart + double-execution hazard this
  // check bans outright).
  const interactiveNodes = ids.filter((id) => nodes[id].name === "Interactive");
  const controlNodes = ids.filter((id) => nodes[id].name === "Inline Button" || nodes[id].name === "Rows");
  for (const id of interactiveNodes) {
    const node = nodes[id];
    const def = node.outputs?.interactiveOutput?.connections ?? [];
    if (def.length) {
      err("interactive-contract", `${nodeLabel(id, node)} has ${def.length} default interactiveOutput connection(s) alongside its controls — one press would execute the next stage twice`);
    }
    const btn = node.outputs?.interactiveOutputButton?.connections ?? [];
    const list = node.outputs?.interactiveOutputListMessage?.connections ?? [];
    if ((btn.length > 0) === (list.length > 0)) {
      err("interactive-contract", `${nodeLabel(id, node)} must use exactly one control family (buttons XOR list message) — has ${btn.length} button connection(s) and ${list.length} list connection(s)`);
    }
    for (const e of btn) {
      if (nodes[String(e.node)]?.name !== "Inline Button") {
        err("interactive-contract", `${nodeLabel(id, node)} interactiveOutputButton targets ${nodeLabel(e.node, nodes[String(e.node)])} — expected an Inline Button`);
      }
    }
    for (const e of list) {
      if (nodes[String(e.node)]?.name !== "Keyboard") {
        err("interactive-contract", `${nodeLabel(id, node)} interactiveOutputListMessage targets ${nodeLabel(e.node, nodes[String(e.node)])} — expected a Keyboard (list) node`);
      }
    }
  }
  for (const id of controlNodes) {
    const node = nodes[id];
    const d = node.data ?? {};
    const label = node.name === "Rows" ? (d.title ?? "") : (d.buttonText ?? "");
    if ("value" in d || "postback_text" in d) {
      err("interactive-contract", `${nodeLabel(id, node)} "${label}" carries Start-a-Flow metadata (value/postback_text) — an intake answer control must never start a flow (self-restart / recursion / double-execution hazard)`);
    }
    if (node.name === "Inline Button" && d.buttonType !== "new_post_back") {
      err("interactive-contract", `${nodeLabel(id, node)} "${label}" buttonType is "${d.buttonType}" — expected "new_post_back"`);
    }
    const cfId = (d.customFieldId ?? "").toString();
    const cfName = (d.customFieldSelectedOptionText ?? "").toString();
    const m = /^custom_(\d+)$/.exec(cfId);
    if (!m) {
      err("interactive-contract", `${nodeLabel(id, node)} "${label}" customFieldId "${cfId}" is not a custom_<id> field reference — the control must save its value directly`);
    } else if (!fieldIdToName.has(m[1])) {
      err("interactive-contract", `${nodeLabel(id, node)} "${label}" customFieldId "${cfId}" is not in the dependency manifest`);
    } else if (fieldIdToName.get(m[1]) !== cfName) {
      err("interactive-contract", `${nodeLabel(id, node)} "${label}" customFieldId ${cfId} is "${fieldIdToName.get(m[1])}" in the manifest but the control's selected field name is "${cfName}" (silent field reuse)`);
    }
    const controlSpec = (profile.interactiveControls ?? {})[cfName];
    if (controlSpec) {
      if (controlSpec.controlType && controlSpec.controlType !== node.name) {
        err("interactive-contract", `${nodeLabel(id, node)} "${label}" collects ${cfName} as a ${node.name} — the approved control type is ${controlSpec.controlType}`);
      }
      if (!controlSpec.labels.includes(label)) {
        err("interactive-contract", `${nodeLabel(id, node)} label "${label}" is not an approved ${cfName} value [${controlSpec.labels.join(", ")}] — the stored value IS the label, so an unapproved label writes an unapproved value`);
      }
    }
    const fwdKey = node.name === "Rows" ? "rowOutput" : "buttonOutput";
    const fwd = node.outputs?.[fwdKey]?.connections ?? [];
    if (fwd.length !== 1) {
      err("interactive-contract", `${nodeLabel(id, node)} "${label}" has ${fwd.length} forward connection(s) on ${fwdKey} — exactly one is required (one press = one field assignment = one downstream transition)`);
    } else if (nodes[String(fwd[0].node)]?.name === "Condition") {
      err("interactive-contract", `${nodeLabel(id, node)} "${label}" routes directly into Condition #${fwd[0].node} — Conditions accept one inbound connection TOTAL (round trip #3); route through a Text/wrapper`);
    }
    const inbound = inEdges(node);
    const attached = inbound.some((e) => e.output === "interactiveOutputButton" || e.output === "sectionOutputRows");
    if (!attached) {
      err("interactive-contract", `${nodeLabel(id, node)} "${label}" is not attached to an Interactive control fan (no interactiveOutputButton / sectionOutputRows parent)`);
    }
  }

  // 14. HTTP API nodes: bound + connected on both sides
  for (const id of apiNodes) {
    const node = nodes[id];
    const apiId = (node.data?.httpApiId ?? "").toString().trim();
    if (!apiId) err("api-binding", `${nodeLabel(id, node)} has an empty httpApiId`);
    else if (!knownApiIds.has(apiId)) err("api-binding", `${nodeLabel(id, node)} httpApiId "${apiId}" is not in the dependency manifest`);
    if (inEdges(node).length === 0) err("api-connection", `${nodeLabel(id, node)} has no incoming connection`);
    if (outEdges(node).length === 0) err("api-connection", `${nodeLabel(id, node)} has no outgoing connection (dead-end API call)`);
  }

  // 15. initial-normalize API only after a stay-text question
  for (const id of apiNodes) {
    const node = nodes[id];
    if ((node.data?.httpApiId ?? "") !== profile.apis.initialNormalize.id) continue;
    for (const e of inEdges(node)) {
      const src = nodes[String(e.node)];
      const okPosition = src?.name === "User Input Flow Single" &&
        (src.data?.customField === profile.fields[profile.stayTextField] || fieldNameOf(src) === profile.stayTextField);
      if (!okPosition) {
        err("api-placement", `initial normalization API ${nodeLabel(id, node)} is fed by ${nodeLabel(e.node, src)} which is not a "${profile.stayTextField}" question`);
      }
    }
  }

  // 16. every date-follow-up question feeds the refine API, and vice versa
  for (const id of questionNodes) {
    const node = nodes[id];
    if (fieldNameOf(node) !== profile.followupField) continue;
    for (const e of outEdges(node)) {
      const dst = nodes[String(e.node)];
      if (dst?.name !== "HTTP API" || dst.data?.httpApiId !== profile.apis.refine.id) {
        err("refine-placement", `date follow-up question ${nodeLabel(id, node)} must continue directly into the refine API (${profile.apis.refine.id}), found ${nodeLabel(e.node, dst)}`);
      }
    }
  }
  for (const id of apiNodes) {
    const node = nodes[id];
    if ((node.data?.httpApiId ?? "") !== profile.apis.refine.id) continue;
    for (const e of inEdges(node)) {
      const src = nodes[String(e.node)];
      if (src?.name !== "User Input Flow Single" || fieldNameOf(src) !== profile.followupField) {
        err("refine-placement", `refine API ${nodeLabel(id, node)} is fed by ${nodeLabel(e.node, src)} which is not a "${profile.followupField}" question`);
      }
    }
  }

  // 17/18. condition-row hygiene
  for (const id of conditionNodes) {
    const d = nodes[id].data ?? {};
    const fields = d.custom_field_variable ?? [];
    const ops = d.custom_field_operator ?? [];
    const values = d.custom_field_variable_value ?? [];
    const names = d.custom_field_variable_selected_texts ?? [];
    if (fields.length !== ops.length || fields.length !== values.length || fields.length !== names.length) {
      err("condition-shape", `${nodeLabel(id, nodes[id])} has misaligned condition arrays (fields=${fields.length}, ops=${ops.length}, values=${values.length}, names=${names.length})`);
      continue;
    }
    if (fields.length === 0) err("condition-shape", `${nodeLabel(id, nodes[id])} has no condition rows`);
    const rowSet = new Set();
    fields.forEach((field, i) => {
      const op = ops[i];
      const value = values[i];
      const name = names[i];
      if (!field || field === "Select") err("condition-rows", `${nodeLabel(id, nodes[id])} row ${i + 1} has a blank field`);
      if (!op || op === "Select") err("condition-rows", `${nodeLabel(id, nodes[id])} row ${i + 1} has a blank operator`);
      else if (!(profile.allowedConditionOperators ?? []).includes(op)) err("condition-rows", `${nodeLabel(id, nodes[id])} row ${i + 1} operator "${op}" is not allowed`);
      if (typeof value !== "string" || value.trim() === "") {
        err("condition-rows", `${nodeLabel(id, nodes[id])} row ${i + 1} has a prohibited blank comparison value`);
      }
      const rowKey = `${field}|${op}|${value}`;
      if (rowSet.has(rowKey)) err("condition-rows", `${nodeLabel(id, nodes[id])} row ${i + 1} duplicates an identical earlier row (${name} ${op} "${value}")`);
      rowSet.add(rowKey);
      // 31/32. referenced field ids must be known and match their names
      const m = /^custom_(.+)$/.exec(field ?? "");
      if (m) {
        const fid = m[1];
        if (!fieldIdToName.has(fid) && !placeholderIds.has(fid)) {
          err("condition-rows", `${nodeLabel(id, nodes[id])} row ${i + 1} references unknown custom field id ${fid}`);
        } else if (fieldIdToName.has(fid) && fieldIdToName.get(fid) !== name) {
          err("condition-rows", `${nodeLabel(id, nodes[id])} row ${i + 1} field id ${fid} is "${fieldIdToName.get(fid)}" in the manifest but the row label says "${name}"`);
        }
        if (placeholderIds.has(fid)) {
          const msg = `${nodeLabel(id, nodes[id])} row ${i + 1} uses placeholder field id "${fid}" — bind before production import`;
          if (opts.strictBinding) err("condition-rows", msg);
          else warn("condition-rows", msg);
        }
      }
    });
    // 19. both branches wired
    for (const branch of ["conditionOutputTrue", "conditionOutputFalse"]) {
      if (((nodes[id].outputs?.[branch]?.connections) ?? []).length === 0) {
        err("condition-branches", `${nodeLabel(id, nodes[id])} has no destination on ${branch}`);
      }
    }
  }

  // 20/21/30. terminal policy
  const terminalIds = ids.filter((id) => outEdges(nodes[id]).length === 0);
  for (const id of terminalIds) {
    const node = nodes[id];
    if (node.name !== "Text") {
      err("terminals", `${nodeLabel(id, node)} is a terminal ${node.name} node — flows must end on approved guest-facing Text messages only`);
      continue;
    }
    const text = (node.data?.textMessage ?? "").toString();
    if ((profile.forbiddenTerminalTexts ?? []).some((t) => text.trim() === t)) {
      err("terminals", `${nodeLabel(id, node)} is a dead-end acknowledgement ("${text.trim()}")`);
      continue;
    }
    const approved = (profile.approvedTerminalSnippets ?? []).some((s) => text.includes(s));
    if (!approved) {
      err("terminals", `${nodeLabel(id, node)} is an unapproved terminal message: "${text.replace(/\s+/g, " ").slice(0, 100)}"`);
    }
    // actionable-outcome invariant: a terminal is valid only when it hands
    // the guest a booking continuation — the secure prefill link AND the
    // canonical fallback /book URL — and states the accurate not-confirmed
    // status. A lead-submission or team-follow-up acknowledgement without a
    // booking continuation is an invalid terminal.
    for (const required of profile.terminalMustIncludeAll ?? []) {
      if (!text.includes(required)) {
        err("terminal-continuation", `${nodeLabel(id, node)} lacks the required continuation element "${required}" — guests must never be left without an actionable next step`);
      }
    }
    if (profile.terminalNotConfirmedPattern && !new RegExp(profile.terminalNotConfirmedPattern, "i").test(text)) {
      err("terminal-continuation", `${nodeLabel(id, node)} does not state the accurate not-confirmed booking status`);
    }
  }

  // pre-API safety-link invariant: from the start node, the guest must be
  // shown the canonical booking URL BEFORE any HTTP API node can be reached.
  // Traverse from start, treating any node whose guest-facing text contains
  // the canonical URL as a barrier (the guest holds the link once it is
  // reached); if an HTTP API node is reachable without crossing a barrier,
  // a platform halt on that call would strand a guest with no link.
  if (profile.canonicalBookingUrl && startId) {
    const showsLink = (n) =>
      `${n?.data?.textMessage ?? ""}\n${n?.data?.question ?? ""}`.includes(profile.canonicalBookingUrl);
    const seen = new Set([String(startId)]);
    const queue = [String(startId)];
    while (queue.length) {
      const id = queue.shift();
      const node = nodes[id];
      if (showsLink(node)) continue; // guest received the link here — stop expanding
      if (node?.name === "HTTP API") {
        err("pre-api-safety-link", `${nodeLabel(id, node)} is reachable from the start before the guest has been shown ${profile.canonicalBookingUrl}`);
        continue;
      }
      for (const edge of outEdges(node ?? {})) {
        const next = String(edge.node);
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }

  // canonical-domain hygiene: every guest-facing text (messages + questions)
  // may only reference https://stayoraya.com — never www., .lb variants,
  // bare oraya.com, or plain http.
  for (const id of ids) {
    const d = nodes[id].data ?? {};
    const guestText = `${d.textMessage ?? ""}\n${d.question ?? ""}`;
    for (const pattern of profile.forbiddenDomainPatterns ?? []) {
      if (new RegExp(pattern, "i").test(guestText)) {
        err("canonical-domain", `${nodeLabel(id, nodes[id])} guest-facing text matches forbidden domain pattern "${pattern}" — the only Oraya web origin is https://stayoraya.com`);
      }
    }
  }

  // helper: does a path exist from a node to any node satisfying pred?
  const reachesPred = (fromId, pred) => {
    const seen = reachableFrom(nodes, fromId);
    for (const id of seen) if (pred(id, nodes[id])) return true;
    return false;
  };
  const controlField = (n) => (n?.data?.customFieldSelectedOptionText ?? "").toString();
  const controlLabel = (n) => (n?.name === "Rows" ? n?.data?.title : n?.data?.buttonText) ?? "";
  const isControl = (n) => n?.name === "Inline Button" || n?.name === "Rows";
  const isBedroomControl = (id, n) =>
    (isControl(n) && controlField(n) === profile.bedroomField) ||
    (n?.name === "User Input Flow Single" && fieldNameOf(n) === profile.bedroomField);
  const isLeadSubmit = (id, n) => n?.name === "HTTP API" && profile.apis.leadSubmit.ids.includes(n.data?.httpApiId ?? "");
  const isNameQuestion = (id, n) => n?.name === "User Input Flow Single" && fieldNameOf(n) === profile.fullNameField;
  const isSummaryTerminal = (id, n) =>
    n?.name === "Text" && outEdges(n).length === 0 &&
    (n.data?.textMessage ?? "").includes(profile.summaryTerminalSnippet ?? " ");

  // 22. guest-count controls: complete choice set, exact values, correct routing
  const guestControls = controlNodes.filter((id) => controlField(nodes[id]) === profile.guestCountField);
  if (guestControls.length === 0) err("guest-path", "no interactive control saving to the exact guest-count field exists");
  const guestStayValues = new Set(profile.supportedGuestValues);
  for (const id of guestControls) {
    const label = controlLabel(nodes[id]);
    if (/\d\s*-\s*\d|or more/i.test(label)) {
      err("guest-path", `guest-count control ${nodeLabel(id, nodes[id])} offers a range choice ("${label}") instead of an exact value`);
    }
    if (guestStayValues.has(label)) {
      // a supported count continues toward the bedroom question
      if (!reachesPred(id, isBedroomControl)) {
        err("guest-path", `guest-count control "${label}" (${nodeLabel(id, nodes[id])}) never reaches a bedroom-selection control`);
      }
    } else if (label === profile.guestOverflowChoice) {
      // "More than 6" exits the stay-completion path into the human outcome
      if (!reachesPred(id, isLeadSubmit)) {
        err("guest-path", `overflow control "${label}" (${nodeLabel(id, nodes[id])}) never reaches lead-submitting escalation`);
      }
      if (reachesPred(id, isSummaryTerminal)) {
        err("guest-path", `overflow control "${label}" (${nodeLabel(id, nodes[id])}) reaches the stay-completion summary — More than 6 must route away from stay completion`);
      }
      if (reachesPred(id, (nid, n) => isControl(n) && (controlField(n) === profile.bedroomField || controlField(n) === profile.villaField))) {
        err("guest-path", `overflow control "${label}" (${nodeLabel(id, nodes[id])}) still reaches a bedroom/villa question — More than 6 must not continue the stay questions`);
      }
    }
  }
  // conditions on the guest field only compare supported values or "null"
  const allowedGuestConditionValues = new Set([...profile.supportedGuestValues, "null"]);
  for (const id of conditionNodes) {
    const d = nodes[id].data ?? {};
    (d.custom_field_variable_selected_texts ?? []).forEach((name, i) => {
      const value = (d.custom_field_variable_value ?? [])[i];
      if (name === profile.guestCountField && !allowedGuestConditionValues.has(value)) {
        err("guest-path", `${nodeLabel(id, nodes[id])} row ${i + 1} compares ${profile.guestCountField} to "${value}" — only supported values or "null" are meaningful (the stored value is the control label)`);
      }
    });
  }

  // 23. bedroom controls: three approved options, each completing the request
  const bedroomControls = controlNodes.filter((id) => controlField(nodes[id]) === profile.bedroomField);
  if (bedroomControls.length === 0 && questionNodes.every((id) => fieldNameOf(nodes[id]) !== profile.bedroomField)) {
    err("bedroom-path", "no bedroom-selection control exists");
  }
  for (const id of bedroomControls) {
    if (!reachesPred(id, isLeadSubmit)) {
      err("bedroom-path", `bedroom control ${nodeLabel(id, nodes[id])} "${controlLabel(nodes[id])}" never reaches lead submission`);
    }
    if (!reachesPred(id, isSummaryTerminal)) {
      err("bedroom-path", `bedroom control ${nodeLabel(id, nodes[id])} "${controlLabel(nodes[id])}" never reaches the request-summary terminal`);
    }
  }

  // 24. villa controls: exact canonical values, each completing the request
  const villaControls = controlNodes.filter((id) => controlField(nodes[id]) === profile.villaField);
  if (villaControls.length === 0 && questionNodes.every((id) => fieldNameOf(nodes[id]) !== profile.villaField)) {
    err("villa-path", "no villa-selection control exists");
  }
  for (const id of villaControls) {
    if (!reachesPred(id, isLeadSubmit)) {
      err("villa-path", `villa control ${nodeLabel(id, nodes[id])} "${controlLabel(nodes[id])}" never reaches lead submission`);
    }
  }

  // 25. request-summary terminals: at least one exists; every one displays the
  // complete stay details (dates, villa, guests, bedrooms)
  const summaryTerminals = terminalIds.filter((id) => isSummaryTerminal(id, nodes[id]));
  if (summaryTerminals.length === 0) err("summary", "no request-summary terminal exists (lead submission must end on the summary message)");
  for (const id of summaryTerminals) {
    const text = (nodes[id].data?.textMessage ?? "").toString();
    for (const token of profile.summaryMustInclude ?? []) {
      if (!text.includes(token)) err("summary", `summary terminal ${nodeLabel(id, nodes[id])} does not display ${token}`);
    }
    const feeder = inEdges(nodes[id]);
    if (!feeder.some((e) => isLeadSubmit(e.node, nodes[String(e.node)]))) {
      err("summary", `summary terminal ${nodeLabel(id, nodes[id])} is not fed by a Lead Submit API node — the request must be saved before the summary is shown`);
    }
  }

  // 26. date retries recover or reach complete escalation
  for (const id of apiNodes) {
    if ((nodes[id].data?.httpApiId ?? "") !== profile.apis.refine.id) continue;
    const recovers = reachesPred(id, isBedroomControl);
    const escalates = reachesPred(id, isLeadSubmit);
    if (!recovers && !escalates) {
      err("date-retry", `refine API ${nodeLabel(id, nodes[id])} neither recovers into the flow nor reaches lead-submitting escalation`);
    }
  }

  // 27. every escalation message reaches name capture + lead submit + approved terminal
  for (const id of textNodes) {
    const text = (nodes[id].data?.textMessage ?? "").toString().toLowerCase();
    if (!(profile.escalationSnippets ?? []).some((s) => text.includes(s.toLowerCase()))) continue;
    if (!reachesPred(id, isNameQuestion)) err("escalation", `escalation message ${nodeLabel(id, nodes[id])} never collects the guest's full name`);
    if (!reachesPred(id, isLeadSubmit)) err("escalation", `escalation message ${nodeLabel(id, nodes[id])} never submits a lead`);
    const reachesApprovedTerminal = reachesPred(id, (nid, n) => {
      if (n?.name !== "Text" || outEdges(n).length > 0) return false;
      return (profile.approvedTerminalSnippets ?? []).some((s) => (n.data?.textMessage ?? "").includes(s));
    });
    if (!reachesApprovedTerminal) err("escalation", `escalation message ${nodeLabel(id, nodes[id])} never reaches an approved final message`);
  }

  // stale version labels: titles / campaign names must not advertise a
  // superseded flow revision (e.g. "v5.5") in the shipped artifact.
  for (const staleLabel of profile.staleVersionLabels ?? []) {
    for (const id of ids) {
      const d = nodes[id].data ?? {};
      for (const key of ["title", "campaignName"]) {
        if (typeof d[key] === "string" && d[key].includes(staleLabel)) {
          err("stale-labels", `${nodeLabel(id, nodes[id])} ${key} still says "${d[key]}" — superseded revision label "${staleLabel}"`);
        }
      }
    }
  }

  // 29. secret scan
  const serialized = JSON.stringify(flow);
  for (const pattern of profile.secretPatterns ?? []) {
    if (serialized.includes(pattern)) err("secrets", `artifact contains the forbidden pattern "${pattern}"`);
  }

  return { errors, warnings };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const strictBinding = args.includes("--strict-binding");
  const profileIdx = args.indexOf("--profile");
  const bedroomIdx = args.indexOf("--bedroom-field-id");
  const optionValueIdxs = new Set([profileIdx + 1, bedroomIdx + 1].filter((i) => i > 0));
  const positional = args.filter((a, i) => !a.startsWith("--") && !optionValueIdxs.has(i));
  const flowPath = positional[0];
  if (!flowPath) {
    console.error("usage: node scripts/validate-whatchimp-flow.mjs <flow-file> [--profile <profile.json>] [--strict-binding] [--bedroom-field-id <id>]");
    process.exit(2);
  }
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const profilePath = profileIdx !== -1 ? args[profileIdx + 1] : path.join(scriptDir, "whatchimp", "natural-intake-profile.json");

  let flow;
  let profile;
  try {
    profile = JSON.parse(readFileSync(profilePath, "utf8"));
  } catch (e) {
    console.error(`cannot read profile ${profilePath}: ${e.message}`);
    process.exit(2);
  }
  if (bedroomIdx !== -1) {
    const realId = args[bedroomIdx + 1];
    if (!/^\d+$/.test(realId ?? "")) {
      console.error("--bedroom-field-id requires the real numeric WhatChimp field id");
      process.exit(2);
    }
    profile.fields.oraya_bedroom_count = realId;
    profile.placeholderFieldIds = [];
  }
  try {
    flow = JSON.parse(readFileSync(flowPath, "utf8"));
  } catch (e) {
    console.error(`FAIL [json] flow file is not valid JSON or unreadable: ${e.message}`);
    process.exit(2);
  }

  const { errors, warnings } = validateFlow(flow, profile, { strictBinding });
  const nodeCount = Object.keys(flow.nodes ?? {}).length;
  let edgeCount = 0;
  for (const n of Object.values(flow.nodes ?? {})) edgeCount += outEdges(n).length;

  console.log(`flow: ${flowPath}`);
  console.log(`profile: ${profile.profile} | nodes: ${nodeCount} | output connections: ${edgeCount} | strict-binding: ${strictBinding}`);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
