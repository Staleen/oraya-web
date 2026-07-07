# Round trip #3 findings — a Condition accepts at most ONE inbound connection TOTAL (any source type); the 181-node candidate's redraw plan is not operator-executable

**Date:** 2026-07-03 (operator-reported, live authenticated WhatChimp editor, fresh disposable test bot)
**Candidate under test:** the 34-redraw Condition-clone-cascade build, SHA-256 `AB456A895221A46DE289EDA054DB9142B4D3F7D0A1892A3FFBEAFF999346AB0C` (181 nodes / 214 output connections) — preserved byte-exact as [`Oraya_natural_intake_v6.roundtrip-3.failed-candidate.txt`](Oraya_natural_intake_v6.roundtrip-3.failed-candidate.txt) (141,728 bytes)
**Status: round trip #3 halted — 3 of the 34 redraw items were refused by the editor; the platform rule is CORRECTED again (one inbound TOTAL per Condition, any source type) and the candidate is superseded by the full-cascade rebuild (186 nodes, SHA-256 `1C7335ED49C7F9F7738B58CCDA4BA340543A9354002FAC2F9FBEC672784EDD48`).**

## 1. What happened

The operator imported the 181-node candidate into a fresh disposable bot and worked the 34-item redraw checklist:

1. **The import/open itself raised the *"This will make an infinite loop…"* warning** before any redraw was attempted. On inspection, Text `#603` had been left **disconnected** from Condition `#602`: the import had kept `#602`'s first serialized inbound edge (`#440` FALSE) and silently dropped `#603 → #602` — consistent with round trip #1's first-edge-wins import normalization, but this time surfaced with the warning at open time.
2. **Drawing `#603 → #602` manually (checklist item #5, Text → Condition) was rejected** with the same infinite-loop modal — even though `#603` is a Text, not a Condition. The destination `#602` already carried one inbound connection (the import-kept `#440` FALSE edge).
3. The two other Condition-destination items — **#22 (`#659 → #654`, HTTP API → Condition)** and **#24 (`#664 → #663`, Text → Condition)** — were refused identically. Both destinations already carried their serialized first parent.

The remaining 31 items (all targeting User Input Flow wrappers or Texts) were not the blocker; the plan halted because 3 of its 34 draws are impossible.

## 2. Corrected platform rule (supersedes the round-trip-#2 Addendum's rule)

**Each Condition node accepts at most ONE inbound connection TOTAL, regardless of the source node's type.** Encoded as `importGraphContract.maxInboundPerCondition: 1`.

Why the round-trip-#2 Addendum got it wrong: its probe matrix drew Text → Condition, HTTP API → Condition, and first-parent Condition → Condition edges **against Conditions whose input socket was otherwise unused**. Those probes proved only that the *pair* is acceptable on an **empty** Condition input — they said nothing about drawing into a Condition that already has a parent. Round trip #3 is the first live test against already-connected Condition destinations, and the editor refuses every such draw, whatever the source type.

Two probe-methodology rules follow (both now standing policy):

- **A probe against an unused input proves nothing about an already-connected destination.** Future probes must reproduce the exact occupancy state of the planned draw.
- **Export survival still ≠ drawability** (round trip #2's lesson, re-confirmed: the v5.5 export carries multi-parent Conditions that today's editor will not let anyone re-create).

Consequently the proven-drawable pair list **shrinks to the three pairs actually executed against real, occupied-or-target-state destinations**: `Condition → User Input Flow`, `Text → User Input Flow`, `Condition → Text`. `editorRejectedDrawPairs` stays empty — no *pair* is categorically rejected; the restriction is the destination Condition's inbound count.

## 3. The three unexecutable items (machine-derived from the candidate bytes)

| Item | Edge | Type pair | Destination's import-kept first parent | Result |
|---|---|---|---|---|
| 5 | `#603` output → `#602` | Text → Condition | `#440` (FALSE) | **⛔ REJECTED (proven live)** |
| 22 | `#659` output → `#654` | HTTP API → Condition | `#653` | **⛔ REJECTED (proven live)** |
| 24 | `#664` output → `#663` | Text → Condition | `#660` (FALSE) | **⛔ REJECTED (proven live)** |

All 34 items of the halted plan satisfied the round-trip-#2 rule (no second *Condition-source* parent); the 3 refusals are exactly the items whose destination is a Condition at all. **Corollary: no redraw plan may ever target a Condition input.** The validator's `redraw-drawability` check now errors if a declared hub *is* a Condition, and the generator's `assertEditorContracts` refuses to emit any redraw targeting one.

## 4. The rebuild: full Condition-clone cascade (behavior-preserving)

Conditions are guest-invisible routing logic, so the fix generalizes the round-trip-#2 cascade: **every** Condition with more than one inbound edge — not just those with multiple Condition-source parents — is split into per-parent clones, until every Condition has exactly one inbound connection and every remaining merge sits on a non-Condition node. Guest behavior is byte-identical: every message, question, choice list, API id, and field binding (including `69114` / `custom_69114`) is unchanged.

New clones beyond the 16 from the previous rebuild (**+5, ids 766–770; 21 clones total, ids 750–770**):

- **`#766`** — clone of `#602` dedicated to Text `#603` (serialized `603 → 766`; its exits `766T → #610` and `766F → #466` are operator draws).
- **`#767` / `#768` / `#769`** — clones of the `#654 → #660 → #663` chain dedicated to HTTP API `#659` (serialized `659 → 767 → 768 → 769`; exits `767T → #655`, `768T → #661`, `769T → #670`, `769F → #736` are operator draws).
- **`#770`** — clone of `#663` dedicated to Text `#664` (serialized `664 → 770`; exits `770T → #670` and `770F → #736` are operator draws).

The three former Condition hubs (`#602`, `#654`, `#663`) are no longer merge points; Text `#655` becomes a declared hub instead.

**Canonical rebuilt artifact:** `Oraya_natural_intake_v6.txt` — **186 nodes, 224 output connections, 14 terminals, 13 merge points, 39 operator draws**, SHA-256 `1C7335ED49C7F9F7738B58CCDA4BA340543A9354002FAC2F9FBEC672784EDD48` (byte-for-byte reproducible by the generator). Declared hubs (`importGraphContract.approvedHubMerges`): `#466`×6, `#480`×4, `#490`×5, `#600`×5, `#610`×6, `#616`×2, `#655`×2, `#661`×3, `#670`×4, `#676`×2, `#691`×4, `#694`×5, `#736`×4 (Σ inbound 52 → 39 beyond-first draws).

**Draw census (machine-derived): 34 Condition → User Input Flow, 2 Text → User Input Flow (`#604 → #490`, `#693 → #694`), 3 Condition → Text (`#614`F `→ #616`, `#767`T `→ #655`, `#674`F `→ #676`) — zero draws target a Condition, and every pair is on the proven list.** No Condition anywhere in the artifact carries more than one inbound connection. Happy-path-first serialization keeps the un-repaired import safe (complete main scenario on first-listed edges, opening-question `https://stayoraya.com/book` link before any API node, no confirmed-booking claims).

## 5. Repository state after this finding

- Profile: `maxInboundPerCondition: 1` replaces `maxConditionSourceParents`; `editorProvenDrawPairs` reduced to the 3 pairs above; `editorRejectedDrawPairs: []`; `approvedHubMerges` rebuilt (13 hubs, no Condition among them).
- Validator: the check is renamed `condition-parent-limit` → **`condition-inbound-limit`** (errors on every inbound edge beyond 1 TOTAL on any Condition); `redraw-drawability` additionally errors if a declared hub is a Condition.
- Generator: `PROVEN_DRAW_PAIRS` = the 3 pairs; `MAX_INBOUND_PER_CONDITION = 1`; `assertEditorContracts` rejects any Condition-targeting redraw, any unproven pair, and any Condition with >1 inbound. `V6_REDRAW_CHECKLIST.md` regenerated with the 39-item plan.
- Fixtures: this candidate is pinned byte-exact (size + SHA-256 above) by a regression test, which also proves it now fails validation with exactly the **3** `[condition-inbound-limit]` errors (`#602`, `#654`, `#663`) that halted the round trip. The round-trip-#2 fixture's expected error count rises from 11 to **14** under the stricter rule (`#440` +4, `#470` +3, `#602` +1, `#654` +1, `#660` +1, `#663` +1, `#690` +3).
- Evidence: validator `--strict-binding` exit 0 (0 errors / 0 warnings) on the rebuilt artifact; simulator 50/50 scenarios pass covering all 14 terminals; test suite 33/33.
- PR #67 stays open and unmerged; production WhatChimp untouched. **Import-safety may not be claimed until round trip #4 passes** — import → the 39 checklist draws (stop and report if ANY is refused) → save → close → reopen → export → comparator PRESERVED exit 0 + validator `--strict-binding` exit 0 on the re-export ([`../V6_ROUNDTRIP_CHECKLIST.md`](../V6_ROUNDTRIP_CHECKLIST.md)).
