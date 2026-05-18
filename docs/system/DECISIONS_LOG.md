# Decisions Log

Durable architectural and operational decisions. Append-only - never edit a past entry except to add a follow-up dated link below it. If a decision is reversed, add a new entry that explicitly supersedes the old one.

**Format:**

```
## YYYY-MM-DD - <short title>

**Decision:** what was decided.
**Reason:** why.
**Impact:** what changes (files, processes, future work).
**Reversible?:** yes / no / hard.
**Supersedes:** (optional) date + title of older entry this replaces.
```

---

## 2026-05-18 - Phase 16B.1 architecture freeze: payment link columns + provider abstraction

**Decision:** Phase 16B.1 is closed as the **architecture / scaffold step**. The following choices are locked before any Phase 16B.2+ implementation code lands:

1. **Schema shape.** One live payment link per booking, modeled as **additive nullable columns** on `bookings`, **not** a separate `payment_links` history table. The columns are: `payment_link_url`, `payment_link_provider`, `payment_link_expires_at`, `payment_link_issued_at`, `payment_link_status`, `payment_provider_session_id`. The SQL is recorded in [/sql/phase-16b1-payment-link-foundation.sql](../../sql/phase-16b1-payment-link-foundation.sql) and is **NOT applied in this commit** - it is human-gated and runs in the Supabase SQL editor at the start of Phase 16B.2.
2. **Status allow-list (locked v1):** `null` / `none` / `active` / `paid` / `expired` / `cancelled` / `failed`. Enforced by a `check` constraint that permits `null` so the locked `/api/bookings` POST insert path keeps writing booking rows with no payment-link columns set.
3. **Provider allow-list (locked v1 floor):** `manual` / `whish` / `stripe`. Enforced by a `check` constraint that permits `null`. `manual` and `whish` are the v1 floor (admin-driven, no external API today). `stripe` is reserved for the Phase 16B.5+ programmatic path; reserving the value now avoids a constraint migration when Stripe lands.
4. **Provider interface.** [lib/payments/provider.ts](../../lib/payments/provider.ts) declares the `PaymentProvider` interface plus the `PaymentLinkStatus` / `PaymentLinkProvider` / `PaymentCurrency` / `PaymentLinkPurpose` allow-lists, type guards, and `PaymentProviderEvent` / `PaymentBookingDelta` shapes. The file is **type-only** - no runtime, no Supabase imports, no SDK dependencies - so it can be safely added now without committing to any vendor. Concrete adapters (`manual.ts`, `whish.ts`, `stripe.ts`) land in 16B.3+.
5. **WhatsApp payment-reply branching contract.** [PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) section 4 is the deterministic mapping from `(bookings.status, payment_link_status, payment_status, refund_status)` to a single response string. The Butler is allowed to echo **only** those strings. The implementation lands in 16B.5 (`lib/payments/whatsapp-reply.ts` + `POST /api/butler/payment-status`).
6. **Currency discipline.** Every provider-interface method that touches money requires explicit currency (`USD` or `LBP`). No implicit currency. The Lebanese-market USD/LBP split makes this a correctness requirement, not just a hygiene preference.
7. **Idempotency anchor.** `payment_provider_session_id` is the single key the webhook handler uses to locate the booking and decide whether a delivered event is a duplicate. Every PATCH triggered by a webhook MUST be guarded by `eq("payment_provider_session_id", session_id)` plus an early-return when the resulting delta would be a no-op.
8. **Locked `/api/bookings` POST stays untouched.** Payment columns default to null on insert. There is **no** booking-creation behavior change in Phase 16B. The booking pipeline (overlap, pricing, addon-audit, email triggers, view-token issuance) remains the authoritative source of truth for stay state.

**Reason:** the schema-vs-table choice, the provider list, and the WhatsApp branching contract are the three architecture questions [PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) section 8.16B.1 marked as the approval gate before any payment code lands. Locking them now means 16B.2 (apply the migration + extend admin route allow-lists) and 16B.3 (admin payment UI + manual + Whish adapters) can each be a minimal, mechanical PR with no architectural debate. Picking `manual + whish` as the v1 provider floor (with `stripe` reserved but unimplemented) avoids both extremes: we are not locked into a single vendor, and we are not paying the cost of a full Stripe integration up front for a market that today settles primarily on Whish + cash + bank transfer.

Additive columns over a `payment_links` history table is justified because:

