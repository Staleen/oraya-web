# Oraya Natural Stay Intake v6 — human round-trip & live test checklist

Run this against a **non-production test bot**. Keep the current production bot untouched until every step passes. Steps reference visible node/question/API names, not node numbers.

## A0. Shared-integration audit — do this BEFORE touching any HTTP API settings

WhatChimp HTTP API integrations are tenant-level objects shared by every flow that references the same integration ID. **Do not edit `7466`, `8101`, `6961`, or `7459` until you have confirmed, in the WhatChimp UI, which flows currently reference each of them.**

1. Open each integration (7466 "Oraya Stay Intent - Production", 8101 "…Refine - Production", 6961 and 7459 "Oraya Lead Submit - Production") and note every flow/bot that uses it.
2. Expected per current system docs: the natural-intake flow is **not yet live** (the old four-step intake still runs in production), so 7466/8101 should have no live consumers — but this must be seen, not assumed. `6961`/`7459` **are expected to be used by the live booking-request flow — treat them as live-shared; never edit them for testing.**
3. For all pre-merge / pre-cutover testing, use **cloned test integrations** (next section), not the production ones.

## A1. Create cloned non-production test integrations

The backend `extracted_text` field exists only on this PR's branch until it is merged and deployed. To test before (or independently of) the production deploy, clone **four** integrations as new entries (WhatChimp assigns the new numeric IDs — record all four; never invent them):

1. **"Oraya Stay Intent - TEST"** (clone of 7466) — same body `{ "stay_text": "#oraya_stay_text#" }`.
2. **"Oraya Stay Intent Refine - TEST"** (clone of 8101) — same body `{ "stay_text": "#oraya_stay_text# #oraya_stay_followup#" }`.
3. **"Oraya Lead Submit WhatsApp - TEST"** (clone of 6961) — same lead body **plus** `oraya_bedroom_count: "#oraya_bedroom_count#"` **and** `oraya_guest_followup: "#oraya_guest_followup#"`. This clone replaces every node currently bound to 6961 (the "May I have your full name for the request?" tail and the escalation tail).
4. **"Oraya Lead Submit Website Handoff - TEST"** (clone of 7459) — same lead body **plus** the same two fields (`oraya_bedroom_count`, `oraya_guest_followup`), **preserving the response mapping `prefill_url` → `oraya_prefill_url`**. This clone replaces the single node currently bound to 7459 (the "Finish on website" branch).

Then:

5. Point the two TEST Stay Intent integrations at the **Vercel Preview deployment** of this PR (`https://<preview-hash>.vercel.app/api/butler/normalize-stay-intent`) with the Preview environment's `X-Butler-Secret`. This requires `BUTLER_WEBHOOK_SECRET` to be set in Vercel Preview (see ENVIRONMENT_MAP.md). Point the two TEST Lead Submit integrations at the Preview `/api/butler/lead` the same way (Preview writes to the same Supabase `whatsapp_leads` table — expect test rows). Alternative: merge the PR first — `extracted_text` and the two additive body fields are harmless to existing consumers — and point the TEST integrations at `https://stayoraya.com` instead.
6. Bind the TEST Stay Intent response mappings to `extracted_text.*` per `V6_DEPENDENCIES.md`.
7. **Test profile for the validator:** the shipped manifest pins the production IDs, so re-exports of the test bot are validated with a copied profile. Copy `scripts/whatchimp/natural-intake-profile.json` and edit:
   - `apis.initialNormalize.id` → TEST Stay Intent id
   - `apis.refine.id` → TEST Refine id
   - `apis.leadSubmit.ids` → **both** TEST lead ids, e.g. `["<whatsapp-test-id>", "<website-handoff-test-id>"]`
   - `apiFieldWrites`: rename the `"7466"`/`"8101"` keys to the TEST Stay Intent / Refine ids (same mapping objects), rename `"6961"` → `<whatsapp-test-id>` (`{}`), and rename `"7459"` → `<website-handoff-test-id>` keeping `{ "prefill_url": "oraya_prefill_url" }` so the simulator/validator still model the handoff URL write.
   Then validate re-exports with:
   `node scripts/validate-whatchimp-flow.mjs <re-export> --profile <test-profile.json> --strict-binding --bedroom-field-id <REAL_ID>`.

## A2. Bind, import, verify, rebind

1. Create custom field `oraya_bedroom_count` (Text). Run:
   `node scripts/bind-whatchimp-field.mjs Oraya_natural_intake_v6.txt <REAL_ID>`
2. Import the bound `Oraya_natural_intake_v6.txt` into the test bot. **Save** the workflow, close the editor completely, then reopen it.
3. Confirm the import persisted structurally. At this point the API nodes still display the **Production** integration names carried in the export — that is expected before rebinding:
   - The four "How many bedrooms would you like?" questions save to `oraya_bedroom_count`.
   - The initial normalization integration appears twice (after the opening "please tell me what you already know about your stay" question, and after "Your updated stay details:").
   - The Refine integration appears after **every** date follow-up question (six places).
   - A Lead Submit integration appears after "May I have your full name for the request?", after the escalation name question ("So our team can follow up personally — may I have your full name?"), and on the "Finish on website" branch.
   - The multi-input merge points kept **all** their inbound arrows (the guest-count check fed by both date branches; the villa check fed by the bedroom validations; the escalation name step fed by the date-trouble, large-group, bedroom, and second-Edit messages). **This is the known platform risk — if arrows were dropped on save, stop and report.**
