# Handoff — Ops Admin v2, next session

**From:** Cowork session 2026-08-01/02 · **Branch:** `claude/admin-booking-reference-search`
**Format:** follows `docs/system/AGENT_HANDOFF_TEMPLATE.md`

---

## Before anything: state of the branch

Nine commits exist locally and **may not be pushed yet**. Check first:

```powershell
git log --oneline origin/claude/admin-booking-reference-search..HEAD
```

```
7be1505  revert: restore true calendar-sync copy — audit finding C-1 was false
ce7b811  G10: provider & shell hygiene (audit X-1,2,3,5,6,7)
2ff374f  ops: per-person staff accounts with owner/operator roles
a6af0b0  ops: work-queue interface at /ops — shell, sign-in, Today, bookings
cf80ab6  fix(ops): QueueBooking was missing fields the data route selects
6aa4694  ops: booking lifecycle view and guided money flows
4c98f6b  fix(ops): wrap useSearchParams in Suspense so the build passes
0ff230a  fix(ops): show why the session check failed, not a guess
1c50591  fix(ops): correct whatsapp_leads columns, and stop a failed load looking like a rejected password
```

**Verification status: `tsc` last passed at `cf80ab6`. The four commits after it are NOT verified** — the previous session ran through a cloud bridge that could not finish a build on the OneDrive-backed folder. Run the full check before trusting anything.

```powershell
npx tsc --noEmit; if ($?) { npm run lint; if ($?) { npm run build } }
```

PowerShell 5.1 does not support `&&`. Use the `if ($?)` form above.

**Already applied to production Supabase** (`nxsdgjtqrhturlojtjlb`): the `staff` table, via `sql/ops-staff-accounts.sql`. Do not re-apply; it is idempotent but pointless.

---

## Copy-paste prompt for the next session

```
You are working on the Oraya production codebase.

# Read these files first (in this order, before any code change)
1. /docs/system/PROJECT_STATE.md       — current state and non-negotiable constraints
2. /docs/system/CURRENT_PHASE.md       — what is in scope right now
3. /docs/system/AGENT_RULES.md         — how you must behave (mandatory)
4. /docs/system/OPS_ADMIN_V2.md        — design record for the /ops rebuild (READ FULLY)
5. /docs/system/ADMIN_V2_PLAN.md       — the batch plan and remaining audit work
6. /docs/system/ADMIN_UI_AUDIT.md      — the 128 findings, incl. the C-1 retraction
7. /docs/system/ARCHITECTURE.md        — system shape
8. /docs/system/KNOWN_BUGS.md          — open issues

In your first response, list which of those files you read. If you skipped any, stop and explain why.

# Task
Complete the operator half of /ops: build the Enquiries screen with lead-to-booking
conversion, and the approve / decline / guest-messaging actions on a booking.

Context you cannot infer from the docs:
- /ops is built ALONGSIDE /admin. /admin must keep working untouched.
- The design rule from the owner is "structure, not text": no warning copy where a
  layout change will do. Guest messaging is gated behind a PREVIEW of the actual
  email and WhatsApp message, never behind "Are you sure?".
- The operator never calculates anything. Amounts pre-fill; the panel states the
  RESULT of what was typed. See components/ops/MoneyDialog.tsx for the pattern to
  follow.
- An approved clickable prototype of the target design exists. Ask the human for
  oraya-admin-prototype.html if you need to see the intended layout.

# Rules (in addition to AGENT_RULES.md)
- Production logic OK. API behavior OK for /api/ops/* only.
- CRITICAL: the guest email + WhatsApp dispatch logic currently lives inside
  app/api/admin/bookings/[id]/route.ts (approx. lines 573-639 for confirm).
  EXTRACT it into a shared lib/ module that BOTH /admin and /ops call. Do NOT
  copy it. Two copies of "message the guest" is how guests get double-messaged.
  The extraction must be behaviour-preserving: /admin must send exactly what it
  sends today.
- Verify every database column name against the live schema before using it.
  The previous session lost a cycle guessing whatsapp_leads columns. It is
  `name`, `follow_up_status`, `guest_count`, `normalized_check_in/out` — NOT
  `guest_name`, `status`, `guests`, `check_in/out`.
- Lead conversion must not be able to create duplicate bookings (audit L-1):
  remember the booking id returned by a successful POST and make any retry
  re-link only, never re-POST /api/bookings.
- Do not edit any real .env file. Do not invent secrets.
- Do not push to master. Push to the feature branch and open a PR.
- Minimal diff. No opportunistic refactors outside the named extraction.
- Stop and ask if a constraint conflicts with the task.

# Scope
- In scope: app/ops/**, app/api/ops/**, components/ops/**, lib/ops-*.ts,
  and the ONE extraction of guest-dispatch logic out of
  app/api/admin/bookings/[id]/route.ts into lib/.
- Out of scope: every other /admin page and route, pricing/quote computation,
  the payments provider layer, /app/book, any guest-facing page.
- Schema changes: forbidden. The staff table already exists and is sufficient.
- New dependencies: forbidden.

# Verification required (run these and paste output)
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Sign in at /ops, open an enquiry, convert it, and confirm exactly one booking
  is created. Paste the resulting row count.

# Final report format (mandatory — see AGENT_RULES.md §8)
## Files changed
- path (created | modified | deleted) — one-line reason

## Build / typecheck
- `npx tsc --noEmit`: <exit code> — <output or "clean">
- `npm run lint`:     <exit code> — <output or "clean">
- `npm run build`:    <exit code> — <output or "clean">

## Tests
- <command>: <exit code> — <pass/fail count or "no tests for this surface">

## Risks
- <bullet list, or "no risks identified after <specific check>">

## Out of scope / not done
- <bullet list, or "n/a">

## Verification the human should run
- <one or two specific click-paths>
```

