# Authenticated WhatChimp round trip #1 — structural findings (2026-07-03)

**Evidence file:** [`Oraya_natural_intake_v6.roundtrip-1.saved-reexport.txt`](Oraya_natural_intake_v6.roundtrip-1.saved-reexport.txt) — byte-for-byte copy of the operator's authenticated re-export (`Oraya_natural_intake_v6 exported.txt`), produced by: import the canonical `Oraya_natural_intake_v6.txt` → **save** successfully → close the editor → reopen the same bot → export.
**Bytes:** 91,657 · **SHA-256:** `6ED2E190E876A9FE00D9F3E68111A86BA60159F4E1B3EBA630574B217C8F7C89`
**Candidate compared against:** `Oraya_natural_intake_v6.txt` at commit `c0587a5` (SHA-256 `72578281BC6E12C70DB43F6AC5ABC2AA4B61403CAE8A8F3F5DA09640DD5608A4`).
**Safety review:** the evidence file contains flow configuration only (node graph, question copy, custom-field ids, tenant HTTP-API integration ids `7466`/`8101`/`6961`). It contains **no** secrets, tokens, credentials, or guest personal data (scan: secret patterns 0 hits; the only `961` substrings are the integration id `6961`).
**Reproduce every number below:** `node scripts/compare-whatchimp-roundtrip.mjs Oraya_natural_intake_v6.txt artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-1.saved-reexport.txt`

## A2 — exact totals

