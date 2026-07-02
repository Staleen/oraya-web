# Oraya Natural Stay Intake v6 — human round-trip & live test checklist

Run this against a **non-production test bot**. Keep the current production bot untouched until every step passes. Steps reference visible node/question/API names, not node numbers.

## A. Bind and import

1. Create custom field `oraya_bedroom_count` (Text). Run:
   `node scripts/bind-whatchimp-field.mjs Oraya_natural_intake_v6.txt <REAL_ID>`
2. Import the bound `Oraya_natural_intake_v6.txt` into the test bot. **Save** the workflow.
3. Close the workflow editor completely, then reopen it.
4. Confirm these persisted visually:
   - The four "How many bedrooms would you like?" questions save to `oraya_bedroom_count`.
   - "Oraya Stay Intent - Production : POST" appears twice (after the opening "please tell me what you already know about your stay" question, and after "Your updated stay details:").
   - "Oraya Stay Intent Refine - Production : POST" appears after **every** date follow-up question (six places).
   - "Oraya Lead Submit - Production : POST" appears after "May I have your full name for the request?", after the escalation name question ("So our team can follow up personally — may I have your full name?"), and on the "Finish on website" branch.
   - The multi-input merge points kept **all** their inbound arrows (the guest-count check fed by both date branches; the villa check fed by the bedroom validations; the escalation name step fed by the date-trouble, large-group, bedroom, and second-Edit messages). **This is the known platform risk — if arrows were dropped on save, stop and report.**
5. In each of the two Stay Intent API settings, rebind response mappings to `extracted_text.*` per `artifacts/whatchimp/V6_DEPENDENCIES.md`, and add `oraya_bedroom_count` to both Lead Submit request bodies.

## B. Round-trip export validation

6. Re-export the saved workflow **without any manual JSON editing**.
7. Run the same validator against the re-export:
   ```
   node scripts/validate-whatchimp-flow.mjs <re-exported-file> --strict-binding --bedroom-field-id <REAL_ID>
   ```
   Required result: exit code 0, zero errors, zero warnings.

## C. Live WhatsApp scenarios (test bot)

For each, message the test number and verify:

1. **Full request** — "Villa Mechmech July 10 to July 11 for 3 guests": no date/villa/guest re-ask → bedroom question shows exactly 1/2/3 bedroom buttons → choose "3 bedrooms" → confirmation shows check-in, check-out, villa, **Overnight guests: 3**, **Bedrooms: 3 bedrooms** → "Looks right" → handoff choice appears.
2. **Continue on WhatsApp** — collects full name, then ends with "…not confirmed yet." Verify the lead (with bedroom count in its payload) appears in `/admin/leads`.
3. **Finish on website** — message contains a working `prefill_url`; opening it hydrates `/book` with villa, dates, guests **and the chosen bedroom count**.
4. **Unreadable dates twice** — reply nonsense to both date asks → escalation asks your name → final message says the request was passed to the team and is **not** a confirmed booking. Lead visible in `/admin/leads`.
5. **Guest 9-option list** — the "How many guests will be staying overnight?" question renders all of 1–8 + "More than 8" on the live WhatsApp channel (platform rendering of >3 choices is unverified). Choose "More than 8" → exact-count ask → team-review wording → name → lead → not-confirmed ending.
6. **Bedroom mismatch** — say 5 guests, choose "1 bedroom": mismatch explanation, bedroom re-ask, choose "3 bedrooms", continue; guest count still 5 at confirmation.
7. **Edit, full replacement** — at confirmation choose Edit, send a complete new request: new details confirmed, no old values shown.
8. **Edit, "Villa Byblos" only** — flow asks dates and guests again; confirmation must NOT show the previous dates/guest count mixed with the new villa.
9. **Returning-subscriber stale test** — complete a partial attempt with Villa Mechmech and abandon; new attempt "July 20 to July 25 for 4 guests" must ask which villa (no silent Mechmech reuse).
10. **Wrong-domain guard** — every message that mentions the website says only `https://stayoraya.com`.

Only after A+B+C pass may the flow be promoted toward the production bot, and only then may it be described as anything beyond an **import-ready v6 candidate**.