- One live link per booking is sufficient for the Whish "admin pastes a link" workflow and for the Stripe "session per booking" workflow.
- The admin diff helpers ([lib/admin-booking-diff.ts](../../lib/admin-booking-diff.ts)) and the admin data fetch ([app/api/admin/data/route.ts](../../app/api/admin/data/route.ts)) already enumerate `bookings.payment_*` columns one-by-one; continuing the convention keeps those surfaces ergonomic and avoids a per-booking join.
- Historical link-issuance audit (if ever needed) can be reconstructed from the existing webhook event logs or added in 16B.6 as a separate `payment_event_log` table without touching the per-booking shape.

**Impact:**

- New file: [/sql/phase-16b1-payment-link-foundation.sql](../../sql/phase-16b1-payment-link-foundation.sql). Additive `add column if not exists`, idempotent constraint drop-and-recreate, partial index on `(payment_link_expires_at) where payment_link_status = 'active'`, column comments. **NOT applied in this commit.** Phase 16B.2 kickoff applies it.
- New file: [/lib/payments/provider.ts](../../lib/payments/provider.ts). Type-only. No runtime behavior, no imports beyond TypeScript's standard library, no Supabase, no SDK. Exports `PAYMENT_LINK_STATUSES`, `PAYMENT_LINK_PROVIDERS`, `PAYMENT_CURRENCIES`, `PAYMENT_LINK_PURPOSES` const arrays plus matching types + type guards, the `CreatePaymentLinkInput` / `CreatePaymentLinkResult` shapes, the `PaymentProviderEvent` / `PaymentBookingDelta` shapes, and the `PaymentProvider` interface.
- [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) - section 8.16B.1 marked complete; scaffold file paths added.
- **No existing file modified beyond the doc.** No locked route touched. No schema applied. No env var consumed. `npx tsc --noEmit` clean. `npm run build` clean.

**Reversible?:** yes - trivially. To reverse this scaffold: delete both new files, revert the section 8.16B.1 status update in PHASE_16B_PLAN.md, and add a superseding entry here. No data has been migrated; no runtime path imports the provider types yet.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-18 prefill-handoff and provenance-linkage decisions below by adding the payment-state layer Phase 16B needs. Locks the schema-vs-table, provider-list, and WhatsApp-branching choices PHASE_16B_PLAN.md section 8.16B.1 deferred.

---

## 2026-05-18 - Phase 16A Butler ops closeout keeps WhatsApp as lead capture + website continuation, not booking submission

**Decision:** operational documentation for Phase 16A is aligned to the shipped architecture: WhatChimp / WhatsApp captures lead intent, calls `POST /api/butler/lead`, uses the returned `prefill_url` when present, and continues the guest into Oraya's existing `/book` flow. WhatsApp is **not** the authoritative booking submission surface in the current approved model, and Butler messaging must not imply payment collection, refund handling, or access/PIN delivery.

**Reason:** the shipped code now supports secure website continuation, guest/member gate persistence, continuation readiness, and best-effort `whatsapp_leads.linked_booking_id` back-linking after booking creation. Several docs still framed 16A around a planned `/api/butler/flow-submit` adapter or implied broader Butler capabilities than production actually has. That drift creates operational risk: humans may misconfigure WhatChimp, promise payment behavior that belongs to 16B, or rotate Butler secrets without coordinating Vercel and WhatChimp.

**Impact:**

- [CURRENT_PHASE.md](CURRENT_PHASE.md) now reflects the shipped Phase 16A state and frames the remaining work as ops closeout alongside the newer Phase 16B provisioning context.
- [PROJECT_STATE.md](PROJECT_STATE.md) and [ARCHITECTURE.md](ARCHITECTURE.md) now describe the live Butler/WhatChimp continuation flow more explicitly.
- [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) now hardens:
  - human escalation routing
  - WhatChimp prompt guidance for `prefill_url`
  - explicit "no payment promises in 16A" language
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) now includes a Butler secret rotation checklist covering Vercel + WhatChimp coordination and token invalidation expectations.

**Reversible?:** yes. The docs can be revised again when a future approved architecture changes the WhatsApp booking boundary.

**Supersedes:** refines the operational interpretation of the 2026-05-12 Butler architecture freeze and the 2026-05-18 prefill-handoff decision without changing the underlying code contracts.

---

## 2026-05-18 - WhatsApp lead -> booking provenance linkage in `/api/bookings` POST

**Decision:** the locked `/api/bookings` POST handler now accepts an optional `butler_prefill_token` in the request body. After a successful booking insert, the handler best-effort verifies the token with `verifyPrefillToken` from [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts) and, on success, updates `whatsapp_leads.linked_booking_id` with the new booking's id. The update uses an `.is("linked_booking_id", null)` race guard so an existing linkage is never overwritten. Every failure mode - missing/empty token, signature mismatch, expired token, missing lead, conflicting prior linkage, Supabase error - logs a server-side warning and returns early; **none of them block booking creation**.

