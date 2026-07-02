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
| `6961` | Oraya Lead Submit - Production | #9 (WhatsApp continue), #642 (escalation) | lead payload incl. `oraya_*` fields — **add** `oraya_bedroom_count: "#oraya_bedroom_count#"` | `message` (optional) |
| `7459` | Oraya Lead Submit - Production (website handoff) | #84 | lead payload incl. `oraya_*` fields — **add** `oraya_bedroom_count: "#oraya_bedroom_count#"` | `prefill_url` → `oraya_prefill_url` |

Both `7466` and `8101` POST to `https://stayoraya.com/api/butler/normalize-stay-intent` (canonical origin only — never `www.` or any `.lb` host) with the `X-Butler-Secret` header. Secret values are never present in the flow export, this manifest, or the repo.

> **Shared-integration warning:** WhatChimp integrations are tenant-global. Before editing 7466/8101 mappings or the 6961/7459 bodies, audit which flows reference them (`V6_ROUNDTRIP_CHECKLIST.md` section A0). All pre-cutover testing uses **cloned TEST integrations** pointed at the PR's Vercel Preview deployment (section A1); re-exports of the test bot are validated with a copied profile whose API ids are replaced by the recorded TEST ids (`--profile <test-profile.json>`).

### Normalization response mapping (7466 and 8101)

The backend now returns an additive `extracted_text` object whose values are **always strings**, with the literal string `"null"` for any field the current message did not contain. Bind the mappings to `extracted_text.*` (recommended) so every call deterministically overwrites the canonical fields — this is the current-attempt mechanism that prevents a returning subscriber's stale villa/dates/guest count from leaking into a new attempt. (`extracted.*` carries the same data but uses JSON `null`, whose write-behavior on WhatChimp mapping is unverified.)

| Response field | WhatChimp custom field |
|---|---|
| `extracted_text.check_in` | `oraya_check_in` |
| `extracted_text.check_out` | `oraya_check_out` |
| `extracted_text.guest_count` | `oraya_guest_count` |
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
4. Also add `oraya_bedroom_count: "#oraya_bedroom_count#"` to the Lead Submit request bodies so the bedroom preference reaches `whatsapp_leads.raw_payload` → `/api/butler/prefill` → `/book` — on the cloned TEST integration during testing, and on the production `6961`/`7459` only at cutover (checklist section D; additive and safe for other flows sharing them).

## Verified vs. requires authenticated WhatChimp verification

**Verified from artifacts/repo:** node/field/API-id placement in the flow, all graph structure, all flow copy, backend contract of `/api/butler/normalize-stay-intent` (incl. new `extracted_text`), `/api/butler/lead` raw_payload persistence, `/api/butler/prefill` bedroom surfacing, `/book` hydration.

**Requires authenticated WhatChimp verification (not claimable from here):** API endpoint URLs/headers/bodies/mappings for 7466/8101/6961/7459; the `extracted_text.*` rebinding; existence/ids of `oraya_nights`/`oraya_date_status`/`safe_message`/`oraya_prefill_url` mappings; the real `oraya_bedroom_count` id; merge-node (multi-input) survival across import → save → re-export; behavior of a 9-option quick-reply question on the live WhatsApp channel. The operator manually verified one refine call (`mechmech for 3 guests` + `july 10 to july 11` → `status: clear`) before export — that is the only externally tested integration behavior on record.
