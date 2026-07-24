# Oraya-Web Remediation Plan 2 — remaining work after PR #85/#86 (2026-07-23)

**For the agent executing this plan:** PR #85 (merged) completed the original REMEDIATION_PLAN.md — do NOT redo any of it; `REMEDIATION_PLAN.md` on master is the record of that completed work. PR #86 made the admin Settings "Update password" button hash server-side. This file contains ONLY the remaining work. Work through it in order; check each box with the commit hash when done; mark anything impossible as BLOCKED with a reason and continue. This file is the single source of truth for progress.

## Rules of engagement (same as before)

- Work on a new branch off latest `master` (if the environment forces a `claude/...` branch name, use it and note it here). NOTE: Phase A runs on the environment-designated `claude/remediation-health-check-2026-vesyus`; Phase B on `claude/remediation2-phase-b`. Never push to master; land via PR.
- **Verification gate after every item:** `npx tsc --noEmit` clean, `npm run build` passes, `npm test` fully green (current baseline: 252 passing — never go below; add tests where the item says so).
- Respect repo governance (`CLAUDE.md`, `AGENTS.md`, `docs/system/*`): locked surfaces stay locked; update `DECISIONS_LOG.md` (dated entry per phase) and `KNOWN_BUGS.md` where relevant.
- Human-required steps (Vercel env vars, visual preview checks) go in the "Human actions" section with exact steps.
- `npm install` needs `PUPPETEER_SKIP_DOWNLOAD=true` in restricted networks.

---

## Phase A — Admin password: finish the account-recovery story

