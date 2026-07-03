# Oraya Natural Stay Intake v6 — WhatChimp dependency manifest

**Artifact:** **`Oraya_natural_intake_v6.txt`** (repo root; copy also delivered next to the operator's v5.5 export) — the single canonical WhatChimp import file. It is generated **fully bound**: the real bedroom field `69114` is emitted directly by the generator, zero placeholders remain, and no second binding step exists.
**Machine-readable profile:** `scripts/whatchimp/natural-intake-profile.json`.
**Status: CORRECTED-RULE HYBRID CANDIDATE — import + 34 proven-operation redraws; ready for the round trip #3 acceptance procedure (2026-07-03).** Round trip #1 proved WhatChimp's **import** keeps only the first serialized connection per input socket ([`roundtrips/ROUNDTRIP_1_FINDINGS.md`](roundtrips/ROUNDTRIP_1_FINDINGS.md)). Round trip #2 halted the 18-redraw hybrid at item #1, and the operator's same-day live probe matrix **corrected the platform rule**: the editor rejects only a **second Condition-source parent** on a destination Condition — Condition→Condition is drawable as the first/only Condition-source parent, and Condition→User Input Flow, Text→User Input Flow, Condition→Text, Text→Condition, HTTP API→Condition are all live-proven ([`roundtrips/ROUNDTRIP_2_FINDINGS.md`](roundtrips/ROUNDTRIP_2_FINDINGS.md) incl. Addendum; halted candidate pinned at `roundtrips/Oraya_natural_intake_v6.roundtrip-2.halted-candidate.txt`, SHA-256 `0066192D…3A39`; pre-hybrid round-trip-#1 candidate at `…roundtrip-1.import-candidate.txt`, SHA-256 `72578281…08A4`). The canonical artifact is rebuilt with the operator-directed, behavior-preserving **Condition-clone cascade**: every Condition that would receive an extra Condition-source parent gets a guest-invisible per-parent clone whose single serialized connection the import keeps automatically (**16 clones**, ids 750–765), and the remaining **15 merge points** (declared in the profile's `importGraphContract.approvedHubMerges`) are repaired by the operator drawing **exactly 34 connections** per the machine-generated [`V6_REDRAW_CHECKLIST.md`](V6_REDRAW_CHECKLIST.md) — every one a live-proven operation, **zero drawn Condition→Condition**, and no Condition anywhere carries more than one Condition-source parent (generator refuses to emit otherwise; validator `condition-parent-limit` + `redraw-drawability` checks enforce it on any re-export). Current canonical artifact: **181 nodes, 214 output connections, 14 terminals**, SHA-256 `AB456A895221A46DE289EDA054DB9142B4D3F7D0A1892A3FFBEAFF999346AB0C` (printed by the generator; byte-for-byte reproducible). The un-repaired import stays safe by construction: first-listed edges run the complete happy path, the opening question carries `https://stayoraya.com/book` before any API node, and no terminal claims a confirmed booking. Validator: exit 0, **0 errors, 0 warnings** under `--strict-binding`. **Import-safety may not be claimed until round trip #3 — import → 34 redraws → save → close → reopen → export → `node scripts/compare-whatchimp-roundtrip.mjs` PRESERVED exit 0 + validator `--strict-binding` exit 0 — passes on a fresh disposable bot ([`V6_ROUNDTRIP_CHECKLIST.md`](V6_ROUNDTRIP_CHECKLIST.md)).**

> **Question-transition contract (operator-verified 2026-07-03):** after importing the earlier v6 build, the operator observed loose/disconnected links around the guest-count, bedroom, bedroom-retry, villa, confirmation, and Looks-right/Edit steps (initial and Edit paths). Root cause: that build wired question nodes **directly** into Condition nodes (7 edges) and User Input Flow wrappers (2 edges) — transitions that appear in **none of the 22 genuine WhatChimp exports surveyed** (the operator's v5.5 plus 21 platform-named exports; exact filenames, sizes, SHA-256 prefixes, and per-file transition censuses in [`V6_TRANSITION_EVIDENCE.md`](V6_TRANSITION_EVIDENCE.md) — 167 question nodes, zero final-reply edges to anything other than a Text or HTTP API node). All 9 unsupported edges are now rebuilt as `Question → acknowledgement Text → next node` — the same device the operator's own v5.5 uses (confirmation `#491 → #492 "Got it." → #493`). Enforced by the validator's `question-transition` check (any direct Question → Condition / Question → User Input Flow edge is an error) and by node-level path assertions in the simulator. The known structural defects are removed; **final save compatibility still requires the operator's import → save → close → reopen → export test** (checklist A2/B).

## HTTP API integrations referenced by the flow

The flow export carries only the integration **IDs**. Endpoint URLs, headers, request bodies, secrets, and response mappings live in the WhatChimp "HTTP API" settings **outside** the export and cannot be verified from the artifact — they require authenticated WhatChimp verification.

| API ID | Name | Used at nodes | Expected request body | Expected response mappings |
|---|---|---|---|---|
| `7466` | Oraya Stay Intent - Production | #401 (initial), #498 (Edit — fresh attempt) | `{ "stay_text": "#oraya_stay_text#" }` | see mapping table below |
| `8101` | Oraya Stay Intent Refine - Production | #422, #427, #435, #506, #653, #659 (after every date follow-up) | `{ "stay_text": "#oraya_stay_text# #oraya_stay_followup#" }` | see mapping table below |
| `6961` | Oraya Lead Submit - Production (WhatsApp / escalation) | #9 (WhatsApp continue), #642 (escalation) | lead payload incl. `oraya_*` fields — **add** `oraya_bedroom_count: "#oraya_bedroom_count#"` and `oraya_guest_followup: "#oraya_guest_followup#"` | **add** `prefill_url` → `oraya_prefill_url` (the terminals after these nodes display the secure continuation link; without the mapping the canonical fallback in the same message still carries) |
| `7459` | Oraya Lead Submit - Production (website handoff) | #84 | lead payload incl. `oraya_*` fields — **add** `oraya_bedroom_count: "#oraya_bedroom_count#"` and `oraya_guest_followup: "#oraya_guest_followup#"` | `prefill_url` → `oraya_prefill_url` |

Both `7466` and `8101` POST to `https://www.stayoraya.com/api/butler/normalize-stay-intent` with the `X-Butler-Secret` header, and the production Lead Submit integrations (`6961`/`7459`) POST to `https://www.stayoraya.com/api/butler/lead`. Secret values are never present in the flow export, this manifest, or the repo.

> **Direct API host requirement (operator-verified 2026-07-03):** during an authenticated WhatChimp test, the bare `https://stayoraya.com` origin answered a Lead Submit POST to `/api/butler/lead` with an HTTP `308` redirect, and WhatChimp did not safely complete the redirected POST — the real endpoint response never reached the flow, so response fields such as `prefill_url` stayed unavailable. After the operator switched that integration to the direct host, WhatChimp reported success, Vercel recorded `POST /api/butler/lead` with HTTP `200`, the prefill secret was logged as present, no prefill-token-generation failure was logged, and the response mapping visibly included `lead_id`, `message`, and `prefill_url` → `oraya_prefill_url`. **All four production WhatChimp server-to-server integrations (Stay Intent, Stay Intent Refine, Lead Submit WhatsApp/escalation, Lead Submit Website Handoff) must call the direct `https://www.stayoraya.com/api/butler/...` host.** Fixing one tenant-level integration does not prove the other three are configured correctly — each must be individually audited before production cutover. This requirement applies **only** to WhatChimp POST integrations: guest-facing links are unchanged (`https://stayoraya.com/book` remains the canonical booking URL; `.lb` and other hosts remain wrong-domain bugs). Any endpoint verification that receives a `3xx` response must be treated as a failure, never a success. Real-subscriber lead persistence and final WhatsApp message rendering remain human checklist items (C2/C5/C12) and are not repository-verified.

> **Shared-integration warning:** WhatChimp integrations are tenant-global. Before editing 7466/8101 mappings or the 6961/7459 bodies, audit which flows reference them (`V6_ROUNDTRIP_CHECKLIST.md` section A0). All pre-cutover testing uses **four cloned TEST integrations** pointed at the PR's Vercel Preview deployment (section A1): Stay Intent, Stay Intent Refine, **Lead Submit WhatsApp** (replaces 6961 at both nodes), and **Lead Submit Website Handoff** (replaces 7459 and must preserve the `prefill_url` → `oraya_prefill_url` response mapping). Re-exports of the test bot are validated with a copied profile whose `apis.*` ids AND `apiFieldWrites` keys are replaced by the recorded TEST ids — `apis.leadSubmit.ids` lists **both** TEST lead ids, and **both** TEST Lead Submit entries (WhatsApp/escalation AND website handoff) retain `{ "prefill_url": "oraya_prefill_url" }`, mirroring the production profile where `6961` and `7459` both carry it (`--profile <test-profile.json>`; details in checklist A1.7).

> **No-dead-end terminal contract:** every terminal message in v6 (#7 WhatsApp lead acknowledgement, #73 website handoff, #643 escalation acknowledgement) contains the secure `#oraya_prefill_url#` slot **and** the canonical fallback `https://stayoraya.com/book`, and states that the booking is not confirmed. A lead-submission or team-follow-up acknowledgement without a booking continuation is an invalid terminal — enforced by the validator (`terminal-continuation` check) and by the simulator's global invariant on the interpolated terminal text. Stale `oraya_guest_followup` values are handled by the deterministic reset mapping above (`extracted_text.guest_followup` → always `"null"`), not by asking consumers to ignore contradictory data.
>
> **Pre-API safety link:** the opening intake question shows the canonical booking URL **before the first HTTP API node is reachable** (validator `pre-api-safety-link` check + simulator ordering invariant). This makes the guest's continuation independent of WhatChimp's HTTP-failure behavior: even if the runtime halts on the very first failed call, the guest already holds `https://stayoraya.com/book`.
>
> **HTTP-failure behavior (unverified platform semantic):** the flow graph continues along each API node's single output edge regardless of the HTTP result — WhatChimp offers no status-based branching. The repo simulator models a failed call as "no field writes" and proves every such walk still ends on a valid actionable terminal; the pre-API safety link covers the halt case. Whether the live WhatChimp runtime actually continues when an HTTP API call errors **requires live verification** — see checklist C11, which probes all four TEST integrations (Stay Intent, Refine, Lead Submit WhatsApp incl. the escalation route, Lead Submit Website Handoff).

> **Payload-persistence contract (three distinct verification levels):**
> 1. **Custom field captured** — the flow saves the guest's answer into a WhatChimp field (e.g. the exact above-capacity total "12" into `oraya_guest_followup`). Proven by the repo simulator.
> 2. **API submission occurred** — the conversation reaches a Lead Submit node and fires it. Proven by the repo simulator (node-level only).
> 3. **Exact field included in the external API body** — `oraya_guest_followup` / `oraya_bedroom_count` reach `whatsapp_leads.raw_payload` only if the operator adds them to the Lead Submit request bodies. The flow export does not contain request bodies, so the repo simulator **cannot** model this level; it requires the authenticated WhatChimp body edit plus the Supabase `raw_payload` verification in checklist C2/C5. The backend half is repo-verified: `POST /api/butler/lead` persists the full request body verbatim into `raw_payload`.

### Normalization response mapping (7466 and 8101)

The backend now returns an additive `extracted_text` object whose values are **always strings**, with the literal string `"null"` for any field the current message did not contain. Bind the mappings to `extracted_text.*` (recommended) so every call deterministically overwrites the canonical fields — this is the current-attempt mechanism that prevents a returning subscriber's stale villa/dates/guest count from leaking into a new attempt. (`extracted.*` carries the same data but uses JSON `null`, whose write-behavior on WhatChimp mapping is unverified.)

| Response field | WhatChimp custom field |
|---|---|
| `extracted_text.check_in` | `oraya_check_in` |
| `extracted_text.check_out` | `oraya_check_out` |
| `extracted_text.guest_count` | `oraya_guest_count` |
| `extracted_text.guest_followup` | `oraya_guest_followup` — always the literal `"null"`; this mapping is the deterministic **current-attempt reset** of the exact above-capacity total, so a stale overflow value (e.g. `"12"`) from an abandoned attempt is cleared on every new/Edit normalization and refinement call, before any Lead Submit can fire. A genuinely captured overflow is never clobbered: every normalization call happens before the current attempt's guest question. |
| `extracted_text.nights` | `oraya_nights` |
| `extracted_text.villa` | `oraya_villa` |
| `status` | `oraya_date_status` |
| `safe_message` | `safe_message` |

Every missing-field condition in v6 compares against the literal string `"null"` — the mappings above are what make those conditions current-turn-accurate.

## Custom fields

| Field name | ID | Verified how |
|---|---|---|
| `oraya_stay_text` | `67692` | v5.5 export (#400) |
| `oraya_stay_followup` | `69090` | v5.5 export (#421/#426/#434/#507) |
| `oraya_guest_followup` | `69091` | v5.5 export (#467) |
| `oraya_check_in` | `57699` | v5.5 export condition rows |
| `oraya_check_out` | `57692` | v5.5 export condition rows |
| `oraya_guest_count` | `57693` | v5.5 export (#455/#458/#464) |
| `oraya_villa` | `57698` | v5.5 export (#481) |
| `oraya_dates_confirmed_text` | `58532` | v5.5 export (#491) |
| `oraya_handoff_required` | `57696` | v5.5 export (#70) |
| `oraya_full_name` | `57759` | v5.5 export (#8) |
| `oraya_bedroom_count` | **`69114`** (operator-created; confirmed 2026-07-03) | emitted directly by the generator into the canonical `Oraya_natural_intake_v6.txt` — see below |
| `oraya_nights`, `oraya_date_status`, `safe_message`, `oraya_prefill_url` | not referenced by flow nodes | exist only in API mappings (authenticated verification required) |

### Bedroom field binding: `oraya_bedroom_count` = `69114` (resolved 2026-07-03; no binding step)

The operator created the field and confirmed the real id `69114`. The generator emits it directly, so the canonical `Oraya_natural_intake_v6.txt` ships fully bound: the 4 bedroom question nodes carry exactly `"customField": "69114"` with `"customFieldSelectedOptionText": "oraya_bedroom_count"`, and the 8 bedroom condition rows carry exactly `"custom_69114"`. There is no placeholder and no second binding step — the file is regenerated deterministically with:

```
node scripts/generate-whatchimp-v6.mjs artifacts/whatchimp/Oraya_natural_intake_v5.5.input.txt Oraya_natural_intake_v6.txt
node scripts/validate-whatchimp-flow.mjs Oraya_natural_intake_v6.txt --strict-binding
```

(`scripts/bind-whatchimp-field.mjs` is retained only as a generic placeholder-binding tool for older artifacts or future external field dependencies; the canonical v6 no longer uses it.)

Operator step that still remains (WhatChimp-side, not in the export): add `oraya_bedroom_count: "#oraya_bedroom_count#"` and `oraya_guest_followup: "#oraya_guest_followup#"` to the Lead Submit request bodies so the bedroom preference reaches `whatsapp_leads.raw_payload` → `/api/butler/prefill` → `/book`, and the exact above-capacity guest total ("More than 8" → e.g. "12") is preserved on the lead for operators — on the two cloned TEST Lead Submit integrations during testing, and on the production `6961`/`7459` only at cutover (checklist section D; additive and safe for other flows sharing them).

## Verified vs. requires authenticated WhatChimp verification

**Verified from artifacts/repo:** node/field/API-id placement in the flow, all graph structure, all flow copy, backend contract of `/api/butler/normalize-stay-intent` (incl. new `extracted_text`), `/api/butler/lead` raw_payload persistence, `/api/butler/prefill` bedroom surfacing, `/book` hydration.

**Requires authenticated WhatChimp verification (not claimable from here):** API endpoint URLs/headers/bodies/mappings for 7466/8101/6961/7459 (including the direct-`www`-host audit of each of the four); the `extracted_text.*` rebinding; existence/ids of `oraya_nights`/`oraya_date_status`/`safe_message`/`oraya_prefill_url` mappings; save-compatibility of the repaired question transitions and merge-node (multi-input) survival across import → save → close → reopen → re-export; behavior of a 9-option quick-reply question on the live WhatsApp channel. Externally tested integration behavior on record: one refine call (`mechmech for 3 guests` + `july 10 to july 11` → `status: clear`) before export, and one Lead Submit call (2026-07-03) on the direct `https://www.stayoraya.com/api/butler/lead` endpoint — HTTP `200` in Vercel, prefill secret present, no prefill-token-generation failure, response mapping visibly including `lead_id`, `message`, and `prefill_url` → `oraya_prefill_url`. Real-subscriber persistence and final WhatsApp rendering remain checklist-only.
