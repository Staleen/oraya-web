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

- [x] 1.1 **Remove hardcoded fallback admin password** — done (default option (b): scrypt hash in settings row via `lib/admin-password.ts`, fail-closed 503 `admin_auth_unavailable`, `scripts/hash-admin-password.mjs` helper, 9 tests). Commit: `24c5185`. (`app/api/admin/verify-password/route.ts:48`). Delete `?? "Oraya2026"`; if the stored credential is absent/unreadable, fail closed (503 `{ error: "admin_auth_unavailable" }`, log server-side). 
  - **DECISION (David): password storage approach** — see Question 1. Default if unanswered: keep the settings-table row but store a **scrypt hash** (Node `crypto.scrypt`, timing-safe compare), add a small `scripts/hash-admin-password.mjs` helper to generate the hash, and fail closed when the row is missing. Never store or compare plaintext.
  - Add `node:test` coverage: missing row → 503; wrong password → 401; correct password → session.
  - HUMAN follow-up: rotate the real admin password (the old one is public in git history forever) and update the stored hash.
- [x] 1.2 **Rate-limit + lockout on `POST /api/admin/verify-password`** — done (`sql/remediation-admin-login-attempts.sql` + `lib/admin-login-throttle.ts`: 5 failures/15min per IP, 20 global, 429 + constant 500ms failure delay, fail-closed 503 when the table is unreachable — run the SQL before deploying). Commit: `4d47eff`. Serverless-safe (in-memory maps don't survive cold starts): use a small Supabase table `admin_login_attempts` (additive SQL in `sql/`) — per-IP and global counters, e.g. max 5 failures / 15 min per IP → 429, constant ~500ms sleep on every failure. Fail closed if the attempts table is unreachable. Tests for the throttle logic (pure function + route behavior).
- [x] 1.3 **Cap stay length + reject past check-ins on `POST /api/bookings`** — done (`lib/booking-date-rules.ts`: `MAX_STAY_NIGHTS=60`, past check-in rejected with today allowed (UTC), wired into `/api/bookings` POST before the pricing engine and the member PATCH; 5 tests). Commit: `499d8cc`.
- [x] 1.4 **Double-booking race — DB backstop + row-count-checked writes.** — done (`sql/remediation-booking-overlap-constraint.sql` with commented preflight; `lib/db-errors.ts` 23P01 mapping in `/api/bookings`, `/api/booking-action`, admin confirm; booking-action update now `.select("id")` and 0 rows → `already_processed` without burning the token or emailing). Commit: `f08980b`.
  - Ship `sql/remediation-booking-overlap-constraint.sql`: `CREATE EXTENSION IF NOT EXISTS btree_gist;` + `EXCLUDE USING gist` on `(villa WITH =, daterange(check_in, check_out) WITH &&) WHERE (status = 'confirmed')` — additive, human-run. Verify first that historical data has no confirmed overlaps (write a check query into the SQL file as a commented preflight).
  - Code must handle the constraint-violation error from any confirm write and return the existing "dates no longer available" style response (booking stays pending) — in `/api/bookings`, `/api/booking-action`, and the admin confirm path.
  - `/api/booking-action/route.ts` (~L62): add `.select("id")` to the status update and treat 0 matched rows as `already_processed` — do NOT burn the token or send email in that case.
- [x] 1.5 **Fail-open availability calendar (client)** — done: both pages now fail closed on availability fetch failure (non-OK responses also treated as failures) with an error panel replacing the calendar, "We couldn't load availability — please retry" + Retry button, and a `handleDateSelect` guard; events-page effect gained the missing `cancelled` guard. Commit: `a394ade`.
- [x] 1.6 **Webhook `set_paid` double-count** — done (`lib/payments/webhook-set-paid.ts` pure decision: any already-paid link is idempotent incl. different-reference-same-session; DB write guarded with NULL-safe not-paid filter + matched-row check, 0 rows → idempotent; 6 tests; KNOWN_BUGS #14 note added). Commit: `5acac99`.
- [x] 1.7 **CyberSource: verify authorized amount + currency** — done (`lib/payments/authorized-amount.ts`: authorizedAmount (fallback totalAmount) + currency must match the requested charge, missing/unparsable details fail closed; adapter flips `approved` to false and logs, so no payment is recorded; 6 mocked-response tests; DECISIONS_LOG Phase 1 entry added). Commit: `3e9d84b`.

## Phase 2 — Hardening & correctness (items 8, 9, 10, 18)

- [x] 2.1 **Member booking modification** — done: PATCH now uses `findAvailabilityConflict` (incl. event expansion + calendar blocks), date changes reprice via `lib/pricing/reprice.ts` (Question 4 default; mirrors the POST audit→bedroom-factor→snapshot→estimated_total path, 4 tests), and guest counts require integers (`sleeping_guests ≥ 1`, `day_visitors ≥ 0`). Commit: `5f5b9ce`.
- [x] 2.2 **Timeouts on outbound fetches** — done: calendar feed sync now enforces https-only, 10s `AbortSignal.timeout`, and a 5 MB response cap (header + body); Stripe checkout-session fetch got a 10s timeout, CyberSource authorization 15s and session creation 10s. Commit: `048a340`.
- [x] 2.3 **Stop echoing raw DB errors on public routes** — done: all six call sites now log server-side and return generic messages (butler availability uses the route's snake_case error vocabulary). Commit: see `Remediation 2.3`.
- [x] 2.4 **Quick-win sweep** — done, all nine sub-items in one commit:
  - ✅ `admin/media` PATCH validates id/display_order per row and returns 500 listing per-row failures; POST validates the villa slug via `resolveVillaFromSlug`.
  - ✅ `/api/profile` PATCH sanitizes + caps `full_name`(200)/`phone`(40)/`country`(100)/`address`(500), rejects non-strings, generic errors (DELETE too).
  - ✅ `AdminDataProvider` raw-payload log gated to non-production.
  - ✅ `/profile` mount effect: parallel fetches, per-query error checks, `.catch` → `pageError` state rendered on the page.
  - ✅ `BookingsTable.confirmSendFeedbackEmail` got the patchBookingRecord-style catch.
  - ✅ `checkOutExpiryUnix` → shared `lib/checkout-expiry.ts` (9 copies removed; strict variant wins + Date.UTC-rollover hardening — impossible dates now throw; identical output for valid dates; tests). `getChargeAmount` → `lib/payments/charge-amount.ts`; member→recipient → `lib/booking-recipient.ts`.
  - ✅ `/api/settings` GET uses `.maybeSingle()` and returns 500 on DB error instead of masking as absent.
  - ✅ `admin/bookings/[id]` + `approve-addon` use the shared `supabaseAdmin`.
  - ✅ `approve-addon` snapshot write is optimistic-concurrency-guarded (jsonb equality), 409 on conflict.
  Commit: see `Remediation 2.4`.

## Phase 3 — CI & test coverage (items 7, 11)

- [x] 3.1 **`.github/workflows/ci.yml`** — done: PR + master push run npm ci (PUPPETEER_SKIP_DOWNLOAD), tsc, lint, `npm test` (new script: `node --test "scripts/*.test.mjs" "lib/**/*.test.mts"` — node's own globstar, shell-safe), and `next build` (Google-Fonts note + restricted-runner fallback documented in the workflow). Commit: `d9109ba`.
- [x] 3.2 **Tests for money/token-critical libs** — done: 6 new suites, 31 tests (total 239). `booking-action-token` + `prefill-token` (round trip, expiry, tamper, wrong-purpose, secret rotation/missing), `checkout-amount` (deposit minimum boundary, over-total, float artifacts, custom percentage), `calendar/event-block` (half-open overlap, event setup-day expansion, boundary arithmetic — the pure core `findAvailabilityConflict` builds on), `pricing/engine` (night iteration, month/year/leap boundaries, Beirut Fri+Sat weekends, seasonal overrides, minimum stay, unpriced nights), `money`. Webhook-handler set_paid cases were covered in 1.6 (`webhook-set-paid.test.mts`). Commit: see `Remediation 3.2`.

## Phase 4 — Dependencies (report §4)

- [x] 4.1 `npm audit fix` + minor bumps — done: `ws` → 8.21.1 (high-severity advisories resolved), `resend` → 6.18.0, `@supabase/supabase-js` → 2.110.8, `autoprefixer` → ^10.5.4, `postcss` → ^8.5.22. Remaining 5 audit findings are all inside `next@14.2.35` itself; the only fix is Next 16 (breaking) — explicitly deferred to 4.3's separate-task decision. Gate: tsc/build/239 tests clean. Commit: see `Remediation 4`.
- [x] 4.2 `PUPPETEER_SKIP_DOWNLOAD=true` guidance — done: README "Local development" install step documents it (kept as devDependency; the screenshot watcher is the only consumer). Commit: see `Remediation 4`.
- [x] 4.3 **Next 15 + React 19 upgrade** — default decision applied (unanswered → SEPARATE scoped task, not in this run). Added to Human actions: schedule the upgrade task. Note: the 5 remaining `npm audit` findings live in Next itself and will be resolved by that task.

## Phase 5 — Refactors & polish (items 13, 14, 15, 16)

Order matters: helpers first (mechanical), then components. NO behavior changes in this phase — refactor commits must be behavior-preserving; verify with build + tests + targeted manual smoke of `/book` and the admin table after each step.

- [x] 5.1 `BookingsTable.tsx` step 1 — done: 71 module-level types/constants/helpers moved verbatim to `components/admin/bookings/helpers.tsx`; DashboardOperationsView's 6 identical copies deleted in favor of the shared ones (its `getAddonStatusTone` kept local — deliberately different colors); the duplicated approve-addon fetch unified in `components/admin/bookings/approve-addon.ts`. BookingsTable 6588 → 5697 lines; behavior-preserving (tsc/build/239 tests). Commit: see `Remediation 5.1`.
- [x] 5.2 `BookingsTable.tsx` step 2 — PARTIAL: ✅ poll pause while a payment edit is in flight (`setPollingPaused` in AdminDataProvider, held while `paymentUpdatingId` is set) and ✅ deep-equal skip for `setBookings`/`setMembers`/`setCalendarSources` (functional set returning `prev` so React bails out) both shipped. ⛔ BLOCKED (sub-part): memoized extraction of the six render sections — `renderExpandedBookingDetails` alone is ~1,570 lines closing over dozens of state setters/drafts; this phase's own rule requires a targeted manual smoke of the admin table after each step, and this environment has no Supabase/ADMIN_SECRET credentials to run the admin console, so behavior-preservation of that conversion cannot be verified here. Recommend a dedicated PR with Vercel Preview verification (extraction order: PaymentSection → ProposalSection → AddonRows → CompactRow → ExpandedDetails → feedback modal, each with stable useCallback props). Commit: see `Remediation 5.2`.
- [x] 5.3 `app/book/page.tsx` extraction — done: new pure modules `lib/booking/calendar-validity.ts` (stay + event rule factories, verbatim logic), `lib/booking/butler-prefill-hydration.ts` (villa/guests/bedrooms/name decisions), `lib/booking/addon-availability.ts` (availability rule with injectable clock), `lib/booking/load-stay-addons.ts` (catalog load) — 13 new tests. All three `react-hooks/exhaustive-deps` suppressions removed (book ×2, events ×1) with honest dependency arrays; `applyButlerPrefill`/`syncCalendarMonthToSelection` are stable useCallbacks. tsc/lint/build/252 tests clean. Commit: see `Remediation 5.3`.
- [x] 5.4 Shared modules — done: `lib/guest-format.ts` (fmtDate — /profile's time-suffix-tolerant variant wins, byte-identical output for date-only input; nightCount, formatUsd, toISO) deduped across 5 pages; `friendlyError` deliberately NOT shared (/book and /events use different guest copy — noted in the module); `lib/guest-validation.ts` (EMAIL_RE) deduped across 3 files; new shared `components/theme.ts` — 77 byte-identical local theme-constant declarations swapped across 26 files (declarations with deliberately different values, e.g. CSS-var theming on /book//booking/view, kept local). Build/tests/lint clean. Commit: see `Remediation 5.4`.
- [x] 5.5 Marketing pages — PARTIAL: ✅ the two villa pages merged into one `components/VillaPage.tsx` template (config-driven, content byte-preserved); route files are now thin SERVER wrappers exporting SEO `metadata` (title/description per villa). ⛔ BLOCKED (sub-parts): (a) converting `/` to a server component — CLAUDE.md governance explicitly mandates "`page.tsx` must stay `\"use client\"` (uses mouse event handlers)", which this plan's rules say to respect; (b) full server-fetched covers + `next/image` hero conversion — covers are remote Supabase-storage URLs whose `images.remotePatterns` host config cannot be runtime-verified in this environment (no Supabase env), and a wrong config hard-breaks hero images in production; house-book `<img>`s are SVG print plates (CLAUDE.md: no next/image for SVGs). Recommend the next/image + remotePatterns change in a PR verified on Vercel Preview. Commit: see `Remediation 5.5`.
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
