# Ops Migration Plan — retire `/admin`, keep `/ops`

**Created:** 2026-08-07 · **Owner decision:** David wants one console. `/admin` is deleted at the end of this plan.
**Companion docs:** `OPS_ADMIN_V2.md` (design record), `ADMIN_UI_AUDIT.md` (findings), `AGENT_RULES.md` (mandatory).

Each batch below is a SELF-CONTAINED task prompt. Dispatch one at a time ("batch N go"), one PR per batch, in order unless a batch says otherwise. Every batch inherits these rules without restating them:

- Read first: `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `AGENT_RULES.md`, `OPS_ADMIN_V2.md`, this file.
- /ops design principles govern all UI (OPS_ADMIN_V2 §2): structure over text; preview over confirmation for anything that messages a guest; undo over confirm for the reversible; absent-not-disabled; never render a failure as an empty state.
- An ops session must NEVER pass an `/api/admin/*` guard. New capability = new ops-guarded route mirroring the admin route's rules, or an import of the shared `lib/` senders/helpers. Never copy dispatch logic — extract or import.
- Verify column names against the live database before using them. No schema changes. No new dependencies. Minimal diff. Feature branch off current master; David pushes and merges.
- Verification per batch: `npx tsc --noEmit`, `npm run lint`, `npm test`, build (CI's Turbopack build on push is authoritative), plus the batch's named click-paths. Final report per AGENT_RULES §8.
- Update `OPS_ADMIN_V2.md` §6 and `DECISIONS_LOG.md` in the same PR when a batch lands.

**Gates (hard stops, in order):**

1. **Decision gate before Batch 8:** (a) moving the live-payments switch ritual into /ops supersedes the 2026-07-25 "only writer is `/api/admin/payments/live-toggle`" decision — David must approve the replacement ritual explicitly; (b) David chooses the /ops password-recovery email destination and policy.
2. **Soak gate before Batch 9:** at least one week of real operation (David + operator) entirely inside /ops, with zero forced trips to `/admin`. Batch 9 does not start until David states the soak passed.

---

## Batch 1 — Booking odds and ends ✅ DONE 2026-08-07 (`claude/ops-migration-batch-1`)

Shipped: ops feedback-request action (admin rules mirrored: confirmed + past-checkout + cooldown 409 + trail written), `GET /api/ops/bookings/[id]/arrival-link` + Copy button, payment-link row in the Money card with expiry-aware badge and copy, lead VIP / needs-human labels in Enquiries (toggle + undo, `labels` validated in `PATCH /api/ops/leads/[id]`).

**Objective:** nothing booking-related ever needs `/admin` again.

1. **Feedback-request email** on the /ops booking detail. New ops action mirroring `app/api/admin/bookings/[id]/send-feedback/route.ts` EXACTLY: confirmed only; only after checkout (`isPastCheckoutForFeedbackEmail`); cooldown via `isFeedbackEmailCooldownActive` → 409; recipient via `resolveBookingRecipient`; sends `sendFeedbackRequestEmail`; then writes `feedback_requested_at`, `feedback_requested_channel: "email"`, incremented `feedback_request_count`. UI: visible on past confirmed stays/events, disclosure-first ("this emails the guest"), shows when feedback was last requested.
2. **Copy Arrival Guide link**: ops route mirroring `app/api/admin/bookings/[id]/arrival-link/route.ts` (confirmed only, mints via `lib/arrival-guide-link.ts`, returns nothing else); copy button beside the WhatsApp-sent line on confirmed stays.
3. **Payment-link visibility**: add `payment_link_url/provider/status/expires_at/issued_at` to the ops data select + `QueueBooking`; render a "Payment link" block in the Money card (status incl. past-expiry, issued/expires, copy URL). Display only.
4. **Lead labels** in Enquiries: show `labels` as badges (VIP / needs-human per `components/admin/leads/leadHelpers.ts` semantics — case-insensitive label match); allow toggling VIP and needs-human via `PATCH /api/ops/leads/[id]` (extend its allowed fields with a validated `labels` array). Undo-over-confirm.

**Acceptance:** each item usable end-to-end from /ops; feedback + arrival-guide rules byte-equivalent to the admin routes; no admin route edited.

## Batch 2 — Extras, the deep half ✅ DONE 2026-08-07 (`claude/ops-migration-batch-2`)

Shipped: every `AddonOperationalFields` value is editable from /ops via a per-row **Rules** panel (villas, applies-to, category, advance notice + cutoff, enforcement, price basis + percentage with the "reprices live quotes" warning, recommended, display order, quantity + unit + min/max, event price unit, description). Server-side strict validation in `PUT /api/ops/setup/addons` (unknown villa/event-type/enum refused; percentage requires 0–100; min ≤ max). The screen's owned keys are stripped from the stored blob before merging so CLEARING a value actually clears it; unknown/future fields still round-trip. R-2 wipe guard and partial-failure reporting unchanged.

**Objective:** end the last reason to open `/admin/rates`.

Extend the /ops Extras screen + `PUT /api/ops/setup/addons` to edit the remaining `AddonOperationalFields` (`lib/addon-operations.ts`): per-villa applicability, category, preparation time + cutoff type, enforcement mode, description, display order, recommended flag, pricing type/percentage, applies-to (stay/event/both), event pricing unit + quantity bounds. The write already round-trips these — the change is exposing them honestly (a per-row expandable "rules" section keeps the table calm). Keep the R-2 wipe guard and partial-failure reporting. Audit R-7 (remove needs no confirm) is already covered by strike-through+Keep-it; R-5's percentage copy must state percentage pricing reprices live quotes.

**Acceptance:** every operational field editable from /ops with named pending-changes sentences; a save from /ops then a read from the legacy rates page shows identical data.

## Batch 3 — Media ✅ DONE 2026-08-08 (`claude/ops-migration-batch-3-7`)

Shipped: owner-only Photos screen (per-gallery upload, category/cover, **button reorder that works on a phone** — ME-6 — with snap-back to server truth on failure per ME-2, delete with ME-5 ordering) over the new ops-guarded `/api/ops/media`; testimonials approve/hide/edit via `PUT /api/ops/setup/testimonials`.

**Objective:** replace `/admin/media` + testimonials.

New owner-only /ops "Media" screen: per-villa photo list + hero/general bucket, upload, category change, delete (DB row before storage object — the ME-5 ordering), reorder that works on PHONES (buttons/drag both; ME-6), cover selection; testimonials list with approve/hide (ME-9's invisible checkbox dies here). Ops-guarded routes mirroring `/api/admin/media` semantics incl. the storage-path allowlist (`general` + villas). Failed reorder must snap back to server truth (ME-2 lesson).

**Acceptance:** full media lifecycle from a phone; guest pages reflect changes; legacy media page untouched.

## Batch 4 — Settings-misc ✅ DONE 2026-08-08

Shipped: /ops **Site** screen — WhatsApp number (validated, 8–15 digits — audit S-10), notification emails (each validated), per-villa instant-booking flags, Butler check-in guidance. `PUT /api/ops/setup/site` allowlists exactly these keys; protected rows are unreachable by construction.

**Objective:** the small owner switches leave `/admin/settings`.

Owner-only "Site" card(s) in /ops Setup: sitewide WhatsApp number (validated — not any string; S-10), notification emails, instant-booking flags, `butler_checkin_guidance` text. Writes via an ops-guarded settings route that ONLY accepts this allowlisted key set (never the protected keys). Compare-and-set like the other setup writes. Save flows must survive network failure with honest errors (S-4).

**Acceptance:** each value editable from /ops and visibly live; protected keys unreachable from the new route.

## Batch 5 — Members ✅ DONE 2026-08-08

Shipped: /ops **Members** — search (M-4), booking count per member shown before delete (M-5), **edit name/phone** via the new `PATCH /api/ops/members/[id]` (M-6: this needed SQL before), delete with auth-account-first ordering and explicit partial-failure messages (G8 pattern) plus a dialog naming the detach consequence.

**Objective:** replace `/admin/members`.

Owner-only Members screen: list with search (M-4), booking count per member shown before delete (M-5), EDIT of full name/phone (M-6 — requires extending the ops member route with a PATCH; the admin API only has DELETE, do NOT edit it), delete with the auth-account-first ordering and explicit partial-failure messages (the G8 pattern). Member deletion consequences named in the dialog (bookings detach, sign-in revoked).

**Acceptance:** find/edit/delete a member wholly from /ops; a deleted member cannot sign in; their bookings survive detached.

## Batch 6 — Calendar sources (G13) ✅ PARTLY DONE 2026-08-08

Shipped: owner-only feed CRUD from Availability (`/api/ops/calendar-sources`) — connect a calendar, rotate a link, pause/resume, remove; URL validated to http(s); rotating a link clears the stale sync verdict. **Still open:** the locked `/api/cron/calendar-sync` still returns 200 when every feed fails (needs its own named approval to edit a locked route), and a manual "sync now" trigger.

**Objective:** feeds manageable without SQL; failures visible.

Ops-guarded CRUD for `external_calendar_sources` (`id, villa, source_name, feed_url, is_enabled, last_synced_at, last_sync_status, last_error, created_at, updated_at` — verified table shape) surfaced in Availability: add/edit/disable a feed, manual "Sync now" (ops route slot calling the same sync internals the admin manual-run route uses — import, don't copy), and per-villa iCal export links. Monitoring fix: `/api/cron/calendar-sync` is LOCKED — propose the non-2xx-on-`sources_failed>0` change as its own named mini-approval inside this batch's report if it requires editing the locked route; otherwise surface staleness purely in /ops (already started). Feed URLs are secrets-adjacent: display truncated.

**Acceptance:** rotate a feed URL, disable a feed, trigger a sync, and see honest freshness — all from /ops.

## Batch 7 — Business screen ✅ DONE 2026-08-08

Shipped: owner-only Business screen over pure, unit-tested `lib/ops-business.ts` (6 tests) — money received (recorded only), still-expected (contracted minus received), refunds owed, occupancy per villa in a 30/90/365-day window, add-on uptake, lead conversion. D-8 honoured: cancelled bookings are excluded everywhere except the refunds-owed line, and every metric states its population.

**Objective:** owner analytics replacing the legacy dashboard's numbers.

Owner-only Business screen: revenue (recorded money, not estimates — and labelled), occupancy per villa, add-on uptake, lead→booking conversion, with a consistent cancelled-bookings policy across every metric (the D-8 lesson: one population, stated). Derivations pure and unit-tested (`lib/ops-business.ts` + `*.test.mts`). Read-only; no new endpoints beyond an ops-guarded aggregate read if the existing data payload is insufficient.

**Acceptance:** numbers reconcile with hand-checks on live data; every metric states its population.

## Batch 8 — Auth endgame ⛔ decision-gated

**Objective:** /ops auth self-sufficient; nothing auth-related needs `/admin`.

Only after Gate 1 decisions:

1. **Change password** in /ops (current password required, min 12, login-throttle discipline — mirror `lib/admin-change-password` semantics against `staff.password_hash`).
2. **Forgot password**: owner-approved destination policy; likely per-staff email recovery links mirroring the admin recovery flow's token discipline (single-use jti, short TTL) against the staff table. An owner losing their password must have a path back in that does not involve `/admin`.
3. **Live-payments switch in /ops** per the approved superseding decision: same fail-closed semantics, password-confirmed enable, session-only disable, single writer (the NEW route replaces the old as the only writer; DECISIONS_LOG entry supersedes 2026-07-25). The legacy endpoint is retired in Batch 9, not here.
4. Decide the fate of `settings.admin_password` (still consulted by the legacy login and live-toggle until Batch 9) — document, don't delete yet.

**Acceptance:** full password lifecycle inside /ops; live switch flippable from /ops with the same ritual; legacy flows still intact (parallel until Batch 9).

## Batch 9 — The switch ⛔ soak-gated

**Objective:** `/admin` is gone.

Only after Gate 2 (the soak week) and David's explicit "flip it":

1. `/admin/*` pages redirect to `/ops` (one small redirect; keep `/admin-reset-password` until the staff recovery replaces it in practice).
2. Delete the legacy admin UI (`components/admin/**`, `app/admin/**` except the redirect) — the ~20k-line removal.
3. Retire `/api/admin/*` routes that no longer have callers — EACH is a locked surface: list them individually in the PR description with proof of zero callers (repo grep + the guest email-link flow `/api/booking-action*` explicitly preserved — it never depended on the admin UI). `verify-password`/recovery/live-toggle retire per the Batch 8 decision. Anything with a remaining caller stays.
4. Docs closeout: PROJECT_STATE (admin surface section), ARCHITECTURE route table, OPS_ADMIN_V2 (switch-over recorded), ADMIN_UI_AUDIT (remaining findings closed as "superseded by /ops"), KNOWN_BUGS sweep, DECISIONS_LOG entry. G11 findings die with the code.

**Acceptance:** stayoraya.com/admin lands on /ops sign-in; every daily flow verified in /ops; CI green; a full guest booking → approval → payment → arrival cycle works end-to-end after the deletion.

---

**Standing note for whoever executes:** batches 1–5 are routine, 6–7 medium, 8 needs David, 9 must be boring. If a batch uncovers a conflict with current docs or a locked surface not named here, stop and report rather than improvising.
