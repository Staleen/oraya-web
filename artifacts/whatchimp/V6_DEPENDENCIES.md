# Oraya Natural Stay Intake v6 — WhatChimp dependency manifest

**Artifact:** `Oraya_natural_intake_v6.txt` (repo root; copy also delivered next to the operator's v5.5 export).
**Machine-readable profile:** `scripts/whatchimp/natural-intake-profile.json`.
**Status: import-ready v6 candidate.** Repository validation is complete; the authenticated WhatChimp import → save → re-export round trip and the live WhatsApp checklist are still required before this may be called production-bound.

## HTTP API integrations referenced by the flow

The flow export carries only the integration **IDs**. Endpoint URLs, headers, request bodies, secrets, and response mappings live in the WhatChimp "HTTP API" settings **outside** the export and cannot be verified from the artifact — they require authenticated WhatChimp verification.

| API ID | Name | Used at nodes | Expected request body | Expected response mappings |
|---|---|---|---|---|
| `7466` | Oraya Stay Intent - Production | #401 (initial), #498 (Edit — fresh attempt) | `{ "stay_text": "#oraya_stay_text#" }` | see mapping table below |
| `8101` | Oraya Stay Intent Refine - Production | #422, #427, #435, #506, #653, #659 (after every date follow-up) | `{ "stay_text": "#oraya_stay_text# #oraya_stay_followup#" }` | see mapping table below |
| `6961` | Oraya Lead Submit - Production (WhatsApp / escalation) | #9 (WhatsApp continue), #642 (escalation) | lead payload incl. `oraya_*` fields — **add** `oraya_bedroom_count: "#oraya_bedroom_count#"` and `oraya_guest_followup: "#oraya_guest_followup#"` | **add** `prefill_url` → `oraya_prefill_url` (the terminals after these nodes display the secure continuation link; without the mapping the canonical fallback in the same message still carries) |
| `7459` | Oraya Lead Submit - Production (website handoff) | #84 | lead payload incl. `oraya_*` fields — **add** `oraya_bedroom_count: "#oraya_bedroom_count#"` and `oraya_guest_followup: "#oraya_guest_followup#"` | `prefill_url` → `oraya_prefill_url` |

Both `7466` and `8101` POST to `https://stayoraya.com/api/butler/normalize-stay-intent` (canonical origin only — never `www.` or any `.lb` host) with the `X-Butler-Secret` header. Secret values are never present in the flow export, this manifest, or the repo.

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
| `oraya_bedroom_count` | **`__ORAYA_BEDROOM_COUNT_FIELD_ID__` (placeholder — external binding dependency)** | does not exist yet; see below |
| `oraya_nights`, `oraya_date_status`, `safe_message`, `oraya_prefill_url` | not referenced by flow nodes | exist only in API mappings (authenticated verification required) |

### The single external binding dependency: `oraya_bedroom_count`

No real WhatChimp field id for bedroom count exists in any supplied artifact or repository file, and no authenticated WhatChimp tooling is available from this environment. A fabricated id is never acceptable, so the v6 artifact ships with a documented placeholder. Operator steps:

1. WhatChimp → Custom Fields → **New** → name exactly `oraya_bedroom_count`, type **Text** (Number also acceptable — the flow saves button captions like `2 bedrooms`; Text is recommended).
2. Note the numeric field id WhatChimp assigns (visible in the field list / URL).
3. Bind it deterministically:
   ```
   node scripts/bind-whatchimp-field.mjs Oraya_natural_intake_v6.txt <REAL_ID>
   node scripts/validate-whatchimp-flow.mjs Oraya_natural_intake_v6.txt --strict-binding --bedroom-field-id <REAL_ID>
   ```
   (20 placeholder occurrences: 4 bedroom questions + 16 condition-row entries.)
4. Also add `oraya_bedroom_count: "#oraya_bedroom_count#"` and `oraya_guest_followup: "#oraya_guest_followup#"` to the Lead Submit request bodies so the bedroom preference reaches `whatsapp_leads.raw_payload` → `/api/butler/prefill` → `/book`, and the exact above-capacity guest total ("More than 8" → e.g. "12") is preserved on the lead for operators — on the two cloned TEST Lead Submit integrations during testing, and on the production `6961`/`7459` only at cutover (checklist section D; additive and safe for other flows sharing them).

## Verified vs. requires authenticated WhatChimp verification

**Verified from artifacts/repo:** node/field/API-id placement in the flow, all graph structure, all flow copy, backend contract of `/api/butler/normalize-stay-intent` (incl. new `extracted_text`), `/api/butler/lead` raw_payload persistence, `/api/butler/prefill` bedroom surfacing, `/book` hydration.

**Requires authenticated WhatChimp verification (not claimable from here):** API endpoint URLs/headers/bodies/mappings for 7466/8101/6961/7459; the `extracted_text.*` rebinding; existence/ids of `oraya_nights`/`oraya_date_status`/`safe_message`/`oraya_prefill_url` mappings; the real `oraya_bedroom_count` id; merge-node (multi-input) survival across import → save → re-export; behavior of a 9-option quick-reply question on the live WhatsApp channel. The operator manually verified one refine call (`mechmech for 3 guests` + `july 10 to july 11` → `status: clear`) before export — that is the only externally tested integration behavior on record.
