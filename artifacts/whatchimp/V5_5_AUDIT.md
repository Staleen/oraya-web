# Oraya Natural Stay Intake v5.5 — audit report (Phase 16A)

**Input artifact:** `artifacts/whatchimp/Oraya_natural_intake_v5.5.input.txt` — byte-preserved copy of the operator's export `Oraya _natural_intake_v5.5.txt`.
**SHA-256:** `0113c6b2040a16866a033158ab7ce0d6270aa4c8b167f231137b1c6afbc6e909` (matches the expected hash) · **size:** 59,555 bytes.
**Audited:** 2026-07-02, independently via `scripts/validate-whatchimp-flow.mjs` (exit 1, 34 semantic errors — see command evidence in the PR).

## Structure

- 69 nodes · 72 directed output connections · 1 start node (#1 "Start Bot Flow") · **10 terminal nodes**.
- Only two terminals are intentional guest-facing outcomes: #7 (WhatsApp lead acknowledgement after Lead Submit API 6961) and #73 (website handoff message after Lead Submit API 7459).

## Defects reproduced (all confirmed by the validator)

| # | Node(s) | Defect |
|---|---|---|
| 1 | #438, #504 | Date-escalation message ("…let me bring in our team…") is a terminal in two separate paths; never collects the name, never submits a lead |
| 2 | #456 | Guest 1–3 branch dead-ends at "Got it." |
| 3 | #459 | Guest 4–6 branch dead-ends at "Got it." |
| 4 | #465 | Guest 7–8 branch dead-ends at "Got it." |
| 5 | #468 | Large-group message stops without name capture or lead submission |
| 6 | #482 | Villa acknowledgement "Got it." dead-ends instead of continuing to confirmation |
| 7 | #498 | Edit-path normalization API (7466) has no outgoing continuation |
| 8 | #497 | Edit question displays `oraya_stay_text` but its `customField` id is empty |
| 9 | #411, #470, #501 | Conditions contain prohibited blank comparison values (`""` rows) |
| 10 | #410 | Same `oraya_check_in equal "null"` row duplicated twice |
| 11 | #450–#465 | Guest flow asks a range (1-3 / 4-6 / 7 or more) and then asks the exact count again |
| 12 | — | Guest branches never converge back into the main flow |
| 13 | — | Villa selection never converges into confirmation |
| 14 | — | No bedroom-selection step exists; confirmation (#491) shows neither bedrooms nor labels guests as overnight guests |
| 15 | — | Canonical-field conditions can leak stale subscriber values into a new attempt when the external API mapping does not overwrite on missing values (see V6_DEPENDENCIES.md — `extracted_text.*`) |

No additional structural defects were found beyond the list above; edge reciprocity, node-id integrity, uniqueId/postbackId uniqueness, and acyclicity all pass on v5.5.

## Manual repairs present in v5.5 that v6 preserves

- `oraya_stay_text` = field **67692** on the initial intake question (#400) — and now also on the Edit question (#497).
- `oraya_stay_followup` = field **69090** on every date follow-up (#421, #426, #434, #507).
- `oraya_guest_followup` = field **69091** on the large-group exact-count question (#467) — kept for its original purpose, not repurposed.
- Initial normalization API **7466** (`Oraya Stay Intent - Production`) at #401/#498; date refinement API **8101** (`Oraya Stay Intent Refine - Production`) at #422/#427/#435/#506.
- Forward-only cloned date retry paths (WhatChimp rejects backward edges as infinite loops).
- Lead Submit APIs **6961** (#9) and **7459** (#84) with the existing handoff tail (#70–#75, #8, #9, #7, #73).
