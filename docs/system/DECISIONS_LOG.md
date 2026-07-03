# Decisions Log

Durable architectural and operational decisions. Append-only - never edit a past entry except to add a follow-up dated link below it. If a decision is reversed, add a new entry that explicitly supersedes the old one.

**Format:**

```
## YYYY-MM-DD - <short title>

**Decision:** what was decided.
**Reason:** why.
**Impact:** what changes (files, processes, future work).
**Reversible?:** yes / no / hard.
**Supersedes:** (optional) date + title of older entry this replaces.
```

---

## 2026-07-03 - WhatChimp server-to-server HTTP APIs call the direct `www.stayoraya.com` API host; guest-facing links stay on the bare canonical origin

**Decision:** production WhatChimp HTTP API integrations (Stay Intent `7466`, Stay Intent Refine `8101`, Lead Submit `6961`/`7459`, and their TEST clones when not pointed at a Vercel Preview URL) must POST to the direct API host `https://www.stayoraya.com/api/butler/...`. Guest-facing URLs are unchanged: `https://stayoraya.com` remains the only canonical Oraya web origin, `https://stayoraya.com/book` remains the booking continuation link, and generated prefill links keep their existing origin. Every HTTP API verification in the round-trip checklist now explicitly rejects any `3xx` response as success.

**Reason:** operator-verified 2026-07-03 during an authenticated WhatChimp test: the bare origin answered a Lead Submit POST on `/api/butler/lead` with an HTTP `308` redirect, and WhatChimp did not safely complete the redirected POST — the flow never received the endpoint response, so `prefill_url` (and the secure website handoff it powers) stayed unavailable. On the direct host the same integration succeeded: Vercel recorded HTTP `200`, the prefill secret was present, no prefill-token-generation failure was logged, and the `lead_id` / `message` / `prefill_url` → `oraya_prefill_url` response mappings were visible. This is a WhatChimp client behavior around redirects, not a domain migration; no Vercel routing, application logic, or guest-facing URL changes.

**Impact:** endpoint instructions corrected in `artifacts/whatchimp/V6_DEPENDENCIES.md` and `artifacts/whatchimp/V6_ROUNDTRIP_CHECKLIST.md` (new A1.8 endpoint-verification rule incl. the expected Lead Submit success shape, D.2 four-integration host audit); BUTLER_PLAYBOOK canonical-origin section gains the server-to-server exception; new [KNOWN_BUGS.md](KNOWN_BUGS.md) #11; new tooling regression test ("operator docs: production WhatChimp API endpoints use direct www host") fails if any current operator doc reintroduces the bare API prefix. Fixing one tenant-level integration does not prove the other three — each is audited at cutover. Real-subscriber persistence and final WhatsApp rendering remain human checklist checks. The generated flow artifact is untouched (endpoint URLs live in tenant-level WhatChimp settings, not in the export).

**Reversible?:** yes — if domain routing later makes the bare API paths answer directly, a superseding entry can relax the requirement; until then the direct host is mandatory for WhatChimp POSTs.

---

## 2026-07-02 - Natural stay intake v6: validated WhatChimp artifact, deterministic flow tooling, `extracted_text` stale-field contract, WhatsApp bedroom capture

**Decision:** the WhatChimp Natural Stay Intake flow is rebuilt as a generated, machine-validated artifact (`Oraya_natural_intake_v6.txt`) produced from the operator's v5.5 export by `scripts/generate-whatchimp-v6.mjs`, and no flow revision may again be reported complete on parse/reachability evidence alone — `scripts/validate-whatchimp-flow.mjs` (semantic validator driven by `scripts/whatchimp/natural-intake-profile.json`) must exit 0 and `scripts/simulate-whatchimp-flow.mjs` (deterministic conversation simulator with stubbed API fixtures; its full scenario suite includes the fault-injection matrix and stands at 42/42 passing at this head) must pass before an artifact is called import-ready. Three durable contracts land with it:

