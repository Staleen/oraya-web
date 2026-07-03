# Round trip #2 findings — the WhatChimp editor refuses Condition → Condition connections; the Option A hybrid redraw plan is not operator-executable

**Date:** 2026-07-03 (operator-reported, live authenticated WhatChimp editor, fresh disposable test bot)
**Candidate under test:** the 18-redraw hybrid, SHA-256 `0066192D4487ED1AC8A95B00E22DEF8B754B1FB458E0025B178E8B125C913A39` (165 nodes / 182 output connections) — preserved byte-exact as [`Oraya_natural_intake_v6.roundtrip-2.halted-candidate.txt`](Oraya_natural_intake_v6.roundtrip-2.halted-candidate.txt) (121,537 bytes)
**Status: round trip #2 halted at redraw item #1 of 18; the same-day operator probe matrix then CORRECTED the platform rule (see Addendum) and the candidate was superseded by the corrected-rule Condition-clone-cascade rebuild.**

> **SUPERSEDED (2026-07-03, round trip #3):** the Addendum's rule below ("at most ONE Condition-**source** parent per Condition") is itself too narrow. Round trip #3 proved the editor refuses **any second inbound connection on a Condition, regardless of source type** (`maxInboundPerCondition: 1`), and that probes against unused Condition inputs do not prove drawability against already-connected destinations. See [`ROUNDTRIP_3_FINDINGS.md`](ROUNDTRIP_3_FINDINGS.md). The Addendum's bodies below are kept verbatim as history.

## ADDENDUM (2026-07-03, same day) — corrected rule from the operator's live probe matrix; §2 and §6 below are superseded

The operator ran the probe matrix on the authenticated editor and **disproved the pair-level conclusion in §2**. Authenticated results (screenshots on record):

1. **Condition → Condition is DRAWABLE when it is the destination's first/only Condition-source parent.** The editor's *"This will make an infinite loop…"* warning fires only when a connection would give a destination Condition a **second** Condition-source parent (the graph is a DAG in both cases — it is an editor multi-Condition-parent restriction, not a real cycle check).
2. **Corrected binding rule:** *each destination Condition input may carry at most ONE inbound edge whose source node type is Condition.*
3. **Live-proven drawable operations:** Condition → Condition (first/only Condition-source parent), Condition → User Input Flow, Text → User Input Flow, Condition → Text, Text → Condition, HTTP API → Condition. The probe edges were evidence only and are not part of any design.

**Consequences (all implemented same day):**

- The profile now encodes the corrected rule: `importGraphContract.editorProvenDrawPairs` lists the six proven operations, `editorRejectedDrawPairs` is empty (the Condition→Condition refusal is *conditional*), and `maxConditionSourceParents: 1` carries the structural rule; the validator enforces it graph-wide via the `condition-parent-limit` check, and the generator refuses to emit any artifact that violates it (`assertEditorContracts`).
- The halted 165-node candidate is preserved byte-exact as the fixture named above and pinned by a regression test (it fails current validation with exactly the **11** beyond-limit Condition-source parents — `#440` +4, `#470` +3, `#660` +1, `#690` +3 — that made its redraw plan unexecutable).
- The canonical `Oraya_natural_intake_v6.txt` was rebuilt with the **Condition-clone cascade** (operator-directed; behavior-preserving — Conditions are guest-invisible): every Condition that would receive an extra Condition-source parent got a per-parent clone whose single serialized connection the import keeps automatically (`#440`→4 clones `750/752/754/756` + paired `#602` clones `751/753/755/757`; `#470`→`758/759/760`; `#660`→`761`; `#663`→`762`; `#690`→`763/764/765` — **16 clones**). Result: **181 nodes, 214 output connections, 14 terminals, 15 merge points, 34 operator draws** (27 Condition→User Input Flow, 2 Text→User Input Flow, 2 Text→Condition, 2 Condition→Text, 1 HTTP API→Condition, **0 drawn Condition→Condition**), SHA-256 `AB456A895221A46DE289EDA054DB9142B4D3F7D0A1892A3FFBEAFF999346AB0C`. Every serialized-kept first edge preserves the un-repaired-import safety contract (full happy path, opening-question `/book` link, no confirmation claims).

Sections 1 and 3 below remain accurate history (the rejection at item #1 really happened — its destination `#440` already had `#411` as a Condition-source parent). **§2's pair-level conclusions and §6's probe plan are superseded by this addendum.**

## 1. What happened

The operator imported the candidate and attempted redraw checklist item #1 exactly as documented:

- FROM `#430` Condition (oraya_check_in = "null" OR oraya_check_out = "null") — FALSE output
- TO `#440` Condition (oraya_guest_count = "null") — input socket

The nodes were located correctly. WhatChimp **rejected the connection** with this exact modal:

> **Warning!**
> This will make an infinite loop. Place a button/list/section/interactive between these two nodes.

The graph has no cycle through these nodes (the validator's `cycles` check proves the candidate is a DAG), so this is an editor-side rule about the node-type pair, not a real loop. This is a **platform rejection, not operator error**.

## 2. Platform contract derived (and its limits) — **SUPERSEDED by the Addendum above (same-day probes corrected the rule)**

1. **Direct Condition → Condition connections cannot be drawn in the current WhatChimp editor.** Proven live 2026-07-03.
2. **A merge existing in a saved export does NOT prove the present editor can draw it.** The operator's own v5.5 export carries the 5-parent merge at `#440` that this project has repeatedly cited as drawability evidence — and a type audit of the v5.5 bytes shows **all 5 of its inbound edges are Condition → Condition** (`#411`, `#430`, `#436`, `#501`, `#505`, each via `conditionOutputFalse` → `conditionInput`). Whatever created those edges (an older editor build, an import before the current normalization, or another mechanism), the present UI refuses to create them. Export survival ≠ drawability.
3. **No node-type pair has proven drawability on this tenant today.** Round trip #2 produced one proven rejection and zero proven acceptances. Every future architecture that requires operator-drawn edges must have its type pairs probed live first (§6).

These are now encoded in the tooling: the profile carries `importGraphContract.editorRejectedDrawPairs` (currently `[["Condition","Condition"]]`) and `editorProvenDrawPairs` (currently empty); the validator's new `redraw-drawability` check errors on any operator-drawn hub edge using a rejected pair and warns on any unproven pair.

## 3. Complete type audit of the 18-item redraw plan

Machine-derived from the candidate bytes (source type / port → destination type):

| Item | Edge | Type pair | Drawable? |
|---|---|---|---|
| 1 | `#430` FALSE → `#440` | Condition → Condition | **⛔ REJECTED (proven live)** |
| 2 | `#436` FALSE → `#440` | Condition → Condition | **⛔ rejected pair** |
| 3 | `#501` FALSE → `#440` | Condition → Condition | **⛔ rejected pair** |
| 4 | `#505` FALSE → `#440` | Condition → Condition | **⛔ rejected pair** |
| 5 | `#603` output → `#602` | Text → Condition | unproven |
| 6 | `#614` TRUE → `#470` | Condition → Condition | **⛔ rejected pair** |
| 7 | `#619` TRUE → `#470` | Condition → Condition | **⛔ rejected pair** |
| 8 | `#621` TRUE → `#470` | Condition → Condition | **⛔ rejected pair** |
| 9 | `#614` FALSE → `#616` | Condition → Text | unproven |
| 10 | `#604` output → `#490` | Text → User Input Flow | unproven |
| 11 | `#659` output → `#654` | HTTP API → Condition | unproven |
| 12 | `#656` FALSE → `#660` | Condition → Condition | **⛔ rejected pair** |
| 13 | `#664` output → `#663` | Text → Condition | unproven |
| 14 | `#674` TRUE → `#690` | Condition → Condition | **⛔ rejected pair** |
| 15 | `#679` TRUE → `#690` | Condition → Condition | **⛔ rejected pair** |
| 16 | `#681` TRUE → `#690` | Condition → Condition | **⛔ rejected pair** |
| 17 | `#674` FALSE → `#676` | Condition → Text | unproven |
| 18 | `#693` output → `#694` | Text → User Input Flow | unproven |

**Blocked items: #1–4, #6–8, #12, #14–16 — 11 of 18** (confirming the operator's preliminary list exactly). Type-pair census of the plan: Condition→Condition ×11 (rejected), Text→Condition ×2, Condition→Text ×2, Text→User Input Flow ×2, HTTP API→Condition ×1 (all unproven).

**Conclusion: the Option A hybrid architecture as shipped is not operator-repairable.** 4 of its 11 hubs (`#440`, `#470`, `#660`, `#690`) cannot receive their drawn edges at all, and none of the remaining 7 draws is proven possible.

## 4. Behavior-preserving direction (exactly quantified): the Condition-clone cascade

Condition nodes are guest-invisible routing logic. Splitting a multi-parent Condition into one identical clone per parent changes **zero** guest-visible behavior — every message, question, button, API call, and terminal stays byte-identical. Repeating the split until no Condition has more than one parent pushes every remaining merge onto non-Condition nodes (interactive question/flow wrappers and Texts) — which is exactly the class of connection the editor's own warning endorses ("place a button/list/section/interactive between these two nodes").

Machine-computed on the candidate graph (deterministic, confluent result):

- **7 Condition splits:** `#440`→5 clones, `#602`→6, `#470`→4, `#654`→2, `#660`→3, `#663`→4, `#690`→4.
- **+21 nodes** (165 → 186); output-connection count grows correspondingly (every clone re-emits both exits).
- **All final merge points are non-Condition** (13 merge nodes: the guest/bedroom/villa/confirm/retry wrappers `#466`, `#480`, `#490`, `#600`, `#610`, `#661`, `#670`, `#691`, `#694`, `#736` and the mismatch Texts `#616`, `#655`, `#676`).
- **Operator draws: 39 edges** (up from 18): 36 into `User Input Flow` wrappers, 3 into `Text` nodes.
- **Distinct type pairs required: only `Condition → User Input Flow`, `Condition → Text`, and `Text → User Input Flow`** (the last two eliminable: cloning the 3 merge Texts, +3 nodes and content-identical, relocates their draws onto wrappers; serialization order at `#490`/`#694` decides whether a Text→wrapper draw remains — happy-path-first keeps it).

Trade-off: **guest behavior 100% preserved**, more manual draws (39 vs 18), modest node growth (+21), and — decisive — **it only works if `Condition → User Input Flow` (and possibly `Text → User Input Flow` / `Condition → Text`) can actually be drawn**, which is unproven (§2.3). Hence the probe gate below.

## 5. Other directions (for completeness)

- **Insert interactive nodes at the blocked merges** (what the editor warning suggests): adds a guest-visible button press at every merge — a UX change, explicitly **forbidden without operator approval**.
- **Behavior reduction to eliminate merges:** each undrawable merge branch would have to stop re-joining the flow — practically, converting date-recovery and bedroom-capacity-OK re-entries into escalation endings. That degrades up to 14 self-service guest paths into "the team will follow up" endings. A full pure-tree unroll remains infeasible (492,864 nodes, round trip #1 findings).
- **Do nothing / abandon v6:** the v5.5 production flow keeps running; the natural-intake upgrade stalls.

## 6. The probe gate — **COMPLETED (see Addendum for the authenticated results)**

On the existing disposable bot (the current import is fine for this — the probes are drawn and then deleted; nothing is saved toward testing), attempt each connection and record accept/reject:

1. **Condition → User Input Flow** — e.g. try drawing a spare Condition output into the input of any question wrapper. *(Decides the cascade outright.)*
2. **Text → User Input Flow** — checklist item #10 (`#604` → `#490`) is exactly this pair.
3. **Condition → Text** — checklist item #9 (`#614` FALSE → `#616`).
4. **Text → Condition** — checklist item #5 (`#603` → `#602`). *(Not needed by the cascade, but pins the platform rule.)*
5. **HTTP API → Condition** — checklist item #11 (`#659` → `#654`). *(Same.)*

Delete every probe edge afterwards; do not save toward testing. Record results in this file and in `editorProvenDrawPairs` / `editorRejectedDrawPairs` in `scripts/whatchimp/natural-intake-profile.json`. **The generator is rebuilt only after the probes decide the target architecture, and only against pairs proven drawable.**

## 7. Repository state after this finding — **intermediate halt state, superseded by the Addendum's same-day rebuild**

- Validator `redraw-drawability` check added: the shipped candidate now fails validation **by design** with exactly **11 errors** (the Condition→Condition draws) + 7 unproven-pair warnings — it can no longer be validated as import-ready.
- `V6_REDRAW_CHECKLIST.md` regenerated with a ⛔ halt banner and per-item NOT-OPERATOR-DRAWABLE markers (artifact bytes unchanged: SHA-256 `0066192D…3A39`).
- The candidate artifact itself is untouched (it remains the exact graph the cascade numbers in §4 are computed from).
- PR #67 stays open and unmerged; production WhatChimp untouched.