---

## After that task, in order

1. **Team screen** — the API is complete (`/api/ops/staff`), only the UI is missing. Needed before an operator account can exist. Invite emails are not wired: `POST` returns a one-time token that nothing delivers yet.
2. **Availability**, then the owner screens: **Pricing**, **Extras**, **Payments**.
3. **Business** screen (owner-only): revenue, occupancy, add-on uptake, lead conversion.
4. **G11** — the remaining concurrency batch on the legacy admin (`B-16`, `S-8`, `R-6`). `B-13` is already fixed on the `/ops` side.
5. **G13** — calendar source CRUD. No API exists; changing a rotated Airbnb feed URL currently needs SQL by hand. Include the monitoring fix: `/api/cron/calendar-sync` returns 200 even when every feed fails, so cron-job.org shows green regardless.

---

## Environment notes for whoever runs this

`.env.local` needed repairing this session. `vercel env pull` returns **11-character placeholders** for variables Vercel marks "Sensitive", so it silently produces a broken file.

- `SUPABASE_SERVICE_ROLE_KEY` — must be copied by hand from the Supabase dashboard.
- `ADMIN_SECRET` — any random value works locally; it only signs cookies on that machine. The admin password lives in the database.
- `NEXT_PUBLIC_SUPABASE_URL` — `https://nxsdgjtqrhturlojtjlb.supabase.co`

Local dev points at the **production** database. There is no dev project. Test money flows on a booking you do not mind altering.

Sign in at `/ops` with the owner email and the same password used for `/admin`.

---

## One thing to hold on to

The most instructive failure of the last session was audit finding **C-1**: an agent read `vercel.json`, saw a daily cron, concluded the "syncs every 10 minutes" copy was false, and shipped a change replacing **true** copy with **false** copy. The real scheduler is an external cron-job.org job — invisible to any amount of code reading, and documented in `PROJECT_STATE.md` all along.

Before "correcting" anything that describes how the running system behaves, check the running system.