1. **`extracted_text.*` response mirror (additive).** `POST /api/butler/normalize-stay-intent` now returns `extracted_text` alongside `extracted`: every key is a non-null string, with the literal string `"null"` for fields absent from the current message. WhatChimp response mappings should bind `extracted_text.*` → `oraya_check_in` / `oraya_check_out` / `oraya_villa` / `oraya_guest_count` so every normalization call deterministically overwrites the canonical fields. This is the current-attempt mechanism that stops a returning subscriber's stale villa/dates/guest count from leaking into a new attempt (WhatChimp's mapping behavior on JSON `null` is unverifiable from exports). Every missing-field condition in v6 compares against the literal `"null"`.
2. **WhatsApp guest/bedroom contract mirrors the website.** One exact overnight-guest question (choices 1–8 + "More than 8", saved to `oraya_guest_count`; the website's sleeping-guests input is min 1 / max 8), then a mandatory three-button bedroom question ("1 bedroom" / "2 bedrooms" / "3 bedrooms", saved to `oraya_bedroom_count`) validated with the website's `BEDROOM_CAPACITY` (1→2, 2→4, 3→6; 7–8 guests require 3 bedrooms + extra bedding). Insufficient selections get one forward-cloned re-ask, then escalate. Bedroom is always re-asked (never condition-skipped), so it needs no stale-field mechanism. Above-capacity groups capture the exact number in `oraya_guest_followup` and go to human review with a lead submitted — never silently accepted.
3. **Bedroom persistence is raw-payload-additive.** WhatChimp Lead Submit bodies gain `oraya_bedroom_count`, which lands verbatim in `whatsapp_leads.raw_payload` (no schema change). `/api/butler/prefill` surfaces it as `bedroom_count` only when it validates to "1"/"2"/"3", and `/book` hydration prefers this explicit preference over the derived-from-guests default while still preserving any manual selection. No locked system touched; `/api/bookings` unchanged.

The real WhatChimp custom-field id for `oraya_bedroom_count` does not exist yet; the artifact ships with the documented placeholder `__ORAYA_BEDROOM_COUNT_FIELD_ID__` and `scripts/bind-whatchimp-field.mjs <flow> <real-id>` binds it deterministically (a fabricated id is never acceptable). The artifact is an **import-ready v6 candidate** — the authenticated WhatChimp import/save/re-export round trip (validated with `--strict-binding`) and the live scenario checklist (`artifacts/whatchimp/V6_ROUNDTRIP_CHECKLIST.md`) remain the production gate. WhatChimp HTTP API integrations are tenant-global shared objects: production integrations `7466`/`8101`/`6961`/`7459` must not be edited for testing — pre-cutover testing uses cloned TEST integrations pointed at the PR's Vercel Preview deployment (checklist section A0/A1).

**No-dead-end terminal invariant (durable):** the flow must never strand a guest. Every reachable terminal message must deliver an actionable booking continuation — the secure `#oraya_prefill_url#` slot plus the canonical fallback `https://stayoraya.com/book` — and state the accurate not-confirmed status; a lead-submission or team-follow-up acknowledgement alone is an invalid terminal. Additionally, the opening intake question shows the canonical booking URL **before the first HTTP API node is reachable** (validator `pre-api-safety-link` check + simulator ordering invariant), so the guest holds a continuation even if the platform halts on a failed call. Enforced by the validator (`terminal-continuation`, `canonical-domain`, `pre-api-safety-link` checks) and the simulator's global invariants plus a fault-injection matrix (normalize/refine failures, WhatsApp / escalation-node / website-handoff Lead Submit failures, missing/empty/malformed `prefill_url`, retry exhaustion, above-capacity groups, double bedroom mismatch, repeated Edit, free-text choice-point replies, stale-overflow reset). **Stale-overflow reset (durable):** `extracted_text.guest_followup` is always the literal `"null"`; mapping it to `oraya_guest_followup` on 7466 and 8101 deterministically clears any stale exact-overflow count on every new/Edit attempt before any Lead Submit can fire — a supported-count lead can never carry a contradictory leftover. The remaining platform semantic — whether the live WhatChimp runtime continues past a failed HTTP call — is probed by checklist C11 across all four TEST integrations.

**Reason:** the previous agent reported the flow complete on parse/reachability/build evidence, yet the import contained unbound questions, dead-end API nodes, invalid condition rows, guest/villa paths that dead-ended at "Got it.", escalations that never submitted leads, no bedroom step, and an incomplete Edit path — the operator repaired parts by hand (v5.5). The validator reproduces all of those defects on v5.5 (exit 1; 60 errors at this head) before v6 fixes them (exit 0), which is the required proof the tooling detects more than JSON validity.

**Impact:** new `scripts/validate-whatchimp-flow.mjs`, `scripts/simulate-whatchimp-flow.mjs`, `scripts/generate-whatchimp-v6.mjs`, `scripts/bind-whatchimp-field.mjs`, `scripts/whatchimp/natural-intake-profile.json`, `scripts/whatchimp-flow-tools.test.mjs` (18 tests at this head); `Oraya_natural_intake_v6.txt` + byte-preserved v5.5 input + audit/dependency/checklist docs under `artifacts/whatchimp/`; additive changes to [lib/butler/extract-stay-intent.ts](../../lib/butler/extract-stay-intent.ts) (+4 tests, 35 total), [app/api/butler/prefill/route.ts](../../app/api/butler/prefill/route.ts), [app/book/page.tsx](../../app/book/page.tsx); ARCHITECTURE.md API-surface rows updated; playbook natural-intake section updated; new [KNOWN_BUGS.md](KNOWN_BUGS.md) #10. No schema change, no new dependency, no env change, no locked-API touch.

**Reversible?:** yes — the tooling and artifact are additive; the backend changes are additive response/payload fields that existing consumers ignore.

**Supersedes:** extends the 2026-06-05 "Natural WhatsApp stay intake" entries; the operator-wiring guidance in BUTLER_PLAYBOOK now points at the v6 artifact instead of hand-built nodes.

---

## 2026-07-02 - PR #64 merged; temporary QA mode retired and live checkout remains fail-closed

**Decision:** Merge the validated NetCommerce / CyberSource Unified Checkout sandbox foundation from PR #64, then remove its temporary Preview QA review bypass and booking auto-confirm exception from the production-bound codebase. The adapter reports checkout ready only in `sandbox`; selecting the production environment remains fail-closed until webhook/MLE reconciliation and explicit live rollout controls are implemented and approved.
**Reason:** NetCommerce confirmed successful sandbox testing and requested only the saved-card omission, which is complete. The QA exception had served its one-time external testing purpose and must not become dormant production behavior. Production credentials are still pending, and payment operations are not hardened enough for live readiness.
**Impact:** One-time Unified Checkout sandbox payments remain supported. Saved-card/tokenization remains disabled. Successful payment updates payment fields but leaves `bookings.status` unchanged for normal operational confirmation. Production payment remains unavailable even if credentials are added prematurely.
**Reversible?:** yes - live readiness can be implemented later only through an explicit Phase 16B production-activation change with webhook/MLE, idempotency/reconciliation, controlled rollout, and human approval.
**Supersedes:** the temporary runtime behavior in the 2026-06-22 PR #64 QA-mode decision; that historical entry remains below for traceability.

---

## 2026-06-22 - Saved-card/tokenization disabled for NetCommerce launch

**Decision:** PR #64 must omit CyberSource Unified Checkout saved-card consent for the NetCommerce launch. Oraya will support one-time Unified Checkout payments only and will not request TMS token creation, persist reusable customer/payment-instrument tokens, record saved-card consent, add token-management UI, or support credentials-on-file, recurring billing, or merchant-initiated payments in this launch.
**Reason:** NetCommerce confirmed the sandbox testing results were successful and requested that Oraya omit the "Save card for future payment" option before account activation. This keeps the launch scope aligned with one-time guest payment collection and avoids introducing consent, lifecycle, revocation, and security obligations that were not approved for Phase 16B launch.
**Impact:** `lib/payments/credit-libanais.ts` must keep the CyberSource capture-context saved-card consent request disabled. Remaining balances, approved add-ons, and top-ups require a new payment link unless NetCommerce later approves tokenization with explicit consent UX and security review. Refunds do not require saved-card tokenization. Production credentials are still pending and production payment remains disabled.
**Reversible?:** yes - but only after explicit NetCommerce approval, consent design, token lifecycle storage/revocation, and security review.

---

## 2026-06-22 - PR #64 temporary NetCommerce QA mode unlocks sandbox payment review gate

**Decision:** PR #64 may enable a temporary Preview-only NetCommerce QA mode using `NEXT_PUBLIC_NETCOMMERCE_QA_MODE=true` and `NETCOMMERCE_QA_MODE=true`. The public flag lets external NetCommerce testers proceed from `/book` to hosted checkout even when add-ons or special requests would normally show Oraya review-before-payment copy. The server flag lets `POST /api/payments/unified-checkout-complete` mark the sandbox booking `confirmed` only after CyberSource approves the transient-token payment and the same Supabase update persists the payment fields.
**Reason:** NetCommerce external testers were blocked before booking creation by the `/book` review gate ("This stay needs Oraya review before payment can be collected"), so they could not complete the required CyberSource Unified Checkout sandbox review. The testing requirement is explicit: add-ons and special requests must not block the sandbox payment path, and successful authoritative sandbox payment must leave the test booking confirmed for NetCommerce workflow validation.
**Impact:** This is not production activation and does not change production `master`. The flags default false/unset, must be scoped to the PR #64 Vercel Preview QA window only, and must not be copied to Production. Browser success/cancel redirects remain informational; failed, declined, abandoned, incomplete, pay-later, and cancelled bookings are not confirmed by the QA mode.
**Reversible?:** yes - remove/disable the two env flags for immediate rollback; remove the QA helper and guarded call sites when NetCommerce sandbox testing no longer needs this temporary path.

---

## 2026-06-17 - PR #64 Preview sandbox path is ready for NetCommerce-side testing

**Decision:** Draft PR #64 (`agent/phase-16b-cybersource-unified-checkout-test`) is the current Phase 16B NetCommerce / Credit Libanais / CyberSource sandbox implementation branch. It is open, unmerged, and ready for NetCommerce-side testing on Vercel Preview. Production `master` remains unchanged and production payment is not enabled.
**Reason:** The original NetCommerce task was to follow the CyberSource Unified Checkout guideline, use sandbox merchant details, add the NetCommerce payment/security seal, and notify NetCommerce when ready for their testing. The Preview approved-card path now passes: `/book` creates a booking; pay-now redirects to `/payments/checkout/[token]`; CyberSource Unified Checkout loads; the NetCommerce seal is visible; an approved sandbox card completes; `POST /api/payments/unified-checkout-complete` succeeds; payment fields update to authorized/paid; `bookings.status` remains `PENDING` for admin/operations confirmation.
**Impact:** Future agents must treat PR #64 as sandbox/Preview work only until NetCommerce review, declined-card validation, production credentials, production env setup, explicit production enablement, and final merge/release approval are complete. The private Vercel share link was sent outside the repo and must never be committed, quoted, or copied into docs.
**Reversible?:** yes - this is a status/coordination decision, not a production rollout.

---

## 2026-06-17 - Official NetCommerce payment seal is the approved PR #64 seal asset

**Decision:** The PR #64 checkout page uses the official NetCommerce seal asset (`NCseal_M.png`) for the sandbox payment/security display. The latest payment implementation commit includes `d8828c9 Use official NetCommerce payment seal`.
**Reason:** The external NetCommerce task explicitly asked Oraya to add the NetCommerce payment/security seal before handing the Preview over for testing. Using the official asset avoids relying on a placeholder or hand-drawn approximation.
**Impact:** The seal is part of the Preview sandbox readiness evidence for PR #64. Do not swap it for unofficial artwork or remove it without NetCommerce / David approval.
**Reversible?:** yes, but only if NetCommerce requests a different official asset.

---

## 2026-06-17 - Declined-card sandbox validation requires provider-supplied vector

**Decision:** Declined-card handling is not considered fully validated until NetCommerce/CyberSource provides an official declined-card sandbox vector or decline trigger and Oraya re-tests the Preview browser flow.
**Reason:** The attempted decline-style sandbox card authorized successfully during PR #64 validation. Treating that attempt as a declined-card pass would be misleading and could hide a real payment-state risk.
**Impact:** [KNOWN_BUGS.md](KNOWN_BUGS.md) tracks this as a Phase 16B payment QA/open validation item, not a production incident. Production rollout remains blocked until the decline path is validated alongside NetCommerce review/approval and production credential readiness.
**Reversible?:** yes - once the provider vector is received and the decline path passes, close the known-bug item with the validation date.

---

## 2026-06-17 - Dirty Phase 16B branch recovered; generated exports moved outside repo

**Decision:** The old dirty worktree `C:\Users\David\OneDrive - Sela\Desktop\oraya-web` on branch `codex/phase-16b-payment-readiness` has been recovered from accidental mass deletions and generated artifacts. It now has 0 tracked deletions, 0 tracked modifications, and 0 untracked files. Generated Phase 16C export artifacts were moved outside the repo to `C:\Users\David\OneDrive - Sela\Desktop\oraya-local-backups\phase-16c-exports-from-dirty-tree`.
**Reason:** The branch previously showed large accidental deletion/generation dirt and overlapped locked surfaces. It contained no useful tracked payment implementation work to salvage for PR #64.
**Impact:** Future Phase 16B implementation should not be based on that old dirty branch and should not treat it as pending useful payment work. Use updated `master` / a clean branch after the PR #64 decision unless David explicitly instructs otherwise.
**Reversible?:** N/A - cleanup coordination record.

---

## 2026-06-17 - CyberSource Unified Checkout SDK metadata comes from capture context

**Decision:** Credit Libanais / NetCommerce session parsing reads the CyberSource-returned Unified Checkout SDK metadata from the decoded capture context, including nested `ctx[*].data.clientLibrary` and `ctx[*].data.clientLibraryIntegrity`, before using any fallback asset URL.
**Reason:** PR #64 Preview validation showed `POST /api/payments/unified-checkout-session` returning 200, but the browser loaded a generic CyberSource asset and the Unified Checkout UI did not mount. Redacted capture-context inspection showed the real SDK URL and integrity value were present under the Unified Checkout context payload, not top-level `data`.
**Impact:** The checkout page now loads the bank/CyberSource-provided client library for the exact capture context. The session request also includes `PANENTRY` as the allowed payment type for card entry. Oraya still never collects card numbers or CVV; completion remains server-side transient-token authorization.
**Reversible?:** yes.

---

## 2026-06-17 - Preview payment links resolve from request origin

**Decision:** Phase 16B payment execution routes resolve checkout, return, and booking-view URLs from the current Vercel Preview request origin instead of blindly falling back to `SITE_URL` when `NEXT_PUBLIC_SITE_URL` is stale or missing. Production behavior remains canonical: `https://stayoraya.com` is still the fallback outside Preview.
**Reason:** PR #64 Preview validation showed the pay-now path creating a real Preview booking but persisting the hosted payment link as `https://www.stayoraya.com/payments/checkout/...`. That blocked sandbox validation on the branch alias and risked crossing Preview test data into production-domain UX.
**Impact:** Payment-only helper `lib/payments/request-origin.ts` is used by `POST /api/payments/checkout`, `POST /api/payments/unified-checkout-session`, and `POST /api/payments/unified-checkout-complete`. Locked `/api/bookings` remains untouched, so transactional email and booking-creation links still follow their existing `NEXT_PUBLIC_SITE_URL || SITE_URL` behavior.
**Reversible?:** yes.

---

## 2026-06-05 - Phase 16A natural stay intake — Batch 2 operator gate passed

**Decision:** Technical gate passed: WhatChimp confirmed able to call `POST /api/butler/normalize-stay-intent` and map nested `extracted.*` response fields (`extracted.check_in`, `extracted.check_out`, `extracted.villa`, `extracted.guest_count`). Architecture validated, endpoint reachable, nested field mapping verified. Production stay-booking flow migration (custom field, trigger, capture node, HTTP API call, response branches, retirement of old four-step intake) is still pending operator action.
**Reason:** Human-in-the-loop gate was required to confirm HTTP reachability and WhatChimp's ability to dereference nested JSON fields — the platform-side capability question that needed live verification before committing to production flow migration.
**Impact:** Technology validated; production flow migration still pending. `CURRENT_PHASE.md` and `BUTLER_PLAYBOOK.md` updated to reflect this distinction. No code change; docs only.
**Reversible?:** N/A (gate confirmation record).

---

## 2026-06-05 - Natural WhatsApp stay intake — new `POST /api/butler/normalize-stay-intent` endpoint

**Decision:** the rigid four-step WhatsApp intake (check-in → check-out → guests → villa) is replaced by a single natural-language ask backed by a new extraction endpoint. `POST /api/butler/normalize-stay-intent` accepts one free-text `stay_text` field (capped at 512 chars) plus an optional `reference_date` and returns `{ status: "clear" | "partial" | "unclear", extracted: { check_in, check_out, nights, villa, guest_count }, missing_fields, human_readable, safe_message, confirm_prompt }`. The endpoint is pure extraction — no Supabase read/write, no availability check, no email, no token, no lead persist. Date arithmetic is delegated to the existing `normalizeStayDates` helper so `YYYY-MM-DD` discipline (no `new Date(<guest text>)`) stays in one place. Villa detection is a substring scan over the canonical names plus the same aliases the existing `lib/butler/villa.ts` resolver recognizes (`mechmech`, `annaya`, `byblos`, `jbeil`). Guest-count detection is a small regex set (`N people / guests / adults / pax / persons`, `for N people`, `we are N`, `group of N`, `N of us`, number words). Missing-field fallbacks are buttons-only for villa (Mechmech / Byblos, no "Other") and number buttons 1–8 for guest count.

The existing two-field `POST /api/butler/normalize-dates` endpoint is **untouched** and remains available — Option A (extend the existing endpoint) was explicitly rejected because widening it from "date normalization" to "villa + guest-count detection" would silently shift the endpoint's purpose. A new endpoint named for what it actually does is cleaner to document, easier to retire later if the WhatChimp tenant ever gains LLM-grade extraction primitives, and produces a sharper DECISIONS_LOG entry.

**Reason:** live guests do not type information in the rigid order the existing flow asks for. The audit collected concrete examples (`"June 10 to June 15"`, `"June 10 till June 15 for 4 people"`, `"I want Mechmech from June 10 to 15, 3 adults"`, `"10 June for 3 nights"`, `"Book Byblos for 5 people next Saturday to Monday"`) and confirmed all five fail under the current four-field intake without a single-message extractor at the backend. The extractor stays at the backend (not in WhatChimp's AI Training layer) because the [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) "Knowledge source-of-truth" boundary forbids AI from inventing availability / pricing / policy / structured booking fields — by extension, any free-text-to-structured-fields decision must be made by Oraya's deterministic code, not by an LLM. Pushing extraction into the backend keeps the boundary intact while still letting WhatChimp run a *natural* opening prompt.

**Operator-side WhatChimp wiring is intentionally separate** (the existing pattern from the 2026-05-23 marker / sentence work). This decision lands the backend + tests + docs only; the WhatChimp custom-field + trigger + branches changes are batch 2 of the audit and are documented in the BUTLER_PLAYBOOK natural-intake section.

The audit explicitly considered and rejected:

- **Option A — extending `/api/butler/normalize-dates`.** Rejected because the endpoint's name + DECISIONS_LOG history (2026-05-14 read-only date normalization) advertise it as a *date* helper. Adding villa + guest-count detection would either widen the endpoint silently or require renaming it, both of which are noisier than just adding the new dedicated endpoint.
- **Letting WhatChimp's AI Training layer extract the structured fields.** Rejected — direct violation of the playbook's no-AI-decisions boundary. The backend must remain the only normalization authority.
- **Schema changes (e.g. adding a `stay_text` column to `whatsapp_leads`).** Rejected — the verbatim `stay_text` already flows into `whatsapp_leads.raw_payload` via the existing ingest contract; no column is required.

**Impact:**

- [lib/butler/extract-stay-intent.ts](../../lib/butler/extract-stay-intent.ts) — new pure helper. `extractStayIntent({ stay_text, reference_date })` returns the `StayIntentResult` envelope. Delegates date parsing to `normalizeStayDates`. Adds connective splitting (`to` / `till` / `until` / `through` / `thru` / `->` / `→` / spaced ` - `), bare-day check-out reconstruction (`June 10 to 15` → `June 15`), bare-weekday check-out anchored to the parsed check-in (`Saturday to Monday` → Monday after Saturday), and a `2026-06-10 2026-06-15` ISO-pair injector. ASCII-only character class (English-first per playbook).
- [app/api/butler/normalize-stay-intent/route.ts](../../app/api/butler/normalize-stay-intent/route.ts) — new secret-guarded POST route. Same 503 / 401 / 400 / 200 contract as the rest of `/api/butler/*`. Caps `stay_text` at 512 chars, validates `reference_date` as ISO when present.
- [lib/butler/extract-stay-intent.test.mts](../../lib/butler/extract-stay-intent.test.mts) — 31 unit tests covering the headline combined-message cases, villa + guest-count detectors, hyphen day-range normalization, ISO date pair handling, partial/unclear paths, the safe-message + confirm-prompt copy, and hostile-input safety (oversize text, emojis, non-string input, missing reference date). Runner is Node's built-in `node:test` via the `.mts` ESM TS-strip loader — no new dependency. Run with `node --test lib/butler/extract-stay-intent.test.mts`.
- [tsconfig.json](../../tsconfig.json) — added `"allowImportingTsExtensions": true`. Required for the helper's explicit `.ts` extension on `import "./normalize-dates.ts"`, which in turn is required so the same file resolves both under Next.js (via webpack/SWC) and under Node's TS-strip ESM loader (which does not auto-resolve extensionless imports). `noEmit: true` was already set, which is the TypeScript-required precondition for this flag.
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — new API surface row + new entry under "Butler flow (Phase 16A — operational surface) → Read endpoints (shipped)".
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — new "Natural stay intake (Phase 16A)" section documenting the request/response contract, status semantics, fallback prompts, operator wiring, backend invariants, and v1 limitations. New bullet under "Forbidden AI behavior" banning AI pre-processing of `oraya_stay_text`.
- [docs/system/CURRENT_PHASE.md](CURRENT_PHASE.md) — "Just completed" entry added; open-issues bullet for operator-side WhatChimp wiring (batch 2).
- No new env var. No schema change. No dependency added. No locked-API touch. `/api/butler/normalize-dates`, `/api/butler/lead`, `/api/butler/prefill`, `/api/bookings*`, `/api/admin/*`, `/api/calendar/*`, `/api/cron/*`, payment files, and WhatChimp export files all untouched.
- `npx tsc --noEmit`: exit 0, clean. `npm run build`: exit 0, new `/api/butler/normalize-stay-intent` route registered. `node --test lib/butler/extract-stay-intent.test.mts`: 31 pass / 0 fail.

**Reversible?:** yes — single-PR revert restores the prior state. The two new files can be removed; the four doc edits + the one-line tsconfig edit can be reverted. Operator-side WhatChimp wiring is independent (batch 2) and would simply never call the missing endpoint.

**Supersedes:** none. Extends the 2026-05-14 read-only `normalize-dates` decision by adding a second, more ambitious extraction surface alongside it; the 2026-05-14 endpoint is unchanged.

---

## 2026-06-05 - Butler handoff auto-advance and bedroom derivation shipped in `/book`

**Decision:** two behaviour gaps in the WhatsApp → website handoff are closed in [app/book/page.tsx](../../app/book/page.tsx):

1. **Bedroom derivation from hydrated guest count.** `applyButlerPrefill` now derives `bedroomCount` from `sleeping_guests` using the inverse of `BEDROOM_CAPACITY` (`≤ 2 guests → "1"`, `≤ 4 → "2"`, `≤ 6 → "3"`). The derivation only fires when `bedroomCount` is still the un-touched default `"1"`; any manual selection already made by the guest is preserved.

2. **Butler-handoff auto-advance from Step 1 → Step 2.** A new `useEffect` fires when `butlerPrefillReady` and `availabilityReadyForSelection` are both true, the stay selection passes the same validity checks as the manual "Continue" button (dates present, no conflict), and the session is identified as a butler handoff (`?h=` param present OR stored butler prefill in `sessionStorage`). It sets `reserveAutoNavigatedRef.current = true` to prevent duplicate firing and calls the existing `transitionStep1To("request")` which also handles scroll-to-top. The `reserveAutoAdvanceSuppressedRef` already prevents re-advance after an explicit Back action; the `reserveAutoAdvanceSignature` reset re-enables it only when the villa/date selection changes.

**Reason:** live testing of the Phase 16A WhatsApp → website handoff revealed: (a) opening `/book?h=<token>` with 3 guests hydrated `sleepingGuests = 3` but left `bedroomCount = 1` (capacity 2), showing a capacity warning instead of the correct 2-bedroom default; (b) the page stayed on Step 1 after hydration, forcing the guest to manually click "Continue to stay setup" — defeating the "seamless continuation" intent of the handoff. The "Butler continuation auto-advance readiness gate" in CURRENT_PHASE.md (PR #25 description) documented the design intent; the gating variables (`butlerPrefillReady`, `availabilityReadyForSelection`, `reserveAutoNavigatedRef`, `reserveAutoAdvanceSuppressedRef`) existed but the actual `useEffect` that acted on them was never implemented.

**Impact:**

- [app/book/page.tsx](../../app/book/page.tsx) — two additions:
  1. Bedroom-derivation block inside `applyButlerPrefill` (after the `sleepingGuests` setter).
  2. Auto-advance `useEffect` placed after `transitionStep1To` declaration, before the existing scroll useEffect.
- No schema change. No API change. No auth change. No new dependency.
- `npx tsc --noEmit`: clean. `npm run build`: clean.

**Reversible?:** yes — single-file revert restores prior behaviour (manual "Continue" required; bedroom stays at default 1).

**Supersedes:** closes the implementation gap left by the CURRENT_PHASE.md entry for PR #25 ("Butler continuation auto-advance readiness gate") — that entry described the gating design; this entry records the wiring that makes it functional.

---

## 2026-06-03 - Canonical Oraya web origin is `https://stayoraya.com`; `www.oraya.com.lb` is a wrong-domain response, not a migration

**Decision:** the single canonical Oraya web origin is **`https://stayoraya.com`** and only `https://stayoraya.com`. Any AI Training, WhatChimp Bot Reply, generic AI assistant, or human-facing reply that proposes a different host - in particular `www.oraya.com.lb`, `oraya.com.lb`, or any unprefixed `oraya.com` variant - is a wrong-domain bug and must be treated as one. This is not a domain migration. There is no LB-TLD Oraya web property today. This is documented in [docs/system/PROJECT_STATE.md](PROJECT_STATE.md), [docs/system/KNOWN_BUGS.md](KNOWN_BUGS.md) (entry #8), and [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) (canonical-domain section).

**Reason:** the canonical origin has been stable since launch: `lib/brand.ts` `SITE_URL` falls back to `https://stayoraya.com` when `NEXT_PUBLIC_SITE_URL` is unset, every transactional email helper builds links off that origin, and every `/legal/*` and `/booking/view/[token]` URL is served from that host. Despite this, generic AI assistants outside Oraya's repo (including external WhatChimp configurations and untrained chat surfaces) have occasionally produced `www.oraya.com.lb` when asked for "the Oraya website." Such responses route guests at a non-existent domain. Documenting the canonical origin as a non-negotiable in the durable decision log prevents future AI-trained surfaces from being miswired or misrepresented as a migration.

**Impact:**

- [docs/system/PROJECT_STATE.md](PROJECT_STATE.md) — canonical-origin line added near the production-status bullets.
- [docs/system/KNOWN_BUGS.md](KNOWN_BUGS.md) — new entry #8 documents the AI wrong-domain response risk.
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — new "Canonical Oraya web origin" subsection (operational guidance for AI Training / WhatChimp configuration).
- [docs/system/CURRENT_PHASE.md](CURRENT_PHASE.md) — open-issues bullet added.
- No code change. No env change. No schema change.

**Reversible?:** trivial — this is a clarifying decision, not a new constraint. If Oraya ever introduces an `.lb` web property, that becomes a new decision that supersedes this one explicitly.

**Supersedes:** none. Formalizes an invariant that was already shipped in code ([lib/brand.ts](../../lib/brand.ts), every `lib/send-*-email.ts`) but not previously captured as an explicit AI-facing constraint.

---

## 2026-06-03 - Booking flow is consolidated into three explicit steps (Villa & Dates → Stay Setup → Review & Guest Details); Step 3 ships a dual-CTA Reserve action set

**Decision:** the public Reserve booking flow at [app/book/page.tsx](../../app/book/page.tsx) is consolidated to three explicit steps:

1. **Villa & Dates** — villa selection + check-in/check-out picker + eligibility check.
2. **Stay Setup** — bedrooms, guests, add-ons, special requests; live estimated total.
3. **Review & Guest Details** — review summary, guest-details form (Reserve path), payment decision.

The step labels are exact and verified in code (`labels = ["Villa & Dates", "Stay Setup", "Review & Guest Details"]` at app/book/page.tsx:824).

A visible Step 4, a standalone Guest Details step, and a four-step booking journey were explicitly evaluated and **rejected**. Step 3 hosts both the review summary AND the guest-details form; checkout / payment is a final action invoked from Step 3, not a separate visual step.

Step 3 (Reserve path) presents **two clear actions**:

- **Primary:** **"Continue to secure payment"** — solid gold button, full-width within the action row, leads to hosted-checkout execution via `POST /api/payments/checkout`. Blocked in the UI with clear setup messaging when the configured hosted-checkout provider is not truly ready (no fake checkout, no silent fall-through).
- **Secondary:** **"Reserve now, pay later"** — outline / transparent-background button with a thin gold border and gold text, separate row below the primary action so it reads as visibly lower priority. Submits a booking request without collecting payment on the website. Used by guests who prefer to be confirmed before paying, by guests holding add-ons / special requests that need Oraya review first, and by operators wiring manual / bank-transfer rails.

**Reason:** the prior architecture had drifted toward a four-step UX with a separate Guest Details step and a Step 4 review. Operationally this was extra friction, and guests reading the progress indicator perceived the journey as longer than it actually was. Collapsing review and guest details into Step 3 (a) keeps the Reserve path under three visible steps for premium hospitality framing, (b) ensures the guest-details form is shown alongside the final review that locks in their decision, and (c) gives both pay-now and pay-later Reserve paths a single shared review surface. The dual-CTA pattern makes the "secure payment" intent unambiguously primary while still preserving the operator-friendly "Reserve now, pay later" path. The earlier Step 3 secondary path was a plain text link ("Prefer to reserve and pay later? Submit booking request") — the visual ranking is now reinforced by treating the secondary as a real outline button.

**Impact:**

- [app/book/page.tsx](../../app/book/page.tsx) — three-step layout, exact step labels, dual-CTA Step 3 (action rendering + intent dispatch via `submitIntent = "pay_now" | "reserve"`). Shipped via [apps#56](https://github.com/Staleen/oraya-web/pull/56) (three-step consolidation) and [apps#58](https://github.com/Staleen/oraya-web/pull/58) (secondary CTA upgrade).
- [lib/payments/runtime.ts](../../lib/payments/runtime.ts) and the readiness contract control the pay-now path's blocked / available state without leaking secret env values.
- No schema change. No locked API behavior change. No new dependency.

**Reversible?:** yes — single-file revert per change restores prior layout. The booking pipeline never depended on the visual step count.

**Supersedes:** refines the 2026-05-22 "Guest-facing payment behavior is now settings-driven before Credit Libanais execution goes live" decision by locking the visual step shape that drives Step 3.

---

## 2026-06-03 - Stay payment proceeds independently of add-ons and special requests; approval-based items are reviewed and charged separately

**Decision:** the website Reserve "pay now" path collects the stay payment first. Add-ons and special requests do NOT block the stay payment. Approval-based add-ons (those flagged `requires_approval` per the existing addon-operations model) are reviewed by Oraya after the booking is reserved and charged separately if and when they are confirmed. The Step 3 review surface tells the guest explicitly when add-ons or special requests are present: "Add-ons and special requests are confirmed by Oraya first. Reserve the stay now; we will send the correct payment step after approval, usually within 24 hours." (verified in [app/book/page.tsx](../../app/book/page.tsx) at the "Payment after Oraya review" panel).

**Reason:** under the old model, the presence of an approval-required add-on or a non-trivial special request blocked the entire pay-now flow because the total wasn't yet final. That kept Oraya's premium guests waiting on manual Oraya confirmation for the stay portion that was already determinate. Splitting "stay charge now" from "add-ons reviewed and charged later" gives the guest a faster confirmation path on the stay (premium hospitality UX), keeps the operator's add-on review surface unchanged (admin operations confirm add-ons explicitly), and aligns with the booking-first / webhook-first hosted checkout architecture that already separates payment lifecycle from booking lifecycle.

**Impact:**

- [app/book/page.tsx](../../app/book/page.tsx) — Step 3 "Payment after Oraya review" panel renders when `hasAddonsOrSpecialRequestsForReview` is true; the primary CTA remains "Continue to secure payment". No change to the locked `/api/bookings` POST contract, the addon-audit fail-closed rules, or the operational strict-rule enforcement.
- The "Reserve now, pay later" secondary CTA remains the explicit pay-later path for guests / operators who prefer admin confirmation before any charge.
- Approval-based add-ons continue to be tracked on the booking row and the admin review surface. The pay-now hosted-checkout amount is the stay total; add-on charging occurs through the existing admin-driven payment flow once admin approves.

**Reversible?:** yes — single-file revert. The booking pipeline did not change.

**Supersedes:** none. Formalizes the policy that ships with the three-step + dual-CTA Step 3 above.

---

## 2026-06-03 - WhatsApp CTA prefills reverted to plain human sentences ("Check my booking <ref>" / "Help with my booking <ref>"); structured-marker scheme withdrawn

**Decision:** the two website-side WhatsApp CTAs that pre-fill the WhatsApp compose box - booking-view "WhatsApp us" and booking-confirmed "Change/cancel via WhatsApp" - now emit **plain human sentences**, not structured markers. `bookingWhatsAppPrefill(ref)` in [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) returns `"Check my booking <ref>"`; `bookingWhatsAppChangePrefill(ref)` returns `"Help with my booking <ref>"`. The earlier `#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>` marker scheme is **withdrawn**. The no-reference fallback constants (`WHATSAPP_GENERAL_CONTACT_PREFILL`, `WHATSAPP_CANCEL_CHANGE_NO_REF`) remain plain human sentences and continue to enter the welcome flow. Normal greetings ("hi", "hello", free-form questions) continue to enter the existing welcome menu - prefills are emitted only by website CTAs, never typed by the guest.

**Reason:** the 2026-05-23 marker scheme assumed WhatChimp would route on the structured marker prefix and skip the welcome menu. Live operator testing confirmed that WhatChimp does not expose the inbound message text to Condition / HTTP-API-body interpolation on the production tenant (the only system fields available are first name, last name, label, email, phone number, chat ID; no "last user message" variable). The marker's only value over a plain sentence was the visual distinctiveness of the `#`-prefixed tag - but the operator routing has to happen on the SUBSTRING the trigger matches either way, and a plain sentence like `"Check my booking"` is at least as routable as `"#ORAYA_REF:"` while reading naturally to any human who sees the prefill in their compose box. The structured marker also created a small but real UX risk: a curious guest seeing `#ORAYA_REF:A0B8CECB` in their compose box might wonder whether they should type that themselves, or might paste it elsewhere. Plain hospitality language ("Check my booking A0B8CECB") eliminates that ambiguity entirely without sacrificing routing.

The audit explicitly considered and rejected:

- **Keeping the marker scheme behind WhatChimp.** Rejected — the marker introduced a guest-visible artifact (`#ORAYA_REF:`) that has no positive use for the guest and creates a low-grade "what is this?" friction. The plain sentence routes equally well via substring matching and reads better.
- **Reverting only the prefill copy while keeping the marker as a hidden routing tag elsewhere.** Rejected — there is no other surface emitting the marker today; the prefill was the marker's only carrier.
- **Going back to the pre-marker generic prefill (`"Hello Oraya — I have a question about a booking."`).** Rejected — the original problem the marker solved was that the generic prefill landed in the welcome menu when the website CTA wanted to disambiguate "view" vs "change/cancel" intent. Plain sentence prefills that NAME the intent ("Check my booking", "Help with my booking") preserve that disambiguation.

**Impact:**

- [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) — `bookingWhatsAppPrefill` and `bookingWhatsAppChangePrefill` return plain sentences; updated docstrings explain the substring-routing model and the WhatChimp limitation. Shipped via [apps#54](https://github.com/Staleen/oraya-web/pull/54).
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — "Website CTA marker routing" section rewritten as "Website CTA prefill routing"; documents the plain-sentence format, the substring trigger contract, and the operator manual steps. The "Verified WhatChimp platform limitation" subsection (added 2026-05-23) carries forward unchanged because it still describes the underlying constraint.
- [docs/system/PROJECT_STATE.md](PROJECT_STATE.md) — "Main completed systems" "Website CTA prefill routing" entry reflects the plain-sentence format.
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — Butler-flow "Website CTA marker prefill" bullet updated to "Website CTA prefill" plain-sentence format.
- [docs/system/CURRENT_PHASE.md](CURRENT_PHASE.md) — Just-completed entry added; out-of-scope item bans re-introducing the marker scheme without a superseding entry.
- The `/api/butler/identify` `message_text` field and the bounded `\b[0-9A-Fa-f]{8}\b` extractor in [lib/butler/extract-booking-reference.ts](../../lib/butler/extract-booking-reference.ts) remain in the codebase as forward-compatible code for non-WhatChimp channels (Telegram, Messenger, direct WhatsApp Cloud API) that DO expose inbound text. Their presence and behavior do not depend on the prefill format.
- No backend behavior change. No schema, env, auth, token, payment, calendar, or booking-pipeline touch.

**Reversible?:** yes — single-file revert restores the prior marker prefills. The WhatChimp operator side can keep or remove triggers independently.

**Supersedes:** both 2026-05-23 entries below — "Website WhatsApp CTA prefills become structured markers (`#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>`)" AND its same-day correction "WhatChimp inbound-text limitation verified; marker-routing operator flow corrected to explicit reference-input step." The earlier entries are kept in place per the append-only rule; this entry records the reversal authoritatively.

---

## 2026-05-23 - WhatChimp inbound-text limitation verified; marker-routing operator flow corrected to explicit reference-input step (supersedes auto-extract assumption in the earlier 2026-05-23 marker decision)

**Decision:** the website-side WhatsApp CTA markers (`#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>`) introduced in PR #51 stay in place. **The operator-side WhatChimp routing**, however, no longer assumes that the booking reference can be auto-extracted from the marker on the backend via `message_text`. Production testing confirmed that the WhatChimp tenant exposes only six system fields (first name, last name, label, email, phone number, chat ID) — no usable "last user message" / inbound-text variable, no Condition field for the message body, no HTTP API body-interpolation token. The marker trigger therefore routes the guest to an **explicit booking-reference input step** that captures the 8-char code via the existing `User Input Flow Single` → `oraya_booking_reference` custom field, then merges into the existing Node 13 (HTTP API 7219 → `POST /api/butler/identify`) identity orchestration unchanged. The marker eliminates the Welcome-menu redundancy; the explicit reference ask remains because WhatChimp cannot do the extraction itself. PR #47's `message_text` field on `/api/butler/identify` and the bounded extractor in `lib/butler/extract-booking-reference.ts` stay in the codebase as forward-compatible code for future non-WhatChimp channels (Telegram, Messenger, direct WhatsApp Cloud API) and for any future WhatChimp version that exposes inbound text.

**Reason:** the earlier 2026-05-23 marker decision documented the operator routing as "skip the Welcome menu and route directly to the Oraya Identify - Production HTTP API," implying that `message_text` would extract the reference server-side. Live verification proved that WhatChimp's variable picker has no inbound-message field. The auto-extract path is therefore unreachable on the production tenant, and the operator must wire a small reference-input step inside the marker-triggered flow. The marker is still load-bearing — it lets WhatChimp route a website-CTA guest into a hospitality-grade booking-reference prompt without first showing the Welcome menu — but the previously-implied "one HTTP API call, zero asks" behaviour is not achievable until WhatChimp ships an inbound-text variable. Acknowledging the limitation in the docs avoids future agents wiring against a capability that doesn't exist on this tenant.

The audit explicitly considered and rejected:

- **Reverting the marker prefills back to human sentences.** Rejected — the marker still pays for itself: it lets the bot skip the Welcome menu redundancy and disambiguate view vs change/cancel intent at the trigger layer. Without the marker, every website-CTA guest would land back in the Welcome menu first.
- **Removing the `message_text` field on `/api/butler/identify` and deleting `lib/butler/extract-booking-reference.ts`.** Rejected — both are forward-compatible additions with zero cost when no caller sends `message_text` (the orchestrator's empty-`booking_reference` branch is the existing `ask_for_booking_reference` flow). Non-WhatChimp channels and future WhatChimp versions will reactivate the path automatically.
- **Adding a Butler-side endpoint that accepts the entire WhatChimp request payload and parses out the message text from there.** Rejected — WhatChimp's outbound HTTP API request body is configured per node in the WhatChimp UI; if the operator can't add `message_text: <variable>` to the body, the backend can't synthesise inbound text from anywhere else. The platform limitation is at the WhatChimp UI / variable layer, not at the wire layer the backend could intercept.
- **Asking WhatChimp support for a custom variable.** Out of scope of this codebase; flagged as a longer-term operator action. Until that lands (if ever), the documented flow stands.

**Impact:**

- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — "Website CTA marker routing" section corrected. New "Verified WhatChimp platform limitation (2026-05-23)" subsection documents the six available system fields and the absence of an inbound-text variable. The Routing-contract and Operator-manual-steps subsections are rewritten to describe the explicit reference-input step and the agreed hospitality copy. The Backend-invariants subsection is rewritten to clarify that `message_text` is forward-compatible code, not the production path.
- [docs/system/KNOWN_BUGS.md](KNOWN_BUGS.md) — new entry #7 documents the WhatChimp inbound-text limitation as an operator-side platform constraint (not a backend bug). Entry #6 stays closed (the `/api/butler/identify` `message_text` field shipped correctly in PR #47 — the bug closure was about the backend, which is correct).
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — the existing "Website CTA marker prefill" Butler-flow bullet (added in PR #51) stays accurate at the architecture-summary level; the playbook is the operational source-of-truth for the corrected routing.
- No code changes. `lib/booking-trust-messaging.ts` prefill builders stay exactly as PR #51 shipped them. `/api/butler/identify` and `lib/butler/extract-booking-reference.ts` stay exactly as PR #47 shipped them. No schema, no env, no auth, no token-continuity, no payment, no booking-pipeline touch.
- `tsc --noEmit` clean; `npm run build` clean (no code changes; runs only confirm the doc-only edits don't break anything).

**Reversible?:** yes — single-file revert per doc restores the prior wording. No data migrated, no operator-side state created by this change.

**Supersedes:** refines the earlier 2026-05-23 "Website WhatsApp CTA prefills become structured markers" entry by correcting the operator-routing claim it made. The marker prefill code and the rationale for choosing structured markers both carry forward unchanged; only the post-trigger WhatChimp flow description is corrected.

---

## 2026-05-23 - Website WhatsApp CTA prefills become structured markers (`#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>`)

**Decision:** the two website-side WhatsApp CTAs that pre-fill the WhatsApp compose box (booking-view "WhatsApp us" and booking-confirmed "Change/cancel via WhatsApp") now emit a structured marker instead of a human sentence. `bookingWhatsAppPrefill(ref)` in [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) returns `#ORAYA_REF:<ref>`; `bookingWhatsAppChangePrefill(ref)` returns `#ORAYA_CHANGE:<ref>`. The no-reference fallback constants (`WHATSAPP_GENERAL_CONTACT_PREFILL`, `WHATSAPP_CANCEL_CHANGE_NO_REF`) remain plain human sentences and continue to enter the welcome flow. The two markers are operator-routing infrastructure that WhatChimp triggers on; the guest never needs to understand them. Normal greetings (`"hi"`, `"hello"`, free-form questions) continue to enter the existing welcome menu — the markers are emitted only by website CTAs, never by user typing.

**Reason:** even after the 2026-05-23 `message_text` field on `/api/butler/identify` shipped, the website prefill `"Hello Oraya — booking reference A0B8CECB"` still required WhatChimp to route on the keyword `"booking reference"`. That keyword could be typed by a user manually, and the trigger had no way to distinguish "guest arrived from the website CTA and the reference is in the message body" from "guest typed the phrase by hand and may or may not have the reference." Routing was correct but the bot could not safely skip the welcome menu without risking false-positive routing on hand-typed messages. A dedicated marker — chosen to be visually distinct (`#`-prefixed), case-insensitive, and impossible to type accidentally — gives WhatChimp an unambiguous routing signal while staying plain text inside the WhatsApp UI. The 8-char reference embedded in the marker is still the public guest-facing support code, so no new disclosure boundary is crossed. The marker is forward-compatible with the existing `message_text` extractor: `\b[0-9A-Fa-f]{8}\b` matches the reference cleanly inside `#ORAYA_REF:A0B8CECB` because `:` and `#` are non-word characters and the word boundary holds.

The audit explicitly considered and rejected:

- **Bare 8-character reference prefill** (`"A0B8CECB"`). Rejected — WhatChimp's exported flow has no regex / pattern primitive available at the trigger or condition layer (only `contains` / `equal`), so a bare hex string cannot be distinguished from any other 8-character text the user might type. A trigger keyword of `""` or a default/catch-all would fire on every unmatched message — bad UX for typos and random replies.
- **Keep the existing human sentence and rely on `message_text` extraction alone.** Rejected — it works, but leaves the welcome-menu redundancy in place for guests who arrived from the website CTA. The marker eliminates that redundancy AND remains compatible with the extractor.
- **Hide the marker via WhatsApp formatting / invisible characters.** Rejected — WhatsApp does not support invisible characters in compose; any escape would be visible to the guest. The marker stays plain text and accepts that the guest sees `#ORAYA_REF:A0B8CECB` in their chat — short, neutral, and self-evidently a routing tag.
- **Use one marker for both CTAs and disambiguate intent server-side.** Rejected — the change/cancel intent is operator routing, not a server decision. WhatChimp branches to a different downstream path for `#ORAYA_CHANGE:`; folding both into one marker would force the bot to ask the guest "are you changing or viewing?", which defeats the point of having two CTAs.
- **Drop the change/cancel intent context entirely.** Rejected — the prior `bookingWhatsAppChangePrefill` carried the cancel/change intent in prose; losing it would force the bot to ask. Encoding the intent in the marker prefix preserves the routing signal without prose.

**Impact:**

- [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) — `bookingWhatsAppPrefill` returns `#ORAYA_REF:<ref>`; `bookingWhatsAppChangePrefill` returns `#ORAYA_CHANGE:<ref>`. Both helpers are pure string builders; their call sites in `app/booking/view/[token]/page.tsx` (2 sites) and `app/booking-confirmed/page.tsx` (2 sites) need no changes — they pass the same `refDisplay` argument and consume the returned string identically (`encodeURIComponent` → `wa.me/?text=`). Inline doc comments updated.
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — new "Website CTA marker routing" section documenting the marker format, the routing contract, the operator manual steps (add two new WhatChimp triggers; keep the welcome trigger intact; do not expose marker syntax in guest-facing copy), and the backend-invariants this change preserves.
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — Butler-flow section gains a one-line "Website CTA marker prefill" bullet pointing to the BUTLER_PLAYBOOK section.
- No backend changes. The `/api/butler/identify` contract is unchanged; the existing `message_text` extractor (PR #47) lifts the reference out of the marker via the same `\b[0-9A-Fa-f]{8}\b` regex.
- No schema changes. No new env vars. No new dependencies. No locked-API touches. No payment-file touches. No booking-pipeline, pricing, overlap, auth, token-continuity, secure-handoff, or unrelated-flow changes.
- `tsc --noEmit` clean; `npm run build` clean.

**Reversible?:** yes — single-file revert restores the prior human-sentence prefills. The WhatChimp operator side can keep or remove the new triggers independently; without the marker prefill, the new triggers simply never fire and the existing welcome trigger continues to handle every conversation.

**Supersedes:** none. This decision extends the 2026-05-23 `message_text` entry by making the website-CTA prefill machine-routable, eliminating the welcome-menu redundancy on the website-CTA path. The `message_text` extractor and the orchestrator contract from that entry both carry forward unchanged.

---

## 2026-05-23 - `/api/butler/identify` accepts optional `message_text` with safe word-boundary-anchored booking-reference extraction

**Decision:** `POST /api/butler/identify` accepts an optional `message_text` body field carrying the verbatim inbound WhatsApp turn that triggered the Butler flow. When `booking_reference` is absent from the request body and `message_text` is present, the route extracts the first word-boundary-anchored 8-character hex token via the new pure helper [lib/butler/extract-booking-reference.ts](../../lib/butler/extract-booking-reference.ts) (`/\b[0-9A-Fa-f]{8}\b/`) and forwards it as `booking_reference` to the orchestrator. Explicit `booking_reference` always wins; `message_text` never overrides it. When `message_text` contains no clean token, behavior is identical to the prior contract — the orchestrator's existing chain still asks the guest for the reference. The orchestrator itself is **unchanged**. The seven refusal/ask `safe_message` strings on the orchestrator's non-success branches receive string-only hospitality copy upgrades; behavior, action enums, sensitive-disclosure rules, and the active-identity composer are all unchanged.

**Reason:** the live website-CTA WhatsApp path opens conversations with text like `"Hello Oraya — booking reference A0B8CECB"`. WhatChimp's Condition / save-to-custom-field primitives can route on substring matches but cannot run a regex capture to lift the 8-character token out of the trigger message into a custom field. The Butler flow therefore reached `/api/butler/identify` with `booking_reference` empty, and the orchestrator correctly fell through to `ask_for_booking_reference` — making the bot redundantly ask the guest for a value they had already provided. A bot-prompt-level workaround was rejected: dropping the entire trigger message into the existing `booking_reference` field and relying on `normalizeBookingReference` would have silently mis-extracted `"Hello Oraya — booking reference A0B8CECB"` as `"EAABEFEE"` because the surrounding English words contain valid hex letters (`e`, `aa`, `b`, `efeece`). The minimal-honest fix is a single additive backend field plus a single bounded-regex helper.

The audit explicitly considered and rejected:

- **Flow-only fix via WhatChimp Condition + custom-field capture.** Rejected — the exported flow's Condition nodes only support `contains` / `equal` operators on system / custom fields. No regex, no capture-group, no substring-extract, no transformation node exists in the available vocabulary. Substring detection is possible (`contains "booking reference"`) and is documented as an optional polish, but the actual hex token cannot be extracted by WhatChimp into a custom field.
- **Naive hex stripping in the existing `normalizeBookingReference` path.** Rejected — `replace(/[^0-9a-fA-F]/g, "")` on the trigger message produces `"eaabefeeceA0B8CECB"` (hex letters from "Hello/Oraya/booking/reference" survive), then `.slice(0, 8)` yields `"EAABEFEE"`, a confidently-wrong reference. Worse than asking twice.
- **Adding `message_text` to the orchestrator's `IdentityInput`.** Rejected — the orchestrator's contract is "decide identity given structured signals." Free-text parsing belongs at the route boundary, not inside the orchestrator. Keeping the extraction in the route also means `/api/butler/confirmed-guest-info` and other identity-using surfaces are not implicitly affected; each surface opts in by accepting and forwarding the derived reference itself if it wants this convenience.
- **Adding a separate `/api/butler/identify-from-message` endpoint.** Rejected — it would duplicate the auth / validation / orchestration shell for a single string transformation. An optional additive field on the existing endpoint is one helper file plus ~10 lines of route code.
- **Widening the extractor to be tolerant of non-word boundaries (e.g. `[A-Fa-f0-9]{8}` anywhere).** Rejected — `\b` is the safety boundary that prevents matching a substring of a longer hex run. `"A0B8CECB1234ABCD"` (which could happen if a guest pastes the full UUID instead of the prefix) does not match because the position after the 8th hex char has no word boundary; that case still falls through cleanly to `ask_for_booking_reference`.

**Hospitality copy upgrade scope** — string-only, no behavior change:

- `ask_for_booking_reference` — softened opener; explains where to find the reference.
- `reference_not_found` — gentler "I'm not finding…" framing; preserves the ask.
- `reference_ambiguous` (escalation) — warmer escalation phrasing.
- `verification_failed` (escalation) — explicit "to keep your booking secure" rationale before handing off.
- `request_identity_proof` — warmer opener; same email-or-name semantics.
- `known_sender_cancelled` — gracious acknowledgement; offers next-step framing.
- `reference_cancelled` — same.

The active-identity `composeActiveIdentitySafeMessage` output (the `verified` and `known_sender_resolved` branches) is left untouched — it already reads warm, and changing it would require co-touching the structured-field consumers.

**Impact:**

- New helper: [lib/butler/extract-booking-reference.ts](../../lib/butler/extract-booking-reference.ts). Pure function `extractBookingReferenceFromText(text)`. Never throws; returns the uppercased 8-char hex token or `null`. Single regex `/\b[0-9A-Fa-f]{8}\b/`. No Supabase, no env, no side effects.
- [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts) — accepts optional `message_text` (capped at 2048 chars). Derives `booking_reference` from it via the helper when the body did not carry an explicit reference. Updated docstring. Wire contract unchanged (503 / 401 / 400 / 200). All existing callers' payloads remain valid and produce identical responses.
- [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) — seven `safe_message` strings receive hospitality copy upgrades on the refusal / ask / cancellation branches. Behavior, action enums, sensitive-disclosure rules unchanged.
- [docs/system/KNOWN_BUGS.md](KNOWN_BUGS.md) — new entry #6 documents the bug + the fix (closed).
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — request-body example updated to include `message_text`; new "Inbound-message convenience" subsection documents the safe extraction rule, the no-naive-stripping invariant, the caller-side invariant, and the two manual WhatChimp operator changes required (HTTP API 7219 body addition + optional early-route Condition).
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — `/api/butler/identify` API-surface table row updated.
- No schema changes. No new env vars. No new dependencies. No locked-API touches. No payment-file touches. No booking-creation, pricing, overlap, schema, auth, token-continuity, secure-handoff, or unrelated-flow changes.
- `tsc --noEmit` clean; `npm run build` clean.

**Reversible?:** yes. Revert the new helper file + the route changes + the orchestrator string changes + the four doc edits; the endpoint returns to its prior contract. No data migrated. No tokens minted that need invalidation. Existing WhatChimp wiring (without the `message_text` body addition) continues to work unchanged.

**Supersedes:** none. This decision extends the 2026-05-22 "WhatsApp identity v2" entry by adding a safe inbound-message convenience field; the priority order, request-body shape, identity-proof comparison set, and 503/401/400/200 contract from that entry all carry forward unchanged.

---

## 2026-05-22 - Credit Libanais provider compatibility is widened at the schema boundary while the adapter stays placeholder-only

**Decision:** Oraya now treats `credit_libanais` as a first-class persisted `bookings.payment_link_provider` value, but the Credit Libanais / MPGS adapter remains an explicit placeholder until the bank delivers the real hosted-checkout contract. The additive migration `sql/phase-16b4-credit-libanais-provider-compat.sql` is the human-gated schema-compatibility step that widens the `payment_link_provider` allow-list to `manual | whish | stripe | credit_libanais` and keeps `stripe` only for backward-compatible dev/test rows. Runtime readiness must report four things clearly: whether the selected provider is configured, whether it is actually implemented vs placeholder-only, a guest-safe setup message, and an admin-facing missing-requirements list that never exposes raw secret values. `/admin/settings` is now the operator surface for that non-secret readiness state, while credentials remain env-only.

**Reason:** after the provider refactor, the code correctly selected Credit Libanais as the only approved production provider, but two readiness gaps remained. First, the database constraint still prevented persisting `credit_libanais` in `bookings.payment_link_provider`, which would have forced another refactor the moment the bank contract arrived. Second, the runtime only reported a coarse guest-safe `online_checkout_ready` boolean/message, which was not enough for operators to tell the difference between "envs missing", "placeholder adapter", and "real bank contract still pending". Widening the persisted provider allow-list now and adding explicit non-secret readiness reporting keeps the codebase ready for the bank specs without faking checkout or leaking secrets.

**Impact:**

- New human-gated migration: [sql/phase-16b4-credit-libanais-provider-compat.sql](../../sql/phase-16b4-credit-libanais-provider-compat.sql). Idempotent; safe to re-run; not auto-applied. Recreates the `bookings.payment_link_provider` check constraint to include `credit_libanais` while preserving `manual`, `whish`, and `stripe` for backward compatibility. No other payment fields are changed.
- [lib/payments/provider.ts](../../lib/payments/provider.ts) now treats `credit_libanais` as a valid persisted provider and adds a shared readiness contract for hosted-checkout adapters.
- [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) now models the exact placeholder contract the real implementation must satisfy: merchant id, gateway URL, session-creation endpoint, auth/signing method, callback verification method, provider session id field, currency/settlement behavior, and sandbox/live mode. It still never fakes a successful checkout or webhook.
- [lib/payments/runtime.ts](../../lib/payments/runtime.ts) now separates guest-safe public readiness from admin-safe readiness, and [app/api/payments/readiness/route.ts](../../app/api/payments/readiness/route.ts) exposes the latter only behind admin auth.
- [app/admin/settings/page.tsx](../../app/admin/settings/page.tsx) and [components/admin/PaymentSettingsSection.tsx](../../components/admin/PaymentSettingsSection.tsx) now show the non-secret provider readiness summary and missing-requirements list directly in the payment settings UI. Secrets remain env-only and are never written to Supabase.

**Reversible?:** yes. The migration can be superseded by a later constraint rewrite, and the readiness route/UI can be reverted without touching booking creation, pricing, overlap protection, or Butler surfaces. The one thing that should not be reversed casually is the "no secret values in DB or readiness responses" boundary.

**Supersedes:** refines the 2026-05-22 entry "Hosted payment execution is provider-agnostic; Credit Libanais / MPGS is the production target" by completing the provider-schema compatibility step and locking the non-secret readiness contract needed before the bank specs land.

---

## 2026-05-22 - Guest-facing payment behavior is now settings-driven before Credit Libanais execution goes live

**Decision:** until the real Credit Libanais / MPGS contract is implemented, Oraya's website payment behavior is controlled by guest-safe admin settings rather than hardcoded Step 3 assumptions. `/admin/settings` now owns the public payment mode (`request_only`, `manual_payment`, `online_payment`, `hybrid`), minimum deposit percentage, whether full payment and custom deposit are offered, guest-visible manual payment rails, guest payment instructions, provider display name, and whether online payment is enabled guest-side. `/book` Step 3 must present two Reserve choices: `Pay now and reserve` and `Submit booking request and pay later`. If the configured hosted-checkout provider is not truly ready, the pay-now path is blocked in the UI with clear setup messaging rather than pretending checkout is live or falling into a server error.

**Reason:** the business direction moved from "payments paused" to "payment infrastructure active, real bank execution pending official specs." That created a UX gap: Step 3 needed to stay premium and decision-oriented without implying that Credit Libanais already works. A settings-driven layer lets operations control the guest story safely while preserving the booking-first architecture and keeping gateway secrets out of the database.

**Impact:**

- New helper: [lib/payments/settings.ts](../../lib/payments/settings.ts) - parses, serializes, and normalizes guest-safe payment settings stored in the existing `settings` key/value table.
- [app/admin/settings/page.tsx](../../app/admin/settings/page.tsx) and [components/admin/PaymentSettingsSection.tsx](../../components/admin/PaymentSettingsSection.tsx) now expose payment configuration to admins without storing gateway secrets in Supabase.
- [app/api/settings/route.ts](../../app/api/settings/route.ts) now publishes a guest-safe payment settings payload plus derived runtime readiness fields for `/book`.
- [app/book/page.tsx](../../app/book/page.tsx) Step 3 now renders the two-path Reserve decision screen. The pay-now path reuses the existing hosted-checkout amount validation, but is disabled in the UI when the configured provider is not ready. The pay-later path records payment preference and follow-up rail as booking-request context only; no charge is collected on the website in that path.
- [app/api/payments/checkout/route.ts](../../app/api/payments/checkout/route.ts) now enforces the admin-configured payment mode, full/deposit availability, and minimum deposit percentage server-side before creating any hosted checkout session.
- Gateway secrets remain env-only. The existing `settings` table stores public instructions and guest-facing behavior only.

**Reversible?:** yes. The settings-driven layer can be revised or narrowed later without touching the locked booking pipeline, as long as payment execution stays booking-first and no secrets move into the database.

**Supersedes:** refines the 2026-05-22 hosted-payment provider refactor by moving guest-facing Step 3 behavior under admin-controlled settings until the real bank contract is implemented.

---

## 2026-05-22 - Butler identity response enriched with booking reference, villa, stay dates, and a signed booking-view URL on identity-established branches

**Decision:** `POST /api/butler/identify` now surfaces a `booking_view_url` field on every response, and the orchestrator's `safe_message` is pre-enriched with the booking reference, villa name, stay dates (`D MMM YYYY → D MMM YYYY`), and the same signed `/booking/view/[token]` URL on the two branches where identity has already been established for an active booking — explicit `verified` (proof match on email or full name) and implicit `known_sender_resolved` (subscriber-id or phone continuity). On every other branch — `request_identity_proof`, `ask_for_booking_reference`, `ask_for_alternative_identifier`, `reference_not_found`, `reference_ambiguous`, `reference_cancelled`, `known_sender_cancelled`, `verification_failed`, and any `escalate_human` outcome — `booking_view_url` is explicitly `null` and the `safe_message` stays at its previous conservative phrasing.

The URL itself is minted by a new helper, [lib/butler/booking-view-link.ts](../../lib/butler/booking-view-link.ts) (`buildButlerBookingViewUrl`), which reuses the existing `createActionToken(bookingId, "view")` and `NEXT_PUBLIC_SITE_URL || SITE_URL` chain already in use by the transactional email senders. It defaults to the 72-hour TTL baked into `createActionToken` (no `expiresAt` override) so past-checkout bookings remain viewable for the duration of the current support exchange, and a fresh URL is minted on every orchestrator call so the link does not need to outlive the conversation. Missing `BOOKING_ACTION_SECRET` is treated as a soft failure: the helper logs once and returns `null`, the orchestrator surfaces `booking_view_url: null`, and the bot must not synthesize a substitute link.

**Reason:** before this change, the Butler's identity surface returned only the structured booking_id / reference / status / villa / dates. WhatChimp had no way to hand the guest a credentialed "view your booking" link inside the same WhatsApp turn — the guest either had to scroll up to the original confirmation email or the operator had to copy the link manually from `/admin/leads`. The signed view URL is exactly the same credential the existing pending / confirmed / payment / event-proposal emails already deliver, so reusing it on the Butler surface introduces no new attack surface, no new schema, no new TTL semantics, and no new secret. The enriched `safe_message` is a UX win on top: a single sentence the bot can echo verbatim already carries the four pieces of context the guest most often asks about ("what booking, where, when, can I see it?"), which trims the typical multi-turn ping-pong on returning conversations.

The audit explicitly considered and rejected:

- **Surfacing the URL on every successful resolution.** Rejected — on `known_sender_cancelled` and `reference_cancelled`, the orchestrator's existing sensitive-disclosure rule already withholds villa / dates because the booking is no longer actionable; a freshly minted view URL would expose those same fields indirectly through the booking-view page. Keeping the URL `null` on every cancelled branch preserves the spirit of "do not surface villa / dates on cancelled."
- **Surfacing the URL on `request_identity_proof`.** Rejected — the guest is holding only the public 8-character reference (32 bits of entropy, printed in confirmation emails and recoverable by anyone with email access). Minting a signed view URL at that stage would let the public reference bypass the identity-proof gate that exists for precisely this case.
- **Binding the URL TTL to `checkOutExpiryUnix(booking.check_out)` like the transactional email senders.** Rejected — past-checkout bookings would receive an already-expired token, so the Butler couldn't help a guest looking up a past stay for receipts / records. The default 72h TTL is the right window for an in-conversation link, and a re-call mints a fresh URL.
- **Pulling `BOOKING_ACTION_SECRET` into the identity-route's auth contract (503 if missing).** Rejected — the identity surface still has useful work to do even when the view link cannot be minted (reference lookup, identity proof gating, escalation routing). Failing closed on a missing secret would degrade the WhatsApp experience for an unrelated reason; the soft-fail to `booking_view_url: null` is the correct posture.
- **Adding the URL to the booking-lookup surface (`/api/butler/booking-lookup`).** Out of scope for this change; that surface is reference-only and intentionally does not return sensitive fields. Future work can mirror the gating model if needed.

**Impact:**

- [lib/butler/booking-view-link.ts](../../lib/butler/booking-view-link.ts) — new helper. `buildButlerBookingViewUrl(bookingId)` returns the signed URL or `null` (never throws). Reuses [lib/booking-action-token.ts](../../lib/booking-action-token.ts) `createActionToken` and [lib/brand.ts](../../lib/brand.ts) `SITE_URL`.
- [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) — `IdentityResult` gains `booking_view_url: string | null`. Every existing result literal sets the new field (null on every unverified / cancelled / not-found / ambiguous / escalation / proof-request branch). The two `reply_with_status` returns (`verified` and `known_sender_resolved` with active status) call the helper, and the new `composeActiveIdentitySafeMessage` helper composes the enriched safe_message with graceful degradation when any field is missing. Date formatting is done by a local `formatStayDateLabel` that mirrors the booking-view page's `fmtDate` (no JS Date parsing, no Date object — per the standing time/date discipline rule).
- [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts) — header docstring updated to enumerate the response shape including `booking_view_url`, clarify the sensitive-disclosure rule now covers the URL, and note the "no synthesized substitute link when null" requirement. Wire contract (503 / 401 / 400 / 200) and request body shape are unchanged.
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — bot-facing action table extended with the URL usage on `reply_with_status` and the explicit no-URL-on-cancelled rule. New "Enriched safe_message behavior" subsection documents the composer's fields and degradation. New "Location and access safety boundary" subsection makes it explicit that the view URL is NOT a smart-lock PIN, exact address, payment link, or admin-data surface. Sensitive-disclosure rule extended to cover `booking_view_url`. "Sensitive fields the orchestrator NEVER returns" paragraph now records the signed view URL as the single intentional exception, gated on the established-identity branches only.
- No schema changes. No new env vars (the helper reuses the existing `BOOKING_ACTION_SECRET` and `NEXT_PUBLIC_SITE_URL`). No new dependencies. No locked-API touches.

**Reversible?:** yes. Revert the three TS files + the two doc files; the prior orchestrator response shape returns. No data migrated, no tokens minted that need invalidation (the issued view tokens are stateless HMAC over `bookingId + "view" + exp + jti` — they age out on their own 72h TTL).

**Supersedes:** none. This decision extends today's earlier "WhatsApp identity v2" entry by adding the booking-view URL surfacing rule; the priority order, request body shape, identity-proof comparison set, and 503/401/400/200 contract from that entry all carry forward unchanged.

---

## 2026-05-22 - WhatsApp identity v2: WhatChimp subscriber_id becomes primary continuity key; identity_proof accepts email OR full name; flow JSON ships placeholder-free

> **Reconciliation note (added 2026-06-03):** the original commit that landed these 2026-05-22 entries left two heading lines stacked above the "Hosted payment execution is provider-agnostic" body, and re-titled what is now the lower 2026-05-22 entry ("Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout") as a duplicate carrier for the "WhatsApp identity v2" body. The bodies are factually correct and in chronological order; only the header/body pairing got shuffled. To preserve append-only history without rewriting the original prose, the headings are left in place and this note documents the mismatch:
>
> - The body immediately under the "Hosted payment execution is provider-agnostic" heading below belongs to **that** decision (provider-agnostic hosted checkout, Credit Libanais production target).
> - The body under the later "Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout" heading describes **the WhatsApp identity v2** work (subscriber_id primary key, email-or-name identity proof, placeholder-free flow JSON).
> - "Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout" remains historically accurate as the precursor decision that the same-day "provider-agnostic" entry supersedes - both are kept for traceability.
>
> Subsequent decisions (2026-05-23 onward) reference the v2 identity body by the "WhatsApp identity v2" heading; the supersession-tracking still works because the body content is unambiguous.

## 2026-05-22 - Hosted payment execution is provider-agnostic; Credit Libanais / MPGS is the production target

**Decision:** Oraya's hosted-payment architecture remains booking-first and webhook-first, but production is no longer assumed to be Stripe. `POST /api/payments/checkout` now resolves a provider-agnostic hosted-checkout adapter selected by `PAYMENT_PROVIDER`, and `POST /api/payments/webhook/[provider]` is the generic callback surface. Credit Libanais / MPGS is the production target provider for settlement into a Fresh USD account in Lebanon. In production, provider selection must be explicit and must be `credit_libanais`: if `PAYMENT_PROVIDER` is missing or set to any other value, checkout fails closed with a configuration error. Outside production, the runtime may default to Stripe so local/dev can still exercise the hosted checkout flow intentionally.

**Reason:** the operating setup is Lebanese bank settlement, not Stripe as merchant of record. The website still must never collect card data directly, and the booking pipeline still must stay authoritative for overlap protection, pricing, add-on rules, email triggers, and signed booking-view links. A provider-agnostic adapter boundary lets Oraya preserve the premium hosted checkout UX and lifecycle fields without baking Stripe into the architecture or pretending the bank contract is already known.

**Impact:**

- [app/api/payments/checkout/route.ts](../../app/api/payments/checkout/route.ts) now resolves the configured hosted-checkout adapter instead of importing Stripe directly. Booking validation, signed booking-token verification, and server-side deposit/full amount validation remain unchanged.
- [lib/payments/provider.ts](../../lib/payments/provider.ts) now distinguishes runtime provider keys from the persisted `payment_link_provider` allow-list, and exports the generic hosted-checkout adapter contract:
  - `createCheckoutSession`
  - `verifyWebhook`
  - `mapProviderEventToBookingUpdate`
- New runtime helpers:
  - [lib/payments/runtime.ts](../../lib/payments/runtime.ts) - provider registry keyed by `PAYMENT_PROVIDER`
  - [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - explicit non-faking placeholder adapter that lists the bank details still required
  - [lib/payments/webhook-handler.ts](../../lib/payments/webhook-handler.ts) - generic callback application logic
- New callback route:
  - [app/api/payments/webhook/[provider]/route.ts](../../app/api/payments/webhook/%5Bprovider%5D/route.ts) - generic hosted-payment callback surface
  - [app/api/payments/webhook/stripe/route.ts](../../app/api/payments/webhook/stripe/route.ts) - compatibility shim for the optional Stripe adapter
- [app/book/page.tsx](../../app/book/page.tsx) no longer hardcodes Stripe in Step 3 copy; guest messaging stays provider-neutral and hosted-checkout-only.
- Environment contract changes:
  - `PAYMENT_PROVIDER=credit_libanais` is the only approved production setting
  - production no longer silently falls back to Stripe when `PAYMENT_PROVIDER` is unset
  - production rejects `PAYMENT_PROVIDER=stripe`
  - `CREDIT_LIBANAIS_MERCHANT_ID`
  - `CREDIT_LIBANAIS_SECRET`
  - `CREDIT_LIBANAIS_GATEWAY_URL`
  - `CREDIT_LIBANAIS_WEBHOOK_SECRET`
  - Stripe envs remain optional for local/dev testing only
- Important schema compatibility note: the current `bookings.payment_link_provider` allow-list is still the older `manual | whish | stripe` floor. The Credit Libanais adapter therefore remains a placeholder and must not write fake provider state until a later explicit schema-compatibility step is approved.

**Reversible?:** yes, but only with a superseding entry that preserves the locked `/api/bookings` authority, server-side amount validation, and verified callback truth.

**Supersedes:** refines the 2026-05-22 "Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout" entry by removing Stripe as the production assumption while preserving the same hosted-checkout execution model.

---

## 2026-05-22 - Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout

**Decision:** the WhatsApp identity orchestration surface from earlier today is revised to fit WhatChimp's actual variable set and to support bookings with no email on file.

Concrete changes:

- The primary continuity key becomes **WhatChimp `subscriber_id`**, looked up against a new `whatsapp_leads.whatsapp_subscriber_id` column. The earlier phone-keyed lookup remains but is demoted to "future channels only" — WhatChimp does NOT expose the sender phone as a variable, so the original design could never auto-resume a returning WhatChimp conversation on its own.
- A diagnostic-only `whatsapp_chat_id` column is added alongside. The orchestrator never queries it; it is captured purely for ops correlation between WhatChimp logs and `whatsapp_leads` rows. No index.
- The identity-proof field is renamed `identity_proof` (was `identity_proof_email`) and now accepts **the email OR the full name** used on the booking. Comparison is exact-after-normalization (lowercased, trimmed, internal whitespace collapsed to single spaces) against `bookings.guest_email`, `bookings.guest_name`, and (when the booking is linked to a member) the member's `auth.users.email` and `members.full_name`. Substring / fuzzy / startsWith matching is intentionally rejected for v1 to prevent name-prefix leakage (e.g. "John" matching every John).
- The new priority order is **subscriber_id → phone → reference + identity_proof gate → human escalation**.
- The WhatChimp flow JSON ships as [whatsapp-bot_guest-identification_v2.json](../../) **placeholder-free**: all WhatChimp ids (HTTP API id, custom field ids, label ids) are empty strings or empty arrays while the human-readable names live in the parallel `*_SelectedOptionText` / `*TextsArray` fields. Matches the user's own re-export pattern from `whatsapp-bot_1857205_*`. Operator wires the ids via the WhatChimp UI after import.
- The legacy `identity_proof_email` field on `POST /api/butler/identify` is accepted as a transitional alias while the v1 flow is migrated. The route prefers `identity_proof` when both are present.

**Schema impact:** new additive migration [sql/phase-16a3-whatsapp-subscriber-identity.sql](../../sql/phase-16a3-whatsapp-subscriber-identity.sql) (NOT auto-applied; idempotent; reversible) adds the two nullable text columns and indexes `whatsapp_subscriber_id` only. Backend degrades gracefully when the migration is not yet applied: the orchestrator detects PostgREST error `42703` (undefined_column) on the subscriber-id path and falls through silently, the ingest route (`POST /api/butler/lead`) retries inserts without the new fields, and both admin lead routes fall back to a base column list.

**Reason:** the v1 design assumed `{{contact.phone}}` would be available on the WhatChimp channel; verification of WhatChimp's actual variable set proved that wrong (only `#LEAD_USER_*#` hashtag variables, no sender phone). Without a stable continuity key the orchestrator could never auto-resume a returning guest in production — every WhatsApp turn would have fallen straight to the reference + identity-proof gate. The subscriber-id path restores the intended UX. Accepting full name as identity proof closes the second real gap: many bookings do not have an email captured (early phases collected name + phone only), so email-only proof would have left the human-escalation arm as the only resolution path for those guests.

The audit explicitly considered and rejected:

- **Substring or startsWith matching on names.** Rejected — a guest named "John Smith" typing "John" would have verified against every other John in the database. Exact-after-normalization is the right safety/usability trade for v1.
- **Two separate proof fields (`identity_proof_email`, `identity_proof_name`).** Rejected — forces the bot to ask the guest which they want to share before they share it, and forces a second WhatChimp custom field. One free-text field that compares against both stores is simpler and equally safe given the exact-match rule.
- **Indexing `whatsapp_chat_id`.** Rejected — it is not a lookup key. The orchestrator does not query it. Indexing it would be dead weight.
- **Auto-applying the SQL migration.** Rejected per the repo's standing rule that schema changes are operator-applied, never auto-applied, and must be reversible. The graceful degradation in the backend means the migration can be applied at any time without downtime.

**Impact:**

- [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) — `IdentityInput` gains `subscriber_id`, `chat_id`, `identity_proof`; `phone` retained. `IdentityResult` shape unchanged. New helpers `resolveBookingBySubscriberId`, `verifyIdentityProofMatchesBooking`; the prior `resolveBookingByPhone` / `verifyEmailMatchesBooking` are refactored into a shared lookup. Priority order updated. Safe-message for `request_identity_proof` reworded to "share the email or the full name used on your booking".
- [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts) — body now reads `subscriber_id` (cap 128), `chat_id` (cap 128), `phone` (cap 64), `booking_reference` (cap 64), `identity_proof` (cap 320). Legacy `identity_proof_email` accepted as a fallback. Unchanged: auth contract (503/401), 400 on shape errors, 200 on every orchestration outcome.
- [lib/butler/leads.ts](../../lib/butler/leads.ts) — `normalizeLeadInput` picks `subscriber_id` and `chat_id` from a handful of WhatChimp aliases (`oraya_subscriber_id`, `lead_user_subscriber_id`, `subscriber_id`, `whatsapp_subscriber_id`, `whatchimp_subscriber_id`; mirror set for chat). `NormalizedLeadInput` and `WhatsappLeadAdminRow` gain `whatsapp_subscriber_id` / `whatsapp_chat_id` as `string | null`.
- [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts) — retries insert without the new columns when Supabase returns `42703`; raw values stay in `raw_payload` regardless.
- [app/api/admin/leads/route.ts](../../app/api/admin/leads/route.ts) + [app/api/admin/leads/[id]/route.ts](../../app/api/admin/leads/%5Bid%5D/route.ts) — `SELECT_COLUMNS_FULL` includes the new fields; both fall back to `SELECT_COLUMNS_BASE` on `42703`.
- [sql/phase-16a3-whatsapp-subscriber-identity.sql](../../sql/phase-16a3-whatsapp-subscriber-identity.sql) — new additive migration. Adds the two columns + the subscriber-id index. Comments document the diagnostic-only intent of `whatsapp_chat_id`.
- [whatsapp-bot_guest-identification_v2.json](../../) (Desktop + `Oraya/`, both `.json` and `.txt`) — replaces the v1 flow. Welcome step unchanged (3 buttons). Identity-proof step rephrased + `emailQuickreply` set to `false` + custom field renamed `oraya_identity_proof_email` → `oraya_identity_proof`. All WhatChimp ids are empty strings; names preserved.
- [ARCHITECTURE.md](ARCHITECTURE.md) WhatsApp identity flow section rewritten for the v2 priority order + schema dependency. [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) identity orchestration section rewritten with the new request body shape, the email-or-name proof rule, the schema dependency, and the booking-request flow gap callout.
- `tsc --noEmit` clean; `npm run build` clean; new `/api/butler/identify` and `/api/butler/booking-lookup` routes confirmed in the build manifest.

**Known gap (intentional, scoped follow-up):** the existing booking-request flow (`whatsapp-bot_1846656_*`) does NOT yet pass `subscriber_id` to `POST /api/butler/lead`. Until that flow is updated separately, new leads created via the booking-request path won't be auto-resumable by subscriber id from WhatChimp — they fall through to the reference + identity-proof gate. The schema and backend already accept the field; only the WhatChimp-side wiring on that other flow is missing. The user's standing instruction is to NOT modify the booking-request flow file in this turn.

**Reversible?:** yes. Backend: revert the three TS files + the two route files + the SQL migration; the prior phone-keyed orchestrator returns. Schema: `drop column if exists whatsapp_subscriber_id`, same for `whatsapp_chat_id`, drop the index. Flow JSON: the v1 file is preserved on Desktop and in the Oraya folder; re-importing it restores the old behavior. No data destroyed (the SQL is additive; the columns are nullable; the rename `identity_proof_email` → `identity_proof` is also accepted as the legacy alias by the route).

**Supersedes:** today's earlier entry "WhatsApp identity orchestration: phone continuity → booking-reference fallback → human escalation, single `/api/butler/identify` endpoint" is updated, not retracted. The endpoint, the orchestrator helper, and the safe-message + sensitive-disclosure contracts all carry forward; only the priority order, the input shape, and the proof comparison set change.

---

## 2026-05-22 - WhatsApp identity orchestration: phone continuity → booking-reference fallback → human escalation, single `/api/butler/identify` endpoint

**Decision:** WhatsApp identity resolution for the Butler is owned server-side by a single stateless orchestrator helper, [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts), and exposed to WhatChimp through one Butler-secret-guarded endpoint, `POST /api/butler/identify`. The bot does not branch on its own; each turn it passes whatever signals it has gathered (`phone`, `booking_reference`, `identity_proof_email`) and receives back a deterministic `recommended_next_action` plus the only `safe_message` the Butler is allowed to echo.

The priority order is locked:

1. **Phone continuity (primary).** Inbound WhatsApp sender phone → `whatsapp_leads.phone` → `linked_booking_id` → `bookings`. When this succeeds, identity is implicit; villa / check_in / check_out / status are returned and the bot composes a status reply (or, for a cancelled booking, an acknowledgement that withholds details).
2. **Booking-reference fallback.** No phone match → bot asks for the 8-character reference. The orchestrator resolves it via [resolveBookingByReference](../../lib/booking-reference.ts). Pending/confirmed matches gate disclosure behind explicit identity verification; cancelled matches return a safe acknowledgement.
3. **Human escalation.** Ambiguous reference, failed identity proof, or any unsafe state hands off to a human; the bot stops auto-replying about the booking and operators pick up from `/admin/leads`.

**Identity verification options recognized today (closed allow-list):**

- Phone continuity (implicit, primary path only).
- Booking email match — case-insensitive comparison against `bookings.guest_email` and (when the booking is linked to a member) the member's `auth.users.email`. Mismatch escalates to human; the bot does not loop on retries.
- Manual escalation — every other case.

**Sensitive-disclosure rule:** `villa`, `check_in`, `check_out` are returned by the orchestrator only when identity is verified. The bot must never echo a cached value for those fields when the current orchestrator response has them null — the orchestrator is the single source of truth per turn.

**Reason:** the Butler must correctly identify a returning guest before disclosing anything stay-specific, but it must also be operationally cheap to use (one call per turn, deterministic output, no client-side policy logic). Centralizing the priority order, the verification gate, and the safe-message strings server-side keeps the WhatChimp configuration trivial and audit-able: the bot reads `recommended_next_action`, calls the next correct primitive, and echoes `safe_message`. It also keeps the security model honest — there is exactly one code path that decides "is this person verified for this booking?" and that code path lives in this repo, not in WhatChimp's AI Training.

The decision explicitly considered and rejected alternatives:

- **Doing the priority logic in WhatChimp AI Training.** Rejected — AI Training is not auditable, drifts silently, and would mean the security model lives in a vendor surface outside the repo. The same argument the 2026-05-12 architecture freeze made about pricing / availability / status applies in full to identity.
- **Storing a per-conversation identity-state column.** Rejected — every signal the orchestrator needs is already on `bookings` or `whatsapp_leads`. Adding a third table would introduce a stateful surface that drifts from the underlying truth (a booking cancelled after a turn was "verified" would silently surface stale state).
- **Multiple specialized endpoints (`/api/butler/lookup-by-phone`, `/api/butler/verify-identity`).** Rejected as scope creep. The single multi-signal endpoint produces the same outcome with less surface, fewer round-trips, and one place to audit the priority order.

**Impact:**

- New file [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts). Single exported async function `orchestrateButlerIdentity(input)` plus the discriminated `IdentityState` / `IdentityAction` types. Always resolves; never throws. Operational errors (Supabase outage, unexpected throw) collapse to the safest "ask for reference" or "escalate human" result, with the error logged server-side.
- New file [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts). Thin HTTP wrapper. Reuses `requireButlerAuth` (503 / 401 contract unchanged). 400 on invalid JSON / body shape / over-length input. 200 on every orchestration outcome, including escalations.
- [ARCHITECTURE.md](ARCHITECTURE.md) API surface table gains `/api/butler/booking-lookup` and `/api/butler/identify`.
- [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) gains a "WhatsApp identity orchestration" section that documents the priority order, the action allow-list, the sensitive-disclosure rule, and the closed identity-verification options list. This is the operational contract WhatChimp configuration must respect.
- **No schema change.** Reuses existing `whatsapp_leads` (phone, linked_booking_id), `bookings` (id, status, villa, check_in, check_out, guest_email, member_id), and `auth.users` (email via service-role).
- **No new env var.** `BUTLER_WEBHOOK_SECRET` already required and already documented in [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).
- **No new dependency.** Uses `supabaseAdmin`, `requireButlerAuth`, and the existing `lib/booking-reference.ts`.
- **No locked-surface touch.** `/api/bookings*`, `/api/admin/*`, `/api/calendar/*`, `/api/cron/*`, the email senders, the auth and token systems, and the existing schema remain untouched.

**Reversible?:** yes — easy. Delete the two new files, revert the ARCHITECTURE.md + BUTLER_PLAYBOOK.md additions, add a superseding entry here. No data persisted; no external consumer locked in (WhatChimp does not call this endpoint until its outbound flow is configured to).

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-12 Butler architecture freeze (locked namespace + secret), the 2026-05-15 `whatsapp_leads` persistence (provides the phone → booking linkage), the 2026-05-18 lead → booking provenance writer (populates `linked_booking_id`), and the 2026-05-22 booking-reference helper (the fallback identifier this orchestrator resolves).

---

## 2026-05-22 - Guest-facing booking reference formalized as the bookings.id 8-char uppercase prefix; lib/booking-reference.ts owns the contract

**Decision:** the existing 8-character uppercased prefix of `bookings.id` is the single guest-facing booking reference. A new module [lib/booking-reference.ts](../../lib/booking-reference.ts) owns the format / normalize / resolve contract. No parallel identifier system is introduced; no schema change; no migration; no env var.

Public / private boundary is now formal:

- **Public guest-facing identifier** = `formatBookingReference(booking.id)`. Visible in pending / event-inquiry / confirmed / cancelled emails (the `Reference` row in the summary card) and at the top of `/booking/view/[token]`. Safe to quote in support channels. Knowing the reference is **not** proof of identity and never authorizes sensitive disclosure on its own.
- **Private signed credentials** = `createActionToken(...)` in [lib/booking-action-token.ts](../../lib/booking-action-token.ts) and `createPrefillToken(...)` in [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts). These remain the only credentials that authorize sensitive operations. They are never quoted, never asked of the guest in conversation, never interchangeable with the public reference.

Future WhatsApp identity model (planning context — not implemented in this entry):

- **Primary path:** known WhatsApp sender → Butler token continuity / lead-linkage continuity → linked booking → deterministic safe status reply (see [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) §4).
- **Fallback path:** unknown sender / spouse / changed number → ask for the booking reference → `resolveBookingByReference` returns booking_id + non-sensitive context (status, villa, check_in, check_out) → identity verification (phone match, booking email match, manual escalation) MUST run before any sensitive field is exposed.

**Reason:** the 8-char-prefix reference is already shipped and visible in three call sites ([app/booking/view/[token]/page.tsx](../../app/booking/view/%5Btoken%5D/page.tsx), [lib/send-booking-pending-email.ts](../../lib/send-booking-pending-email.ts), [lib/send-booking-email.ts](../../lib/send-booking-email.ts)) and explicitly named the "public guest-facing support code" in [PROJECT_STATE.md](PROJECT_STATE.md), [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md), and [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md). Introducing a second identifier would have meant two reference systems, two migration risks, and a years-long deprecation tail; centralizing the existing one into a named helper achieves every product goal (human-friendly identifier, safe for WhatsApp/support use, future-ready for payment-lookup and arrival-messaging flows) with zero schema or env impact.

The audit explicitly considered and rejected the alternatives:

- A new `bookings.booking_reference` text column. Rejected — duplicates an identifier already derived from the primary key; adds a migration with no observable guest benefit; collision-prevention logic (the only argument for a separate column) is unnecessary at Oraya's booking volume given uuid v4 first-8-hex entropy and is already handled by the `ambiguous` branch of the new resolver.
- A short opaque token (e.g. base32 nanoid) separate from `bookings.id`. Rejected — same migration cost, plus historical bookings would need backfill; the existing reference is already in production emails and the guest already knows it as theirs.

**Impact:**

- New file [lib/booking-reference.ts](../../lib/booking-reference.ts). Three exports: `formatBookingReference(id) -> string | null`, `normalizeBookingReference(value) -> string | null`, `resolveBookingByReference(reference) -> Promise<BookingReferenceResolution>`. Type-and-helper module; no runtime side-effects at import time (the Supabase admin client is already lazy-Proxy-loaded).
- The `resolveBookingByReference` discriminated union returns `not_found` / `ambiguous` / `found`. The `found` variant exposes only `booking_id`, `status`, `villa`, `check_in`, `check_out` — the same fields the guest already sees on `/booking/view/[token]`. Sensitive fields (phone, email, payment ledger, `payment_link_*`, raw payload, admin notes) are never returned by the resolver; identity verification is the caller's job.
- [ARCHITECTURE.md](ARCHITECTURE.md) gains a "Booking identity model" section formalizing the public / private split and documenting the primary / fallback WhatsApp identity flow.
- **No schema, no env, no new dependency, no new route.** The three existing call sites that compute `.slice(0, 8).toUpperCase()` are left untouched (minimal diff; the email senders are listed as locked surfaces in [AGENT_RULES.md](AGENT_RULES.md) §4, so even a no-op refactor was deferred). The helper has no callers in this commit; it is scaffolding for the next WhatsApp / payment-lookup PR.
- `tsc --noEmit` clean. `npm run build` clean.

**Reversible?:** yes — trivially. Delete the new file, revert the ARCHITECTURE.md section, add a superseding entry here. No data persisted; no external consumer locked in.

**Supersedes:** does not supersede a prior decision. Formalizes a convention that has been informally documented across [PROJECT_STATE.md](PROJECT_STATE.md), [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md), and [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) since Phase 16A but had no central code module.

---

## 2026-05-18 - Phase 16B.1 architecture freeze: payment link columns + provider abstraction

**Decision:** Phase 16B.1 is closed as the **architecture / scaffold step**. The following choices are locked before any Phase 16B.2+ implementation code lands:

1. **Schema shape.** One live payment link per booking, modeled as **additive nullable columns** on `bookings`, **not** a separate `payment_links` history table. The columns are: `payment_link_url`, `payment_link_provider`, `payment_link_expires_at`, `payment_link_issued_at`, `payment_link_status`, `payment_provider_session_id`. The SQL is recorded in [/sql/phase-16b1-payment-link-foundation.sql](../../sql/phase-16b1-payment-link-foundation.sql) and is **NOT applied in this commit** - it is human-gated and runs in the Supabase SQL editor at the start of Phase 16B.2.
2. **Status allow-list (locked v1):** `null` / `none` / `active` / `paid` / `expired` / `cancelled` / `failed`. Enforced by a `check` constraint that permits `null` so the locked `/api/bookings` POST insert path keeps writing booking rows with no payment-link columns set.
3. **Provider allow-list (locked v1 floor):** `manual` / `whish` / `stripe`. Enforced by a `check` constraint that permits `null`. `manual` and `whish` are the v1 floor (admin-driven, no external API today). `stripe` is reserved for the Phase 16B.5+ programmatic path; reserving the value now avoids a constraint migration when Stripe lands.
4. **Provider interface.** [lib/payments/provider.ts](../../lib/payments/provider.ts) declares the `PaymentProvider` interface plus the `PaymentLinkStatus` / `PaymentLinkProvider` / `PaymentCurrency` / `PaymentLinkPurpose` allow-lists, type guards, and `PaymentProviderEvent` / `PaymentBookingDelta` shapes. The file is **type-only** - no runtime, no Supabase imports, no SDK dependencies - so it can be safely added now without committing to any vendor. Concrete adapters (`manual.ts`, `whish.ts`, `stripe.ts`) land in 16B.3+.
5. **WhatsApp payment-reply branching contract.** [PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) section 4 is the deterministic mapping from `(bookings.status, payment_link_status, payment_status, refund_status)` to a single response string. The Butler is allowed to echo **only** those strings. The implementation lands in 16B.5 (`lib/payments/whatsapp-reply.ts` + `POST /api/butler/payment-status`).
6. **Currency discipline.** Every provider-interface method that touches money requires explicit currency (`USD` or `LBP`). No implicit currency. The Lebanese-market USD/LBP split makes this a correctness requirement, not just a hygiene preference.
7. **Idempotency anchor.** `payment_provider_session_id` is the single key the webhook handler uses to locate the booking and decide whether a delivered event is a duplicate. Every PATCH triggered by a webhook MUST be guarded by `eq("payment_provider_session_id", session_id)` plus an early-return when the resulting delta would be a no-op.
8. **Locked `/api/bookings` POST stays untouched.** Payment columns default to null on insert. There is **no** booking-creation behavior change in Phase 16B. The booking pipeline (overlap, pricing, addon-audit, email triggers, view-token issuance) remains the authoritative source of truth for stay state.

**Reason:** the schema-vs-table choice, the provider list, and the WhatsApp branching contract are the three architecture questions [PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) section 8.16B.1 marked as the approval gate before any payment code lands. Locking them now means 16B.2 (apply the migration + extend admin route allow-lists) and 16B.3 (admin payment UI + manual + Whish adapters) can each be a minimal, mechanical PR with no architectural debate. Picking `manual + whish` as the v1 provider floor (with `stripe` reserved but unimplemented) avoids both extremes: we are not locked into a single vendor, and we are not paying the cost of a full Stripe integration up front for a market that today settles primarily on Whish + cash + bank transfer.

Additive columns over a `payment_links` history table is justified because:

- One live link per booking is sufficient for the Whish "admin pastes a link" workflow and for the Stripe "session per booking" workflow.
- The admin diff helpers ([lib/admin-booking-diff.ts](../../lib/admin-booking-diff.ts)) and the admin data fetch ([app/api/admin/data/route.ts](../../app/api/admin/data/route.ts)) already enumerate `bookings.payment_*` columns one-by-one; continuing the convention keeps those surfaces ergonomic and avoids a per-booking join.
- Historical link-issuance audit (if ever needed) can be reconstructed from the existing webhook event logs or added in 16B.6 as a separate `payment_event_log` table without touching the per-booking shape.

**Impact:**

- New file: [/sql/phase-16b1-payment-link-foundation.sql](../../sql/phase-16b1-payment-link-foundation.sql). Additive `add column if not exists`, idempotent constraint drop-and-recreate, partial index on `(payment_link_expires_at) where payment_link_status = 'active'`, column comments. **NOT applied in this commit.** Phase 16B.2 kickoff applies it.
- New file: [/lib/payments/provider.ts](../../lib/payments/provider.ts). Type-only. No runtime behavior, no imports beyond TypeScript's standard library, no Supabase, no SDK. Exports `PAYMENT_LINK_STATUSES`, `PAYMENT_LINK_PROVIDERS`, `PAYMENT_CURRENCIES`, `PAYMENT_LINK_PURPOSES` const arrays plus matching types + type guards, the `CreatePaymentLinkInput` / `CreatePaymentLinkResult` shapes, the `PaymentProviderEvent` / `PaymentBookingDelta` shapes, and the `PaymentProvider` interface.
- [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) - section 8.16B.1 marked complete; scaffold file paths added.
- **No existing file modified beyond the doc.** No locked route touched. No schema applied. No env var consumed. `npx tsc --noEmit` clean. `npm run build` clean.

**Reversible?:** yes - trivially. To reverse this scaffold: delete both new files, revert the section 8.16B.1 status update in PHASE_16B_PLAN.md, and add a superseding entry here. No data has been migrated; no runtime path imports the provider types yet.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-18 prefill-handoff and provenance-linkage decisions below by adding the payment-state layer Phase 16B needs. Locks the schema-vs-table, provider-list, and WhatsApp-branching choices PHASE_16B_PLAN.md section 8.16B.1 deferred.

---

## 2026-05-18 - Phase 16A Butler ops closeout keeps WhatsApp as lead capture + website continuation, not booking submission

**Decision:** operational documentation for Phase 16A is aligned to the shipped architecture: WhatChimp / WhatsApp captures lead intent, calls `POST /api/butler/lead`, uses the returned `prefill_url` when present, and continues the guest into Oraya's existing `/book` flow. WhatsApp is **not** the authoritative booking submission surface in the current approved model, and Butler messaging must not imply payment collection, refund handling, or access/PIN delivery.

**Reason:** the shipped code now supports secure website continuation, guest/member gate persistence, continuation readiness, and best-effort `whatsapp_leads.linked_booking_id` back-linking after booking creation. Several docs still framed 16A around a planned `/api/butler/flow-submit` adapter or implied broader Butler capabilities than production actually has. That drift creates operational risk: humans may misconfigure WhatChimp, promise payment behavior that belongs to 16B, or rotate Butler secrets without coordinating Vercel and WhatChimp.

**Impact:**

- [CURRENT_PHASE.md](CURRENT_PHASE.md) now reflects the shipped Phase 16A state and frames the remaining work as ops closeout alongside the newer Phase 16B provisioning context.
- [PROJECT_STATE.md](PROJECT_STATE.md) and [ARCHITECTURE.md](ARCHITECTURE.md) now describe the live Butler/WhatChimp continuation flow more explicitly.
- [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) now hardens:
  - human escalation routing
  - WhatChimp prompt guidance for `prefill_url`
  - explicit "no payment promises in 16A" language
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) now includes a Butler secret rotation checklist covering Vercel + WhatChimp coordination and token invalidation expectations.

**Reversible?:** yes. The docs can be revised again when a future approved architecture changes the WhatsApp booking boundary.

**Supersedes:** refines the operational interpretation of the 2026-05-12 Butler architecture freeze and the 2026-05-18 prefill-handoff decision without changing the underlying code contracts.

---

## 2026-05-18 - WhatsApp lead -> booking provenance linkage in `/api/bookings` POST

**Decision:** the locked `/api/bookings` POST handler now accepts an optional `butler_prefill_token` in the request body. After a successful booking insert, the handler best-effort verifies the token with `verifyPrefillToken` from [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts) and, on success, updates `whatsapp_leads.linked_booking_id` with the new booking's id. The update uses an `.is("linked_booking_id", null)` race guard so an existing linkage is never overwritten. Every failure mode - missing/empty token, signature mismatch, expired token, missing lead, conflicting prior linkage, Supabase error - logs a server-side warning and returns early; **none of them block booking creation**.

**Reason:** Phase 16A's `/api/butler/lead` and `/api/butler/prefill` close the WhatsApp -> website hand-off direction, but until this decision there was no return path: a guest who clicked the prefill URL, completed the booking form, and submitted produced a booking row that was not linkable to the original lead in `/admin/leads`. Operators triaging from `/admin/leads` therefore could not see which leads converted. The lead -> booking provenance loop is the operational backbone Phase 16B's payment / WhatsApp lookup flow needs (to answer "what booking are we talking about?" deterministically when a guest replies on WhatsApp). The decision keeps the linkage non-authoritative - the booking, not the lead, remains the source of truth for stay state - and treats the link as a best-effort enrichment so the locked booking pipeline is never destabilized by Butler-side configuration drift (e.g. a rotated `BUTLER_PREFILL_SECRET`).

**Impact:**

- [app/api/bookings/route.ts](../../app/api/bookings/route.ts) now reads `butler_prefill_token` from the JSON body and, after the booking insert succeeds, calls a new internal `linkBookingToButlerLead` helper. The helper:
  - Returns silently if the token is missing, not a string, or empty.
  - Returns silently with a `console.warn` if `verifyPrefillToken` fails (invalid or expired).
  - Looks up the lead row by `lead_id`; warns + returns if the lead is missing.
  - No-ops if the lead is already linked to this same booking.
  - Warns + returns (without overwriting) if the lead is linked to a different booking.
  - Otherwise issues an atomic update guarded by `.is("linked_booking_id", null)` so concurrent submissions cannot stomp on each other.
- [app/book/page.tsx](../../app/book/page.tsx) stores the original `?h=...` handoff token in `sessionStorage` only after a successful prefill round-trip, sends the stored token as `butler_prefill_token` in the booking POST body, and clears it from `sessionStorage` after the booking view-token redirect.
- No new env var. `BUTLER_PREFILL_SECRET` (introduced 2026-05-18 in the prefill-handoff decision below) is now also consumed by `/api/bookings` via `verifyPrefillToken`. If the env is unset, verification cleanly returns `{ ok: false, reason: "invalid" }`, the warning is logged, and the booking proceeds - there is **no failure path that blocks booking creation**.
- **No schema changes.** The `whatsapp_leads.linked_booking_id` column already existed from the 2026-05-15 entry below; this decision adds a writer (the booking pipeline) on top of the existing 16A.2.e admin-PATCH writer.
- **No locked booking-creation logic changed.** Pricing, overlap protection, addon audit, email triggers, view-token issuance, and the API response shape are all untouched. The new linkage helper runs after the insert and after the booking response is computed.
- Docs: [CURRENT_PHASE.md](CURRENT_PHASE.md) "Just completed" entry added; [ARCHITECTURE.md](ARCHITECTURE.md) Butler flow section gains a line about the provenance writer; this entry is the durable record.

**Reversible?:** yes - easy. To reverse: drop the `butler_prefill_token` destructure, drop the `linkBookingToButlerLead` call site + helper, drop the `verifyPrefillToken` import, revert the three `app/book/page.tsx` storage helpers + their two call sites, and add a superseding entry here. No data corruption risk on reversal - the only persisted side-effect is the `linked_booking_id` enrichment, which is informational.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-18 prefill-handoff decision below (which introduced the token + lead row plumbing) by adding the lead -> booking return-path writer.

---

## 2026-05-18 - WhatsApp lead capture may mint an additive opaque `/book` prefill handoff

**Decision:** keep `whatsapp_leads` as the source of truth for WhatsApp-originated booking intent and add a short-lived opaque prefill handoff on top of it. `POST /api/butler/lead` may now return an additive `prefill_url` that points at `/book?h=<opaque-token>`, where `h` is signed only with `BUTLER_PREFILL_SECRET`. A new public `GET /api/butler/prefill?h=...` verifies the token, loads the lead row, and returns a strict safe-field allow-list only: `villa`, normalized `check_in`, normalized `check_out`, `sleeping_guests`, `full_name`, `source`.

**Reason:** the website handoff must let the guest continue without retyping information, but raw booking intent and PII must not appear in public query params. At the same time, lead capture is business-critical and must not fail solely because token issuance is unavailable. The additive handoff preserves both constraints: `whatsapp_leads` stays authoritative, the URL carries only an opaque token, and missing `BUTLER_PREFILL_SECRET` degrades gracefully by omitting `prefill_url` while still persisting the lead.

**Impact:**

- New helper: [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts) - HMAC-SHA256 signed opaque token with `{ lead_id, exp, jti, v:1, purpose:"prefill" }`, 2-hour TTL, timing-safe signature compare.
- New route: [app/api/butler/prefill/route.ts](../../app/api/butler/prefill/route.ts) - public GET endpoint, token-auth only, `Cache-Control: no-store`, 400 invalid token, 410 expired/missing lead, 500 safe server error.
- [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts) now attempts to issue `prefill_url` after successful insert, but catches token/config errors so lead capture still succeeds with the existing `{ ok, lead_id, message }` contract intact plus additive `prefill_url: null`.
- [app/book/page.tsx](../../app/book/page.tsx) now hydrates safe fields from `/api/butler/prefill?h=...`, uses only normalized date-only strings for date prefill, and strips `h` from the URL after success or failure so the page continues to work normally when prefill is unavailable.
- [lib/butler/leads.ts](../../lib/butler/leads.ts) now accepts WhatChimp-style normalized aliases `oraya_check_in` / `oraya_check_out` in addition to `normalized_check_in` / `normalized_check_out`, and drops reversed normalized ranges instead of persisting them for prefill.
- New env var: `BUTLER_PREFILL_SECRET`. Distinct from `BUTLER_WEBHOOK_SECRET`.
- **No schema changes.** `whatsapp_leads` shape is unchanged. No locked API touched. No raw WhatsApp text is used for `/book` hydration.

**Reversible?:** yes. Remove the new helper + route, remove the additive `prefill_url` behavior from the lead route, remove the `/book?h=...` hydration effect, delete the env-doc references, and add a superseding entry here.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-15 `whatsapp_leads` persistence decision by adding a non-authoritative website handoff layer without changing the table or the booking pipeline.

---

## 2026-05-15 - WhatsApp leads are persisted in `whatsapp_leads` before booking creation

**Decision:** WhatsApp / WhatChimp lead intake is persisted in a new operational Supabase table `whatsapp_leads` and surfaced through a new admin dashboard at `/admin/leads`. A new `POST /api/butler/lead` is the only writer; new `GET /api/admin/leads` and `PATCH /api/admin/leads/[id]` are the only readers/mutators. The lead is **not** a booking, and writing a lead does **not** create a booking row, hold dates, check availability, send email, issue a token, or trigger payment.

The Butler ingest reuses the existing 2026-05-12 Butler auth contract (`requireButlerAuth`, `X-Butler-Secret`, `BUTLER_WEBHOOK_SECRET`). The admin routes reuse the existing `requireAdminAuth` cookie/bearer contract from [lib/admin-auth.ts](../../lib/admin-auth.ts) - neither auth helper is modified.

**Reason:** WhatsApp conversations are not authoritative bookings. WhatChimp's labels and custom fields are vendor-internal, ephemeral, and not auditable from Oraya. Without an Oraya-owned table, the operator has no durable record of who reached out, what they wanted, or whether anyone followed up - and the locked `/api/bookings` POST pipeline cannot be the right home, since most leads will never become bookings (questions, lost opportunities, spam). Persisting leads in a separate table:

- Keeps the booking pipeline locked and authoritative for actual bookings.
- Gives the operator a single dashboard (`/admin/leads`) where every WhatsApp lead lands, with status, contact link, notes, and an optional `linked_booking_id` once a lead converts.
- Establishes the operational backbone that the future `POST /api/butler/flow-submit` (write-capable booking adapter) will hand off to once a lead is ready to become a real booking.

**Impact:**

- New schema (additive, explicitly approved): `public.whatsapp_leads`. RLS **enabled with no policies** - service role bypasses RLS so the Butler ingest + admin routes (both server-only via `SUPABASE_SERVICE_ROLE_KEY`) work, while every other client is denied by default. This is a stricter posture than the repo's existing operational tables (e.g. `booking_action_tokens` runs RLS off); the stricter default is chosen because there is no client-side use case for this table, only server-mediated access.
- New schema helper: [/sql/phase-16a2e-whatsapp-leads.sql](../../sql/phase-16a2e-whatsapp-leads.sql). Idempotent. Must be run once in the Supabase SQL editor before the endpoint can insert. Includes a `BEFORE UPDATE` trigger that keeps `updated_at` honest even on direct dashboard edits.
- New API: [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts), [app/api/admin/leads/route.ts](../../app/api/admin/leads/route.ts), [app/api/admin/leads/[id]/route.ts](../../app/api/admin/leads/%5Bid%5D/route.ts).
- New UI: [app/admin/leads/page.tsx](../../app/admin/leads/page.tsx). A single new "Leads" link added to [components/admin/AdminChrome.tsx](../../components/admin/AdminChrome.tsx) `NAV_ITEMS` - the minimum non-invasive change to make the page discoverable.
- New shared library: [lib/butler/leads.ts](../../lib/butler/leads.ts) - pure helpers for input normalization (Butler ingest), patch validation (admin PATCH), and the canonical `FOLLOW_UP_STATUSES` allow-list (mirrored by the SQL check constraint).
- Docs: [ARCHITECTURE.md](ARCHITECTURE.md) API surface table + Butler flow section + schema list updated. [CURRENT_PHASE.md](CURRENT_PHASE.md) "Just completed" entry added. [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) gets an operator note that human triage lives in `/admin/leads`, not WhatsApp scrollback.
- **No existing schema changes.** `bookings`, `addons`, `settings`, `booking_action_tokens`, `members` are untouched. No existing RLS policy modified. No existing column added, removed, renamed, or retyped.
- **No new env var.** `BUTLER_WEBHOOK_SECRET` and `ADMIN_SECRET` are reused as-is. `ENVIRONMENT_MAP.md` not modified.
- **Boundaries - what this does NOT do:** create bookings, reserve / hold dates, check availability, send emails, issue tokens, expose access details / Wi-Fi / PIN / exact villa location / payment information / IBANs, surface raw Supabase errors, expose other guests' data via this surface. Raw Supabase / driver errors collapse to safe `error: "server_error" }` 500s - logged server-side only.

**Reversible?:** yes. To reverse:
1. `drop table if exists whatsapp_leads cascade;` (loses captured leads - export first if needed).
2. Delete the four new route files, the new admin page, the new lib, and the SQL helper.
3. Revert the single-line `NAV_ITEMS` addition in `components/admin/AdminChrome.tsx`.
4. Revert the docs additions and add a superseding entry here.
No external consumer is locked in - WhatChimp can be unconfigured without affecting any locked surface.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-12 Butler architecture freeze (read-only `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET`) by introducing the **first Butler write** - but only to a brand-new operational table that is explicitly outside the booking pipeline. The 2026-05-12 source-of-truth boundary (Oraya owns pricing/availability/booking/access; the Butler must never invent them) is preserved.

---

## 2026-05-14 - `/api/butler/normalize-dates` added as additional read-only Butler endpoint

**Decision:** ship [app/api/butler/normalize-dates/route.ts](../../app/api/butler/normalize-dates/route.ts) (backed by [lib/butler/normalize-dates.ts](../../lib/butler/normalize-dates.ts)) as a secret-guarded `POST` endpoint that normalizes natural-language date text from WhatChimp (e.g. `"this Saturday"`, `"June 10"`, `"10 June 2026"`, `"two nights"`, ISO) into a structured `{ status, check_in, check_out, nights, human_readable, safe_message }` suggestion. Output is always advisory: even when both dates parse cleanly the endpoint returns `status: "needs_confirmation"` so the Butler must echo the parsed dates back to the guest for confirmation before any availability check.

**Reason:** the WhatsApp Butler / WhatChimp surface receives free-form guest text long before it ever calls the locked `/api/bookings/availability` route. Without a deterministic, server-side normalizer the Butler would have to either (a) push date parsing into AI Training (which the 2026-05-12 architecture freeze and [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) explicitly forbid for any source-of-truth field) or (b) round-trip every phrasing variant through a human. A small, dependency-free, allow-listed parser inside Oraya keeps the Butler vendor-agnostic, leaves availability/pricing/booking ownership untouched, and gives 16A.2's `flow-submit` adapter a canonical pre-step it can rely on.

**Impact:**

- New files: [lib/butler/normalize-dates.ts](../../lib/butler/normalize-dates.ts) (pure parser; no dependencies, no `new Date(<text>)` calls - guest text is tokenized explicitly and dates are constructed via `Date.UTC(...)`), [app/api/butler/normalize-dates/route.ts](../../app/api/butler/normalize-dates/route.ts) (POST handler; same 503/401/200 contract as every other `/api/butler/*` route).
- **Reuses the existing 2026-05-12 Butler auth contract** ([lib/butler/auth.ts](../../lib/butler/auth.ts) `requireButlerAuth`, `X-Butler-Secret` header validated against `BUTLER_WEBHOOK_SECRET`). No new env var, no new secret, no change to that auth decision.
- [ARCHITECTURE.md](ARCHITECTURE.md) - API surface table gains a new `/api/butler/normalize-dates` row; the Butler flow "Read endpoints" section gains a bullet describing the helper.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) - "Just completed" lists this as additional 16A.2 read-only Butler scaffolding. Active sub-phase remains `flow-submit`.
- **No locked-API touches, no schema changes, no new dependencies, no DB reads/writes, no email sends, no token issuance, no availability lookups.** The endpoint is pure text -> structured suggestion.
- The Butler still must call `/api/butler/availability` and ultimately `/api/bookings` for any real-world decision; `normalize-dates` is a pre-step, never an authority on whether a stay can happen.

**Reversible?:** yes - trivially. To reverse: delete the two new files, drop the route row + bullet from `ARCHITECTURE.md`, and add a superseding entry here. No data persisted; no external consumer locked in.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-12 architecture freeze (read-only `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET` auth contract) and the 2026-05-12 [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) rule that AI Training must never own deterministic fields.

---

## 2026-05-12 - Butler Playbook established as operational source-of-truth

**Decision:** [/docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) is the operational source-of-truth for the WhatsApp AI Butler's identity, conversation behavior, knowledge boundary, and forbidden behaviors. Every WhatChimp configuration, AI prompt, and future agent extending the Butler surface reads it before extending or modifying Butler-facing behavior.

**Reason:** the 2026-05-12 architecture freeze (entry below) locked the **data plane** - namespace, secret, source-of-truth boundary, implementation order. It did **not** lock the **operational plane** - tone, when to escalate, when to upsell, what the AI must never invent. Without a durable, version-controlled rulebook, those rules would live only in chat memory and the WhatChimp admin UI: both ephemeral and untraceable. The playbook closes that gap.

**Impact:**

- Created [/docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) with sections on identity, conversation behavior, availability philosophy, pricing philosophy, VIP handling, add-on philosophy, knowledge source-of-truth, event vs stay separation, deferred future-phase systems, and forbidden AI behavior. Plus a cross-reference index back to the data-plane docs.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) - "Just completed" updated with the playbook + the minor 16A.1.x villa-slug helper extraction.
- [ARCHITECTURE.md](ARCHITECTURE.md) - Butler flow section cross-references the playbook.
- **No code paths consume the playbook directly.** It is read by humans configuring WhatChimp, by AI prompt authors, and by future repo agents extending the Butler surface. No runtime dependency; no risk to production systems.

**Reversible?:** yes - the playbook is documentation. To reverse: delete the file and add a superseding entry here. Not recommended; operational rules would scatter again.

**Supersedes:** does not supersede a prior decision. Complements the 2026-05-12 architecture freeze (entry directly below) by adding the operational layer the freeze did not cover.

---

## 2026-05-12 - Phase 16A Butler architecture freeze - `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET`

**Decision:** the Phase 16A WhatsApp AI Butler integration is locked to the following architecture before any code lands:

1. **Endpoint namespace:** `/api/butler/*`. Not `/api/whatchimp/*`. The name describes what the surface does (AI Butler / concierge intake), not which vendor calls it. WhatChimp is the current caller; future swaps (Meta-direct webhook, alternative routing platforms) reuse the same routes without renaming.
2. **Shared secret:** `BUTLER_WEBHOOK_SECRET`. Server-only. Must never be exposed in a `"use client"` component or any `NEXT_PUBLIC_*` variable. Distinct from `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `ADMIN_SECRET` - do not reuse. Placeholder reserved in [/.env.example](../../.env.example) and [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md); no code path consumes it yet (wired in Phase 16A.1).
3. **Auth model:** for 16A.1 the floor is shared-secret-in-header (`X-Butler-Auth: ${BUTLER_WEBHOOK_SECRET}`). Once WhatChimp confirms it supports outbound request signing, upgrade to HMAC over `timestamp + "\n" + raw_body` with a 5-minute drift window for replay protection. The bare shared secret remains the fallback contract; HMAC is additive.
4. **Source-of-truth boundary:** the Oraya backend (Supabase + the locked `/api/bookings*` surface) is the only authority for pricing, availability, add-ons, booking status, access codes, refund eligibility, and policy text. WhatChimp, WhatsApp Flows, and AI Training **must not** own, paraphrase, or cache any of these. The AI Butler may relay deterministic strings Oraya returns; it must not generate its own quotes or status claims.
5. **Implementation order:** 16A.1 ships read-only Butler endpoints (`/api/butler/health`, `/api/butler/event-types`, `/api/butler/addons`, `/api/butler/availability`). Booking writes, payment, smart-lock, member linking, and AI prompt tuning come later (16A.2+, 16B-16E). The locked API surface is not modified.

**Reason:** the Phase 16A audit (2026-05-11) identified vendor-coupled naming, ad-hoc auth schemes, and source-of-truth duplication as the dominant failure modes for WhatsApp integrations of this shape. Locking the namespace, the secret name, the auth model, and the read/write boundary up front prevents:

- Renaming churn if WhatChimp is later replaced.
- Secret-name collisions or accidental reuse of existing HMAC keys.
- Hallucinated quotes/availability from AI Training, which the audit flagged as the single most expensive trust failure.
- Schema or locked-API drift, because every subsequent 16A step now has an explicit constraint to point at.

**Impact:**

- [CURRENT_PHASE.md](CURRENT_PHASE.md) - rewritten to mark Phase 16A.1 (read-only Butler API foundation) as the next active phase; the 16A audit and the 16A.0 architecture freeze recorded under "Just completed".
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) - `BUTLER_WEBHOOK_SECRET` added as a reserved, **not-yet-consumed** server-only secret. Sensitive when wired; explicit guidance against `NEXT_PUBLIC_*` exposure; not yet required in any environment.
- [/.env.example](../../.env.example) - placeholder `BUTLER_WEBHOOK_SECRET=replace_with_butler_webhook_secret` added with a comment pointing at this entry and confirming "not yet consumed".
- **No code, no schema, no API routes touched.** This commit is documentation only. The first code consumer of `BUTLER_WEBHOOK_SECRET` lands in Phase 16A.1.

**Reversible?:** yes - easy. To reverse: drop the `BUTLER_WEBHOOK_SECRET` line from `.env.example` and `ENVIRONMENT_MAP.md`, rewrite `CURRENT_PHASE.md` to a different next-phase, and add a superseding entry here. Do not delete this entry; supersede it.

**Supersedes:** does not supersede a prior decision. Establishes the Phase 16A architecture baseline that Phase 16A.1+ must respect.

---

## 2026-05-09 - `RESEND_FROM_EMAIL` removed from env contract; from-address stays hardcoded

**Decision:** `RESEND_FROM_EMAIL` is no longer part of the Oraya env contract. It has been removed from [/.env.example](../../.env.example) and removed from the active inventory in [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md). The Resend `from:` value remains hardcoded as `Oraya Reservations <bookings@stayoraya.com>` (the `FROM_EMAIL` constant in each `lib/send-*-email.ts`) for the foreseeable future.

**Reason:** the variable was reserved but consumed by zero code paths (KNOWN_BUGS.md #1). Leaving it in `.env.example` and the audit doc created false expectations: an operator setting it in Vercel would see no effect, silently, with no log line to indicate the setting was inert. Removing the variable from the contract makes the current behavior - a hardcoded sender - the documented behavior, and removes a footgun. A configurable sender is fine to add later, but only as an explicit, approved implementation task that wires `process.env.RESEND_FROM_EMAIL` into each `lib/send-*-email.ts` and reintroduces the variable in `.env.example` and the env map at the same time. This commit performs none of that wiring.

**Impact:**

- [/.env.example](../../.env.example) - `RESEND_FROM_EMAIL=...` line plus its two preceding comment lines removed; replaced with a short comment that points readers at this decision entry.
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) - row removed from the at-a-glance inventory table; per-variable section replaced with a "removed by decision" notice; Vercel checklist note about non-sensitive variables updated; "expected gap" and "known gap" follow-up bullets removed.
- [KNOWN_BUGS.md](KNOWN_BUGS.md) - entry #1 flipped to `closed (resolved 2026-05-09)` with a pointer to this entry. Numbering preserved so the other open bugs keep their IDs.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) - open-issues bullet removed, "Just completed" bullet added, "Next recommended steps" item renumbered.
- **No code changed.** No `lib/send-*-email.ts` file was modified in this commit. Email send behavior is identical before and after.
- The historical reference in the 2026-05-09 "Environment audit baseline" entry below ("including `RESEND_FROM_EMAIL` reserved-but-unused") is preserved as-is per the append-only rule of this log - it accurately describes what the audit found at that moment.
- A stale informational mention remains in [/README.md](../../README.md) ("currently hardcoded... unless you later wire `RESEND_FROM_EMAIL`"). It is still factually accurate (current state: hardcoded; future state: would require wiring) and was outside the explicit scope of the cleanup task. It can be tightened in a future README pass.

**Reversible?:** yes - easy. To reintroduce, perform the wiring work in `lib/send-*-email.ts` and re-add the variable to `.env.example` and `ENVIRONMENT_MAP.md` in the same PR. Do not re-add the variable without the wiring; that would re-create the original footgun.

**Supersedes:** does not supersede a prior decision; resolves [KNOWN_BUGS.md](KNOWN_BUGS.md) entry #1.

---

## 2026-05-09 - `/docs/system/` is the AI source of truth

**Decision:** all AI-facing project documentation lives in [`/docs/system/`](.) as version-controlled Markdown. ChatGPT chat memory and side-channel notes are no longer authoritative. New AI sessions read this directory first.

**Reason:** chat threads are ephemeral, drift across providers (ChatGPT / Claude Code / Codex / Cursor), and have no diff history. Repo-tracked docs are durable, reviewable, and reachable from every agent. Long ChatGPT conversations were starting to disagree with the actual repo state.

**Impact:**

- Created `/docs/system/{PROJECT_STATE,CURRENT_PHASE,AGENT_RULES,ARCHITECTURE,DECISIONS_LOG,KNOWN_BUGS,AGENT_HANDOFF_TEMPLATE,CHATGPT_PROJECT_INSTRUCTIONS}.md`. (`ENVIRONMENT_MAP.md` already created in the prior commit.)
- Existing root-level docs ([/PROJECT_STATE.md](../../PROJECT_STATE.md), [/AGENTS.md](../../AGENTS.md), [/CLAUDE.md](../../CLAUDE.md), [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md), [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md)) are kept intact and remain valid where they don't conflict with `/docs/system/`. The new `/docs/system/PROJECT_STATE.md` is the authoritative summary; the root `/PROJECT_STATE.md` is the historical detail log.
- Every PR that changes behavior described in a `/docs/system/` file must update that file in the same PR (see [AGENT_RULES.md](AGENT_RULES.md) rule 11).
- ChatGPT Project Instructions field will be populated from [CHATGPT_PROJECT_INSTRUCTIONS.md](CHATGPT_PROJECT_INSTRUCTIONS.md) so every new chat starts with the same orientation.

**Reversible?:** yes - but reverting means losing the cross-agent consistency benefit; not recommended.

---

## 2026-05-09 - `.gitignore` explicitly protects all `.env*` variants

**Decision:** `.gitignore` lists every Next.js env-file variant by name (`.env`, `.env.local`, `.env.development`, `.env.development.local`, `.env.production`, `.env.production.local`, `.env.test`, `.env.test.local`) instead of relying solely on `.env*.local` glob.

**Reason:** the previous pattern `.env*.local` matched `.env.production.local` but **not** `.env.production`. Anyone saving a prod env snapshot under that name would have committed it. The hole is closed and made obvious by listing every variant.

**Impact:**

- [/.gitignore](../../.gitignore) updated.
- `.env.example` (placeholders only) remains the single tracked env file.
- Verified with `git check-ignore -v` against all variants.

**Reversible?:** yes, but no reason to.

---

## 2026-05-09 - `.env.example` uses explicit `replace_with_*` placeholders

**Decision:** `.env.example` switched from empty values (`KEY=`) to explicit placeholder values (`KEY=replace_with_<thing>`) plus per-variable "where to get it" comments. Cross-links to [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).

**Reason:** empty values are easy to overlook and easy to commit unfilled. A literal `replace_with_*` placeholder both documents intent and fails loudly in tooling that validates env var format. The "where to get it" notes shorten onboarding from minutes-of-grep to one read.

**Impact:** [/.env.example](../../.env.example) updated. Local devs and Vercel admins now see the source for each value inline.

**Reversible?:** yes.

---

## 2026-05-09 - Environment audit baseline

**Decision:** [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) is the single source of truth for every `process.env.*` read in the repo. Re-audited on every release that touches API routes, lib helpers, or `vercel.json`.

**Reason:** secrets sprawl across `.env.example`, README, AGENTS.md, CLAUDE.md, and ad-hoc Vercel notes had drifted. One canonical map removes guesswork around scope, risk, and rotation.

**Impact:**

- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) created (10 variables documented, including `RESEND_FROM_EMAIL` reserved-but-unused and `NODE_ENV` system-managed).
- Three open issues surfaced and now tracked in [KNOWN_BUGS.md](KNOWN_BUGS.md).

**Reversible?:** no - once the audit baseline exists, future agents are expected to keep it current.

---

<!-- New entries go above this line, newest first. Old entries never deleted. -->