- [x] A.1 **Harden the Settings "Update password" flow to the full spec** — done: new `POST /api/admin/change-password` (session + current password via `lib/admin-change-password.ts`; new password twice, min 12; shared login throttle via extracted `lib/admin-login-attempts.ts` with wrong-current counted as a failure + 500ms delay; audit log lines, no password values). Generic settings POST now refuses the `admin_password` key so the check can't be bypassed. Settings UI has current/new/confirm fields with inline success/error feedback. 5 tests (257 total). Commit: `7f56fcc`. (builds on PR #86's server-side hashing — if #86 is not yet merged, branch from it):
  - Require the **current password** before accepting a new one (verify via `lib/admin-password.ts` against the stored hash; the admin session cookie alone is not enough).
  - New password entered twice (confirm field), minimum **12** characters (raise from #86's 8).
  - Reuse the existing `lib/admin-login-throttle.ts` limiter on this endpoint (count failed current-password checks as failures).
  - Server-side audit log line on success/failure (never log password values).
  - Success/failure feedback in the UI. Tests: wrong current password → 401 + throttle-counted; mismatch/short new password → 400; success path stores a verifying scrypt hash.
- [x] A.2 **"Forgot password" recovery via admin email** — done: "Forgot password?" on the admin login gate → `POST /api/admin/recovery/request` (always-generic response; destination is exclusively the server-side `ADMIN_RECOVERY_EMAIL`; silently no-ops when env unset; global cap 3 sends/hour via success-marker rows the login throttle ignores; Resend sender `lib/send-admin-recovery-email.ts`). Token: `lib/admin-recovery.ts` — HMAC-signed (ADMIN_SECRET), purpose-bound, 30-min expiry, SINGLE-USE via server-stored jti (settings row, atomically claimed on spend; newer tokens supersede older). Reset page at **`/admin-reset-password`** (top-level route — deliberately NOT under `/admin/*`, whose layout auth-gate would block a locked-out admin; noted as the one deviation from "admin-scoped route"). Min 12 + confirm, stores scrypt hash. Settings GET/POST now shield the jti row alongside admin_password. 7 tests (264 total). Commit: `a2bd40b`.
  - A "Forgot password?" action on the admin login sends a one-time reset link via the existing Resend integration to a server-side constant **`ADMIN_RECOVERY_EMAIL`** env var — hardcoded destination, never taken from user input. If the env var is unset, the endpoint returns a generic response and sends nothing.
  - Token: signed, single-use, 30-minute expiry, invalidated server-side after use (follow the discipline of the existing token helpers — import, don't modify, locked helpers if reusable; otherwise a small parallel helper with tests).
  - The reset page (admin-scoped route) sets a new password (min 12, entered twice), stored as scrypt hash.
  - Rate-limit the send endpoint (max 3 sends/hour globally). The endpoint must not reveal whether an email was sent.
  - Tests: token expiry, reuse rejection, tamper rejection, unset-env behavior.
  - HUMAN follow-up: set `ADMIN_RECOVERY_EMAIL=admin@stayoraya.com` in Vercel; verify Resend delivers to it.

## Phase B — The three items deferred from PR #85 (need visual verification)

These were BLOCKED in the original run because they change rendering and need human eyes on a Vercel Preview. Behavior-preserving only; one commit each. The PR body MUST list exactly which pages David should visually check on the Preview before merging.

- [x] B.1 **BookingsTable render-section extraction** — done in the specified order. `PaymentSection`, `ProposalSection`, `AddonRows`, `CompactRow` are `React.memo` children keyed on `booking` + their own draft/panel slice, with per-card derived scalars (`activePaymentAction`, `activeAddonResolution`, conflict-hold flags) so unrelated cards' props stay identical; handlers arrive through ONE permanently-stable actions object (useEvent-style ref-delegating wrappers — the stable-callback mechanism the "stable useCallback props" spec intends, chosen over per-handler useCallback chains because the ~20 handlers are interdependent). A keystroke in a draft now re-renders only the edited card: collapsed `CompactRow`s receive `expandedContent=null` and bail out, and inside the open card only the edited section re-renders. `ExpandedBookingDetails` (~1,970 lines incl. its internal `renderRow`/`summarizeOverlap`/recursion) is extracted verbatim to its own file but deliberately NOT memoized: it renders only for the open card, and its inputs are cross-booking (overlap cards, alternative-date map, the bookings list) with per-render identities — memoizing it would be a no-op; reason documented in the file header. The feedback modal was already the shared `ConfirmDialog` (PR #85) and renders only when open. Pure draft seeding + send-validation moved to `components/admin/bookings/drafts.ts`. BookingsTable 5,631 → 1,935 lines. tsc/lint/build/252 tests clean. Commit: `532043f`.
- [x] B.2 **Homepage server conversion** — done: `app/page.tsx` is a server component with SEO `metadata` and server-fetched covers (villa_media: general/mechmech/byblos) + approved testimonials (each fail-safe to the branded fallbacks); all interactivity (auth nav, dropdown, hover handlers, pricing/instant-booking hooks) lives in the `components/HomeClient.tsx` island. `/` is now server-rendered per request (ƒ — supabaseAdmin is deliberately no-store), removing the client fetch flash. CLAUDE.md + AGENTS.md notes updated. Commit: `59d0b23`.
- [x] B.3 **next/image heroes** — done: homepage hero + both villa cards (HomeClient) and the villa-page hero + gallery strip (VillaPage) now render covers as `next/image` `fill` images (gradient fallbacks stay as the container background; overlays/badges keep their stacking). `next.config.mjs` derives `images.remotePatterns` from `NEXT_PUBLIC_SUPABASE_URL` (covers are minted via `storage.getPublicUrl` → `<supabase-host>/storage/v1/object/public/villa-images/...`); if the env var is missing at build, images fall back to `unoptimized` instead of hard-failing on an un-allowlisted host. House-book/arrival/explore SVG plates stay `<img>` per CLAUDE.md. Commit: `67b4646`.

## Phase C — Closeout

- [x] C.1 Closeout — done on both branches: Phase A → PR #87 (mergeable on green CI; DECISIONS_LOG Phase A entry on that branch); Phase B → its own PR flagged "merge only after visual Preview check" with the exact page list in the body (DECISIONS_LOG Phase B entry on this branch). Final gate on each branch: tsc clean, build clean, 252/252 (Phase A: 264/264 incl. its new suites), lint warning-free apart from pre-existing out-of-scope `no-img-element` sites. NOTE: both branches add `REMEDIATION_PLAN_2.md` + a DECISIONS_LOG entry — whichever PR merges second will need a trivial add/add conflict resolution (keep both entries / union of checkboxes).

## Explicitly OUT of scope (do not touch)

- Next 15/16 + React 19 upgrade — separate scoped task, later.
- Remote-branch deletions — the commands are already in `REMEDIATION_PLAN.md` §6.1 on master; David runs them himself.
- Anything already completed in PR #85/#86.

## Human actions (agent appends; David executes)

- [x] Set `ADMIN_RECOVERY_EMAIL=admin@stayoraya.com` in Vercel env (after A.2 merges). Done 2026-07-24.
- [x] Visually check the Vercel Preview pages listed in Phase B's PR body before merging it. Done 2026-07-24.