**Reason:** Phase 16A's `/api/butler/lead` and `/api/butler/prefill` close the WhatsApp -> website hand-off direction, but until this decision there was no return path: a guest who clicked the prefill URL, completed the booking form, and submitted produced a booking row that was not linkable to the original lead in `/admin/leads`. Operators triaging from `/admin/leads` therefore could not see which leads converted. The lead -> booking provenance loop is the operational backbone Phase 16B's payment / WhatsApp lookup flow needs (to answer "what booking are we talking about?" deterministically when a guest replies on WhatsApp). The decision keeps the linkage non-authoritative - the booking, not the lead, remains the source of truth for stay state - and treats the link as a best-effort enrichment so the locked booking pipeline is never destabilized by Butler-side configuration drift (e.g. a rotated `BUTLER_PREFILL_SECRET`).

**Impact:**

- [app/api/bookings/route.ts](../../app/api/bookings/route.ts) now reads `butler_prefill_token` from the JSON body and, after the booking insert succeeds, calls a new internal `linkBookingToButlerLead` helper. The helper:
  - Returns silently if the token is missing, not a string, or empty.
  - Returns silently with a `console.warn` if `verifyPrefillToken` fails (invalid or expired).
  - Looks up the lead row by `lead_id`; warns + returns if the lead is missing.
  - No-ops if the lead is already linked to this same booking.
  - Warns + returns (without overwriting) if the lead is linked to a different booking.
  - Otherwise issues an atomic update guarded by `.is("linked_booking_id", null)` so concurrent submissions cannot stomp on each other.
- [app/book/page.tsx](../../app/book/page.tsx) stores the original `?h=...` handoff token in `sessionStorage` only after a successful prefill round-trip, sends the stored token as `butler_prefill_token` in the booking POST body, and clears it from `sessionStorage` after the booking view-token redirect.
- No new env var. `BUTLER_PREFILL_SECRET` (introduced 2026-05-18 in the prefill-handoff decision below) is now also consumed by `/api/bookings` via `verifyPrefillToken`. If the env is unset, verification cleanly returns `{ ok: false, reason: "invalid" }`, the warning is logged, and the booking proceeds - there is **no failure path that blocks booking creation**.
- **No schema changes.** The `whatsapp_leads.linked_booking_id` column already existed from the 2026-05-15 entry below; this decision adds a writer (the booking pipeline) on top of the existing 16A.2.e admin-PATCH writer.
- **No locked booking-creation logic changed.** Pricing, overlap protection, addon audit, email triggers, view-token issuance, and the API response shape are all untouched. The new linkage helper runs after the insert and after the booking response is computed.
- Docs: [CURRENT_PHASE.md](CURRENT_PHASE.md) "Just completed" entry added; [ARCHITECTURE.md](ARCHITECTURE.md) Butler flow section gains a line about the provenance writer; this entry is the durable record.

**Reversible?:** yes - easy. To reverse: drop the `butler_prefill_token` destructure, drop the `linkBookingToButlerLead` call site + helper, drop the `verifyPrefillToken` import, revert the three `app/book/page.tsx` storage helpers + their two call sites, and add a superseding entry here. No data corruption risk on reversal - the only persisted side-effect is the `linked_booking_id` enrichment, which is informational.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-18 prefill-handoff decision below (which introduced the token + lead row plumbing) by adding the lead -> booking return-path writer.

---

## 2026-05-18 - WhatsApp lead capture may mint an additive opaque `/book` prefill handoff

**Decision:** keep `whatsapp_leads` as the source of truth for WhatsApp-originated booking intent and add a short-lived opaque prefill handoff on top of it. `POST /api/butler/lead` may now return an additive `prefill_url` that points at `/book?h=<opaque-token>`, where `h` is signed only with `BUTLER_PREFILL_SECRET`. A new public `GET /api/butler/prefill?h=...` verifies the token, loads the lead row, and returns a strict safe-field allow-list only: `villa`, normalized `check_in`, normalized `check_out`, `sleeping_guests`, `full_name`, `source`.

**Reason:** the website handoff must let the guest continue without retyping information, but raw booking intent and PII must not appear in public query params. At the same time, lead capture is business-critical and must not fail solely because token issuance is unavailable. The additive handoff preserves both constraints: `whatsapp_leads` stays authoritative, the URL carries only an opaque token, and missing `BUTLER_PREFILL_SECRET` degrades gracefully by omitting `prefill_url` while still persisting the lead.

