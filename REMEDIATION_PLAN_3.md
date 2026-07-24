# Oraya-Web Plan 3 — post-remediation work queue (2026-07-24)

**For the agent executing this plan:** REMEDIATION_PLAN.md and REMEDIATION_PLAN_2.md are COMPLETE and merged (PRs #85–#88) — do not redo anything in them. This file is the single source of truth for the remaining work. Work through phases IN ORDER. Check each box with the commit hash when done; mark anything impossible as BLOCKED with a reason and continue. Copy this file into the repo root on your first branch so progress survives across sessions.

## Rules of engagement

- Each phase gets its OWN branch off latest `master` and its OWN PR. Never push to master; land via PR. If the environment forces a `claude/...` branch name, use it and note it here.
- **Verification gate after every item:** `npx tsc --noEmit` clean, `npm run build` passes, `npm test` fully green (current baseline: **264 passing — never go below**; add tests where the item says so), `npm run lint` clean apart from pre-existing `no-img-element` warnings.
- Respect repo governance (`CLAUDE.md`, `AGENTS.md`, `docs/system/*`): locked surfaces stay locked; update `DECISIONS_LOG.md` (dated entry per phase) and `KNOWN_BUGS.md` where relevant. NOTE: the CLAUDE.md "auto-backup push to master" snippet is legacy advice (KNOWN_BUGS #5) — never follow it.
- Schema changes ship as additive human-run SQL files in `sql/` (repo convention, with commented preflight queries). Code must tolerate the pre-migration state.
- Multiple phases touch `DECISIONS_LOG.md`/`KNOWN_BUGS.md`; if PRs merge out of order, resolve those add/add conflicts by keeping the union of entries.
- `npm install` needs `PUPPETEER_SKIP_DOWNLOAD=true` in restricted networks.

---

## Phase 1 — Bookkeeping: close out the completed human actions (doc-only, 1 commit)

All four outstanding human actions were completed and verified by David on 2026-07-24. Record them:

- [ ] 1.1 In `REMEDIATION_PLAN.md` (Human actions): check the "Rotate the production admin password + store new hash" box and the "Run new SQL files in `sql/` against Supabase" box — annotate each "Done 2026-07-24 (David)". Also check the 5.2/5.5 "(Recommended) Schedule Preview-verified PRs" box — annotate "Done: shipped as Remediation 2 Phase B (PR #88, merged 2026-07-24; visually verified)".
- [ ] 1.2 In `REMEDIATION_PLAN_2.md` (Human actions): check the `ADMIN_RECOVERY_EMAIL` box — annotate "Done 2026-07-24 (David); Forgot password? verified working end-to-end" — and the "Visually check the Vercel Preview pages" box — annotate "Done 2026-07-24 (David); pages verified after PR #88 merged". No other changes in this phase.

## Phase 2 — Branch cleanup (no code changes)

- [ ] 2.1 Run the exact `git push origin --delete` command block from `REMEDIATION_PLAN.md` §6.1 Human actions (26 branches, all verified merged into master on 2026-07-23). Before deleting each branch, re-verify with `git merge-base --is-ancestor origin/<branch> origin/master`; skip and list any that fail the check. Do NOT touch the 29 unmerged stale branches — output their list in the PR/summary for David's separate judgment.
- [ ] 2.2 Check the §6.1 human-action box in `REMEDIATION_PLAN.md` with the date and the count actually deleted (this edit can ride in the Phase 1 branch if Phase 1 hasn't merged yet; otherwise its own trivial PR).

## Phase 3 — KNOWN_BUGS #14: durable idempotency for Unified Checkout completion (CRITICAL — the production-payments blocker)

Spec source: `docs/system/KNOWN_BUGS.md` #14. The defect, verified in code (`app/api/payments/unified-checkout-complete/route.ts`):

1. The route reads the booking, checks `payment_link_status === "active"`, then calls `authorizeCreditLibanaisTransientToken(...)` with NO claim taken between the read and the provider call — two concurrent requests can both charge (double charge).
2. The post-approval conditional update (`.eq("payment_link_status","active").eq("payment_provider_session_id", ...)`) never checks matched-row count — the concurrent loser matches zero rows and the route STILL returns `{ ok: true, paid: true }`.
3. No durable payment-attempt record and no stable provider idempotency identifier, so a retry-after-timeout can charge twice with no reconciliation trail.
4. Related orphan-session risk in `app/api/payments/unified-checkout-session/` (post-provider conditional update also unchecked).

Prior art to follow: `lib/payments/webhook-set-paid.ts` (remediation 1.6) — NULL-safe not-paid filter + matched-row checks; mirror its discipline and `node:test` style.

- [ ] 3.1 **Payment-attempts table** — new SQL file in `sql/` (with commented preflight): `payment_attempts(id uuid pk, booking_id uuid not null, provider_session_id text not null, idempotency_key text not null, status text not null default 'claimed' /* claimed|authorized|recorded|failed|ambiguous */, provider_request_id text, provider_transaction_id text, provider_reference text, amount numeric not null, currency text not null, created_at, updated_at)` + a partial unique index enforcing at most ONE in-flight attempt per booking: `unique (booking_id) where status in ('claimed','authorized','ambiguous')`. Code must tolerate the table not existing yet by failing closed (checkout completion refuses with a clear 503, never falls back to the unguarded path).
- [ ] 3.2 **Atomic claim before the provider call**: insert the attempt row FIRST; unique-violation ⇒ another attempt is in flight ⇒ return 409 "payment already being processed" WITHOUT touching the provider.
- [ ] 3.3 **Stable idempotency key**: derive a deterministic merchant reference from the attempt id; send it to CyberSource via `lib/payments/credit-libanais.ts` (`clientReferenceInformation.code` at minimum); persist returned provider request/transaction ids onto the attempt row immediately after the call.
- [ ] 3.4 **Row-count-verified writes**: every conditional booking update must `.select("id")` and verify exactly 1 row matched. Zero rows after an approved charge ⇒ mark the attempt `ambiguous`, log loudly, return an explicit "payment received, reconciliation required" error state — NEVER `ok: true` on a zero-row update.
- [ ] 3.5 **Terminal states**: `recorded` on success; `failed` on decline (release the claim so the guest can retry); `ambiguous` on timeout/unknown outcome — an `ambiguous` attempt BLOCKS new attempts for that booking until reconciled (document the manual admin reconciliation steps; do not auto-release).
- [ ] 3.6 **Session route**: apply the same row-count verification to the unified-checkout-session post-provider update; clean up or supersede orphaned sessions explicitly.
- [ ] 3.7 **Tests** (pure logic in `lib/payments/` with `node:test`, fake provider injected): concurrent double-completion ⇒ second claim conflicts ⇒ 409 and provider called exactly once; zero-row update after approval ⇒ `ambiguous`, response NOT success; retry after `failed` succeeds with a NEW attempt row; retry while `ambiguous` exists ⇒ blocked; idempotency-key determinism per attempt.
- [ ] 3.8 Update `KNOWN_BUGS.md` #14 (status + date + PR), dated `DECISIONS_LOG.md` entry. PR body MUST state: David runs the new `sql/` file in Supabase BEFORE merging. Do NOT enable production checkout in this PR — that remains a separate explicit decision after #15 (provider-side refunds) is assessed.

## Phase 4 — Email observability (KNOWN_BUGS #2, quick win)

A missing/rotated `RESEND_API_KEY` currently means bookings land with zero confirmation emails and no alarm.

- [ ] 4.1 Add `GET /api/health`: returns 200 with `{ ok: true }` when required production config is present; 503 listing missing keys (names only, never values) when not — check at minimum `RESEND_API_KEY`, `ADMIN_SECRET`, `ADMIN_RECOVERY_EMAIL`, Supabase URL/keys. No auth needed but response must leak nothing sensitive.
- [ ] 4.2 In each `lib/send-*-email.ts`, when the key is missing in production, upgrade the silent `console.warn` to a structured `console.error` line with a stable grep-able tag (e.g. `[email-config-missing]`).
- [ ] 4.3 Tests for the health decision logic (pure function). Update `KNOWN_BUGS.md` #2 and `DECISIONS_LOG.md`. Note in the PR body: David can point an uptime monitor (e.g. Vercel checks / UptimeRobot) at `/api/health` — listed as an optional human action.

## Phase 5 — Next 16 + React 19 upgrade (breaking; LAST because everything above should land on the stable stack first)

Resolves all 5 remaining high `npm audit` findings (all inside `next@14.2.35`) plus the `glob` advisory in `eslint-config-next`.

- [ ] 5.1 On a fresh branch: upgrade `next` + `eslint-config-next` to 16.x, `react`/`react-dom` to 19, `@types/react`/`@types/react-dom` to 19; run the official codemods (`npx @next/codemod@latest upgrade`) and fix all breaking changes (async request APIs, config changes, ESLint flat-config if required). Keep `next.config.mjs` behavior identical (images.remotePatterns derivation, unoptimized fallback).
- [ ] 5.2 Full verification gate + `npm audit` re-run recorded in the PR body (expect 0 high). Manually list in the PR body the pages David should eyeball on the Vercel Preview before merging (homepage, /book flow, both villa pages, admin dashboard + Bookings tab, booking view page, events inquiry).
- [ ] 5.3 Update `REMEDIATION_PLAN.md`'s "Schedule the Next 15+/React 19 upgrade" human-action box (done, PR #), `DECISIONS_LOG.md` entry.

## Explicitly OUT of scope (do not touch)

- Enabling production checkout (separate decision after Phase 3 + KNOWN_BUGS #15 assessment).
- KNOWN_BUGS #15 (provider-side refund execution) — needs its own design conversation.
- The 29 unmerged stale branches (David's judgment).
- Large page refactors (`app/book/page.tsx`, `app/events/inquiry/page.tsx`, `ExpandedBookingDetails.tsx`) — later, using the Phase B extraction pattern.

## Human actions (agent appends; David executes)

- [ ] Phase 3: run the new `sql/payment_attempts` file in the Supabase SQL editor BEFORE merging the Phase 3 PR.
- [ ] Phase 5: eyeball the Vercel Preview page list in the Phase 5 PR body before merging.
- [ ] Optional (Phase 4): point an uptime monitor at `/api/health`.
- [ ] Merge each phase's PR when CI is green (Phases 1–2 are safe to merge immediately; 3 after the SQL; 5 after the visual check).
