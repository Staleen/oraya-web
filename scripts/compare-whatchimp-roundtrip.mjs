#!/usr/bin/env node
/**
 * Phase 16A — WhatChimp round-trip comparator. Compares an import candidate
 * with an authenticated WhatChimp re-export of the same flow and reports
 * whether the platform preserved the graph semantically.
 *
 * Ignores approved WhatChimp normalization (node positions and regenerated
 * ids: `uniqueId`, `postbackId`, `newPostbackId`, `xitFbpostbackId` — the
 * list is configurable via the profile's `roundTripIgnoreFields`).
 *
 * Reports: node counts, edge counts, deleted/added nodes, semantic node
 * differences, lost/added edges (with ports and retained parents),
 * inbound-parent census on both sides, unexpected terminals, custom-field
 * changes, and API-integration-id changes.
 *
 * Calibrated against authenticated round trip #1 (2026-07-03), where the
 * WhatChimp import kept only the FIRST serialized connection per input
 * socket: 118/118 nodes survived, 32 complete reciprocal edges were silently
 * removed, and 16 unintended terminals appeared. Evidence:
 * artifacts/whatchimp/roundtrips/ROUNDTRIP_1_FINDINGS.md.
 *
 * Usage:
 *   node scripts/compare-whatchimp-roundtrip.mjs <candidate> <re-export> [--profile <profile.json>]
 *
 * Exit codes: 0 = graph semantically preserved, 1 = preservation failure
 * (lost/added nodes or edges, semantic node changes, or new terminals),
 * 2 = unusable input.
 *
 * Node standard library only. No new dependencies.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const DEFAULT_IGNORE_FIELDS = ["uniqueId", "postbackId", "newPostbackId", "xitFbpostbackId"];

function edgesOf(flow) {
  const out = [];
  for (const [id, node] of Object.entries(flow.nodes ?? {})) {
    for (const [outKey, o] of Object.entries(node.outputs ?? {})) {
      for (const c of o.connections ?? []) {
        out.push({ from: String(id), outKey, to: String(c.node), inKey: c.input });
      }
    }
  }
  return out;
}

const edgeKey = (e) => `${e.from}:${e.outKey} -> ${e.to}:${e.inKey}`;

function inboundOf(flow) {
  const inbound = new Map(Object.keys(flow.nodes ?? {}).map((id) => [id, []]));
  for (const e of edgesOf(flow)) inbound.get(e.to)?.push(e);
  return inbound;
}

function terminalsOf(flow) {
  return Object.keys(flow.nodes ?? {}).filter((id) =>
    Object.values(flow.nodes[id].outputs ?? {}).every((o) => (o.connections ?? []).length === 0),
  );
}

function semanticData(data, ignore) {
  const out = {};
  for (const k of Object.keys(data ?? {}).sort()) {
    if (ignore.has(k)) continue;
    out[k] = data[k];
  }
  return out;
}

function snippet(node) {
  const d = node?.data ?? {};
  return (d.textMessage ?? d.question ?? d.httpApiText ?? d.campaignName ?? "").toString().replace(/\s+/g, " ").slice(0, 60);
}

/**
 * Compare a candidate flow with a re-export of it.
 * Returns a structured report; `report.preserved` is the pass/fail verdict.
 */