**Impact:**

- New helper: [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts) - HMAC-SHA256 signed opaque token with `{ lead_id, exp, jti, v:1, purpose:"prefill" }`, 2-hour TTL, timing-safe signature compare.
- New route: [app/api/butler/prefill/route.ts](../../app/api/butler/prefill/route.ts) - public GET endpoint, token-auth only, `Cache-Control: no-store`, 400 invalid token, 410 expired/missing lead, 500 safe server error.
- [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts) now attempts to issue `prefill_url` after successful insert, but catches token/config errors so lead capture still succeeds with the existing `{ ok, lead_id, message }` contract intact plus additive `prefill_url: null`.
- [app/book/page.tsx](../../app/book/page.tsx) now hydrates safe fields from `/api/butler/prefill?h=...`, uses only normalized date-only strings for date prefill, and strips `h` from the URL after success or failure so the page continues to work normally when prefill is unavailable.
- [lib/butler/leads.ts](../../lib/butler/leads.ts) now accepts WhatChimp-style normalized aliases `oraya_check_in` / `oraya_check_out` in addition to `normalized_check_in` / `normalized_check_out`, and drops reversed normalized ranges instead of persisting them for prefill.
- New env var: `BUTLER_PREFILL_SECRET`. Distinct from `BUTLER_WEBHOOK_SECRET`.
- **No schema changes.** `whatsapp_leads` shape is unchanged. No locked API touched. No raw WhatsApp text is used for `/book` hydration.

**Reversible?:** yes. Remove the new helper + route, remove the additive `prefill_url` behavior from the lead route, remove the `/book?h=...` hydration effect, delete the env-doc references, and add a superseding entry here.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-15 `whatsapp_leads` persistence decision by adding a non-authoritative website handoff layer without changing the table or the booking pipeline.

---

## 2026-05-15 - WhatsApp leads are persisted in `whatsapp_leads` before booking creation

**Decision:** WhatsApp / WhatChimp lead intake is persisted in a new operational Supabase table `whatsapp_leads` and surfaced through a new admin dashboard at `/admin/leads`. A new `POST /api/butler/lead` is the only writer; new `GET /api/admin/leads` and `PATCH /api/admin/leads/[id]` are the only readers/mutators. The lead is **not** a booking, and writing a lead does **not** create a booking row, hold dates, check availability, send email, issue a token, or trigger payment.

The Butler ingest reuses the existing 2026-05-12 Butler auth contract (`requireButlerAuth`, `X-Butler-Secret`, `BUTLER_WEBHOOK_SECRET`). The admin routes reuse the existing `requireAdminAuth` cookie/bearer contract from [lib/admin-auth.ts](../../lib/admin-auth.ts) - neither auth helper is modified.

**Reason:** WhatsApp conversations are not authoritative bookings. WhatChimp's labels and custom fields are vendor-internal, ephemeral, and not auditable from Oraya. Without an Oraya-owned table, the operator has no durable record of who reached out, what they wanted, or whether anyone followed up - and the locked `/api/bookings` POST pipeline cannot be the right home, since most leads will never become bookings (questions, lost opportunities, spam). Persisting leads in a separate table:

- Keeps the booking pipeline locked and authoritative for actual bookings.
- Gives the operator a single dashboard (`/admin/leads`) where every WhatsApp lead lands, with status, contact link, notes, and an optional `linked_booking_id` once a lead converts.
- Establishes the operational backbone that the future `POST /api/butler/flow-submit` (write-capable booking adapter) will hand off to once a lead is ready to become a real booking.

**Impact:**

