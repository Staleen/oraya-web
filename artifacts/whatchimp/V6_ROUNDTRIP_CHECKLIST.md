# Oraya Natural Stay Intake v6 — human round-trip & live test checklist

Run this against a **non-production test bot**. Keep the current production bot untouched until every step passes. Steps reference visible node/question/API names, not node numbers.

> **Current candidate (2026-07-04): INTERACTIVE CONTROLS — import with ZERO operator redraws.** Round trip #1 proved the import keeps only the first serialized connection per input socket ([`roundtrips/ROUNDTRIP_1_FINDINGS.md`](roundtrips/ROUNDTRIP_1_FINDINGS.md)); round trips #2/#3 proved each Condition accepts at most ONE inbound connection TOTAL ([`roundtrips/ROUNDTRIP_2_FINDINGS.md`](roundtrips/ROUNDTRIP_2_FINDINGS.md), [`roundtrips/ROUNDTRIP_3_FINDINGS.md`](roundtrips/ROUNDTRIP_3_FINDINGS.md)). The operator's authenticated saved/reopened export of 2026-07-04 (pinned at `roundtrips/Oraya_natural_intake_v6.button-evidence.saved-reexport.txt`, SHA-256 `1D4A5E3D…11EB`) proved Inline Buttons save directly to custom fields and **converge forward normally**, so the rebuilt `Oraya_natural_intake_v6.txt` (161 nodes, 211 connections, 12 Interactive, 55 buttons/rows, 10 terminals, SHA-256 `F2810694…69E7`) asks missing guest count (one-click list, 1–6 + "More than 6"), bedrooms (3 buttons), and villa (2 canonical buttons) through Interactive controls; extracted values skip their question; completion = Lead Submit → summary ("team will review availability", not confirmed, secure link + fallback). **There is nothing to redraw** — the only serialized convergence is button/row convergence. The remaining platform unknowns are exactly what this procedure verifies: import survival of serialized postback convergence, the stored value equalling the visible label, and one-press-one-transition behavior.

## Interactive acceptance procedure — import + click-through (mandatory before any section C testing)

