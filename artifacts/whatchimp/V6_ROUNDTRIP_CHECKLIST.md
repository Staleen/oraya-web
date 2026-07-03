# Oraya Natural Stay Intake v6 — human round-trip & live test checklist

Run this against a **non-production test bot**. Keep the current production bot untouched until every step passes. Steps reference visible node/question/API names, not node numbers.

> **⚠️ Current candidate (2026-07-03): Option A HYBRID — import alone is NOT sufficient.** Round trip #1 proved WhatChimp's import keeps only the first serialized connection per input socket (evidence: [`roundtrips/ROUNDTRIP_1_FINDINGS.md`](roundtrips/ROUNDTRIP_1_FINDINGS.md)), while editor-drawn merges survive save/export. The rebuilt `Oraya_natural_intake_v6.txt` (165 nodes, 182 connections, SHA-256 `0066192D…3A39`) therefore ships with 11 declared hub merges, and **after every import the operator must draw exactly 18 connections in the editor, following [`V6_REDRAW_CHECKLIST.md`](V6_REDRAW_CHECKLIST.md), before sections B/C/D apply.** The un-repaired import is safe by construction (happy path complete, opening-question safety link, no fake confirmations) but is missing every escalation/Edit/capacity merge beyond the first-listed edge — the validator detects that state as hub-count drift.

## Round trip #2 — acceptance procedure for the hybrid candidate (mandatory before any section C testing)

