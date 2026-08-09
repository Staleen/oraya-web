# Mission — /ops to production grade

Opened: 2026-08-09
Owner decisions recorded: 2026-08-09 (see "Decisions taken" below)
Status: PHASES 0–3 DONE · PHASE 4 PARTLY DONE · THREE ITEMS AWAIT DAVID

Short version: /ops can now stand on its own for the people who use it daily.
An operator who forgets their password can be let back in, an owner who forgets
theirs can recover, the kill switch for real card payments lives in the console
that survives, and the money path has been exercised against the production
database and cleaned up. What has NOT happened is a human clicking through
every screen — that needs this branch deployed first.

Definition of done, as decided by David:

> Every /admin capability exists in /ops and is verified against production.
> /admin stays reachable but unused for one week as the safety net. Deleting it
> is a separate task after the soak.

This document is the mission's spine. It supersedes nothing in
`OPS_MIGRATION_PLAN.md`; it consumes the parts of it that remain open
(Batch 6 partly done, Batch 8, and the verification that was never performed).

---

## Decisions taken 2026-08-09

| Question | Decision |
| --- | --- |
| What is a "package"? | An existing marketing concept on the site: a named group of options where the guest picks exactly one (Light / Standard / Premium Catering). David must be able to **add a new one without a developer**. |
| Staff lockout recovery | Owner resets from the Team screen, producing a one-time link. No staff-facing email reset. |
| Live production testing | Authorised: create a marked test booking, exercise the real paths, send nothing to real guests, remove the test rows afterward and prove removal. |
| Scope of "done" | Full parity, /admin kept dormant one week, deletion is a later task. |

---

## Phase 0 — parity audit (COMPLETE)

Every `/admin` screen and API route enumerated and mapped to its `/ops`
equivalent. Result: **five true capability gaps**, plus three quality gaps
already known.

### Capability gaps — /admin can do it, /ops cannot

| # | Capability | /admin route | Severity |
| --- | --- | --- | --- |
| G1 | Force a calendar re-sync now | `POST /api/admin/calendar-sync/run` | Operator-blocking |
| G2 | Sync / seed the event-services catalogue | `POST /api/admin/event-services/sync` | Owner-blocking |
| G3 | Change your own password | `POST /api/admin/change-password` | Operator-blocking |
| G4 | Flip the live-payments switch | `POST /api/admin/payments/live-toggle` | Owner-blocking |
| G5 | Recover a lost password | `/api/admin/recovery/{request,reset}` | Operator-blocking |

G3 and G5 are the reason an operator cannot yet be trusted alone with /ops:
if they lose their password there is no way back in without David re-inviting
them. G4 is the reason /admin cannot go dormant — the switch only lives there.

### Quality gaps — /ops has it, but it is wrong

| # | Problem | Evidence |
| --- | --- | --- |
| ~~Q1~~ | ~~Extras show stay and event items in one list~~ | **Withdrawn — I was wrong.** `getAddonAppliesTo` already treats `null` as `"stay"` by design, and `parseOperationalFields` deliberately omits the field when it is stay. The Extras screen has grouped by stay / event / both since Batch 2. There is no data problem and nothing to backfill. |
| Q2 | Packages are not owner-editable | The mutually-exclusive tiers (Light/Standard/Premium Catering, Basic/Enhanced/Premium Decoration, and four more) live in `lib/event-service-exclusivity.ts` as hardcoded seed ids. Adding a package requires a code change. |
| Q3 | Villa restrictions are hard to see | `heated_pool` is Villa Mechmech only in production. The Extras screen does expose it, but only after opening Rules on the row. |
| Q4 | **Category control could destroy live data** | The dropdown offered five lowercase tokens (`comfort`, `experience`, …) while production stores `Setup & Seating`, `Production & Atmosphere`, `Food & Hospitality`. No stored value matched any option, so every event service displayed "None", and one touch of the control would have written a token the guest-facing event page does not group on. |
| Q5 | Testimonials save has no concurrency guard | Every other Setup screen uses `expected_raw`; this one did not, so two editors silently overwrote each other. |
| Q6 | Calendar sync reports success when every feed fails | `/api/cron/calendar-sync` returns 200 with `sources_failed` in the body. The dashboard is green while sync is dead. **Locked route — needs David's explicit approval to touch.** |
| Q7 | Owner could not reach Setup from a phone | The mobile nav rendered `visible.slice(0, 5)`. For an owner that silently hid Pricing, Extras, Payments, Photos, Site, Members and Team. |

---

## Phase 1 — Extras — DONE (reduced scope, see Q1 withdrawal)