1. Use a **fresh disposable test bot** (not the round-trip-#1/#2/#3 bots, not production).
2. Import `Oraya_natural_intake_v6.txt` — the import and first open must show **NO warning**, and there must be **NO loose connectors** anywhere (every button/row carries its forward line; the shared acknowledgement Texts receive all inbound lines). If anything arrives loose or warned: **stop and report — do not draw around it.**
3. Work through the machine-generated click matrix in [`V6_REDRAW_CHECKLIST.md`](V6_REDRAW_CHECKLIST.md): **click every guest option and inspect `oraya_guest_count`; click every bedroom option and inspect `oraya_bedroom_count`; click both villa options and inspect `oraya_villa`** — each stored value must equal the visible label EXACTLY, and each press must advance the conversation exactly once (no duplicate message, no restart of the intake flow).
4. **Save** → close the editor completely → reopen → confirm every connection survived → re-click at least one control per Interactive → **export**.
5. Compare mechanically — no visual inspection substitutes for this:
   `node scripts/compare-whatchimp-roundtrip.mjs Oraya_natural_intake_v6.txt <re-export-file>`
   Required result, PRESERVED / exit code 0 with: **zero** deleted/added nodes, **zero** semantic node changes, **zero** lost or gained edges, **zero** new unintended terminals, and `oraya_bedroom_count` = `custom_69114` bindings intact (also run `node scripts/validate-whatchimp-flow.mjs <re-export> --strict-binding` → exit 0; dropped button/row edges show up as `single-parent-contract` postback-hub errors, and any control drift as `interactive-contract` errors).
6. Run one complete conversation to the final summary and verify the saved lead (dates, guests, bedrooms, villa) in `/admin/leads` + Supabase `whatsapp_leads.raw_payload`.
7. TEST integrations only (sections A0/A1); **no production activation** and no production integration edits.
8. Save compatibility may not be claimed until this passes; only then proceed to section C.

## A0. Shared-integration audit — do this BEFORE touching any HTTP API settings

WhatChimp HTTP API integrations are tenant-level objects shared by every flow that references the same integration ID. **Do not edit `7466`, `8101`, `6961`, or `7459` until you have confirmed, in the WhatChimp UI, which flows currently reference each of them.**

1. Open each integration (7466 "Oraya Stay Intent - Production", 8101 "…Refine - Production", 6961 and 7459 "Oraya Lead Submit - Production") and note every flow/bot that uses it.
2. Expected per current system docs: the natural-intake flow is **not yet live** (the old four-step intake still runs in production), so 7466/8101 should have no live consumers — but this must be seen, not assumed. `6961`/`7459` **are expected to be used by the live booking-request flow — treat them as live-shared; never edit them for testing.**
3. For all pre-merge / pre-cutover testing, use **cloned test integrations** (next section), not the production ones.

## A1. Create cloned non-production test integrations

The backend `extracted_text` field exists only on this PR's branch until it is merged and deployed. To test before (or independently of) the production deploy, clone **three** integrations as new entries (WhatChimp assigns the new numeric IDs — record all three; never invent them). The website-handoff integration `7459` is **no longer referenced by this flow** (the handoff-choice stage was removed 2026-07-04) — no clone of it is needed; do not edit or delete the production integration.

1. **"Oraya Stay Intent - TEST"** (clone of 7466) — same body `{ "stay_text": "#oraya_stay_text#" }`.
2. **"Oraya Stay Intent Refine - TEST"** (clone of 8101) — same body `{ "stay_text": "#oraya_stay_text# #oraya_stay_followup#" }`.
3. **"Oraya Lead Submit WhatsApp - TEST"** (clone of 6961) — same lead body **plus** `oraya_bedroom_count: "#oraya_bedroom_count#"` **and** `oraya_guest_followup: "#oraya_guest_followup#"`, and **add the response mapping `prefill_url` → `oraya_prefill_url`** (the summary and escalation terminals display this secure continuation link; the canonical fallback in the same message carries when it is absent). This clone replaces every node currently bound to 6961 (the two stay-request completion nodes and the eight escalation tails).

Then:

5. Point the two TEST Stay Intent integrations at the **Vercel Preview deployment** of this PR (`https://<preview-hash>.vercel.app/api/butler/normalize-stay-intent`) with the Preview environment's `X-Butler-Secret`. This requires `BUTLER_WEBHOOK_SECRET` to be set in Vercel Preview (see ENVIRONMENT_MAP.md). Point the single TEST Lead Submit integration at the Preview `/api/butler/lead` the same way (Preview writes to the same Supabase `whatsapp_leads` table — expect test rows). Alternative: merge the PR first — `extracted_text` and the two additive body fields are harmless to existing consumers — and point the TEST integrations at the direct production API host `https://www.stayoraya.com` instead (never the bare host: see the endpoint-verification rule in A1.8). Vercel Preview deployment URLs are already direct and non-redirecting; use them as-is.
6. Bind the TEST Stay Intent response mappings to `extracted_text.*` per `V6_DEPENDENCIES.md`.
7. **Test profile for the validator:** the shipped manifest pins the production IDs, so re-exports of the test bot are validated with a copied profile. Copy `scripts/whatchimp/natural-intake-profile.json` and edit:
   - `apis.initialNormalize.id` → TEST Stay Intent id
   - `apis.refine.id` → TEST Refine id
   - `apis.leadSubmit.ids` → the single TEST lead id, e.g. `["<whatsapp-test-id>"]`
   - `apiFieldWrites`: rename the `"7466"`/`"8101"` keys to the TEST Stay Intent / Refine ids (same mapping objects, including `guest_followup`), and rename `"6961"` → `<whatsapp-test-id>` **preserving** `{ "prefill_url": "oraya_prefill_url" }` (matches A1.3 — the summary and escalation endings display the secure link). The TEST Lead Submit entry keeps the prefill mapping; the canonical `/book` fallback in the terminal texts is complementary, never a replacement.
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
   - The six bedroom Interactives ("How many bedrooms would you like?") each carry three Inline Buttons ("1 bedroom" / "2 bedrooms" / "3 bedrooms"), all eighteen bound to `oraya_bedroom_count` (`custom_69114`). The guest list stages carry seven Rows each bound to `oraya_guest_count`; the villa Interactive carries two buttons bound to `oraya_villa`.
   - **No loose or disconnected lines anywhere** — every Inline Button and every list Row carries exactly one forward line into its acknowledgement Text or next stage, and every free-text question (the opening stay question, the date follow-ups, the exact-count ask, the escalation name questions) connects forward through exactly one line into an acknowledgement Text or an HTTP API node. **If anything shows a dangling or missing line after save → close → reopen, stop and report.**
   - The initial normalization integration appears exactly **once** (after the opening "please tell me what you already know about your stay" question).
   - The Refine integration appears after **every** date follow-up question (four places).
   - A Lead Submit integration appears in **ten** places: the two stay-request completion nodes (feeding the two final summaries) and the eight escalation tails (after each escalation name question).
   - **Postback merges must arrive COMPLETE.** The shared acknowledgement Texts and the exact-count question converge many button/row lines (up to 30 on the guest acknowledgement) — every one of those edges must be present straight from import. **If any button/row edge is missing, stop and report — there is nothing to draw in this build** (see the ZERO-connections-to-draw statement in [`V6_REDRAW_CHECKLIST.md`](V6_REDRAW_CHECKLIST.md)).
4. **Rebind the API nodes to the TEST integrations** (UI dropdown per node):
   - the single initial-normalization node → "Oraya Stay Intent - TEST"
   - all four refine nodes → "Oraya Stay Intent Refine - TEST"
   - all ten Lead Submit nodes (two completion + eight escalation tails) → "Oraya Lead Submit WhatsApp - TEST"
5. **Save**, close, reopen again and confirm the TEST bindings persisted on all fifteen API nodes. Production integrations stay untouched throughout testing.

## B. Round-trip export validation

6. Re-export the saved workflow **without any manual JSON editing**.
7. Run the validator against the re-export with the test profile from A1.7:
   ```
   node scripts/validate-whatchimp-flow.mjs <re-exported-file> --profile <test-profile.json> --strict-binding --bedroom-field-id 69114
   ```
   Required result: exit code 0, zero errors, zero warnings.

## C. Live WhatsApp scenarios (test bot)

There is **no confirmation step, no Edit loop, no handoff choice, and no happy-path name ask** in this build — the flow ends at the final summary and the lead is submitted directly. There is also **no WhatsApp-side capacity validation** (guests-vs-bedrooms fit is enforced by the `/book` website form, the system of record). Known UX gap to observe throughout: **free-text typed at an Interactive question does NOT advance the flow** — the guest must tap a button/row; note anywhere this strands a real conversation.

For each, message the test number and verify:

1. **Full request → direct summary** — the opening "please tell me what you already know about your stay" question must already display the safety link `https://stayoraya.com/book` (this is the pre-API guarantee — verify it appears BEFORE you answer anything). Then: "Villa Mechmech July 10 to July 11 for 3 guests": no date/villa/guest re-ask → bedroom Interactive shows exactly the three buttons "1 bedroom" / "2 bedrooms" / "3 bedrooms" → tap "3 bedrooms" → the flow proceeds straight to the final summary showing check-in, check-out, villa, **Overnight guests: 3**, **Bedrooms: 3 bedrooms**, the "team will review availability and follow up" wording, and "not a confirmed booking yet". No name question, no "Looks right / Edit" step may appear.
2. **Lead saved without a name ask** — after the summary in scenario 1, verify the lead row appears in `/admin/leads`, then verify in Supabase (Table Editor → `whatsapp_leads` → newest row → `raw_payload`) that `oraya_bedroom_count` carries the tapped value (`"3 bedrooms"`) — `/admin/leads` intentionally does not display `raw_payload`.
3. **Secure continuation link in the summary** — the final summary itself contains a working `prefill_url` (populated by the Lead Submit response mapping) plus the `https://stayoraya.com/book` fallback; opening the secure link hydrates `/book` with villa, dates, guests **and the chosen bedroom count**; the fallback opens `/book` blank.
4. **Unreadable dates twice** — reply nonsense to both date asks → escalation asks your name (escalation tails keep their existing name question) → final message says the request was passed to the team and is **not** a confirmed booking. Lead visible in `/admin/leads`.
5. **Guest list rendering + exact above-capacity total (critical platform unknown)** — the guest question must render as a WhatsApp **list message**: a "Choose guests" button opens the "Overnight guests" section with all seven rows **1, 2, 3, 4, 5, 6, More than 6**. Open the list, tap a numeric row on one run (verify `oraya_guest_count` = the bare numeral and exactly one advance), then on a fresh run tap "More than 6" → exact-count ask → answer "12" → team-review wording → name → lead → not-confirmed ending. Verify in Supabase (`whatsapp_leads` → newest row → `raw_payload`) that `oraya_guest_followup` = `"12"` — a lead row existing is NOT sufficient; the exact number must be preserved. (This requires `oraya_guest_followup: "#oraya_guest_followup#"` in the Lead Submit body — A1 step 3.)
6. **Villa buttons** — a request with dates+guests but no villa reaches the villa Interactive with exactly the two buttons "Villa Mechmech" / "Villa Byblos"; tapping one stores the exact canonical name in `oraya_villa` and the summary shows it.
7. **Returning-subscriber stale test** — complete a partial attempt with Villa Mechmech and abandon; new attempt "July 20 to July 25 for 4 guests" must present the villa buttons again (no silent Mechmech reuse).
8. **Wrong-domain guard** — every message that mentions the website says only `https://stayoraya.com`.
9. **No-dead-end / HTTP-failure behavior (critical platform unknown)** — probe **each of the three TEST integration types in isolation** on a throwaway copy of the flow, restoring the correct endpoint immediately after each probe:
    - **Stay Intent - TEST** → invalid path (e.g. `/api/butler/does-not-exist`) → send a stay message → does the flow continue to the date/guest questions? (Guest already holds the safety link from the opening question either way.)
    - **Stay Intent Refine - TEST** → invalid path → answer a date follow-up → does the flow continue (retry / escalation)?
    - **Lead Submit WhatsApp - TEST** → invalid path → run BOTH routes that use it: a completed request (through the interactive questions to the summary) AND an escalation route (unreadable dates twice → name → submit) → does each still deliver its final message with the booking links?
    The repo simulator assumes the runtime continues past a failed call (the graph has no status branching); if the live platform instead halts, stop and report — the pre-API safety link in the opening question is then the guest's only continuation, which is exactly why it exists.
10. **Terminal continuation on the endings** — this build has **ten terminals: two final summaries** (villa-gate true/false completion paths) **and eight escalation tails**. Verify both summaries and at least one escalation tail of each family reached during testing visibly contain the secure link (when the Lead Submit mapping populated `oraya_prefill_url`) **and** the `https://stayoraya.com/book` fallback, and say the booking is not confirmed. Tap the secure link and confirm `/book` hydrates; tap the fallback and confirm `/book` opens blank.
11. **Stale guest-overflow reset (live Supabase test)** — with ONE subscriber: (a) start an above-capacity attempt, tap "More than 6", enter `12`, and either abandon or complete it; (b) start a NEW supported request ("Villa Mechmech July 10 to July 11 for 2 guests") and complete it to a lead; (c) open Supabase → `whatsapp_leads` → the **newest** row → `raw_payload`; verify `oraya_guest_followup` is `"null"` (the reset value written by the `extracted_text.guest_followup` mapping) and `oraya_guest_count` is `"2"` — **no stale `"12"` may be present on the supported-count lead.**

## D. Production cutover (only after A+B+C pass AND the PR is merged/deployed)

1. Re-run the A0 shared-integration audit for `7466`/`8101`. Only if no other live flow references them, rebind their response mappings to `extracted_text.*` (production endpoint `https://www.stayoraya.com/api/butler/normalize-stay-intent` — direct host per A1.8). If any other live flow shares them, clone production-scoped integrations instead and rebind the flow's API nodes at import.
2. **Audit the endpoint host of ALL FOUR production integrations** (`7466`, `8101`, `6961`, `7459`): each must POST to the direct `https://www.stayoraya.com/api/butler/...` host. One Lead Submit integration was already corrected and verified on the direct host (2026-07-03: HTTP `200` in Vercel, prefill secret present, `lead_id` / `message` / `prefill_url` → `oraya_prefill_url` mappings visible); that does **not** prove the other three — verify each individually against the A1.8 rule (any `3xx` = failure).
3. Add `oraya_bedroom_count: "#oraya_bedroom_count#"` **and** `oraya_guest_followup: "#oraya_guest_followup#"` to the production Lead Submit body of `6961`, and confirm it carries the `prefill_url` → `oraya_prefill_url` response mapping. This is additive and safe for other flows sharing the integration: unknown/empty values land in `whatsapp_leads.raw_payload`, the prefill route only surfaces bedroom values that validate to 1/2/3, and `oraya_guest_followup` is audit data for operators (the exact above-capacity guest total). `7459` (website handoff) is **no longer referenced by this flow** — do not edit it for v6; it still gets the D.2 host audit because other flows may use it.
4. Import the bound v6 artifact into the production bot with the production integration bindings, save, re-export, and validate with the **production** profile:
   `node scripts/validate-whatchimp-flow.mjs <production-re-export> --strict-binding --bedroom-field-id 69114`
5. Re-run checklist section C against the production number before retiring the old intake flow.

Only after A+B+C pass may the flow be promoted toward the production bot, and only after D passes may it be described as anything beyond an **import-ready v6 candidate**.