4. **Rebind the API nodes to the TEST integrations** (UI dropdown per node):
   - both initial-normalization nodes → "Oraya Stay Intent - TEST"
   - all six refine nodes → "Oraya Stay Intent Refine - TEST"
   - the two name-tail / escalation Lead Submit nodes → "Oraya Lead Submit WhatsApp - TEST"
   - the "Finish on website" Lead Submit node → "Oraya Lead Submit Website Handoff - TEST"
5. **Save**, close, reopen again and confirm the TEST bindings persisted on all eleven API nodes. Production integrations stay untouched throughout testing.

## B. Round-trip export validation

6. Re-export the saved workflow **without any manual JSON editing**.
7. Run the validator against the re-export with the test profile from A1.7:
   ```
   node scripts/validate-whatchimp-flow.mjs <re-exported-file> --profile <test-profile.json> --strict-binding --bedroom-field-id <REAL_ID>
   ```
   Required result: exit code 0, zero errors, zero warnings.

## C. Live WhatsApp scenarios (test bot)

For each, message the test number and verify:

1. **Full request** — "Villa Mechmech July 10 to July 11 for 3 guests": no date/villa/guest re-ask → bedroom question shows exactly 1/2/3 bedroom buttons → choose "3 bedrooms" → confirmation shows check-in, check-out, villa, **Overnight guests: 3**, **Bedrooms: 3 bedrooms** → "Looks right" → handoff choice appears.
2. **Continue on WhatsApp** — collects full name, then ends with "…not confirmed yet." Verify the lead row appears in `/admin/leads`, then verify in Supabase (Table Editor → `whatsapp_leads` → newest row → `raw_payload`) that `oraya_bedroom_count` carries the chosen value — `/admin/leads` intentionally does not display `raw_payload`.
3. **Finish on website** — message contains a working `prefill_url`; opening it hydrates `/book` with villa, dates, guests **and the chosen bedroom count**.
4. **Unreadable dates twice** — reply nonsense to both date asks → escalation asks your name → final message says the request was passed to the team and is **not** a confirmed booking. Lead visible in `/admin/leads`.
5. **Guest 9-option list + exact above-capacity total** — the "How many guests will be staying overnight?" question renders all of 1–8 + "More than 8" on the live WhatsApp channel (platform rendering of >3 choices is unverified). Choose "More than 8" → exact-count ask → answer "12" → team-review wording → name → lead → not-confirmed ending. Then verify in Supabase (`whatsapp_leads` → newest row → `raw_payload`) that `oraya_guest_followup` = `"12"` — a lead row existing is NOT sufficient; the exact number must be preserved. (This requires `oraya_guest_followup: "#oraya_guest_followup#"` in the Lead Submit body — A1 steps 3–4.)
6. **Bedroom mismatch** — say 5 guests, choose "1 bedroom": mismatch explanation, bedroom re-ask, choose "3 bedrooms", continue; guest count still 5 at confirmation.
7. **Edit, full replacement** — at confirmation choose Edit, send a complete new request: new details confirmed, no old values shown.
8. **Edit, "Villa Byblos" only** — flow asks dates and guests again; confirmation must NOT show the previous dates/guest count mixed with the new villa.
9. **Returning-subscriber stale test** — complete a partial attempt with Villa Mechmech and abandon; new attempt "July 20 to July 25 for 4 guests" must ask which villa (no silent Mechmech reuse).
10. **Wrong-domain guard** — every message that mentions the website says only `https://stayoraya.com`.

## D. Production cutover (only after A+B+C pass AND the PR is merged/deployed)

1. Re-run the A0 shared-integration audit for `7466`/`8101`. Only if no other live flow references them, rebind their response mappings to `extracted_text.*` (production endpoint `https://stayoraya.com/api/butler/normalize-stay-intent`). If any other live flow shares them, clone production-scoped integrations instead and rebind the flow's API nodes at import.
2. Add `oraya_bedroom_count: "#oraya_bedroom_count#"` **and** `oraya_guest_followup: "#oraya_guest_followup#"` to the production Lead Submit bodies (`6961` and `7459`). This is additive and safe for other flows sharing those integrations: unknown/empty values land in `whatsapp_leads.raw_payload`, the prefill route only surfaces bedroom values that validate to 1/2/3, and `oraya_guest_followup` is audit data for operators (the exact above-capacity guest total).
3. Import the bound v6 artifact into the production bot with the production integration bindings, save, re-export, and validate with the **production** profile:
   `node scripts/validate-whatchimp-flow.mjs <production-re-export> --strict-binding --bedroom-field-id <REAL_ID>`
4. Re-run checklist section C against the production number before retiring the old intake flow.

Only after A+B+C pass may the flow be promoted toward the production bot, and only after D passes may it be described as anything beyond an **import-ready v6 candidate**.
