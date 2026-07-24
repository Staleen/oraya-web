# Oraya-Web Plan 4 — Production payment go-live readiness (2026-07-24)

**For the agent executing this plan:** Plans 1–3 are COMPLETE and merged (PRs #85–#93) — do not redo anything. The payment-attempts idempotency ledger (KNOWN_BUGS #14 fix) is live on master and the `payment_attempts` table exists in Supabase. This plan makes the code side of production card payments 100% ready, so that when NetCommerce/Credit Libanais delivers the production configuration, going live is only: enter env values in Vercel → run the go-live checklist → flip one admin switch. Copy this file into the repo root on your branch.

**Standing rule: ONE branch, ONE PR for this whole plan.** Branch off latest master; never push to master; land via a single PR. Resolve any doc-file conflicts by keeping the union of checked boxes.

**Decision baked into this plan (David, 2026-07-24): refunds are MANUAL-FIRST.** Refunds are executed by hand in the NetCommerce Business Center; the admin UI must record and reflect that honestly. Automated provider-side refunds are a separate later plan — do not build them here.

## Rules of engagement

- Verification gate after every phase: `npx tsc --noEmit` clean, `npm run build` passes, `npm test` fully green (baseline: current master count — never go below; add tests where items say so), `npm run lint` clean apart from pre-existing `no-img-element` warnings.
- Respect repo governance (`CLAUDE.md`, `AGENTS.md`, `docs/system/*`). Update `DECISIONS_LOG.md` (dated entry per phase) and `KNOWN_BUGS.md` (#15 and the production-gate items). The CLAUDE.md "push to master" snippet is legacy — PR only.
- Everything must FAIL CLOSED: missing config, missing settings row, or unverifiable webhook ⇒ checkout refuses safely. No path may default to live.
- Schema changes (if any) ship as additive human-run SQL in `sql/` with commented preflight; code tolerates the pre-migration state.
- `npm install` needs `PUPPETEER_SKIP_DOWNLOAD=true` in restricted networks.

---

## Phase 1 — Honest manual refunds (KNOWN_BUGS #15, manual-first resolution)

- [x] 1.1 (`029eead`) Rename/relabel the admin "Issue refund" action to reflect reality: it RECORDS a refund that the admin has executed manually in the NetCommerce Business Center. UI copy must say so explicitly (e.g. "Record manual refund — execute the refund in the NetCommerce Business Center first"). Require a provider reference field (the Business Center refund/transaction id) before the record is accepted; store it with the refund record.
- [x] 1.2 (`029eead`) Add a short admin-facing runbook `docs/system/REFUND_RUNBOOK.md`: step-by-step manual refund in the Business Center (find transaction by `payment_reference` / `idempotency_key`), then record it in the admin UI; include the `payment_attempts` ambiguous-reconciliation steps already documented in `sql/plan3-payment-attempts.sql` so both money-back paths live in one doc.
- [x] 1.3 (`029eead`) Update `KNOWN_BUGS.md` #15: status → resolved-by-policy (manual refunds, honest UI, runbook), with a pointer to a future "automated refunds" plan as the upgrade path. Tests for the new validation (refund record without provider reference ⇒ 400).

## Phase 2 — Webhook / MLE reconciliation (the first half of the production-gate message)

The production gate says: "disabled until webhook/MLE reconciliation and live rollout controls are implemented and approved". This phase implements the reconciliation half.

- [x] 2.1 (`6fbedc9`) Make verified webhooks authoritative for payment outcomes: on a verified CyberSource webhook for a known `payment_attempts` row (match by `idempotency_key` = clientReferenceInformation.code, or provider transaction id), transition the attempt — `claimed`/`authorized`/`ambiguous` + webhook-confirmed success ⇒ record the payment on the booking through the EXISTING idempotent path (`lib/payments/webhook-set-paid.ts` discipline: NULL-safe filters + matched-row checks) and mark the attempt `recorded`; webhook-confirmed decline/void ⇒ mark `failed` (releasing the claim). This auto-resolves most `ambiguous` states without human reconciliation.
- [x] 2.2 (`6fbedc9`) Webhook signature/MLE verification must fail closed: unverifiable payload ⇒ 401/ignore + structured log line, never a state change. If MLE env vars are unset, the webhook endpoint refuses (503) rather than processing unverified events. Cover with tests (fake signed/unsigned payloads).
- [x] 2.3 (`6fbedc9`) Reconciliation visibility: extend `/api/health` (from Plan 3 Phase 4) to also report, for admins, the count of `payment_attempts` rows stuck in `ambiguous`/`claimed` older than 1 hour (names/counts only, no amounts or guest data). Optional small admin dashboard tile if trivially cheap; otherwise health-endpoint only. *(Health-endpoint only — the admin readiness panel already surfaces gate state; a dashboard tile was not trivially cheap.)*

## Phase 3 — Live rollout controls (the second half of the production-gate message)

- [x] 3.1 (`561fb1c`) Replace the hardcoded sandbox-only gate in `lib/payments/credit-libanais.ts` (`checkoutReady = configured && environment === "sandbox"`) with an explicit, fail-closed rollout switch: checkout is ready when (a) all session env config present, (b) `NETCOMMERCE_CYBERSOURCE_ENVIRONMENT` is `sandbox`, OR (c) environment is `production` AND all webhook/MLE env vars are present AND a server-side settings row `payments_live_enabled` = `"true"` exists. Missing row, any other value, or unreadable settings ⇒ NOT ready (same message as today). The settings row is the kill switch: flipping it to anything else instantly disables live checkout without a deploy.
- [x] 3.2 (`561fb1c`) Admin Settings UI: a "Live card payments" toggle wired to that settings row, admin-session-gated like the password change flow, with stark copy (enabling charges real cards; disabling stops new checkouts immediately but does not affect payments already made). The generic settings POST must shield this key the same way it shields `admin_password` (only the dedicated, confirmed toggle can change it). *(Enabling additionally requires the current admin password with the shared login throttle; disabling is session-only so the kill switch is never slowed down.)*
- [x] 3.3 (`561fb1c`) Readiness surface: admin payments panel (or Settings) shows the CURRENT readiness verdict with the exact missing items (reuse `getCreditLibanaisReadiness().missing_requirements`) so David can see at a glance what's still absent while waiting for NetCommerce. Tests: every gate combination (missing env, sandbox, production w/o toggle, production + toggle, unreadable settings) ⇒ expected ready/not-ready.

## Phase 4 — Closeout

- [x] 4.1 (`561fb1c` gate message; `325e031` docs) Update the production-gate message so it reflects the new contract (what exactly is missing, instead of the blanket "remains disabled" text). `DECISIONS_LOG.md` entries for Phases 1–3; `KNOWN_BUGS.md` #14 note extended (webhook reconciliation now closes the ambiguous-outcome loop) and #15 resolved per Phase 1. Full gate green. *(Gate after every phase: tsc clean, tests 291→313→322 all green, build passing, lint 0 errors / 37 pre-existing no-img-element warnings.)*
- [x] 4.2 (`325e031`) PR body: the single GO-LIVE CHECKLIST below, updated with anything learned during implementation.

## GO-LIVE CHECKLIST (David executes when NetCommerce delivers — the PR body must carry the final version)

Waiting on NetCommerce/Credit Libanais to provide (ask for exactly these if not already promised):
- [ ] Production Merchant ID
- [ ] Production API Key ID + Shared Secret (HTTP Signature auth)
- [ ] Production API base URL
- [ ] Webhook/MLE credentials: MLE Key ID, MLE private key, MLE certificate ID — and confirmation of the webhook endpoint URL they will deliver events to (`https://www.stayoraya.com/api/payments/webhook/credit_libanais`)
- [ ] The exact webhook signature scheme for deliveries (we verify `v-c-signature` = Base64 HMAC-SHA256 of the raw body keyed with the Base64-decoded MLE private key, plus `v-c-key-id`; if their delivered spec differs, `lib/payments/credit-libanais-webhook.ts` is the single module to adapt)
- [ ] Confirmation of supported currency (USD) and any 3-D Secure requirements

Then, in order:
- [ ] Run `sql/plan4-refund-provider-reference.sql` in the Supabase SQL editor (additive; refund records tolerate its absence but should not go live without it).
- [ ] Enter all `NETCOMMERCE_CYBERSOURCE_*` production values in Vercel (Production env only), set `NETCOMMERCE_CYBERSOURCE_ENVIRONMENT=production`, redeploy.
- [ ] Check the admin readiness panel (Admin → Settings → Payments → Gateway readiness): it must say "Zero missing requirements" except the Live-rollout-switch-is-OFF line.
- [ ] Keep `payments_live_enabled` OFF; verify guest checkout still refuses (fail-closed proof).
- [ ] Flip the admin "Live card payments" toggle ON (Admin → Settings → Payments → Live card payments; requires your admin password).
- [ ] Make ONE real test booking with a real card (small amount). Verify: charge appears in Business Center; booking shows paid; `payment_attempts` row `recorded`; confirmation email received.
- [ ] Refund that test charge manually in the Business Center; record it via the admin "Record manual refund" flow per `docs/system/REFUND_RUNBOOK.md` (the Business Center refund reference is required).
- [ ] Watch `/api/health` for 24h — `payment_attempts.stuck_claimed` and `.stuck_ambiguous` should stay 0. Kill switch = flip the toggle OFF (instant, no deploy).

## Explicitly OUT of scope

- Automated provider-side refunds (separate later plan).
- Any change to booking/pricing/email logic beyond what the phases above require.
