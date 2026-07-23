# Oraya-Web Remediation Plan — from the 2026-07-23 health check

**For the agent executing this plan:** work through every phase in order and do not stop until every checkbox is checked or explicitly marked BLOCKED with a reason. This file is the single source of truth for progress — after finishing each item, edit this file to check its box and add a one-line note (commit hash). If your session ends, the next session resumes by reading this file.

## Rules of engagement

- Work on a branch: `remediation/health-check-2026-07-23`. One commit per item (or per tightly-related pair), message format: `Remediation N: <short title>`.
- **Verification gate after every item:** `npx tsc --noEmit` clean, `npm run build` passes, and ALL test suites pass (baseline is 168 passing across 11 `node:test` suites — never go below; most items should add tests). Run suites with `node --test <file>` per the repo convention.
- **Respect the repo's own governance.** Read `CLAUDE.md`, `AGENTS.md`, and `docs/system/CURRENT_PHASE.md` before starting. Locked surfaces (booking pipeline, token helpers, email senders, WhatChimp artifacts) must not change behavior beyond what an item explicitly requires. Update `docs/system/DECISIONS_LOG.md` (dated entry per phase) and `docs/system/KNOWN_BUGS.md` where relevant — this repo keeps docs in sync with code; keep that discipline.
- **Schema changes ship as additive human-run SQL files in `sql/`** (repo convention). Never assume a migration has been applied — code must tolerate the pre-migration state.
- Items requiring HUMAN action (Vercel env vars, running SQL in Supabase, rotating passwords, deleting remote branches) get everything prepared by the agent, then are listed in the "Human actions" section at the bottom with exact steps. Mark the item ✅ when the code side is done, and add the human step to that list.
- `npm install` needs `PUPPETEER_SKIP_DOWNLOAD=true` in restricted networks.

---

## Phase 0 — Setup & baseline

- [x] 0.1 Create branch off latest `master`. — done; note: remote execution environment mandates branch name `claude/remediation-health-check-2026-vesyus` (pushes to other names are denied), used in place of `remediation/health-check-2026-07-23`.
- [x] 0.2 `PUPPETEER_SKIP_DOWNLOAD=true npm install`; record baseline: `tsc --noEmit` clean, `npm run build` pass, 168/168 tests pass. — verified 2026-07-23 (node v22.22.2): tsc exit 0, build exit 0, 168/168 across 11 suites.

## Phase 1 — Security critical (report items 1, 2, 4, 3, 5, 6, 12)

- [ ] 1.1 **Remove hardcoded fallback admin password** (`app/api/admin/verify-password/route.ts:48`). Delete `?? "Oraya2026"`; if the stored credential is absent/unreadable, fail closed (503 `{ error: "admin_auth_unavailable" }`, log server-side). 
  - **DECISION (David): password storage approach** — see Question 1. Default if unanswered: keep the settings-table row but store a **scrypt hash** (Node `crypto.scrypt`, timing-safe compare), add a small `scripts/hash-admin-password.mjs` helper to generate the hash, and fail closed when the row is missing. Never store or compare plaintext.
  - Add `node:test` coverage: missing row → 503; wrong password → 401; correct password → session.
  - HUMAN follow-up: rotate the real admin password (the old one is public in git history forever) and update the stored hash.
