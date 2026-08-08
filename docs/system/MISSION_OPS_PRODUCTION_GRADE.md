# Mission — /ops to production grade

Opened: 2026-08-09
Owner decisions recorded: 2026-08-09 (see "Decisions taken" below)
Status: IN PROGRESS

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
| Q1 | Extras show stay and event items in one undifferentiated list | Production `applies_to` is `"event"` on all 20 event services and `null` on the 4 stay extras. Null is ambiguous, so the screen cannot group. |
| Q2 | Packages are not owner-editable | The mutually-exclusive tiers live in `lib/event-service-exclusivity.ts` as hardcoded seed ids. Adding a package requires a code change. |
| Q3 | Villa restrictions are invisible | `heated_pool` is Villa Mechmech only in production; nothing in /ops says so. |
| Q4 | Category vocabulary is inconsistent | Production uses `Production & Atmosphere`, `Food & Hospitality`, `Arrival & Guest Flow`; the code expects `Lighting & Ambience`, `Entertainment & Music`, `Catering & Dining`, `Staffing & Service`. Two vocabularies for one catalogue. `extra_bedding` has no category at all. |
| Q5 | Testimonials save has no concurrency guard | Every other Setup screen uses `expected_raw`; this one does not, so two editors silently overwrite each other. |
| Q6 | Calendar sync reports success when every feed fails | `/api/cron/calendar-sync` returns 200 with `sources_failed` in the body. The dashboard is green while sync is dead. **Locked route — needs David's explicit approval to touch.** |

---

## Phase 1 — Extras and packages

The catalogue is the thing David has complained about twice, so it goes first.

**1a — make the data honest.** `applies_to` becomes explicit: `stay`, `event`,
or `both`. Backfill the four nulls to `stay`. Collapse the two category
vocabularies into one list and give `extra_bedding` a category. No schema
change: `addon_operational_settings` is a JSON blob in `settings`.

**1b — packages become data.** A package is a named group with a rule ("guest
picks one"). Move the six hardcoded groups into the same owner-editable blob
and let David create a seventh from /ops. Existing exclusivity behaviour must
be preserved exactly — verified by test, not by eye.

**1c — rebuild the Extras screen** around the real model: stay extras and event
services separated, villa restrictions visible, package groups shown as groups,
pending-changes discipline kept.

## Phase 2 — Authentication and lockout (closes G3, G4, G5)

Owner resets a staff password from Team, producing a one-time link. Staff
change their own password in /ops. The live-payments switch moves to /ops with
its password-confirmed ritual intact — one writer, one ritual, now in the
console that survives. `DECISIONS_LOG` entry supersedes 2026-07-25.

## Phase 3 — Remaining gaps (closes G1, G2, Q5)

Manual calendar re-sync and event-services sync exposed in /ops with the same
guards. Testimonials concurrency guard added. Q6 prepared as a separate,
clearly-scoped change awaiting David's approval because the route is locked.

## Phase 4 — Live production verification

The step that has never happened. A marked test booking exercised end-to-end
through /ops: record payment via the ledger RPC, refund, proposal save and
send, approve, decline, add-on resolution. Nothing reaches a real guest. All
test rows removed afterward, with the deletion proven by query.

## Phase 5 — Evidence and handover

`npx tsc --noEmit`, lint, full test suite, production build — each with exit
code and output. `/docs/system` updated in the same PR. PR report states
exactly what was verified live, what was verified only by test, and what
remains unverified.

---

## Standing constraints

No schema changes. No new dependencies. Feature branch, never direct master.
No secret exposure, no real `.env` edits. Locked systems untouched unless a
named path is explicitly authorised. An /ops session must never satisfy an
`/api/admin/*` guard. Minimal diff, no opportunistic refactors.

## Gate before /admin deletion

One week of real /ops-only operation. Deletion is not part of this mission.