- New schema (additive, explicitly approved): `public.whatsapp_leads`. RLS **enabled with no policies** - service role bypasses RLS so the Butler ingest + admin routes (both server-only via `SUPABASE_SERVICE_ROLE_KEY`) work, while every other client is denied by default. This is a stricter posture than the repo's existing operational tables (e.g. `booking_action_tokens` runs RLS off); the stricter default is chosen because there is no client-side use case for this table, only server-mediated access.
- New schema helper: [/sql/phase-16a2e-whatsapp-leads.sql](../../sql/phase-16a2e-whatsapp-leads.sql). Idempotent. Must be run once in the Supabase SQL editor before the endpoint can insert. Includes a `BEFORE UPDATE` trigger that keeps `updated_at` honest even on direct dashboard edits.
- New API: [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts), [app/api/admin/leads/route.ts](../../app/api/admin/leads/route.ts), [app/api/admin/leads/[id]/route.ts](../../app/api/admin/leads/%5Bid%5D/route.ts).
- New UI: [app/admin/leads/page.tsx](../../app/admin/leads/page.tsx). A single new "Leads" link added to [components/admin/AdminChrome.tsx](../../components/admin/AdminChrome.tsx) `NAV_ITEMS` - the minimum non-invasive change to make the page discoverable.
- New shared library: [lib/butler/leads.ts](../../lib/butler/leads.ts) - pure helpers for input normalization (Butler ingest), patch validation (admin PATCH), and the canonical `FOLLOW_UP_STATUSES` allow-list (mirrored by the SQL check constraint).
- Docs: [ARCHITECTURE.md](ARCHITECTURE.md) API surface table + Butler flow section + schema list updated. [CURRENT_PHASE.md](CURRENT_PHASE.md) "Just completed" entry added. [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) gets an operator note that human triage lives in `/admin/leads`, not WhatsApp scrollback.
- **No existing schema changes.** `bookings`, `addons`, `settings`, `booking_action_tokens`, `members` are untouched. No existing RLS policy modified. No existing column added, removed, renamed, or retyped.
- **No new env var.** `BUTLER_WEBHOOK_SECRET` and `ADMIN_SECRET` are reused as-is. `ENVIRONMENT_MAP.md` not modified.
- **Boundaries - what this does NOT do:** create bookings, reserve / hold dates, check availability, send emails, issue tokens, expose access details / Wi-Fi / PIN / exact villa location / payment information / IBANs, surface raw Supabase errors, expose other guests' data via this surface. Raw Supabase / driver errors collapse to safe `error: "server_error" }` 500s - logged server-side only.

**Reversible?:** yes. To reverse:
1. `drop table if exists whatsapp_leads cascade;` (loses captured leads - export first if needed).
2. Delete the four new route files, the new admin page, the new lib, and the SQL helper.
3. Revert the single-line `NAV_ITEMS` addition in `components/admin/AdminChrome.tsx`.
4. Revert the docs additions and add a superseding entry here.
No external consumer is locked in - WhatChimp can be unconfigured without affecting any locked surface.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-12 Butler architecture freeze (read-only `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET`) by introducing the **first Butler write** - but only to a brand-new operational table that is explicitly outside the booking pipeline. The 2026-05-12 source-of-truth boundary (Oraya owns pricing/availability/booking/access; the Butler must never invent them) is preserved.

---

## 2026-05-14 - `/api/butler/normalize-dates` added as additional read-only Butler endpoint

**Decision:** ship [app/api/butler/normalize-dates/route.ts](../../app/api/butler/normalize-dates/route.ts) (backed by [lib/butler/normalize-dates.ts](../../lib/butler/normalize-dates.ts)) as a secret-guarded `POST` endpoint that normalizes natural-language date text from WhatChimp (e.g. `"this Saturday"`, `"June 10"`, `"10 June 2026"`, `"two nights"`, ISO) into a structured `{ status, check_in, check_out, nights, human_readable, safe_message }` suggestion. Output is always advisory: even when both dates parse cleanly the endpoint returns `status: "needs_confirmation"` so the Butler must echo the parsed dates back to the guest for confirmation before any availability check.

**Reason:** the WhatsApp Butler / WhatChimp surface receives free-form guest text long before it ever calls the locked `/api/bookings/availability` route. Without a deterministic, server-side normalizer the Butler would have to either (a) push date parsing into AI Training (which the 2026-05-12 architecture freeze and [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) explicitly forbid for any source-of-truth field) or (b) round-trip every phrasing variant through a human. A small, dependency-free, allow-listed parser inside Oraya keeps the Butler vendor-agnostic, leaves availability/pricing/booking ownership untouched, and gives 16A.2's `flow-submit` adapter a canonical pre-step it can rely on.

**Impact:**

- New files: [lib/butler/normalize-dates.ts](../../lib/butler/normalize-dates.ts) (pure parser; no dependencies, no `new Date(<text>)` calls - guest text is tokenized explicitly and dates are constructed via `Date.UTC(...)`), [app/api/butler/normalize-dates/route.ts](../../app/api/butler/normalize-dates/route.ts) (POST handler; same 503/401/200 contract as every other `/api/butler/*` route).
- **Reuses the existing 2026-05-12 Butler auth contract** ([lib/butler/auth.ts](../../lib/butler/auth.ts) `requireButlerAuth`, `X-Butler-Secret` header validated against `BUTLER_WEBHOOK_SECRET`). No new env var, no new secret, no change to that auth decision.
- [ARCHITECTURE.md](ARCHITECTURE.md) - API surface table gains a new `/api/butler/normalize-dates` row; the Butler flow "Read endpoints" section gains a bullet describing the helper.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) - "Just completed" lists this as additional 16A.2 read-only Butler scaffolding. Active sub-phase remains `flow-submit`.
- **No locked-API touches, no schema changes, no new dependencies, no DB reads/writes, no email sends, no token issuance, no availability lookups.** The endpoint is pure text -> structured suggestion.
- The Butler still must call `/api/butler/availability` and ultimately `/api/bookings` for any real-world decision; `normalize-dates` is a pre-step, never an authority on whether a stay can happen.