- [ ] 1.2 **Rate-limit + lockout on `POST /api/admin/verify-password`**. Serverless-safe (in-memory maps don't survive cold starts): use a small Supabase table `admin_login_attempts` (additive SQL in `sql/`) — per-IP and global counters, e.g. max 5 failures / 15 min per IP → 429, constant ~500ms sleep on every failure. Fail closed if the attempts table is unreachable. Tests for the throttle logic (pure function + route behavior).
- [ ] 1.3 **Cap stay length + reject past check-ins on `POST /api/bookings`** (route boundary, before the pricing engine): max 60 nights (constant, easy to change), `check_in` not in the past (allow today), clear 400 messages. Same cap on the member modification route. Tests.
- [ ] 1.4 **Double-booking race — DB backstop + row-count-checked writes.**
  - Ship `sql/remediation-booking-overlap-constraint.sql`: `CREATE EXTENSION IF NOT EXISTS btree_gist;` + `EXCLUDE USING gist` on `(villa WITH =, daterange(check_in, check_out) WITH &&) WHERE (status = 'confirmed')` — additive, human-run. Verify first that historical data has no confirmed overlaps (write a check query into the SQL file as a commented preflight).
  - Code must handle the constraint-violation error from any confirm write and return the existing "dates no longer available" style response (booking stays pending) — in `/api/bookings`, `/api/booking-action`, and the admin confirm path.
  - `/api/booking-action/route.ts` (~L62): add `.select("id")` to the status update and treat 0 matched rows as `already_processed` — do NOT burn the token or send email in that case.
- [ ] 1.5 **Fail-open availability calendar (client)**: `app/book/page.tsx` ~1398 and `app/events/inquiry/page.tsx` ~888 — on availability fetch failure, set an error state that disables date selection and shows "We couldn't load availability — please retry", with a retry action. Add the missing `cancelled` guard to the events-page effect (villa-toggle race).
- [ ] 1.6 **Webhook `set_paid` double-count** (`lib/payments/webhook-handler.ts` ~L104): make the paid-update conditional (`.neq("payment_link_status", "paid")` or equivalent guard matching the idempotency contract), check matched-row count, and treat 0 rows as already-processed (no re-add of `amount_paid`). Add `node:test` coverage for duplicate-delivery and different-reference-same-session cases. Note in KNOWN_BUGS that this is distinct from #14.
- [ ] 1.7 **CyberSource: verify authorized amount + currency** (`lib/payments/credit-libanais.ts` ~L380): compare `orderInformation.amountDetails` in the response against the requested charge before recording `amount_paid`; mismatch → treat as failed, log, do not record payment. Test with a mocked response.

## Phase 2 — Hardening & correctness (items 8, 9, 10, 18)

- [ ] 2.1 **Member booking modification** (`app/api/bookings/[id]/route.ts`): replace the raw overlap query (L76–92) with `findAvailabilityConflict`; re-run the pricing audit when dates change (reuse the same pricing/snapshot path `/api/bookings` POST uses) or, if repricing is out of scope for the locked pipeline, reject date changes that would change price with a clear message — pick whichever `docs/system` conventions allow; guest-count validation → `Number.isInteger(n) && n >= 1`.
- [ ] 2.2 **Timeouts on outbound fetches**: `AbortSignal.timeout(10_000)` + response-size cap + scheme check (https only) in `lib/calendar/sync.ts:38`; timeouts on Stripe and CyberSource fetch calls. Copy the existing pattern from `lib/whatsapp/confirmed-stay-notification.ts:275`.
- [ ] 2.3 **Stop echoing raw DB errors on public routes** (six call sites: `bookings` POST, `media`, `addons`, `bookings/availability`, `butler/availability` GET, `pricing`): log server-side, return generic messages — match the butler-POST discipline.
- [ ] 2.4 **Quick-win sweep** (one commit each or grouped sensibly):
  - `admin/media` PATCH: inspect per-row errors from `Promise.all`, return failure if any failed; validate `display_order` type; validate `villa` against `ALLOWED_VILLAS` in POST.
  - `/api/profile` PATCH: validate/cap `full_name`, `phone`, `country`, `address` (string type + length caps, reuse the pattern in `lib/butler/leads.ts`); generic errors.
  - `AdminDataProvider.tsx` ~L116: gate the raw-payload `console.log` behind `NODE_ENV !== "production"`.
  - `app/profile/page.tsx` mount effect: add `.catch` that clears the loading state into an error state; check `error` on each Supabase query; parallelize the independent fetches.
  - `BookingsTable.tsx` `confirmSendFeedbackEmail` (~1063): add proper catch (copy `patchBookingRecord`'s pattern).
  - Extract `checkOutExpiryUnix` into one shared helper in `lib/` (3 copies exist, one divergent — reconcile deliberately and note which behavior wins); extract the duplicated `getChargeAmount` and member→recipient resolution into `lib/` helpers.
  - `/api/settings` GET: use `.maybeSingle()`, check `error` before reading `data`, don't mask DB failures as "absent" for payment-relevant keys.
  - Admin routes `admin/bookings/[id]` and `approve-addon`: replace local `makeAdminClient()` with the shared `supabaseAdmin` (Data-Cache workaround).
  - `approve-addon`: guard the snapshot write against concurrent modification (conditional update on `updated_at` or re-read-verify), reject on conflict.

## Phase 3 — CI & test coverage (items 7, 11)

- [ ] 3.1 **`.github/workflows/ci.yml`**: on PR + push to master — `npm ci` (with `PUPPETEER_SKIP_DOWNLOAD=true`), `npx tsc --noEmit`, `npm run lint`, and every `node --test` suite (glob `lib/**/*.test.mts scripts/*.test.mjs`). Note: `next build` in CI needs Google Fonts network access — include it; if the runner blocks it, document the fallback. Add a `test` script to `package.json` so CI and humans run the same command.
- [ ] 3.2 **Tests for money/token-critical libs** (pure-function first): `lib/booking-action-token.ts` + `lib/butler/prefill-token.ts` (expiry, tamper, wrong-purpose), `lib/payments/checkout-amount.ts` (deposit math edges), `lib/calendar/availability.ts` (overlap semantics incl. event expansion), `lib/pricing/engine.ts` (night iteration, boundary dates), `lib/payments/webhook-handler.ts` (with 1.6's cases), `lib/money.ts`. Target: meaningful edge cases, not line coverage.

## Phase 4 — Dependencies (report §4)

- [ ] 4.1 `npm audit fix` (resolves `ws`); bump minors: `resend` → 6.18.x, `@supabase/supabase-js` → 2.110.x, `autoprefixer`, `postcss`. Full verification gate after.
- [ ] 4.2 Add `PUPPETEER_SKIP_DOWNLOAD=true` guidance (`.npmrc` comment or README note) — or move `puppeteer` to `optionalDependencies` if the screenshot watcher tolerates it.
- [ ] 4.3 **Next 15 + React 19 upgrade — DECISION (David): in this run or a separate scoped task?** See Question 3. Default: SEPARATE task (it's a major with real migration surface: async request APIs, caching-default changes). If included: own sub-branch, follow the official codemod, full manual pass over `/book`, `/booking/view/[token]`, admin, and payment flows afterward.

## Phase 5 — Refactors & polish (items 13, 14, 15, 16)

Order matters: helpers first (mechanical), then components. NO behavior changes in this phase — refactor commits must be behavior-preserving; verify with build + tests + targeted manual smoke of `/book` and the admin table after each step.

- [ ] 5.1 `BookingsTable.tsx` step 1: extract the ~60 pure helpers (lines 95–978) to `components/admin/bookings/helpers.ts` (or `lib/`); point `DashboardOperationsView` at them (deletes its duplicates); unify the duplicated approve-addon action.
- [ ] 5.2 `BookingsTable.tsx` step 2: extract render sections (`renderExpandedBookingDetails`, `renderPaymentSection`, `renderEventProposalSection`, `renderAddonRows`, `renderCompactRow`, feedback modal) into memoized child components keyed on `booking` + their own draft slice, so keystrokes re-render one card. Pause the 45s poll while a payment edit is in flight; skip `setBookings` when payload is deep-equal.
- [ ] 5.3 `app/book/page.tsx`: extract butler-prefill hydration, addon pricing engine, and calendar validity rules into pure modules (removing the `exhaustive-deps` suppressions); same for the events-page suppression.
- [ ] 5.4 Shared modules: `lib/guest-format.ts` (fmtDate, nightCount, formatUsd, toISO, friendlyError), `lib/guest-validation.ts`, promote `components/admin/theme.ts` to a shared theme import (repo-wide swap of the 112 local re-declarations — mechanical, do with search/replace + build check).
- [ ] 5.5 Marketing pages: convert `/` and `/villas/*` to server components with `metadata` exports and server-fetched covers, small client islands for auth/nav (model: `/booking/view/[token]`); merge the two villa pages into one `VillaPage({ villa })` template (pattern already exists in explore pages); convert hero/cover `<img>` on marketing + house-book pages to `next/image` (admin thumbnails may stay).
- [ ] 5.6 Accessibility: `htmlFor`/`id` association sweep on `/book`, `/events/inquiry`, `/profile`, `/join`; shared `<ConfirmDialog>` with Escape, initial focus, and focus trap for the admin dialogs; static fallback image per villa when cover fetch fails.

## Phase 6 — Cleanup & closeout (item 17)

- [ ] 6.1 Branch cleanup: generate the list of the ~55 remote branches with no commits in 30+ days (`git for-each-ref --sort=-committerdate refs/remotes`), verify each is merged into master (or clearly superseded), output the exact `git push origin --delete ...` commands to the Human-actions list — do NOT delete without David's confirmation.
- [ ] 6.2 Final full verification: `tsc`, build, all suites, `npm audit` re-run; update `docs/system/DECISIONS_LOG.md` + `KNOWN_BUGS.md`; update this file so every box is checked; open PR(s) with a summary mapping commits → plan items.

## Human actions (agent appends here; David executes)

- [ ] Rotate the production admin password + store new hash (after 1.1).
- [ ] Run new SQL files in `sql/` against Supabase (after 1.2, 1.4) — preflight queries included in each file.
- [ ] Confirm/execute remote-branch deletions (after 6.1).
- [ ] (If 4.3 approved) schedule the Next 15 upgrade task.

## Open decisions for David

1. **Admin password storage**: (a) hash in server-only Vercel env var (rotation = Vercel dashboard + redeploy, nothing secret in DB) or (b) scrypt hash in the existing settings row (rotation possible via an admin UI later). Default: (b).
2. **Rate limiting backend**: Supabase attempts table (default, no new infra) vs Upstash/Vercel KV if you already have one.
3. **Next 15 + React 19**: inside this run, or separate scoped task? Default: separate.
4. **Member date-change repricing (2.1)**: automatically reprice on date change, or block date changes that alter the price? Default: reprice.
