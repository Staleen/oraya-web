# Ops Admin v2 — design record and current state

**Started:** 2026-08-01/02 · **Branch:** `claude/admin-booking-reference-search`
**Status:** operator foundation built and running locally at `/ops`. Not merged, not deployed.
**Companion docs:** `ADMIN_V2_PLAN.md` (the batch plan), `ADMIN_UI_AUDIT.md` (the 128 findings)

---

## 1. Why this exists

Oraya is hiring an operator — someone who did not build the system and will run day-to-day work: answering WhatsApp enquiries, converting them to bookings, approving stays and add-ons, chasing and recording money, and handling arrivals.

The existing `/admin` cannot be handed to that person. Two reasons, and only the second is about looks:

1. **It is organised around data, not work.** Eight pages named after database tables (Dashboard, Bookings, Leads, Calendar, Members, Rates, Media, Settings). To do a job you must already know which page holds it. `/admin/bookings` is a 2,100-line console where confirming a stay, requesting a deposit, recording a payment and recording a refund all live inside expanded cards, several scrolls down.
2. **There is one shared password and no identity.** The session cookie payload is `{ exp }` — an expiry and nothing else. No action is attributable to a person, and "operators cannot change pricing" is unenforceable, because every `/api/admin/*` route accepts any valid session regardless of what the menu shows.

> **Scope note.** The owner's screens are *not* being simplified. Same design language, same quality, more power. The split is access, not sophistication.

---

## 2. Design principles

These came directly from the owner and govern every screen. The governing sentence was:

> "The solution is not putting text and notes — the solution is to have a user friendly user interface."

**Structure over text.** A warning is what you add when the layout is wrong. Prefer changing what is on screen over explaining a hazard.

**Preview over confirmation.** Nothing that messages a guest is gated behind "Are you sure?". It is gated behind seeing the actual email and the actual WhatsApp message rendered as the guest will receive them. Sending *is* looking at it.

**The system calculates, the person confirms.** The operator never does arithmetic. Amounts pre-fill from what is owed; the panel underneath states the *result* of what was typed — "Nadia will be fully paid", "$400 will still be outstanding", "that is more than they owe".

**Undo over confirm.** Reversible actions complete immediately with an Undo affordance. Confirmation dialogs are reserved for the irreversible.

**Absent, not disabled-with-a-warning.** Things an operator must not touch are not on their screen at all — and are refused by the API, not merely hidden.

**Never render a failure as an empty state.** The most dangerous bug class in the old admin: a failed fetch producing a convincing "nothing needs you today". Enforced in code, see §5.

---

## 3. Architecture

`/ops` is built **alongside** `/admin`, not on top of it. `/admin` is untouched and keeps running. Switch-over happens when `/ops` is genuinely better, so there is never a half-redesigned state.

| Concern | `/admin` (legacy) | `/ops` (new) |
|---|---|---|
| Login | one shared password | per-person accounts |
| Cookie | `oraya_admin`, payload `{ exp }` | `oraya_ops`, payload `{ sub, role, exp }` |
| Session TTL | 7 days | 12 hours |
| Guard | `requireAdminAuth` | `requireOps({ requiredRole? })` |
| Data | `GET /api/admin/data` | `GET /api/ops/data` |

**Why a separate data endpoint.** Letting an ops session through the admin guard would have opened *every* `/api/admin/*` route to operators — including rates and the live-payments switch. That is precisely the boundary roles exist to draw, so `/ops` gets its own operator-safe read.

**Roles.** `requireOps` re-reads the staff row on every request rather than trusting the cookie's role claim, so deactivating someone or changing their role takes effect immediately instead of at the end of a 12-hour session. It fails closed when the lookup errors.

---

## 4. What exists

### Database
`public.staff` — `id, email, full_name, role (owner|operator), password_hash, invite_token_hash, invite_expires_at, is_active, last_login_at, created_by, created_at, updated_at`. RLS enabled with no policies, so it is reachable only via the service role, matching every other admin-owned table. Case-insensitive unique email.

Migration: `sql/ops-staff-accounts.sql`. **Already applied** to project `nxsdgjtqrhturlojtjlb`. The owner row is seeded from the existing `settings.admin_password` value, so the owner signs in with the password they already use. Password hashing reuses `lib/admin-password.ts` (scrypt) — no second scheme was introduced.