Q4 fixed: the category control is now a suggest-or-type field whose options are
the canonical list **plus every value already in use**, so no stored category
can be lost by editing. Q1 needed no work. Q2 is deferred — see "Needs David"
below.

## Phase 2 — Authentication and lockout — DONE (closes G3, G4, G5)

Owner resets a staff password from Team, producing a one-time link. Staff
change their own password at `/ops/account`. Owner self-service recovery by
email for the one person nobody can reset. The live card-payments switch now
exists in /ops. Three `DECISIONS_LOG` entries dated 2026-08-09 record the
reasoning, including the one that supersedes 2026-07-25.

Found and fixed while here: an /ops session survived a password reset, because
sessions are stateless and nothing re-checked the password. It does not now.

## Phase 3 — Remaining gaps — PARTLY DONE

- **G1 done.** `POST /api/ops/calendar-sync/run` plus a "Sync now" button on
  Availability, open to operators as well as owners. It refuses to report
  success when feeds failed and nothing was written.
- **Q5 done.** Testimonials save is now compare-and-set like every other Setup
  screen.
- **Q7 done.** Mobile nav no longer hides Setup behind a silent `slice(0, 5)`.
- **G2 not done.** See "Needs David".

## Phase 4 — Live production verification — PARTLY DONE

Done against the production database on 2026-08-09, with all test rows removed
afterward and removal proven by query:

| Check | Result |
| --- | --- |
| `oraya_record_manual_payment` with the exact 13 arguments /ops sends | Recorded $1; `booking_amount_paid` returned `1.00` |
| Booking row after recording | `amount_paid` 1.00, `amount_due` 99.00, `payment_status` `deposit_paid`, `payment_stage` `partially_paid` |
| `payment_marked_by` | Holds a **uuid** — the bug that made every /ops payment fail is confirmed fixed |
| Replay with the same idempotency key | Refused; still one transaction, still 1.00 |
| Stale write (`expected` 0 when 1.00 is paid) | Refused; balance unchanged |
| `oraya_reverse_manual_payment` | Reversed to `0.00` |
| Cleanup | 0 test bookings, 0 test transactions, 0 rows matching `ZZ TEST` |

**Still unverified:** every screen, in a browser, signed in as a real person.
That cannot happen until this branch is merged and deployed, and it is the
remaining gap between "verified" and "proven in use".

## Phase 5 — Evidence and handover

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` on the /ops surface | clean, 0 problems |
| Unit tests | 40/40 files pass, 0 failures (10 new in `lib/ops-recovery.test.mts`) |
| `npm run build` | **Not completed in this environment.** See below. |

The production build could not be run to completion here. Each sandbox shell
call is torn down after roughly three minutes and no process survives between
calls, and `node_modules` is reached over the OneDrive mount, so a full
Next.js webpack build does not finish inside one call on two cores. It is not
claimed as passing.

**This is the one gate David must watch personally:** Vercel builds the branch
on the PR, and that build is the authoritative check. It must be green before
merge. `tsc` passing makes a type error unlikely, but it does not prove the
build.

---

## Needs David — not done, and not doable without a decision

**G2 — event-services catalogue sync.** `/api/admin/event-services/sync` holds
~200 lines of seed-merge logic. Exposing it in /ops honestly means extracting
that logic to a shared lib and having both routes call it — which modifies a
route under `/api/admin/*`, a locked path. The alternative, copying 200 lines
of merge logic, would guarantee the two copies drift. I did neither.
**Decision needed:** authorise the refactor of that named path, or accept that
this one maintenance action stays in /admin.

**Q6 — calendar sync monitoring.** `/api/cron/calendar-sync` answers 200 even
when every feed fails, which is why the dashboard can be green while sync is
dead. The new /ops route already reports honestly, but the cron path is
locked. **Decision needed:** authorise editing `/api/cron/calendar-sync`.

**Q2 — owner-editable packages.** A package is a named group where the guest
picks one option. Making them editable means threading the group config from
data through `lib/event-service-exclusivity.ts` into the 2,000-line guest event
inquiry page. That is a feature with guest-facing blast radius, and putting it
in the same change as the auth work is how a rushed release breaks bookings.
**Recommendation:** its own task, after the operator is safely running.

---

## Standing constraints

No schema changes. No new dependencies. Feature branch, never direct master.
No secret exposure, no real `.env` edits. Locked systems untouched unless a
named path is explicitly authorised. An /ops session must never satisfy an
`/api/admin/*` guard. Minimal diff, no opportunistic refactors.

## Gate before /admin deletion

One week of real /ops-only operation. Deletion is not part of this mission.