| Measure | Candidate | Re-export |
|---|---|---|
| Nodes | 118 | 118 |
| Output connections (edges) | 149 | 117 |
| Reciprocal input references | 149 | 117 |
| One-sided (output-only / input-only) edges | 0 / 0 | 0 / 0 |
| Zero-inbound nodes | 1 (`#1` Start Bot Flow) | 1 (`#1` Start Bot Flow) |
| Nodes with multiple inbound parents | **16** | **0** |
| Input sockets with >1 connection | 16 | 0 |
| Deleted nodes | — | **0** |
| Added nodes | — | **0** |
| Lost edges | — | **32** |
| Added edges | — | **0** |
| Semantically changed nodes | — | **0** (only `#1`'s `xitFbpostbackId` was regenerated — approved normalization; positions/`uniqueId`/postback ids ignored) |
| Reachable terminals | 3 (`#7`, `#73`, `#643` — all approved Texts) | 19 (**16 new unintended terminals**) |

Import, save, close/reopen, and export all **succeeded mechanically**; every node, every question text, every choice list, every custom-field binding (including `69114`/`custom_69114`), every condition definition, and every API integration id survived byte-comparably. **Only edges were destroyed.**

## A4 — single-parent hypothesis: CONFIRMED for imported graphs, with the exact mechanism

- All **32** lost edges targeted a destination that had **>1** candidate parent (0 lost edges targeted a single-parent destination).
- All **16** multi-parent candidate nodes were reduced to **exactly one** parent (none to zero, none kept more than one).
- In **16 of 16** cases the surviving parent is the **first-listed connection in the destination input socket's serialized `connections` array**. The mechanism is deterministic: *WhatChimp's import keeps `connections[0]` per input socket and silently drops every other complete reciprocal edge.*

**Scope limit of the hypothesis (disproven as a blanket saved-graph rule):** the operator's own v5.5 export — a genuine saved export from this same tenant — contains node `#440` with **5 inbound parents** (`411/430/436/501/505 → conditionOutputFalse → 440`), and KNOWN_BUGS #10 records the live v4.3.3 production export carrying multi-input nodes. So the WhatChimp **editor** can create merges and they **survive save/export**; it is the **import** path that renders extra inbound connections as loose lines (operator-observed) and drops them on save. The graph contract for any generated **import** artifact is therefore single-parent; whether operator-redrawn merges survive a subsequent save cycle is editor-proven by v5.5/v4.3.3 but has not been re-tested on a fresh import in this round trip.

## A3 — complete lost-edge table (all 32, machine-derived)

Ports: every lost edge's destination input socket is the node's single standard input (`conditionInput`, `textInput`, `userInputFlowInput`, or `userInputFlowSingleInput`); the "kept" column is the one parent WhatChimp retained.

### Group 1 — date-completion merges (4 edges → `#440` guest gate; this merge exists in v5.5 itself)

| # | Lost edge | Source type | Purpose | Kept parent | User-facing failure |
|---|---|---|---|---|---|
| 1 | `430:False → 440` | Condition | dates recovered after 1st follow-up → guest validation | `411:False` | flow stops after the follow-up; guest never asked guests/bedrooms |
| 2 | `436:False → 440` | Condition | checkout recovered → guest validation | `411:False` | same |
| 3 | `501:False → 440` | Condition | dates recovered after 2nd follow-up → guest validation | `411:False` | same |
| 4 | `505:False → 440` | Condition | checkout recovered after 2nd follow-up → guest validation | `411:False` | same |

### Group 2 — guest-validation merges (3 edges)

| # | Lost edge | Purpose | Kept parent | Failure |
|---|---|---|---|---|
| 5 | `603 → 602` | guest acknowledgement ("Perfect, thank you 😊") → supported-count gate (guest just asked) | `440:False` (guest already known) | conversation dead-ends at the acknowledgement after answering the guest question |
| 6 | `664 → 663` | Edit guest acknowledgement → Edit supported-count gate | `660:False` | same, on the Edit path |
| 7 | `663:False → 466` | Edit above-capacity → shared exact-count team review | `602:False` | Edit-path large groups never reach the exact-count ask/escalation |

### Group 3 — bedroom-capacity success merges, initial path (7 edges)

| # | Lost edge | Purpose | Kept parent | Failure |
|---|---|---|---|---|
| 8–12 | `613:True → 470`, `615:True → 470`, `619:True → 470`, `620:True → 470`, `622:True → 470` | capacity-OK exits (guests 1–2, guests 3–4, and all three retry exits) → villa gate | `612:True` (bedroom=3, first try only) | any bedroom choice other than first-try "3 bedrooms" dead-ends at a bare Condition node |
| 13 | `615:False → 616` | capacity mismatch (2nd detection row) → mismatch explanation | `614:False` | mismatch guest gets silence instead of the explained re-ask |
| 14 | `622:False → 623` | retry mismatch (2nd row) → bedroom escalation message | `621:False` | same on the retry |

### Group 4 — bedroom-capacity merges, Edit path (7 edges)

| # | Lost edge | Purpose | Kept parent |
|---|---|---|---|
| 15–19 | `673:True → 690`, `675:True → 690`, `679:True → 690`, `680:True → 690`, `682:True → 690` | Edit capacity-OK exits → Edit villa gate | `672:True` |
| 20 | `675:False → 676` | Edit mismatch (2nd row) → explanation | `674:False` |
| 21 | `682:False → 683` | Edit retry mismatch (2nd row) → escalation message | `681:False` |

### Group 5 — villa/confirmation merges (2 edges)

| # | Lost edge | Purpose | Kept parent | Failure |
|---|---|---|---|---|
| 22 | `604 → 490` | villa acknowledgement ("Lovely choice 😊") → confirmation (villa just asked) | `470:False` (villa known) | guest who chose a villa never sees the confirmation |
| 23 | `693 → 694` | Edit villa acknowledgement → Edit confirmation | `690:False` | same on Edit |

### Group 6 — handoff merge (1 edge)

| # | Lost edge | Purpose | Kept parent | Failure |
|---|---|---|---|---|
| 24 | `697 → 70` | Edit "Looks right" continuation → shared handoff question | `494` (initial path) | after a successful Edit, the flow ends at an empty wrapper — no handoff, no lead |

### Group 7 — Edit-path date merges (2 edges)

| # | Lost edge | Purpose | Kept parent |
|---|---|---|---|
| 25 | `656:False → 660` | Edit checkout-known → Edit guest gate | `654:False` |
| 26 | `659 → 654` | Edit checkout refine API → both-dates gate | `653` (leaves `#659` a dead-end API call) |

### Group 8 — escalation merges (6 edges → `#640` shared name-capture → Lead Submit tail)

| # | Lost edge | Escalation source | Kept parent | Failure |
|---|---|---|---|---|
| 27 | `468 → 640` | above-capacity team review | `438` (initial date failure only) | large groups: no name ask, **no lead submitted**, no final links |
| 28 | `504 → 640` | date-failure escalation #2 | `438` | same |
| 29 | `623 → 640` | bedroom retry escalation | `438` | same |
| 30 | `655 → 640` | Edit date-failure escalation | `438` | same |
| 31 | `683 → 640` | Edit bedroom escalation | `438` | same |
| 32 | `698 → 640` | repeated-Edit escalation | `438` | same |

All ten example edges named in the task (`603→602`, `604→490`, `468→640`, `504→640`, `655→640`, `659→654`, `664→663`, `693→694`, `697→70`, `698→640`) are confirmed in the machine-derived list above.

## A5 — current tooling vs the re-export (expected failures; evidence)

- `node scripts/validate-whatchimp-flow.mjs artifacts/whatchimp/roundtrips/Oraya_natural_intake_v6.roundtrip-1.saved-reexport.txt --strict-binding` → **exit 1, 96 errors, 0 warnings**: 21 `condition-branches` (dangling True/False outputs), 1 `api-connection` dead-end (`#659`), unapproved/continuation-less `terminals` on the 16 unintended terminals (`#468, #504, #603, #604, #615, #622, #623, #655, #659, #664, #675, #682, #683, #693, #697, #698`), plus the downstream `guest-path` / `bedroom-path` / `villa-path` / `date-retry` / `escalation` reachability failures.
- `node scripts/simulate-whatchimp-flow.mjs <re-export>` → **exit 1, 6 passed / 36 failed of 42.** Business scenarios now failing include: every capacity-mismatch path (S14/S15/S17), above-capacity escalation (S16/S30), all date-retry recoveries (S03/S05–S09), date escalations (S10/S29), the entire Edit path (S23/S24, F08, F10), the stale-overflow reset walk (F09), and the bedroom/date escalation fault matrix (F01/F02/F07).
- The re-export itself contains **zero** multi-parent nodes — the graph WhatChimp saved is a clean single-parent tree; the damage is the missing business continuations, not corruption.

## Phase B feasibility measurement (why "clone everything" is not the fix)

The exact node count of the candidate graph fully unshared into a single-parent tree (memoized unroll of the DAG from Start) is **492,864 nodes**. The explosion is structural: the flow's contract is "ask only the missing fields, then reconverge" — dates (5 recovery variants) × guests (known/asked) × bedroom capacity (3 OK exits × first-try/retry) × villa (known/asked) multiply into ~120 distinct paths into the initial confirmation alone, and the complete Edit path (with its own internal gating) hangs off **each** of them. No selection of "smallest necessary downstream subgraphs" changes this: a tree's size equals its number of distinct conversation prefixes, and the current behavior contract generates hundreds of thousands. **Any import-survivable rebuild therefore requires either (a) keeping a small set of hub merges that the operator re-draws manually in the editor after import (the device v5.5's `#440` proves survives save/export), or (b) an approved reduction of the gating behavior.** That is an operator decision, recorded as pending in DECISIONS_LOG (2026-07-03) and KNOWN_BUGS #10.