### API
| Route | Access | Purpose |
|---|---|---|
| `POST /api/ops/login` | public | email + password, IP-throttled |
| `POST /api/ops/logout` | public | clears the cookie |
| `GET /api/ops/me` | any staff | current identity |
| `GET /api/ops/data` | any staff | bookings, leads, calendar sources |
| `PATCH /api/ops/bookings/[id]` | any staff | `record_payment`, `record_refund`, `approve`, `decline` |
| `GET /api/ops/bookings/[id]/message-preview` | any staff | what the guest WILL receive for approve/decline — recipient, full email content, WhatsApp send decision (real gates, nothing claimed or sent) |
| `PATCH /api/ops/leads/[id]` | any staff | follow-up status, notes, conversion link (L-6 guard: non-null link only writes over null, else 409 `already_linked`) |
| `GET/POST /api/ops/staff` | **owner only** | team list, invite |
| `PATCH/DELETE /api/ops/staff/[id]` | **owner only** | role, enable/disable, remove |
| `POST /api/ops/invite/accept` | public | redeem a one-time invite: prove the token (scrypt-verified against pending invites), set a min-12-char password, sign in. Same IP throttle as login; one indistinguishable 400 for unknown/expired/used/deactivated; single-use via a `password_hash IS NULL` write guard |

**Approve / decline** write the same status values the legacy admin writes, race-guarded on the status the operator was shown (else 409), run the same pre-write availability-conflict check + exclusion-violation handling on approve, and hand guest messaging to **`lib/booking-guest-dispatch.ts`** — the ONE copy of "message the guest about a status change", extracted verbatim from the admin PATCH route (which now calls it too; explicitly authorized edit). Event inquiries are refused by the API — their proposal flow stays in the legacy admin until the /ops event screens exist.

Login returns one indistinguishable 401 for unknown account, not-yet-activated, deactivated and wrong password, so the endpoint cannot be used to discover which addresses are real. A throttle block reports itself as a throttle, not as a wrong password.

### UI
- `components/ops/ui.tsx` — tokens and primitives (Button, Badge, Card, Banner, QueueRow, EmptyState, Field, Ref), plus a reactive `useIsMobile`.
- `components/ops/OpsProvider.tsx` — auth state, 45s poll with a pause hook, keeps previous data on a failed refresh, awaits sign-out.
- `components/ops/OpsShell.tsx` — role-aware nav; sidebar on desktop, bottom bar on mobile.
- `components/ops/SignIn.tsx`, `components/ops/MoneyDialog.tsx`.
- `components/ops/MessagePreviewDialog.tsx` — approve / decline / cancel gated behind the rendered messages (preview-over-confirmation); reports the email + WhatsApp outcome after sending.
- `components/ops/ConvertLeadDialog.tsx` — lead → pending booking request through the locked `POST /api/bookings`; remembers the created booking id so a retry only re-links (L-1).
- `lib/ops-queue.ts` — **pure** derivation of the work queue, `now` passed in for deterministic testing.
- `lib/booking-guest-dispatch.ts` — the shared guest-messaging module both `/admin` and `/ops` call.
- Screens: **Today** (queue), **Enquiries** (list + detail, notes, WhatsApp reply link, conversion; the guest's raw date words always shown beside normalised dates — L-5), **Bookings** (searchable list), **Booking detail** (lifecycle + money + approve/decline/cancel behind previews), **Team** (owner-only: invite via one-time copyable link shown exactly once, role change, disable/re-enable, remove; the API's last-owner lockout guard surfaces as its own message), **Availability** (read-only: 3-month per-villa occupancy from confirmed stays — events include their setup day — plus external blocks, with per-feed sync freshness honestly staged fresh / limping / dead against the real 10-minute schedule). `app/ops-invite/[token]` (deliberately outside the /ops auth shell) is where an invite link lands: set password → signed in. Pricing, Extras, Payments are placeholder pages.
- `GET /api/ops/data` additionally returns active `external_blocks` (ending within the last month or later) for the Availability screen.

### Queue ranking
Booking requests climb fastest with age (a guest who books elsewhere is the most expensive thing to miss), then refunds owed, overdue payments, add-on approvals, unsent arrival guides. Grouped as *Needs you now* / *Money* / *Arriving soon*.

---

## 5. Audit findings fixed structurally

Rather than as copy or warnings:

- **B-13 concurrent payment overwrite** — `record_payment` / `record_refund` send the value the operator was shown; the update only applies if the database still holds it, else 409 with "someone else changed this". With one shared login this race was theoretical; with two people it is not.
- **D-2 stale modal** — the booking is derived from the live array on every render, never a click-time copy.
- **D-4 / L-4 empty-vs-failed** — `EmptyState` takes a required `reason: "clear" | "load-failed"`. It is not possible to render a failed load as "nothing to do" by omission. `GET /api/ops/data` returns 503 on any failed query rather than partial data.
- **B-1 findability** — bookings searchable by reference, full id, name, email, phone digits.
- **X-4 breakpoints** — one `useIsMobile` (matchMedia + listener), one breakpoint constant.
- **G10** (`X-1, X-2, X-3, X-5, X-6, X-7`) applied to the **legacy** `/admin` as well.

---

## 6. Not built yet

1. ~~**Enquiries** + lead → booking conversion~~ — built 2026-08-07 (with the L-1 + L-6 guards).
2. ~~**Approve / decline / messaging**, with the message previews~~ — built 2026-08-07. The dispatch logic was extracted into `lib/booking-guest-dispatch.ts`, called by both admins. Note: the email preview mirrors `lib/send-booking-email.ts` content display-only; if that locked email ever changes substantively, the preview copy in `app/api/ops/bookings/[id]/message-preview/route.ts` must be updated alongside it (the SEND cannot drift — only the preview styling can). `/ops` events remain excluded (proposal flow stays legacy-admin).
3. ~~**Team** screen~~ — built 2026-08-07, with the accept-invite flow (`/ops-invite/[token]` + `POST /api/ops/invite/accept`). Invite delivery is deliberately **link-only** (owner copies the one-time link and sends it by WhatsApp); a Resend invite email remains future work.
4. ~~**Availability**~~ — built 2026-08-07 as read-only occupancy + feed freshness. The owner screens: **Pricing, Extras, Payments** — still open.
5. **Business** screen (owner-only) — revenue, occupancy, add-on uptake, lead conversion. Owner information, deliberately not on the operator's landing page.
6. ~~Unit tests for `lib/ops-queue.ts`~~ — `lib/ops-queue.test.mts` added 2026-08-07 (12 tests; also pins the `villaName` double-prefix fix — queue rows previously rendered "Villa Villa Mechmech" for canonical booking villa values).
7. **Event enquiry handling in /ops** — proposals, event approval, and event lead conversion (all deliberately refused by the /ops API today).
8. **Calendar-source CRUD + sync monitoring fix** (G13) — the Availability screen shows feed freshness but cannot add/edit/disable feeds, and `/api/cron/calendar-sync` still returns 200 when every feed fails.

---

## 7. Gotchas discovered — read before continuing

**Verify column names against the live database.** `whatsapp_leads` uses `name`, `follow_up_status`, `guest_count`, `normalized_check_in/out` — *not* `guest_name`, `status`, `guests`, `check_in/out`. Guessing these cost a debugging cycle in which a 503 presented as a rejected password. `follow_up_status` values in use: `new`, `contacted`, `converted`.

**A static code audit cannot see infrastructure.** Audit finding **C-1** claimed the calendar-sync copy was false because `vercel.json` has a daily cron. It was wrong: an external **cron-job.org** job calls `/api/cron/calendar-sync` every 10 minutes, recorded at `PROJECT_STATE.md:137`. G8 replaced true copy with false copy and shipped it. Retracted in commit `7be1505`. Treat any "the code says X, so the claim is wrong" finding as unproven until the running system is checked.

**Related, still open:** `/api/cron/calendar-sync` returns HTTP 200 with `ok: true` even when every feed fails — `sources_failed` is in the body, not the status. The external monitor therefore shows green regardless. Fix belongs with G13.

**Vercel "Sensitive" env vars cannot be pulled.** `vercel env pull` returns 11-character placeholders for them. `SUPABASE_SERVICE_ROLE_KEY` must be copied from the Supabase dashboard by hand. `ADMIN_SECRET` can be any random value locally — it only signs cookies on that machine; the admin password lives in the database.

**`useSearchParams` needs a Suspense boundary** in Next 16 or the build fails.

**Local dev points at the production database.** There is no separate dev project. Test money flows on a booking you do not mind altering.

---

## 8. Open decisions

- **Where `/ops` lives long-term.** Currently a second route. Eventually `/admin` should redirect to it and the legacy pages be deleted — not before the owner screens exist.
- **Design tokens.** `/ops` has its own token set in `components/ops/ui.tsx`, mirroring the guest dark theme. `components/admin/theme.ts` gained a parallel set (V1) for the legacy admin. These should converge on the guest-side `--oraya-*` CSS variables once the legacy pages are retired.
- **Invite delivery.** `POST /api/ops/staff` returns a one-time invite token; nothing emails it yet. Needs a Resend template and an accept-invite page.