1. Use a **fresh disposable test bot** (not the round-trip-#1 bot, not production).
2. Import `Oraya_natural_intake_v6.txt` → **draw the 18 connections** exactly as listed in [`V6_REDRAW_CHECKLIST.md`](V6_REDRAW_CHECKLIST.md) (only that list — no other edits) → **Save** → close the editor completely → reopen → **export**.
3. Compare mechanically — no visual inspection substitutes for this:
   `node scripts/compare-whatchimp-roundtrip.mjs Oraya_natural_intake_v6.txt <re-export-file>`
4. Required result, PRESERVED / exit code 0 with: **zero** deleted/added nodes, **zero** semantic node changes, **zero** lost or gained edges, **zero** new unintended terminals, and `oraya_bedroom_count` = `69114` / `custom_69114` bindings intact (also run `node scripts/validate-whatchimp-flow.mjs <re-export> --strict-binding` → exit 0; a missed redraw shows up as `single-parent-contract` hub-count errors pointing back to the checklist).
5. TEST integrations only (sections A0/A1); **no production activation** and no production integration edits.
6. Save compatibility may not be claimed until this passes; only then proceed to section C.

## A0. Shared-integration audit — do this BEFORE touching any HTTP API settings

WhatChimp HTTP API integrations are tenant-level objects shared by every flow that references the same integration ID. **Do not edit `7466`, `8101`, `6961`, or `7459` until you have confirmed, in the WhatChimp UI, which flows currently reference each of them.**

1. Open each integration (7466 "Oraya Stay Intent - Production", 8101 "…Refine - Production", 6961 and 7459 "Oraya Lead Submit - Production") and note every flow/bot that uses it.
2. Expected per current system docs: the natural-intake flow is **not yet live** (the old four-step intake still runs in production), so 7466/8101 should have no live consumers — but this must be seen, not assumed. `6961`/`7459` **are expected to be used by the live booking-request flow — treat them as live-shared; never edit them for testing.**
3. For all pre-merge / pre-cutover testing, use **cloned test integrations** (next section), not the production ones.

## A1. Create cloned non-production test integrations

The backend `extracted_text` field exists only on this PR's branch until it is merged and deployed. To test before (or independently of) the production deploy, clone **four** integrations as new entries (WhatChimp assigns the new numeric IDs — record all four; never invent them):

1. **"Oraya Stay Intent - TEST"** (clone of 7466) — same body `{ "stay_text": "#oraya_stay_text#" }`.
2. **"Oraya Stay Intent Refine - TEST"** (clone of 8101) — same body `{ "stay_text": "#oraya_stay_text# #oraya_stay_followup#" }`.
3. **"Oraya Lead Submit WhatsApp - TEST"** (clone of 6961) — same lead body **plus** `oraya_bedroom_count: "#oraya_bedroom_count#"` **and** `oraya_guest_followup: "#oraya_guest_followup#"`, and **add the response mapping `prefill_url` → `oraya_prefill_url`** (the acknowledgement/escalation terminals display this secure continuation link; the canonical fallback in the same message carries when it is absent). This clone replaces every node currently bound to 6961 (the "May I have your full name for the request?" tail and the escalation tail).
4. **"Oraya Lead Submit Website Handoff - TEST"** (clone of 7459) — same lead body **plus** the same two fields (`oraya_bedroom_count`, `oraya_guest_followup`), **preserving the response mapping `prefill_url` → `oraya_prefill_url`**. This clone replaces the single node currently bound to 7459 (the "Finish on website" branch).

Then:

5. Point the two TEST Stay Intent integrations at the **Vercel Preview deployment** of this PR (`https://<preview-hash>.vercel.app/api/butler/normalize-stay-intent`) with the Preview environment's `X-Butler-Secret`. This requires `BUTLER_WEBHOOK_SECRET` to be set in Vercel Preview (see ENVIRONMENT_MAP.md). Point the two TEST Lead Submit integrations at the Preview `/api/butler/lead` the same way (Preview writes to the same Supabase `whatsapp_leads` table — expect test rows). Alternative: merge the PR first — `extracted_text` and the two additive body fields are harmless to existing consumers — and point the TEST integrations at the direct production API host `https://www.stayoraya.com` instead (never the bare host: see the endpoint-verification rule in A1.8). Vercel Preview deployment URLs are already direct and non-redirecting; use them as-is.
6. Bind the TEST Stay Intent response mappings to `extracted_text.*` per `V6_DEPENDENCIES.md`.
7. **Test profile for the validator:** the shipped manifest pins the production IDs, so re-exports of the test bot are validated with a copied profile. Copy `scripts/whatchimp/natural-intake-profile.json` and edit:
   - `apis.initialNormalize.id` → TEST Stay Intent id
   - `apis.refine.id` → TEST Refine id
   - `apis.leadSubmit.ids` → **both** TEST lead ids, e.g. `["<whatsapp-test-id>", "<website-handoff-test-id>"]`
   - `apiFieldWrites`: rename the `"7466"`/`"8101"` keys to the TEST Stay Intent / Refine ids (same mapping objects, including `guest_followup`), rename `"6961"` → `<whatsapp-test-id>` **preserving** `{ "prefill_url": "oraya_prefill_url" }` (matches A1.3 — the WhatsApp lead-acknowledgement and escalation endings display the secure link), and rename `"7459"` → `<website-handoff-test-id>` **preserving** `{ "prefill_url": "oraya_prefill_url" }`. Both TEST Lead Submit entries keep the prefill mapping; the canonical `/book` fallback in the terminal texts is complementary, never a replacement.
   Then validate re-exports with:
   `node scripts/validate-whatchimp-flow.mjs <re-export> --profile <test-profile.json> --strict-binding --bedroom-field-id 69114`.
8. **Endpoint-verification rule (applies to EVERY production or TEST HTTP API check in this checklist):** a verification counts as successful only when the integration receives a direct `2xx` response from the configured URL. **Any `3xx` response is a failure**, even if WhatChimp reports the request as sent — an authenticated test (2026-07-03) showed the bare `https://stayoraya.com` origin answers `/api/butler/...` POSTs with a `308` redirect that WhatChimp does not safely complete, leaving response mappings (e.g. `prefill_url` → `oraya_prefill_url`) unpopulated. Production integrations must use the direct `https://www.stayoraya.com/api/butler/...` host; guest-facing links stay on `https://stayoraya.com` (e.g. `https://stayoraya.com/book`). For Lead Submit, a complete successful endpoint response is expected to include:
   ```json
   { "ok": true, "lead_id": "...", "message": "...", "prefill_url": "https://stayoraya.com/book?h=..." }
   ```
   The exact `h=` token is a short-lived credential — never commit it, paste it into docs/PRs, or share it outside the test.

## A2. Import, verify, rebind

1. The bedroom custom field exists (`oraya_bedroom_count` = `69114`, operator-created 2026-07-03) and the canonical artifact is fully bound — there is exactly **one** import file: **`Oraya_natural_intake_v6.txt`** (repo root; copy delivered in the operator's Oraya folder). No binding step is required. To regenerate from source: `node scripts/generate-whatchimp-v6.mjs artifacts/whatchimp/Oraya_natural_intake_v5.5.input.txt Oraya_natural_intake_v6.txt`.
2. Import `Oraya_natural_intake_v6.txt` into the test bot. **Save** the workflow, close the editor completely, then reopen it.
3. Confirm the import persisted structurally. At this point the API nodes still display the **Production** integration names carried in the export — that is expected before rebinding:
   - The four "How many bedrooms would you like?" questions save to `oraya_bedroom_count`.
   - **No loose or disconnected lines around any question** — every question (guest count, bedrooms, bedroom retry, villa, confirmation "Here's what I have…", the Edit-path clones of each, "Your updated stay details:", both full-name questions, the date follow-ups, and "How would you like to continue?") must connect forward through exactly one line into either a short acknowledgement message ("Perfect, thank you 😊" / "Noted 😊" / "Lovely choice 😊" / "Got it.") or an HTTP API node. The 2026-07-03 import showed loose links here because the earlier build wired questions directly into condition diamonds; that construction is removed. **If any question still shows a dangling or missing line after save → close → reopen, stop and report.**
   - The initial normalization integration appears twice (after the opening "please tell me what you already know about your stay" question, and after "Your updated stay details:").
   - The Refine integration appears after **every** date follow-up question (six places).
   - A Lead Submit integration appears after "May I have your full name for the request?", after the escalation name question ("So our team can follow up personally — may I have your full name?"), and on the "Finish on website" branch.
   - The multi-input merge points (guest-count check, villa check, confirmation, Edit merges, handoff choice) arrive from import with **only their first inbound arrow** — that is the expected hybrid state, not a failure. **Draw the 18 missing connections exactly per [`V6_REDRAW_CHECKLIST.md`](V6_REDRAW_CHECKLIST.md), then save → close → reopen and confirm every drawn arrow survived** (editor-drawn merges are export-proven; if a drawn arrow disappears after save, stop and report).
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
   node scripts/validate-whatchimp-flow.mjs <re-exported-file> --profile <test-profile.json> --strict-binding --bedroom-field-id 69114
   ```
   Required result: exit code 0, zero errors, zero warnings.

## C. Live WhatsApp scenarios (test bot)

For each, message the test number and verify:

1. **Full request** — the opening "please tell me what you already know about your stay" question must already display the safety link `https://stayoraya.com/book` (this is the pre-API guarantee — verify it appears BEFORE you answer anything). Then: "Villa Mechmech July 10 to July 11 for 3 guests": no date/villa/guest re-ask → bedroom question shows exactly 1/2/3 bedroom buttons → choose "3 bedrooms" → confirmation shows check-in, check-out, villa, **Overnight guests: 3**, **Bedrooms: 3 bedrooms** → "Looks right" → handoff choice appears.
2. **Continue on WhatsApp** — collects full name, then ends with "…not confirmed yet." Verify the lead row appears in `/admin/leads`, then verify in Supabase (Table Editor → `whatsapp_leads` → newest row → `raw_payload`) that `oraya_bedroom_count` carries the chosen value — `/admin/leads` intentionally does not display `raw_payload`.
3. **Finish on website** — message contains a working `prefill_url`; opening it hydrates `/book` with villa, dates, guests **and the chosen bedroom count**.
4. **Unreadable dates twice** — reply nonsense to both date asks → escalation asks your name → final message says the request was passed to the team and is **not** a confirmed booking. Lead visible in `/admin/leads`.
5. **Guest 9-option list + exact above-capacity total** — the "How many guests will be staying overnight?" question renders all of 1–8 + "More than 8" on the live WhatsApp channel (platform rendering of >3 choices is unverified). Choose "More than 8" → exact-count ask → answer "12" → team-review wording → name → lead → not-confirmed ending. Then verify in Supabase (`whatsapp_leads` → newest row → `raw_payload`) that `oraya_guest_followup` = `"12"` — a lead row existing is NOT sufficient; the exact number must be preserved. (This requires `oraya_guest_followup: "#oraya_guest_followup#"` in the Lead Submit body — A1 steps 3–4.)
6. **Bedroom mismatch** — say 5 guests, choose "1 bedroom": mismatch explanation, bedroom re-ask, choose "3 bedrooms", continue; guest count still 5 at confirmation.
7. **Edit, full replacement + repeated Edit** — at confirmation choose Edit, send a complete new request: new details confirmed, no old values shown. Then choose Edit **again** at the second confirmation: the bot must escalate gracefully (name → lead → final message with the booking links), never stall. Also try a free-text reply (e.g. "hmm?") instead of the Looks right / Edit buttons — it must route into the Edit path, not stop.
8. **Edit, "Villa Byblos" only** — flow asks dates and guests again; confirmation must NOT show the previous dates/guest count mixed with the new villa.
9. **Returning-subscriber stale test** — complete a partial attempt with Villa Mechmech and abandon; new attempt "July 20 to July 25 for 4 guests" must ask which villa (no silent Mechmech reuse).
10. **Wrong-domain guard** — every message that mentions the website says only `https://stayoraya.com`.
11. **No-dead-end / HTTP-failure behavior (critical platform unknown)** — probe **each of the four TEST integration types in isolation** on a throwaway copy of the flow, restoring the correct endpoint immediately after each probe:
    - **Stay Intent - TEST** → invalid path (e.g. `/api/butler/does-not-exist`) → send a stay message → does the flow continue to the date/guest questions? (Guest already holds the safety link from the opening question either way.)
    - **Stay Intent Refine - TEST** → invalid path → answer a date follow-up → does the flow continue (retry / escalation)?
    - **Lead Submit WhatsApp - TEST** → invalid path → run BOTH routes that use it: "Continue on WhatsApp" (name → submit) AND an escalation route (unreadable dates twice → name → submit) → does each still deliver its final message with the booking links?
    - **Lead Submit Website Handoff - TEST** → invalid path → "Finish on website" → does the final message still appear with the canonical fallback link?
    The repo simulator assumes the runtime continues past a failed call (the graph has no status branching); if the live platform instead halts, stop and report — the pre-API safety link in the opening question is then the guest's only continuation, which is exactly why it exists.
12. **Terminal continuation on all three endings** — verify each of the three final messages (WhatsApp lead acknowledgement, website handoff, escalation acknowledgement) visibly contains the secure link (when the Lead Submit mapping populated `oraya_prefill_url`) **and** the `https://stayoraya.com/book` fallback, and says the booking is not confirmed. Tap the secure link and confirm `/book` hydrates; tap the fallback and confirm `/book` opens blank.
13. **Stale guest-overflow reset (live Supabase test)** — with ONE subscriber: (a) start an above-capacity attempt, choose "More than 8", enter `12`, and either abandon or complete it; (b) start a NEW supported request ("Villa Mechmech July 10 to July 11 for 2 guests") and complete it to a lead; (c) open Supabase → `whatsapp_leads` → the **newest** row → `raw_payload`; verify `oraya_guest_followup` is `"null"` (the reset value written by the `extracted_text.guest_followup` mapping) and `oraya_guest_count` is `"2"` — **no stale `"12"` may be present on the supported-count lead.**

## D. Production cutover (only after A+B+C pass AND the PR is merged/deployed)

1. Re-run the A0 shared-integration audit for `7466`/`8101`. Only if no other live flow references them, rebind their response mappings to `extracted_text.*` (production endpoint `https://www.stayoraya.com/api/butler/normalize-stay-intent` — direct host per A1.8). If any other live flow shares them, clone production-scoped integrations instead and rebind the flow's API nodes at import.
2. **Audit the endpoint host of ALL FOUR production integrations** (`7466`, `8101`, `6961`, `7459`): each must POST to the direct `https://www.stayoraya.com/api/butler/...` host. One Lead Submit integration was already corrected and verified on the direct host (2026-07-03: HTTP `200` in Vercel, prefill secret present, `lead_id` / `message` / `prefill_url` → `oraya_prefill_url` mappings visible); that does **not** prove the other three — verify each individually against the A1.8 rule (any `3xx` = failure).
3. Add `oraya_bedroom_count: "#oraya_bedroom_count#"` **and** `oraya_guest_followup: "#oraya_guest_followup#"` to the production Lead Submit bodies (`6961` and `7459`), and confirm both carry the `prefill_url` → `oraya_prefill_url` response mapping. This is additive and safe for other flows sharing those integrations: unknown/empty values land in `whatsapp_leads.raw_payload`, the prefill route only surfaces bedroom values that validate to 1/2/3, and `oraya_guest_followup` is audit data for operators (the exact above-capacity guest total).
4. Import the bound v6 artifact into the production bot with the production integration bindings, save, re-export, and validate with the **production** profile:
   `node scripts/validate-whatchimp-flow.mjs <production-re-export> --strict-binding --bedroom-field-id 69114`
5. Re-run checklist section C against the production number before retiring the old intake flow.

Only after A+B+C pass may the flow be promoted toward the production bot, and only after D passes may it be described as anything beyond an **import-ready v6 candidate**.