**Reversible?:** yes - trivially. To reverse: delete the two new files, drop the route row + bullet from `ARCHITECTURE.md`, and add a superseding entry here. No data persisted; no external consumer locked in.

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-12 architecture freeze (read-only `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET` auth contract) and the 2026-05-12 [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) rule that AI Training must never own deterministic fields.

---

## 2026-05-12 - Butler Playbook established as operational source-of-truth

**Decision:** [/docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) is the operational source-of-truth for the WhatsApp AI Butler's identity, conversation behavior, knowledge boundary, and forbidden behaviors. Every WhatChimp configuration, AI prompt, and future agent extending the Butler surface reads it before extending or modifying Butler-facing behavior.

**Reason:** the 2026-05-12 architecture freeze (entry below) locked the **data plane** - namespace, secret, source-of-truth boundary, implementation order. It did **not** lock the **operational plane** - tone, when to escalate, when to upsell, what the AI must never invent. Without a durable, version-controlled rulebook, those rules would live only in chat memory and the WhatChimp admin UI: both ephemeral and untraceable. The playbook closes that gap.

**Impact:**

- Created [/docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) with sections on identity, conversation behavior, availability philosophy, pricing philosophy, VIP handling, add-on philosophy, knowledge source-of-truth, event vs stay separation, deferred future-phase systems, and forbidden AI behavior. Plus a cross-reference index back to the data-plane docs.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) - "Just completed" updated with the playbook + the minor 16A.1.x villa-slug helper extraction.
- [ARCHITECTURE.md](ARCHITECTURE.md) - Butler flow section cross-references the playbook.
- **No code paths consume the playbook directly.** It is read by humans configuring WhatChimp, by AI prompt authors, and by future repo agents extending the Butler surface. No runtime dependency; no risk to production systems.

**Reversible?:** yes - the playbook is documentation. To reverse: delete the file and add a superseding entry here. Not recommended; operational rules would scatter again.

**Supersedes:** does not supersede a prior decision. Complements the 2026-05-12 architecture freeze (entry directly below) by adding the operational layer the freeze did not cover.

---

## 2026-05-12 - Phase 16A Butler architecture freeze - `/api/butler/*` namespace + `BUTLER_WEBHOOK_SECRET`

**Decision:** the Phase 16A WhatsApp AI Butler integration is locked to the following architecture before any code lands:

1. **Endpoint namespace:** `/api/butler/*`. Not `/api/whatchimp/*`. The name describes what the surface does (AI Butler / concierge intake), not which vendor calls it. WhatChimp is the current caller; future swaps (Meta-direct webhook, alternative routing platforms) reuse the same routes without renaming.
2. **Shared secret:** `BUTLER_WEBHOOK_SECRET`. Server-only. Must never be exposed in a `"use client"` component or any `NEXT_PUBLIC_*` variable. Distinct from `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `ADMIN_SECRET` - do not reuse. Placeholder reserved in [/.env.example](../../.env.example) and [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md); no code path consumes it yet (wired in Phase 16A.1).
3. **Auth model:** for 16A.1 the floor is shared-secret-in-header (`X-Butler-Auth: ${BUTLER_WEBHOOK_SECRET}`). Once WhatChimp confirms it supports outbound request signing, upgrade to HMAC over `timestamp + "\n" + raw_body` with a 5-minute drift window for replay protection. The bare shared secret remains the fallback contract; HMAC is additive.
4. **Source-of-truth boundary:** the Oraya backend (Supabase + the locked `/api/bookings*` surface) is the only authority for pricing, availability, add-ons, booking status, access codes, refund eligibility, and policy text. WhatChimp, WhatsApp Flows, and AI Training **must not** own, paraphrase, or cache any of these. The AI Butler may relay deterministic strings Oraya returns; it must not generate its own quotes or status claims.
5. **Implementation order:** 16A.1 ships read-only Butler endpoints (`/api/butler/health`, `/api/butler/event-types`, `/api/butler/addons`, `/api/butler/availability`). Booking writes, payment, smart-lock, member linking, and AI prompt tuning come later (16A.2+, 16B-16E). The locked API surface is not modified.

**Reason:** the Phase 16A audit (2026-05-11) identified vendor-coupled naming, ad-hoc auth schemes, and source-of-truth duplication as the dominant failure modes for WhatsApp integrations of this shape. Locking the namespace, the secret name, the auth model, and the read/write boundary up front prevents:

- Renaming churn if WhatChimp is later replaced.
- Secret-name collisions or accidental reuse of existing HMAC keys.
- Hallucinated quotes/availability from AI Training, which the audit flagged as the single most expensive trust failure.
- Schema or locked-API drift, because every subsequent 16A step now has an explicit constraint to point at.

**Impact:**

- [CURRENT_PHASE.md](CURRENT_PHASE.md) - rewritten to mark Phase 16A.1 (read-only Butler API foundation) as the next active phase; the 16A audit and the 16A.0 architecture freeze recorded under "Just completed".
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) - `BUTLER_WEBHOOK_SECRET` added as a reserved, **not-yet-consumed** server-only secret. Sensitive when wired; explicit guidance against `NEXT_PUBLIC_*` exposure; not yet required in any environment.
- [/.env.example](../../.env.example) - placeholder `BUTLER_WEBHOOK_SECRET=replace_with_butler_webhook_secret` added with a comment pointing at this entry and confirming "not yet consumed".
- **No code, no schema, no API routes touched.** This commit is documentation only. The first code consumer of `BUTLER_WEBHOOK_SECRET` lands in Phase 16A.1.

**Reversible?:** yes - easy. To reverse: drop the `BUTLER_WEBHOOK_SECRET` line from `.env.example` and `ENVIRONMENT_MAP.md`, rewrite `CURRENT_PHASE.md` to a different next-phase, and add a superseding entry here. Do not delete this entry; supersede it.

**Supersedes:** does not supersede a prior decision. Establishes the Phase 16A architecture baseline that Phase 16A.1+ must respect.

---

## 2026-05-09 - `RESEND_FROM_EMAIL` removed from env contract; from-address stays hardcoded

**Decision:** `RESEND_FROM_EMAIL` is no longer part of the Oraya env contract. It has been removed from [/.env.example](../../.env.example) and removed from the active inventory in [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md). The Resend `from:` value remains hardcoded as `Oraya Reservations <bookings@stayoraya.com>` (the `FROM_EMAIL` constant in each `lib/send-*-email.ts`) for the foreseeable future.

**Reason:** the variable was reserved but consumed by zero code paths (KNOWN_BUGS.md #1). Leaving it in `.env.example` and the audit doc created false expectations: an operator setting it in Vercel would see no effect, silently, with no log line to indicate the setting was inert. Removing the variable from the contract makes the current behavior - a hardcoded sender - the documented behavior, and removes a footgun. A configurable sender is fine to add later, but only as an explicit, approved implementation task that wires `process.env.RESEND_FROM_EMAIL` into each `lib/send-*-email.ts` and reintroduces the variable in `.env.example` and the env map at the same time. This commit performs none of that wiring.

**Impact:**

- [/.env.example](../../.env.example) - `RESEND_FROM_EMAIL=...` line plus its two preceding comment lines removed; replaced with a short comment that points readers at this decision entry.
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) - row removed from the at-a-glance inventory table; per-variable section replaced with a "removed by decision" notice; Vercel checklist note about non-sensitive variables updated; "expected gap" and "known gap" follow-up bullets removed.
- [KNOWN_BUGS.md](KNOWN_BUGS.md) - entry #1 flipped to `closed (resolved 2026-05-09)` with a pointer to this entry. Numbering preserved so the other open bugs keep their IDs.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) - open-issues bullet removed, "Just completed" bullet added, "Next recommended steps" item renumbered.
- **No code changed.** No `lib/send-*-email.ts` file was modified in this commit. Email send behavior is identical before and after.
- The historical reference in the 2026-05-09 "Environment audit baseline" entry below ("including `RESEND_FROM_EMAIL` reserved-but-unused") is preserved as-is per the append-only rule of this log - it accurately describes what the audit found at that moment.
- A stale informational mention remains in [/README.md](../../README.md) ("currently hardcoded... unless you later wire `RESEND_FROM_EMAIL`"). It is still factually accurate (current state: hardcoded; future state: would require wiring) and was outside the explicit scope of the cleanup task. It can be tightened in a future README pass.

**Reversible?:** yes - easy. To reintroduce, perform the wiring work in `lib/send-*-email.ts` and re-add the variable to `.env.example` and `ENVIRONMENT_MAP.md` in the same PR. Do not re-add the variable without the wiring; that would re-create the original footgun.

**Supersedes:** does not supersede a prior decision; resolves [KNOWN_BUGS.md](KNOWN_BUGS.md) entry #1.

---

## 2026-05-09 - `/docs/system/` is the AI source of truth

**Decision:** all AI-facing project documentation lives in [`/docs/system/`](.) as version-controlled Markdown. ChatGPT chat memory and side-channel notes are no longer authoritative. New AI sessions read this directory first.

**Reason:** chat threads are ephemeral, drift across providers (ChatGPT / Claude Code / Codex / Cursor), and have no diff history. Repo-tracked docs are durable, reviewable, and reachable from every agent. Long ChatGPT conversations were starting to disagree with the actual repo state.

**Impact:**

- Created `/docs/system/{PROJECT_STATE,CURRENT_PHASE,AGENT_RULES,ARCHITECTURE,DECISIONS_LOG,KNOWN_BUGS,AGENT_HANDOFF_TEMPLATE,CHATGPT_PROJECT_INSTRUCTIONS}.md`. (`ENVIRONMENT_MAP.md` already created in the prior commit.)
- Existing root-level docs ([/PROJECT_STATE.md](../../PROJECT_STATE.md), [/AGENTS.md](../../AGENTS.md), [/CLAUDE.md](../../CLAUDE.md), [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md), [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md)) are kept intact and remain valid where they don't conflict with `/docs/system/`. The new `/docs/system/PROJECT_STATE.md` is the authoritative summary; the root `/PROJECT_STATE.md` is the historical detail log.
- Every PR that changes behavior described in a `/docs/system/` file must update that file in the same PR (see [AGENT_RULES.md](AGENT_RULES.md) rule 11).
- ChatGPT Project Instructions field will be populated from [CHATGPT_PROJECT_INSTRUCTIONS.md](CHATGPT_PROJECT_INSTRUCTIONS.md) so every new chat starts with the same orientation.

**Reversible?:** yes - but reverting means losing the cross-agent consistency benefit; not recommended.

---

## 2026-05-09 - `.gitignore` explicitly protects all `.env*` variants

**Decision:** `.gitignore` lists every Next.js env-file variant by name (`.env`, `.env.local`, `.env.development`, `.env.development.local`, `.env.production`, `.env.production.local`, `.env.test`, `.env.test.local`) instead of relying solely on `.env*.local` glob.

**Reason:** the previous pattern `.env*.local` matched `.env.production.local` but **not** `.env.production`. Anyone saving a prod env snapshot under that name would have committed it. The hole is closed and made obvious by listing every variant.

**Impact:**

- [/.gitignore](../../.gitignore) updated.
- `.env.example` (placeholders only) remains the single tracked env file.
- Verified with `git check-ignore -v` against all variants.

**Reversible?:** yes, but no reason to.

---

## 2026-05-09 - `.env.example` uses explicit `replace_with_*` placeholders

**Decision:** `.env.example` switched from empty values (`KEY=`) to explicit placeholder values (`KEY=replace_with_<thing>`) plus per-variable "where to get it" comments. Cross-links to [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).

**Reason:** empty values are easy to overlook and easy to commit unfilled. A literal `replace_with_*` placeholder both documents intent and fails loudly in tooling that validates env var format. The "where to get it" notes shorten onboarding from minutes-of-grep to one read.

**Impact:** [/.env.example](../../.env.example) updated. Local devs and Vercel admins now see the source for each value inline.

**Reversible?:** yes.

---

## 2026-05-09 - Environment audit baseline

**Decision:** [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) is the single source of truth for every `process.env.*` read in the repo. Re-audited on every release that touches API routes, lib helpers, or `vercel.json`.

**Reason:** secrets sprawl across `.env.example`, README, AGENTS.md, CLAUDE.md, and ad-hoc Vercel notes had drifted. One canonical map removes guesswork around scope, risk, and rotation.

**Impact:**

- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) created (10 variables documented, including `RESEND_FROM_EMAIL` reserved-but-unused and `NODE_ENV` system-managed).
- Three open issues surfaced and now tracked in [KNOWN_BUGS.md](KNOWN_BUGS.md).

**Reversible?:** no - once the audit baseline exists, future agents are expected to keep it current.

---

<!-- New entries go above this line, newest first. Old entries never deleted. -->