export function compareFlows(candidate, reexport, opts = {}) {
  const ignore = new Set(opts.ignoreFields ?? DEFAULT_IGNORE_FIELDS);
  const candIds = new Set(Object.keys(candidate.nodes ?? {}));
  const reexIds = new Set(Object.keys(reexport.nodes ?? {}));

  const deletedNodes = [...candIds].filter((id) => !reexIds.has(id));
  const addedNodes = [...reexIds].filter((id) => !candIds.has(id));

  const changedNodes = [];
  const customFieldChanges = [];
  const apiIdChanges = [];
  for (const id of candIds) {
    if (!reexIds.has(id)) continue;
    const a = candidate.nodes[id];
    const b = reexport.nodes[id];
    const da = semanticData(a.data, ignore);
    const db = semanticData(b.data, ignore);
    const keys = [...new Set([...Object.keys(da), ...Object.keys(db)])].filter(
      (k) => JSON.stringify(da[k]) !== JSON.stringify(db[k]),
    );
    if (a.name !== b.name || keys.length) {
      changedNodes.push({ id, candidateName: a.name, reexportName: b.name, keys });
    }
    for (const k of keys) {
      if (k === "customField" || k === "customFieldSelectedOptionText" || k.startsWith("custom_field_")) {
        customFieldChanges.push({ id, key: k, candidate: da[k], reexport: db[k] });
      }
      if (k === "httpApiId" || k === "httpApiText") {
        apiIdChanges.push({ id, key: k, candidate: da[k], reexport: db[k] });
      }
    }
  }

  const candEdges = new Map(edgesOf(candidate).map((e) => [edgeKey(e), e]));
  const reexEdges = new Map(edgesOf(reexport).map((e) => [edgeKey(e), e]));
  const candInbound = inboundOf(candidate);
  const reexInbound = inboundOf(reexport);

  const lostEdges = [...candEdges.entries()]
    .filter(([k]) => !reexEdges.has(k))
    .map(([, e]) => ({
      ...e,
      fromName: candidate.nodes[e.from]?.name,
      toName: candidate.nodes[e.to]?.name,
      destCandidateParents: (candInbound.get(e.to) ?? []).map((p) => p.from),
      destKeptParents: (reexInbound.get(e.to) ?? []).map((p) => p.from),
    }));
  const gainedEdges = [...reexEdges.entries()]
    .filter(([k]) => !candEdges.has(k))
    .map(([, e]) => ({ ...e, fromName: reexport.nodes[e.from]?.name, toName: reexport.nodes[e.to]?.name }));

  const multiParent = {
    candidate: [...candInbound.entries()]
      .filter(([, v]) => v.length > 1)
      .map(([id, v]) => ({ id, name: candidate.nodes[id].name, parents: v.map((p) => p.from) })),
    reexport: [...reexInbound.entries()]
      .filter(([, v]) => v.length > 1)
      .map(([id, v]) => ({ id, name: reexport.nodes[id].name, parents: v.map((p) => p.from) })),
  };

  // for each candidate multi-parent node that survived: which parent was kept,
  // and was it the first-listed connection in the serialized input socket?
  const reducedToSingle = multiParent.candidate
    .filter((m) => reexIds.has(m.id))
    .map((m) => {
      const kept = (reexInbound.get(m.id) ?? []).map((p) => p.from);
      const socketOrder = [];
      for (const inp of Object.values(candidate.nodes[m.id].inputs ?? {})) {
        for (const c of inp.connections ?? []) socketOrder.push(String(c.node));
      }
      return {
        id: m.id,
        candidateParents: m.parents,
        kept: kept.length,
        keptFrom: kept,
        firstListedSurvived: kept.length === 1 && kept[0] === socketOrder[0],
      };
    });

  const candTerminals = new Set(terminalsOf(candidate));
  const unexpectedTerminals = terminalsOf(reexport)
    .filter((id) => !candTerminals.has(id))
    .map((id) => ({ id, name: reexport.nodes[id].name, text: snippet(reexport.nodes[id]) }));
  const lostTerminals = [...candTerminals].filter((id) => reexIds.has(id) && !terminalsOf(reexport).includes(id));

  const preserved =
    deletedNodes.length === 0 &&
    addedNodes.length === 0 &&
    changedNodes.length === 0 &&
    lostEdges.length === 0 &&
    gainedEdges.length === 0 &&
    unexpectedTerminals.length === 0 &&
    lostTerminals.length === 0;

  return {
    counts: {
      candidateNodes: candIds.size,
      reexportNodes: reexIds.size,
      candidateEdges: candEdges.size,
      reexportEdges: reexEdges.size,
    },
    deletedNodes,
    addedNodes,
    changedNodes,
    customFieldChanges,
    apiIdChanges,
    lostEdges,
    gainedEdges,
    multiParent,
    reducedToSingle,
    unexpectedTerminals,
    lostTerminals,
    preserved,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const profileIdx = args.indexOf("--profile");
  const positional = args.filter((a, i) => !a.startsWith("--") && (profileIdx === -1 || i !== profileIdx + 1));
  const [candidatePath, reexportPath] = positional;
  if (!candidatePath || !reexportPath) {
    console.error("usage: node scripts/compare-whatchimp-roundtrip.mjs <candidate> <re-export> [--profile <profile.json>]");
    process.exit(2);
  }
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const profilePath = profileIdx !== -1 ? args[profileIdx + 1] : path.join(scriptDir, "whatchimp", "natural-intake-profile.json");

  let candidate, reexport, ignoreFields;
  try {
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    ignoreFields = profile.roundTripIgnoreFields ?? DEFAULT_IGNORE_FIELDS;
  } catch {
    ignoreFields = DEFAULT_IGNORE_FIELDS; // comparator stays usable without a profile
  }
  try {
    candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
    reexport = JSON.parse(readFileSync(reexportPath, "utf8"));
  } catch (e) {
    console.error(`cannot read flow file: ${e.message}`);
    process.exit(2);
  }

  const r = compareFlows(candidate, reexport, { ignoreFields });

  console.log(`candidate: ${candidatePath} — ${r.counts.candidateNodes} nodes, ${r.counts.candidateEdges} edges`);
  console.log(`re-export: ${reexportPath} — ${r.counts.reexportNodes} nodes, ${r.counts.reexportEdges} edges`);
  console.log(`ignored normalization fields: ${ignoreFields.join(", ")} (+ node positions)`);
  console.log(`deleted nodes: ${r.deletedNodes.length}${r.deletedNodes.length ? ` [${r.deletedNodes.join(", ")}]` : ""}`);
  console.log(`added nodes: ${r.addedNodes.length}${r.addedNodes.length ? ` [${r.addedNodes.join(", ")}]` : ""}`);
  console.log(`semantically changed nodes: ${r.changedNodes.length}`);
  for (const c of r.changedNodes) console.log(`  #${c.id} ${c.candidateName}${c.reexportName !== c.candidateName ? ` → ${c.reexportName}` : ""}: keys [${c.keys.join(", ")}]`);
  console.log(`custom-field changes: ${r.customFieldChanges.length}`);
  for (const c of r.customFieldChanges) console.log(`  #${c.id} ${c.key}: ${JSON.stringify(c.candidate)} → ${JSON.stringify(c.reexport)}`);
  console.log(`API-id changes: ${r.apiIdChanges.length}`);
  for (const c of r.apiIdChanges) console.log(`  #${c.id} ${c.key}: ${JSON.stringify(c.candidate)} → ${JSON.stringify(c.reexport)}`);
  console.log(`lost edges: ${r.lostEdges.length}`);
  for (const e of r.lostEdges) {
    console.log(`  LOST ${e.from}(${e.fromName}):${e.outKey} -> ${e.to}(${e.toName}):${e.inKey} | dest parents [${e.destCandidateParents.join(",")}] kept [${e.destKeptParents.join(",")}]`);
  }
  console.log(`gained edges: ${r.gainedEdges.length}`);
  for (const e of r.gainedEdges) console.log(`  GAINED ${e.from}(${e.fromName}):${e.outKey} -> ${e.to}(${e.toName}):${e.inKey}`);
  console.log(`inbound-parent census: candidate multi-parent nodes ${r.multiParent.candidate.length}, re-export ${r.multiParent.reexport.length}`);
  for (const m of r.reducedToSingle) {
    console.log(`  #${m.id}: ${m.candidateParents.length} parents → kept ${m.kept} [${m.keptFrom.join(",")}] first-listed-survived=${m.firstListedSurvived}`);
  }
  console.log(`unexpected terminals in re-export: ${r.unexpectedTerminals.length}`);
  for (const t of r.unexpectedTerminals) console.log(`  #${t.id} ${t.name} "${t.text}"`);
  if (r.lostTerminals.length) console.log(`terminals no longer terminal: [${r.lostTerminals.join(", ")}]`);

  console.log(`\nround-trip graph preservation: ${r.preserved ? "PRESERVED" : "FAILED"}`);
  process.exit(r.preserved ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
