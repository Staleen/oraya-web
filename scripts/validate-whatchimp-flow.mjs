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
 * bindings, API placement, condition-row hygiene, terminal-message policy,
 * guest→bedroom→villa→confirmation path completeness, Edit re-entry, and
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

  // single destination per output socket (Interactive button fan-out is the
  // only WhatChimp node that legitimately drives multiple targets from one
  // output) — a second connection on a Condition/Text/question output makes
  // the executed branch ambiguous and silently bypasses inserted steps.
  for (const id of ids) {
    const node = nodes[id];
    if (node.name === "Interactive") continue;
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
  // Hybrid architecture (2026-07-03, Option A): a bounded set of central hub
  // merges is DECLARED in the profile (`approvedHubMerges`: node id → exact
  // inbound count). The import drops their beyond-first edges; the operator
  // re-draws them from the generated artifacts/whatchimp/V6_REDRAW_CHECKLIST.md.
  // The validator therefore (a) rejects any UNdeclared convergence, and
  // (b) rejects a declared hub whose inbound count differs from the declared
  // one — which is exactly what an unrepaired WhatChimp re-export looks like.
  const contract = profile.importGraphContract;
  if (contract) {
    const maxIn = contract.maxInboundPerNode ?? 1;
    const rootName = contract.rootNodeName ?? "Start Bot Flow";
    const approvedHubs = contract.approvedHubMerges ?? {};
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
      const declared = approvedHubs[id];
      if (declared !== undefined) {
        if (parents.length !== declared) {
          err("single-parent-contract", `${nodeLabel(id, node)}${campaign} is a declared operator-redrawn hub with exactly ${declared} inbound connections but has ${parents.length} [${parents.map((e) => `#${e.node}:${e.output}→${e.inKey}`).join(", ")}] — if this is a WhatChimp re-export, the import dropped hub edges; re-draw them per artifacts/whatchimp/V6_REDRAW_CHECKLIST.md`);
        }
        continue;
      }
      let socketReported = false;
      for (const [inKey, inp] of Object.entries(node.inputs ?? {})) {
        const conns = inp.connections ?? [];
        if (conns.length > 1) {
          socketReported = true;
          err("single-parent-contract", `${nodeLabel(id, node)}${campaign} input socket "${inKey}" has ${conns.length} connections [${conns.map((c) => `#${c.node}:${c.output}`).join(", ")}] — WhatChimp import keeps only the first and silently drops the rest (round trip #1, 2026-07-03); undeclared convergence must be cloned or added to approvedHubMerges + the redraw checklist`);
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

  // Operator-drawability of the declared hub redraws (round trip #2 +
  // corrected live probes, 2026-07-03 — evidence:
  // artifacts/whatchimp/roundtrips/ROUNDTRIP_2_FINDINGS.md). The editor's
  // "This will make an infinite loop…" warning fires only when a connection
  // would give a destination Condition a SECOND Condition-source parent, so:
  //   editorProvenDrawPairs — [sourceType, destType] operations an operator
  //     has successfully drawn live on this tenant (anything else warns as
  //     unproven until probed);
  //   editorRejectedDrawPairs — pairs the editor refused unconditionally
  //     (currently none — the Condition→Condition refusal is conditional and
  //     is enforced by the condition-parent-limit check below);
  //   maxConditionSourceParents — each destination Condition may carry at
  //     most this many inbound edges whose SOURCE is a Condition (default 1).
  if (contract?.approvedHubMerges) {
    const rejectedPairs = (contract.editorRejectedDrawPairs ?? []).map((p) => p.join(" → "));
    const provenPairs = (contract.editorProvenDrawPairs ?? []).map((p) => p.join(" → "));
    for (const id of Object.keys(contract.approvedHubMerges)) {
      const node = nodes[id];
      if (!node) continue;
      for (const e of inEdges(node).slice(1)) {
        const src = nodes[e.node];
        const pair = `${src?.name} → ${node.name}`;
        if (rejectedPairs.includes(pair)) {
          err("redraw-drawability", `hub ${nodeLabel(id, node)}: operator-drawn edge #${e.node}:${e.output} → #${id}:${e.inKey} is ${pair} — the WhatChimp editor refuses this operation; the architecture must not require it (artifacts/whatchimp/roundtrips/ROUNDTRIP_2_FINDINGS.md)`);
        } else if (!provenPairs.includes(pair)) {
          warn("redraw-drawability", `hub ${nodeLabel(id, node)}: operator-drawn edge #${e.node}:${e.output} → #${id}:${e.inKey} is ${pair} — drawability of this node-type pair has never been proven in the current editor; probe it on a disposable bot before any candidate relies on it`);
        }
      }
    }
  }

  // Corrected editor rule (round trip #2, 2026-07-03): a destination Condition
  // may carry at most ONE inbound edge whose source node type is Condition —
  // attempting to draw a second is rejected by the editor with the
  // infinite-loop warning, so a graph that expects one is not
  // operator-repairable after import. Applies to the FULL expected graph
  // (serialized-kept and operator-drawn edges alike).
  if (contract) {
    const maxCondParents = contract.maxConditionSourceParents ?? 1;
    for (const id of ids) {
      const node = nodes[id];
      if (node.name !== "Condition") continue;
      const condParents = inEdges(node).filter((e) => nodes[e.node]?.name === "Condition");
      if (condParents.length > maxCondParents) {
        for (const e of condParents.slice(maxCondParents)) {
          err("condition-parent-limit", `${nodeLabel(id, node)} carries ${condParents.length} Condition-source parents (edge #${e.node}:${e.output} → #${id}:${e.inKey} is beyond the editor limit of ${maxCondParents}) — the editor rejects drawing extra Condition parents ("This will make an infinite loop…"); give each extra Condition-source parent its own clone (see roundtrips/ROUNDTRIP_2_FINDINGS.md)`);
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
  const isBedroomQuestion = (id, n) => n?.name === "User Input Flow Single" && fieldNameOf(n) === profile.bedroomField;
  const isConfirmQuestion = (id, n) => n?.name === "User Input Flow Single" && fieldNameOf(n) === profile.confirmField;
  const isVillaGate = (id, n) =>
    (n?.name === "Condition" && (n.data?.custom_field_variable_selected_texts ?? []).includes(profile.villaField)) ||
    (n?.name === "User Input Flow Single" && fieldNameOf(n) === profile.villaField);
  const isLeadSubmit = (id, n) => n?.name === "HTTP API" && profile.apis.leadSubmit.ids.includes(n.data?.httpApiId ?? "");
  const isNameQuestion = (id, n) => n?.name === "User Input Flow Single" && fieldNameOf(n) === profile.fullNameField;

  // 22. every supported guest-count path reaches bedroom selection
  const guestQuestions = questionNodes.filter((id) => fieldNameOf(nodes[id]) === profile.guestCountField);
  if (guestQuestions.length === 0) err("guest-path", "no question saving to the exact guest-count field exists");
  for (const id of guestQuestions) {
    if (!reachesPred(id, isBedroomQuestion)) {
      err("guest-path", `guest-count question ${nodeLabel(id, nodes[id])} never reaches a bedroom-selection question`);
    }
    const choices = nodes[id].data?.multipleChoices ?? [];
    if (choices.length) {
      const expected = [...profile.supportedGuestValues, profile.guestOverflowChoice];
      const missing = expected.filter((c) => !choices.includes(c));
      const rangeLike = choices.filter((c) => /\d\s*-\s*\d|or more/i.test(c));
      if (rangeLike.length) err("guest-path", `guest-count question ${nodeLabel(id, nodes[id])} offers range choices (${rangeLike.join(", ")}) instead of exact values`);
      if (missing.length && !rangeLike.length) err("guest-path", `guest-count question ${nodeLabel(id, nodes[id])} is missing expected choices: ${missing.join(", ")}`);
    }
  }

  // 23. every bedroom path reaches villa validation and confirmation
  const bedroomQuestions = questionNodes.filter((id) => isBedroomQuestion(id, nodes[id]));
  if (bedroomQuestions.length === 0) err("bedroom-path", "no bedroom-selection question exists");
  for (const id of bedroomQuestions) {
    const choices = nodes[id].data?.multipleChoices ?? [];
    const expected = profile.bedroomChoices;
    if (choices.length !== expected.length || expected.some((c, i) => choices[i] !== c)) {
      err("bedroom-path", `bedroom question ${nodeLabel(id, nodes[id])} choices [${choices.join(", ")}] do not match the approved three options [${expected.join(", ")}]`);
    }
    if (!reachesPred(id, isVillaGate)) err("bedroom-path", `bedroom question ${nodeLabel(id, nodes[id])} never reaches villa validation`);
    if (!reachesPred(id, isConfirmQuestion)) err("bedroom-path", `bedroom question ${nodeLabel(id, nodes[id])} never reaches confirmation`);
  }

  // 24. every villa-selection path reaches confirmation
  const villaQuestions = questionNodes.filter((id) => fieldNameOf(nodes[id]) === profile.villaField);
  if (villaQuestions.length === 0) err("villa-path", "no villa-selection question exists");
  for (const id of villaQuestions) {
    if (!reachesPred(id, isConfirmQuestion)) {
      err("villa-path", `villa question ${nodeLabel(id, nodes[id])} never reaches confirmation`);
    }
  }

  // 25. Edit returns to normalization and eventually confirmation
  const confirmQuestions = questionNodes.filter((id) => isConfirmQuestion(id, nodes[id]));
  if (confirmQuestions.length === 0) err("confirmation", "no confirmation question exists");
  const editStayTextQuestions = questionNodes.filter((id) => {
    if (fieldNameOf(nodes[id]) !== profile.stayTextField && nodes[id].data?.customField !== profile.fields[profile.stayTextField]) return false;
    // an Edit question is a stay-text question reachable FROM a confirmation question
    return confirmQuestions.some((cid) => reachableFrom(nodes, cid).has(id));
  });
  if (editStayTextQuestions.length === 0) err("edit-path", "no Edit path re-captures the full stay description into the stay-text field");
  for (const id of editStayTextQuestions) {
    const reachesNormalize = reachesPred(id, (nid, n) => n?.name === "HTTP API" && n.data?.httpApiId === profile.apis.initialNormalize.id);
    if (!reachesNormalize) err("edit-path", `Edit question ${nodeLabel(id, nodes[id])} never calls the initial normalization API`);
    if (!reachesPred(id, isConfirmQuestion)) err("edit-path", `Edit question ${nodeLabel(id, nodes[id])} never returns to a confirmation step`);
  }

  // 26. date retries recover or reach complete escalation
  for (const id of apiNodes) {
    if ((nodes[id].data?.httpApiId ?? "") !== profile.apis.refine.id) continue;
    const recovers = reachesPred(id, (nid, n) => isBedroomQuestion(nid, n) || isConfirmQuestion(nid, n));
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

  // 28. confirmation content
  for (const id of confirmQuestions) {
    const q = (nodes[id].data?.question ?? "").toString();
    for (const token of profile.confirmationMustInclude ?? []) {
      if (!q.includes(token)) err("confirmation", `confirmation question ${nodeLabel(id, nodes[id])} does not display ${token}`);
    }
    const choices = nodes[id].data?.multipleChoices ?? [];
    for (const c of profile.confirmChoices ?? []) {
      if (!choices.includes(c)) err("confirmation", `confirmation question ${nodeLabel(id, nodes[id])} is missing the "${c}" choice`);
    }
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
