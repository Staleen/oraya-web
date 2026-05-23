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

## 2026-05-23 - Website WhatsApp CTA prefills become structured markers (`#ORAYA_REF:<ref>` / `#ORAYA_CHANGE:<ref>`)

**Decision:** the two website-side WhatsApp CTAs that pre-fill the WhatsApp compose box (booking-view "WhatsApp us" and booking-confirmed "Change/cancel via WhatsApp") now emit a structured marker instead of a human sentence. `bookingWhatsAppPrefill(ref)` in [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) returns `#ORAYA_REF:<ref>`; `bookingWhatsAppChangePrefill(ref)` returns `#ORAYA_CHANGE:<ref>`. The no-reference fallback constants (`WHATSAPP_GENERAL_CONTACT_PREFILL`, `WHATSAPP_CANCEL_CHANGE_NO_REF`) remain plain human sentences and continue to enter the welcome flow. The two markers are operator-routing infrastructure that WhatChimp triggers on; the guest never needs to understand them. Normal greetings (`"hi"`, `"hello"`, free-form questions) continue to enter the existing welcome menu — the markers are emitted only by website CTAs, never by user typing.

**Reason:** even after the 2026-05-23 `message_text` field on `/api/butler/identify` shipped, the website prefill `"Hello Oraya — booking reference A0B8CECB"` still required WhatChimp to route on the keyword `"booking reference"`. That keyword could be typed by a user manually, and the trigger had no way to distinguish "guest arrived from the website CTA and the reference is in the message body" from "guest typed the phrase by hand and may or may not have the reference." Routing was correct but the bot could not safely skip the welcome menu without risking false-positive routing on hand-typed messages. A dedicated marker — chosen to be visually distinct (`#`-prefixed), case-insensitive, and impossible to type accidentally — gives WhatChimp an unambiguous routing signal while staying plain text inside the WhatsApp UI. The 8-char reference embedded in the marker is still the public guest-facing support code, so no new disclosure boundary is crossed. The marker is forward-compatible with the existing `message_text` extractor: `\b[0-9A-Fa-f]{8}\b` matches the reference cleanly inside `#ORAYA_REF:A0B8CECB` because `:` and `#` are non-word characters and the word boundary holds.

The audit explicitly considered and rejected:

- **Bare 8-character reference prefill** (`"A0B8CECB"`). Rejected — WhatChimp's exported flow has no regex / pattern primitive available at the trigger or condition layer (only `contains` / `equal`), so a bare hex string cannot be distinguished from any other 8-character text the user might type. A trigger keyword of `""` or a default/catch-all would fire on every unmatched message — bad UX for typos and random replies.
- **Keep the existing human sentence and rely on `message_text` extraction alone.** Rejected — it works, but leaves the welcome-menu redundancy in place for guests who arrived from the website CTA. The marker eliminates that redundancy AND remains compatible with the extractor.
- **Hide the marker via WhatsApp formatting / invisible characters.** Rejected — WhatsApp does not support invisible characters in compose; any escape would be visible to the guest. The marker stays plain text and accepts that the guest sees `#ORAYA_REF:A0B8CECB` in their chat — short, neutral, and self-evidently a routing tag.
- **Use one marker for both CTAs and disambiguate intent server-side.** Rejected — the change/cancel intent is operator routing, not a server decision. WhatChimp branches to a different downstream path for `#ORAYA_CHANGE:`; folding both into one marker would force the bot to ask the guest "are you changing or viewing?", which defeats the point of having two CTAs.
- **Drop the change/cancel intent context entirely.** Rejected — the prior `bookingWhatsAppChangePrefill` carried the cancel/change intent in prose; losing it would force the bot to ask. Encoding the intent in the marker prefix preserves the routing signal without prose.

**Impact:**

- [lib/booking-trust-messaging.ts](../../lib/booking-trust-messaging.ts) — `bookingWhatsAppPrefill` returns `#ORAYA_REF:<ref>`; `bookingWhatsAppChangePrefill` returns `#ORAYA_CHANGE:<ref>`. Both helpers are pure string builders; their call sites in `app/booking/view/[token]/page.tsx` (2 sites) and `app/booking-confirmed/page.tsx` (2 sites) need no changes — they pass the same `refDisplay` argument and consume the returned string identically (`encodeURIComponent` → `wa.me/?text=`). Inline doc comments updated.
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — new "Website CTA marker routing" section documenting the marker format, the routing contract, the operator manual steps (add two new WhatChimp triggers; keep the welcome trigger intact; do not expose marker syntax in guest-facing copy), and the backend-invariants this change preserves.
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — Butler-flow section gains a one-line "Website CTA marker prefill" bullet pointing to the BUTLER_PLAYBOOK section.
- No backend changes. The `/api/butler/identify` contract is unchanged; the existing `message_text` extractor (PR #47) lifts the reference out of the marker via the same `\b[0-9A-Fa-f]{8}\b` regex.
- No schema changes. No new env vars. No new dependencies. No locked-API touches. No payment-file touches. No booking-pipeline, pricing, overlap, auth, token-continuity, secure-handoff, or unrelated-flow changes.
- `tsc --noEmit` clean; `npm run build` clean.

**Reversible?:** yes — single-file revert restores the prior human-sentence prefills. The WhatChimp operator side can keep or remove the new triggers independently; without the marker prefill, the new triggers simply never fire and the existing welcome trigger continues to handle every conversation.

**Supersedes:** none. This decision extends the 2026-05-23 `message_text` entry by making the website-CTA prefill machine-routable, eliminating the welcome-menu redundancy on the website-CTA path. The `message_text` extractor and the orchestrator contract from that entry both carry forward unchanged.

---

## 2026-05-23 - `/api/butler/identify` accepts optional `message_text` with safe word-boundary-anchored booking-reference extraction

**Decision:** `POST /api/butler/identify` accepts an optional `message_text` body field carrying the verbatim inbound WhatsApp turn that triggered the Butler flow. When `booking_reference` is absent from the request body and `message_text` is present, the route extracts the first word-boundary-anchored 8-character hex token via the new pure helper [lib/butler/extract-booking-reference.ts](../../lib/butler/extract-booking-reference.ts) (`/\b[0-9A-Fa-f]{8}\b/`) and forwards it as `booking_reference` to the orchestrator. Explicit `booking_reference` always wins; `message_text` never overrides it. When `message_text` contains no clean token, behavior is identical to the prior contract — the orchestrator's existing chain still asks the guest for the reference. The orchestrator itself is **unchanged**. The seven refusal/ask `safe_message` strings on the orchestrator's non-success branches receive string-only hospitality copy upgrades; behavior, action enums, sensitive-disclosure rules, and the active-identity composer are all unchanged.

**Reason:** the live website-CTA WhatsApp path opens conversations with text like `"Hello Oraya — booking reference A0B8CECB"`. WhatChimp's Condition / save-to-custom-field primitives can route on substring matches but cannot run a regex capture to lift the 8-character token out of the trigger message into a custom field. The Butler flow therefore reached `/api/butler/identify` with `booking_reference` empty, and the orchestrator correctly fell through to `ask_for_booking_reference` — making the bot redundantly ask the guest for a value they had already provided. A bot-prompt-level workaround was rejected: dropping the entire trigger message into the existing `booking_reference` field and relying on `normalizeBookingReference` would have silently mis-extracted `"Hello Oraya — booking reference A0B8CECB"` as `"EAABEFEE"` because the surrounding English words contain valid hex letters (`e`, `aa`, `b`, `efeece`). The minimal-honest fix is a single additive backend field plus a single bounded-regex helper.

The audit explicitly considered and rejected:

- **Flow-only fix via WhatChimp Condition + custom-field capture.** Rejected — the exported flow's Condition nodes only support `contains` / `equal` operators on system / custom fields. No regex, no capture-group, no substring-extract, no transformation node exists in the available vocabulary. Substring detection is possible (`contains "booking reference"`) and is documented as an optional polish, but the actual hex token cannot be extracted by WhatChimp into a custom field.
- **Naive hex stripping in the existing `normalizeBookingReference` path.** Rejected — `replace(/[^0-9a-fA-F]/g, "")` on the trigger message produces `"eaabefeeceA0B8CECB"` (hex letters from "Hello/Oraya/booking/reference" survive), then `.slice(0, 8)` yields `"EAABEFEE"`, a confidently-wrong reference. Worse than asking twice.
- **Adding `message_text` to the orchestrator's `IdentityInput`.** Rejected — the orchestrator's contract is "decide identity given structured signals." Free-text parsing belongs at the route boundary, not inside the orchestrator. Keeping the extraction in the route also means `/api/butler/confirmed-guest-info` and other identity-using surfaces are not implicitly affected; each surface opts in by accepting and forwarding the derived reference itself if it wants this convenience.
- **Adding a separate `/api/butler/identify-from-message` endpoint.** Rejected — it would duplicate the auth / validation / orchestration shell for a single string transformation. An optional additive field on the existing endpoint is one helper file plus ~10 lines of route code.
- **Widening the extractor to be tolerant of non-word boundaries (e.g. `[A-Fa-f0-9]{8}` anywhere).** Rejected — `\b` is the safety boundary that prevents matching a substring of a longer hex run. `"A0B8CECB1234ABCD"` (which could happen if a guest pastes the full UUID instead of the prefix) does not match because the position after the 8th hex char has no word boundary; that case still falls through cleanly to `ask_for_booking_reference`.

**Hospitality copy upgrade scope** — string-only, no behavior change:

- `ask_for_booking_reference` — softened opener; explains where to find the reference.
- `reference_not_found` — gentler "I'm not finding…" framing; preserves the ask.
- `reference_ambiguous` (escalation) — warmer escalation phrasing.
- `verification_failed` (escalation) — explicit "to keep your booking secure" rationale before handing off.
- `request_identity_proof` — warmer opener; same email-or-name semantics.
- `known_sender_cancelled` — gracious acknowledgement; offers next-step framing.
- `reference_cancelled` — same.

The active-identity `composeActiveIdentitySafeMessage` output (the `verified` and `known_sender_resolved` branches) is left untouched — it already reads warm, and changing it would require co-touching the structured-field consumers.

**Impact:**

- New helper: [lib/butler/extract-booking-reference.ts](../../lib/butler/extract-booking-reference.ts). Pure function `extractBookingReferenceFromText(text)`. Never throws; returns the uppercased 8-char hex token or `null`. Single regex `/\b[0-9A-Fa-f]{8}\b/`. No Supabase, no env, no side effects.
- [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts) — accepts optional `message_text` (capped at 2048 chars). Derives `booking_reference` from it via the helper when the body did not carry an explicit reference. Updated docstring. Wire contract unchanged (503 / 401 / 400 / 200). All existing callers' payloads remain valid and produce identical responses.
- [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) — seven `safe_message` strings receive hospitality copy upgrades on the refusal / ask / cancellation branches. Behavior, action enums, sensitive-disclosure rules unchanged.
- [docs/system/KNOWN_BUGS.md](KNOWN_BUGS.md) — new entry #6 documents the bug + the fix (closed).
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — request-body example updated to include `message_text`; new "Inbound-message convenience" subsection documents the safe extraction rule, the no-naive-stripping invariant, the caller-side invariant, and the two manual WhatChimp operator changes required (HTTP API 7219 body addition + optional early-route Condition).
- [docs/system/ARCHITECTURE.md](ARCHITECTURE.md) — `/api/butler/identify` API-surface table row updated.
- No schema changes. No new env vars. No new dependencies. No locked-API touches. No payment-file touches. No booking-creation, pricing, overlap, schema, auth, token-continuity, secure-handoff, or unrelated-flow changes.
- `tsc --noEmit` clean; `npm run build` clean.

**Reversible?:** yes. Revert the new helper file + the route changes + the orchestrator string changes + the four doc edits; the endpoint returns to its prior contract. No data migrated. No tokens minted that need invalidation. Existing WhatChimp wiring (without the `message_text` body addition) continues to work unchanged.

**Supersedes:** none. This decision extends the 2026-05-22 "WhatsApp identity v2" entry by adding a safe inbound-message convenience field; the priority order, request-body shape, identity-proof comparison set, and 503/401/400/200 contract from that entry all carry forward unchanged.

---

## 2026-05-22 - Credit Libanais provider compatibility is widened at the schema boundary while the adapter stays placeholder-only

**Decision:** Oraya now treats `credit_libanais` as a first-class persisted `bookings.payment_link_provider` value, but the Credit Libanais / MPGS adapter remains an explicit placeholder until the bank delivers the real hosted-checkout contract. The additive migration `sql/phase-16b4-credit-libanais-provider-compat.sql` is the human-gated schema-compatibility step that widens the `payment_link_provider` allow-list to `manual | whish | stripe | credit_libanais` and keeps `stripe` only for backward-compatible dev/test rows. Runtime readiness must report four things clearly: whether the selected provider is configured, whether it is actually implemented vs placeholder-only, a guest-safe setup message, and an admin-facing missing-requirements list that never exposes raw secret values. `/admin/settings` is now the operator surface for that non-secret readiness state, while credentials remain env-only.

**Reason:** after the provider refactor, the code correctly selected Credit Libanais as the only approved production provider, but two readiness gaps remained. First, the database constraint still prevented persisting `credit_libanais` in `bookings.payment_link_provider`, which would have forced another refactor the moment the bank contract arrived. Second, the runtime only reported a coarse guest-safe `online_checkout_ready` boolean/message, which was not enough for operators to tell the difference between "envs missing", "placeholder adapter", and "real bank contract still pending". Widening the persisted provider allow-list now and adding explicit non-secret readiness reporting keeps the codebase ready for the bank specs without faking checkout or leaking secrets.

**Impact:**

- New human-gated migration: [sql/phase-16b4-credit-libanais-provider-compat.sql](../../sql/phase-16b4-credit-libanais-provider-compat.sql). Idempotent; safe to re-run; not auto-applied. Recreates the `bookings.payment_link_provider` check constraint to include `credit_libanais` while preserving `manual`, `whish`, and `stripe` for backward compatibility. No other payment fields are changed.
- [lib/payments/provider.ts](../../lib/payments/provider.ts) now treats `credit_libanais` as a valid persisted provider and adds a shared readiness contract for hosted-checkout adapters.
- [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) now models the exact placeholder contract the real implementation must satisfy: merchant id, gateway URL, session-creation endpoint, auth/signing method, callback verification method, provider session id field, currency/settlement behavior, and sandbox/live mode. It still never fakes a successful checkout or webhook.
- [lib/payments/runtime.ts](../../lib/payments/runtime.ts) now separates guest-safe public readiness from admin-safe readiness, and [app/api/payments/readiness/route.ts](../../app/api/payments/readiness/route.ts) exposes the latter only behind admin auth.
- [app/admin/settings/page.tsx](../../app/admin/settings/page.tsx) and [components/admin/PaymentSettingsSection.tsx](../../components/admin/PaymentSettingsSection.tsx) now show the non-secret provider readiness summary and missing-requirements list directly in the payment settings UI. Secrets remain env-only and are never written to Supabase.

**Reversible?:** yes. The migration can be superseded by a later constraint rewrite, and the readiness route/UI can be reverted without touching booking creation, pricing, overlap protection, or Butler surfaces. The one thing that should not be reversed casually is the "no secret values in DB or readiness responses" boundary.

**Supersedes:** refines the 2026-05-22 entry "Hosted payment execution is provider-agnostic; Credit Libanais / MPGS is the production target" by completing the provider-schema compatibility step and locking the non-secret readiness contract needed before the bank specs land.

---

## 2026-05-22 - Guest-facing payment behavior is now settings-driven before Credit Libanais execution goes live

**Decision:** until the real Credit Libanais / MPGS contract is implemented, Oraya's website payment behavior is controlled by guest-safe admin settings rather than hardcoded Step 3 assumptions. `/admin/settings` now owns the public payment mode (`request_only`, `manual_payment`, `online_payment`, `hybrid`), minimum deposit percentage, whether full payment and custom deposit are offered, guest-visible manual payment rails, guest payment instructions, provider display name, and whether online payment is enabled guest-side. `/book` Step 3 must present two Reserve choices: `Pay now and reserve` and `Submit booking request and pay later`. If the configured hosted-checkout provider is not truly ready, the pay-now path is blocked in the UI with clear setup messaging rather than pretending checkout is live or falling into a server error.

**Reason:** the business direction moved from "payments paused" to "payment infrastructure active, real bank execution pending official specs." That created a UX gap: Step 3 needed to stay premium and decision-oriented without implying that Credit Libanais already works. A settings-driven layer lets operations control the guest story safely while preserving the booking-first architecture and keeping gateway secrets out of the database.

**Impact:**

- New helper: [lib/payments/settings.ts](../../lib/payments/settings.ts) - parses, serializes, and normalizes guest-safe payment settings stored in the existing `settings` key/value table.
- [app/admin/settings/page.tsx](../../app/admin/settings/page.tsx) and [components/admin/PaymentSettingsSection.tsx](../../components/admin/PaymentSettingsSection.tsx) now expose payment configuration to admins without storing gateway secrets in Supabase.
- [app/api/settings/route.ts](../../app/api/settings/route.ts) now publishes a guest-safe payment settings payload plus derived runtime readiness fields for `/book`.
- [app/book/page.tsx](../../app/book/page.tsx) Step 3 now renders the two-path Reserve decision screen. The pay-now path reuses the existing hosted-checkout amount validation, but is disabled in the UI when the configured provider is not ready. The pay-later path records payment preference and follow-up rail as booking-request context only; no charge is collected on the website in that path.
- [app/api/payments/checkout/route.ts](../../app/api/payments/checkout/route.ts) now enforces the admin-configured payment mode, full/deposit availability, and minimum deposit percentage server-side before creating any hosted checkout session.
- Gateway secrets remain env-only. The existing `settings` table stores public instructions and guest-facing behavior only.

**Reversible?:** yes. The settings-driven layer can be revised or narrowed later without touching the locked booking pipeline, as long as payment execution stays booking-first and no secrets move into the database.

**Supersedes:** refines the 2026-05-22 hosted-payment provider refactor by moving guest-facing Step 3 behavior under admin-controlled settings until the real bank contract is implemented.

---

## 2026-05-22 - Butler identity response enriched with booking reference, villa, stay dates, and a signed booking-view URL on identity-established branches

**Decision:** `POST /api/butler/identify` now surfaces a `booking_view_url` field on every response, and the orchestrator's `safe_message` is pre-enriched with the booking reference, villa name, stay dates (`D MMM YYYY → D MMM YYYY`), and the same signed `/booking/view/[token]` URL on the two branches where identity has already been established for an active booking — explicit `verified` (proof match on email or full name) and implicit `known_sender_resolved` (subscriber-id or phone continuity). On every other branch — `request_identity_proof`, `ask_for_booking_reference`, `ask_for_alternative_identifier`, `reference_not_found`, `reference_ambiguous`, `reference_cancelled`, `known_sender_cancelled`, `verification_failed`, and any `escalate_human` outcome — `booking_view_url` is explicitly `null` and the `safe_message` stays at its previous conservative phrasing.

The URL itself is minted by a new helper, [lib/butler/booking-view-link.ts](../../lib/butler/booking-view-link.ts) (`buildButlerBookingViewUrl`), which reuses the existing `createActionToken(bookingId, "view")` and `NEXT_PUBLIC_SITE_URL || SITE_URL` chain already in use by the transactional email senders. It defaults to the 72-hour TTL baked into `createActionToken` (no `expiresAt` override) so past-checkout bookings remain viewable for the duration of the current support exchange, and a fresh URL is minted on every orchestrator call so the link does not need to outlive the conversation. Missing `BOOKING_ACTION_SECRET` is treated as a soft failure: the helper logs once and returns `null`, the orchestrator surfaces `booking_view_url: null`, and the bot must not synthesize a substitute link.

**Reason:** before this change, the Butler's identity surface returned only the structured booking_id / reference / status / villa / dates. WhatChimp had no way to hand the guest a credentialed "view your booking" link inside the same WhatsApp turn — the guest either had to scroll up to the original confirmation email or the operator had to copy the link manually from `/admin/leads`. The signed view URL is exactly the same credential the existing pending / confirmed / payment / event-proposal emails already deliver, so reusing it on the Butler surface introduces no new attack surface, no new schema, no new TTL semantics, and no new secret. The enriched `safe_message` is a UX win on top: a single sentence the bot can echo verbatim already carries the four pieces of context the guest most often asks about ("what booking, where, when, can I see it?"), which trims the typical multi-turn ping-pong on returning conversations.

The audit explicitly considered and rejected:

- **Surfacing the URL on every successful resolution.** Rejected — on `known_sender_cancelled` and `reference_cancelled`, the orchestrator's existing sensitive-disclosure rule already withholds villa / dates because the booking is no longer actionable; a freshly minted view URL would expose those same fields indirectly through the booking-view page. Keeping the URL `null` on every cancelled branch preserves the spirit of "do not surface villa / dates on cancelled."
- **Surfacing the URL on `request_identity_proof`.** Rejected — the guest is holding only the public 8-character reference (32 bits of entropy, printed in confirmation emails and recoverable by anyone with email access). Minting a signed view URL at that stage would let the public reference bypass the identity-proof gate that exists for precisely this case.
- **Binding the URL TTL to `checkOutExpiryUnix(booking.check_out)` like the transactional email senders.** Rejected — past-checkout bookings would receive an already-expired token, so the Butler couldn't help a guest looking up a past stay for receipts / records. The default 72h TTL is the right window for an in-conversation link, and a re-call mints a fresh URL.
- **Pulling `BOOKING_ACTION_SECRET` into the identity-route's auth contract (503 if missing).** Rejected — the identity surface still has useful work to do even when the view link cannot be minted (reference lookup, identity proof gating, escalation routing). Failing closed on a missing secret would degrade the WhatsApp experience for an unrelated reason; the soft-fail to `booking_view_url: null` is the correct posture.
- **Adding the URL to the booking-lookup surface (`/api/butler/booking-lookup`).** Out of scope for this change; that surface is reference-only and intentionally does not return sensitive fields. Future work can mirror the gating model if needed.

**Impact:**

- [lib/butler/booking-view-link.ts](../../lib/butler/booking-view-link.ts) — new helper. `buildButlerBookingViewUrl(bookingId)` returns the signed URL or `null` (never throws). Reuses [lib/booking-action-token.ts](../../lib/booking-action-token.ts) `createActionToken` and [lib/brand.ts](../../lib/brand.ts) `SITE_URL`.
- [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) — `IdentityResult` gains `booking_view_url: string | null`. Every existing result literal sets the new field (null on every unverified / cancelled / not-found / ambiguous / escalation / proof-request branch). The two `reply_with_status` returns (`verified` and `known_sender_resolved` with active status) call the helper, and the new `composeActiveIdentitySafeMessage` helper composes the enriched safe_message with graceful degradation when any field is missing. Date formatting is done by a local `formatStayDateLabel` that mirrors the booking-view page's `fmtDate` (no JS Date parsing, no Date object — per the standing time/date discipline rule).
- [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts) — header docstring updated to enumerate the response shape including `booking_view_url`, clarify the sensitive-disclosure rule now covers the URL, and note the "no synthesized substitute link when null" requirement. Wire contract (503 / 401 / 400 / 200) and request body shape are unchanged.
- [docs/system/BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) — bot-facing action table extended with the URL usage on `reply_with_status` and the explicit no-URL-on-cancelled rule. New "Enriched safe_message behavior" subsection documents the composer's fields and degradation. New "Location and access safety boundary" subsection makes it explicit that the view URL is NOT a smart-lock PIN, exact address, payment link, or admin-data surface. Sensitive-disclosure rule extended to cover `booking_view_url`. "Sensitive fields the orchestrator NEVER returns" paragraph now records the signed view URL as the single intentional exception, gated on the established-identity branches only.
- No schema changes. No new env vars (the helper reuses the existing `BOOKING_ACTION_SECRET` and `NEXT_PUBLIC_SITE_URL`). No new dependencies. No locked-API touches.

**Reversible?:** yes. Revert the three TS files + the two doc files; the prior orchestrator response shape returns. No data migrated, no tokens minted that need invalidation (the issued view tokens are stateless HMAC over `bookingId + "view" + exp + jti` — they age out on their own 72h TTL).

**Supersedes:** none. This decision extends today's earlier "WhatsApp identity v2" entry by adding the booking-view URL surfacing rule; the priority order, request body shape, identity-proof comparison set, and 503/401/400/200 contract from that entry all carry forward unchanged.

---

## 2026-05-22 - WhatsApp identity v2: WhatChimp subscriber_id becomes primary continuity key; identity_proof accepts email OR full name; flow JSON ships placeholder-free
## 2026-05-22 - Hosted payment execution is provider-agnostic; Credit Libanais / MPGS is the production target

**Decision:** Oraya's hosted-payment architecture remains booking-first and webhook-first, but production is no longer assumed to be Stripe. `POST /api/payments/checkout` now resolves a provider-agnostic hosted-checkout adapter selected by `PAYMENT_PROVIDER`, and `POST /api/payments/webhook/[provider]` is the generic callback surface. Credit Libanais / MPGS is the production target provider for settlement into a Fresh USD account in Lebanon. In production, provider selection must be explicit and must be `credit_libanais`: if `PAYMENT_PROVIDER` is missing or set to any other value, checkout fails closed with a configuration error. Outside production, the runtime may default to Stripe so local/dev can still exercise the hosted checkout flow intentionally.

**Reason:** the operating setup is Lebanese bank settlement, not Stripe as merchant of record. The website still must never collect card data directly, and the booking pipeline still must stay authoritative for overlap protection, pricing, add-on rules, email triggers, and signed booking-view links. A provider-agnostic adapter boundary lets Oraya preserve the premium hosted checkout UX and lifecycle fields without baking Stripe into the architecture or pretending the bank contract is already known.

**Impact:**

- [app/api/payments/checkout/route.ts](../../app/api/payments/checkout/route.ts) now resolves the configured hosted-checkout adapter instead of importing Stripe directly. Booking validation, signed booking-token verification, and server-side deposit/full amount validation remain unchanged.
- [lib/payments/provider.ts](../../lib/payments/provider.ts) now distinguishes runtime provider keys from the persisted `payment_link_provider` allow-list, and exports the generic hosted-checkout adapter contract:
  - `createCheckoutSession`
  - `verifyWebhook`
  - `mapProviderEventToBookingUpdate`
- New runtime helpers:
  - [lib/payments/runtime.ts](../../lib/payments/runtime.ts) - provider registry keyed by `PAYMENT_PROVIDER`
  - [lib/payments/credit-libanais.ts](../../lib/payments/credit-libanais.ts) - explicit non-faking placeholder adapter that lists the bank details still required
  - [lib/payments/webhook-handler.ts](../../lib/payments/webhook-handler.ts) - generic callback application logic
- New callback route:
  - [app/api/payments/webhook/[provider]/route.ts](../../app/api/payments/webhook/%5Bprovider%5D/route.ts) - generic hosted-payment callback surface
  - [app/api/payments/webhook/stripe/route.ts](../../app/api/payments/webhook/stripe/route.ts) - compatibility shim for the optional Stripe adapter
- [app/book/page.tsx](../../app/book/page.tsx) no longer hardcodes Stripe in Step 3 copy; guest messaging stays provider-neutral and hosted-checkout-only.
- Environment contract changes:
  - `PAYMENT_PROVIDER=credit_libanais` is the only approved production setting
  - production no longer silently falls back to Stripe when `PAYMENT_PROVIDER` is unset
  - production rejects `PAYMENT_PROVIDER=stripe`
  - `CREDIT_LIBANAIS_MERCHANT_ID`
  - `CREDIT_LIBANAIS_SECRET`
  - `CREDIT_LIBANAIS_GATEWAY_URL`
  - `CREDIT_LIBANAIS_WEBHOOK_SECRET`
  - Stripe envs remain optional for local/dev testing only
- Important schema compatibility note: the current `bookings.payment_link_provider` allow-list is still the older `manual | whish | stripe` floor. The Credit Libanais adapter therefore remains a placeholder and must not write fake provider state until a later explicit schema-compatibility step is approved.

**Reversible?:** yes, but only with a superseding entry that preserves the locked `/api/bookings` authority, server-side amount validation, and verified callback truth.

**Supersedes:** refines the 2026-05-22 "Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout" entry by removing Stripe as the production assumption while preserving the same hosted-checkout execution model.

---

## 2026-05-22 - Phase 16B.3 Reserve-path payment execution uses booking-first + hosted Stripe checkout

**Decision:** the WhatsApp identity orchestration surface from earlier today is revised to fit WhatChimp's actual variable set and to support bookings with no email on file.

Concrete changes:

- The primary continuity key becomes **WhatChimp `subscriber_id`**, looked up against a new `whatsapp_leads.whatsapp_subscriber_id` column. The earlier phone-keyed lookup remains but is demoted to "future channels only" — WhatChimp does NOT expose the sender phone as a variable, so the original design could never auto-resume a returning WhatChimp conversation on its own.
- A diagnostic-only `whatsapp_chat_id` column is added alongside. The orchestrator never queries it; it is captured purely for ops correlation between WhatChimp logs and `whatsapp_leads` rows. No index.
- The identity-proof field is renamed `identity_proof` (was `identity_proof_email`) and now accepts **the email OR the full name** used on the booking. Comparison is exact-after-normalization (lowercased, trimmed, internal whitespace collapsed to single spaces) against `bookings.guest_email`, `bookings.guest_name`, and (when the booking is linked to a member) the member's `auth.users.email` and `members.full_name`. Substring / fuzzy / startsWith matching is intentionally rejected for v1 to prevent name-prefix leakage (e.g. "John" matching every John).
- The new priority order is **subscriber_id → phone → reference + identity_proof gate → human escalation**.
- The WhatChimp flow JSON ships as [whatsapp-bot_guest-identification_v2.json](../../) **placeholder-free**: all WhatChimp ids (HTTP API id, custom field ids, label ids) are empty strings or empty arrays while the human-readable names live in the parallel `*_SelectedOptionText` / `*TextsArray` fields. Matches the user's own re-export pattern from `whatsapp-bot_1857205_*`. Operator wires the ids via the WhatChimp UI after import.
- The legacy `identity_proof_email` field on `POST /api/butler/identify` is accepted as a transitional alias while the v1 flow is migrated. The route prefers `identity_proof` when both are present.

**Schema impact:** new additive migration [sql/phase-16a3-whatsapp-subscriber-identity.sql](../../sql/phase-16a3-whatsapp-subscriber-identity.sql) (NOT auto-applied; idempotent; reversible) adds the two nullable text columns and indexes `whatsapp_subscriber_id` only. Backend degrades gracefully when the migration is not yet applied: the orchestrator detects PostgREST error `42703` (undefined_column) on the subscriber-id path and falls through silently, the ingest route (`POST /api/butler/lead`) retries inserts without the new fields, and both admin lead routes fall back to a base column list.

**Reason:** the v1 design assumed `{{contact.phone}}` would be available on the WhatChimp channel; verification of WhatChimp's actual variable set proved that wrong (only `#LEAD_USER_*#` hashtag variables, no sender phone). Without a stable continuity key the orchestrator could never auto-resume a returning guest in production — every WhatsApp turn would have fallen straight to the reference + identity-proof gate. The subscriber-id path restores the intended UX. Accepting full name as identity proof closes the second real gap: many bookings do not have an email captured (early phases collected name + phone only), so email-only proof would have left the human-escalation arm as the only resolution path for those guests.

The audit explicitly considered and rejected:

- **Substring or startsWith matching on names.** Rejected — a guest named "John Smith" typing "John" would have verified against every other John in the database. Exact-after-normalization is the right safety/usability trade for v1.
- **Two separate proof fields (`identity_proof_email`, `identity_proof_name`).** Rejected — forces the bot to ask the guest which they want to share before they share it, and forces a second WhatChimp custom field. One free-text field that compares against both stores is simpler and equally safe given the exact-match rule.
- **Indexing `whatsapp_chat_id`.** Rejected — it is not a lookup key. The orchestrator does not query it. Indexing it would be dead weight.
- **Auto-applying the SQL migration.** Rejected per the repo's standing rule that schema changes are operator-applied, never auto-applied, and must be reversible. The graceful degradation in the backend means the migration can be applied at any time without downtime.

**Impact:**

- [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts) — `IdentityInput` gains `subscriber_id`, `chat_id`, `identity_proof`; `phone` retained. `IdentityResult` shape unchanged. New helpers `resolveBookingBySubscriberId`, `verifyIdentityProofMatchesBooking`; the prior `resolveBookingByPhone` / `verifyEmailMatchesBooking` are refactored into a shared lookup. Priority order updated. Safe-message for `request_identity_proof` reworded to "share the email or the full name used on your booking".
- [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts) — body now reads `subscriber_id` (cap 128), `chat_id` (cap 128), `phone` (cap 64), `booking_reference` (cap 64), `identity_proof` (cap 320). Legacy `identity_proof_email` accepted as a fallback. Unchanged: auth contract (503/401), 400 on shape errors, 200 on every orchestration outcome.
- [lib/butler/leads.ts](../../lib/butler/leads.ts) — `normalizeLeadInput` picks `subscriber_id` and `chat_id` from a handful of WhatChimp aliases (`oraya_subscriber_id`, `lead_user_subscriber_id`, `subscriber_id`, `whatsapp_subscriber_id`, `whatchimp_subscriber_id`; mirror set for chat). `NormalizedLeadInput` and `WhatsappLeadAdminRow` gain `whatsapp_subscriber_id` / `whatsapp_chat_id` as `string | null`.
- [app/api/butler/lead/route.ts](../../app/api/butler/lead/route.ts) — retries insert without the new columns when Supabase returns `42703`; raw values stay in `raw_payload` regardless.
- [app/api/admin/leads/route.ts](../../app/api/admin/leads/route.ts) + [app/api/admin/leads/[id]/route.ts](../../app/api/admin/leads/%5Bid%5D/route.ts) — `SELECT_COLUMNS_FULL` includes the new fields; both fall back to `SELECT_COLUMNS_BASE` on `42703`.
- [sql/phase-16a3-whatsapp-subscriber-identity.sql](../../sql/phase-16a3-whatsapp-subscriber-identity.sql) — new additive migration. Adds the two columns + the subscriber-id index. Comments document the diagnostic-only intent of `whatsapp_chat_id`.
- [whatsapp-bot_guest-identification_v2.json](../../) (Desktop + `Oraya/`, both `.json` and `.txt`) — replaces the v1 flow. Welcome step unchanged (3 buttons). Identity-proof step rephrased + `emailQuickreply` set to `false` + custom field renamed `oraya_identity_proof_email` → `oraya_identity_proof`. All WhatChimp ids are empty strings; names preserved.
- [ARCHITECTURE.md](ARCHITECTURE.md) WhatsApp identity flow section rewritten for the v2 priority order + schema dependency. [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) identity orchestration section rewritten with the new request body shape, the email-or-name proof rule, the schema dependency, and the booking-request flow gap callout.
- `tsc --noEmit` clean; `npm run build` clean; new `/api/butler/identify` and `/api/butler/booking-lookup` routes confirmed in the build manifest.

**Known gap (intentional, scoped follow-up):** the existing booking-request flow (`whatsapp-bot_1846656_*`) does NOT yet pass `subscriber_id` to `POST /api/butler/lead`. Until that flow is updated separately, new leads created via the booking-request path won't be auto-resumable by subscriber id from WhatChimp — they fall through to the reference + identity-proof gate. The schema and backend already accept the field; only the WhatChimp-side wiring on that other flow is missing. The user's standing instruction is to NOT modify the booking-request flow file in this turn.

**Reversible?:** yes. Backend: revert the three TS files + the two route files + the SQL migration; the prior phone-keyed orchestrator returns. Schema: `drop column if exists whatsapp_subscriber_id`, same for `whatsapp_chat_id`, drop the index. Flow JSON: the v1 file is preserved on Desktop and in the Oraya folder; re-importing it restores the old behavior. No data destroyed (the SQL is additive; the columns are nullable; the rename `identity_proof_email` → `identity_proof` is also accepted as the legacy alias by the route).

**Supersedes:** today's earlier entry "WhatsApp identity orchestration: phone continuity → booking-reference fallback → human escalation, single `/api/butler/identify` endpoint" is updated, not retracted. The endpoint, the orchestrator helper, and the safe-message + sensitive-disclosure contracts all carry forward; only the priority order, the input shape, and the proof comparison set change.

---

## 2026-05-22 - WhatsApp identity orchestration: phone continuity → booking-reference fallback → human escalation, single `/api/butler/identify` endpoint

**Decision:** WhatsApp identity resolution for the Butler is owned server-side by a single stateless orchestrator helper, [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts), and exposed to WhatChimp through one Butler-secret-guarded endpoint, `POST /api/butler/identify`. The bot does not branch on its own; each turn it passes whatever signals it has gathered (`phone`, `booking_reference`, `identity_proof_email`) and receives back a deterministic `recommended_next_action` plus the only `safe_message` the Butler is allowed to echo.

The priority order is locked:

1. **Phone continuity (primary).** Inbound WhatsApp sender phone → `whatsapp_leads.phone` → `linked_booking_id` → `bookings`. When this succeeds, identity is implicit; villa / check_in / check_out / status are returned and the bot composes a status reply (or, for a cancelled booking, an acknowledgement that withholds details).
2. **Booking-reference fallback.** No phone match → bot asks for the 8-character reference. The orchestrator resolves it via [resolveBookingByReference](../../lib/booking-reference.ts). Pending/confirmed matches gate disclosure behind explicit identity verification; cancelled matches return a safe acknowledgement.
3. **Human escalation.** Ambiguous reference, failed identity proof, or any unsafe state hands off to a human; the bot stops auto-replying about the booking and operators pick up from `/admin/leads`.

**Identity verification options recognized today (closed allow-list):**

- Phone continuity (implicit, primary path only).
- Booking email match — case-insensitive comparison against `bookings.guest_email` and (when the booking is linked to a member) the member's `auth.users.email`. Mismatch escalates to human; the bot does not loop on retries.
- Manual escalation — every other case.

**Sensitive-disclosure rule:** `villa`, `check_in`, `check_out` are returned by the orchestrator only when identity is verified. The bot must never echo a cached value for those fields when the current orchestrator response has them null — the orchestrator is the single source of truth per turn.

**Reason:** the Butler must correctly identify a returning guest before disclosing anything stay-specific, but it must also be operationally cheap to use (one call per turn, deterministic output, no client-side policy logic). Centralizing the priority order, the verification gate, and the safe-message strings server-side keeps the WhatChimp configuration trivial and audit-able: the bot reads `recommended_next_action`, calls the next correct primitive, and echoes `safe_message`. It also keeps the security model honest — there is exactly one code path that decides "is this person verified for this booking?" and that code path lives in this repo, not in WhatChimp's AI Training.

The decision explicitly considered and rejected alternatives:

- **Doing the priority logic in WhatChimp AI Training.** Rejected — AI Training is not auditable, drifts silently, and would mean the security model lives in a vendor surface outside the repo. The same argument the 2026-05-12 architecture freeze made about pricing / availability / status applies in full to identity.
- **Storing a per-conversation identity-state column.** Rejected — every signal the orchestrator needs is already on `bookings` or `whatsapp_leads`. Adding a third table would introduce a stateful surface that drifts from the underlying truth (a booking cancelled after a turn was "verified" would silently surface stale state).
- **Multiple specialized endpoints (`/api/butler/lookup-by-phone`, `/api/butler/verify-identity`).** Rejected as scope creep. The single multi-signal endpoint produces the same outcome with less surface, fewer round-trips, and one place to audit the priority order.

**Impact:**

- New file [lib/butler/identity-orchestrator.ts](../../lib/butler/identity-orchestrator.ts). Single exported async function `orchestrateButlerIdentity(input)` plus the discriminated `IdentityState` / `IdentityAction` types. Always resolves; never throws. Operational errors (Supabase outage, unexpected throw) collapse to the safest "ask for reference" or "escalate human" result, with the error logged server-side.
- New file [app/api/butler/identify/route.ts](../../app/api/butler/identify/route.ts). Thin HTTP wrapper. Reuses `requireButlerAuth` (503 / 401 contract unchanged). 400 on invalid JSON / body shape / over-length input. 200 on every orchestration outcome, including escalations.
- [ARCHITECTURE.md](ARCHITECTURE.md) API surface table gains `/api/butler/booking-lookup` and `/api/butler/identify`.
- [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) gains a "WhatsApp identity orchestration" section that documents the priority order, the action allow-list, the sensitive-disclosure rule, and the closed identity-verification options list. This is the operational contract WhatChimp configuration must respect.
- **No schema change.** Reuses existing `whatsapp_leads` (phone, linked_booking_id), `bookings` (id, status, villa, check_in, check_out, guest_email, member_id), and `auth.users` (email via service-role).
- **No new env var.** `BUTLER_WEBHOOK_SECRET` already required and already documented in [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).
- **No new dependency.** Uses `supabaseAdmin`, `requireButlerAuth`, and the existing `lib/booking-reference.ts`.
- **No locked-surface touch.** `/api/bookings*`, `/api/admin/*`, `/api/calendar/*`, `/api/cron/*`, the email senders, the auth and token systems, and the existing schema remain untouched.

**Reversible?:** yes — easy. Delete the two new files, revert the ARCHITECTURE.md + BUTLER_PLAYBOOK.md additions, add a superseding entry here. No data persisted; no external consumer locked in (WhatChimp does not call this endpoint until its outbound flow is configured to).

**Supersedes:** does not supersede a prior decision. Builds on the 2026-05-12 Butler architecture freeze (locked namespace + secret), the 2026-05-15 `whatsapp_leads` persistence (provides the phone → booking linkage), the 2026-05-18 lead → booking provenance writer (populates `linked_booking_id`), and the 2026-05-22 booking-reference helper (the fallback identifier this orchestrator resolves).

---

## 2026-05-22 - Guest-facing booking reference formalized as the bookings.id 8-char uppercase prefix; lib/booking-reference.ts owns the contract

**Decision:** the existing 8-character uppercased prefix of `bookings.id` is the single guest-facing booking reference. A new module [lib/booking-reference.ts](../../lib/booking-reference.ts) owns the format / normalize / resolve contract. No parallel identifier system is introduced; no schema change; no migration; no env var.

Public / private boundary is now formal:

- **Public guest-facing identifier** = `formatBookingReference(booking.id)`. Visible in pending / event-inquiry / confirmed / cancelled emails (the `Reference` row in the summary card) and at the top of `/booking/view/[token]`. Safe to quote in support channels. Knowing the reference is **not** proof of identity and never authorizes sensitive disclosure on its own.
- **Private signed credentials** = `createActionToken(...)` in [lib/booking-action-token.ts](../../lib/booking-action-token.ts) and `createPrefillToken(...)` in [lib/butler/prefill-token.ts](../../lib/butler/prefill-token.ts). These remain the only credentials that authorize sensitive operations. They are never quoted, never asked of the guest in conversation, never interchangeable with the public reference.

Future WhatsApp identity model (planning context — not implemented in this entry):

- **Primary path:** known WhatsApp sender → Butler token continuity / lead-linkage continuity → linked booking → deterministic safe status reply (see [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) §4).
- **Fallback path:** unknown sender / spouse / changed number → ask for the booking reference → `resolveBookingByReference` returns booking_id + non-sensitive context (status, villa, check_in, check_out) → identity verification (phone match, booking email match, manual escalation) MUST run before any sensitive field is exposed.

**Reason:** the 8-char-prefix reference is already shipped and visible in three call sites ([app/booking/view/[token]/page.tsx](../../app/booking/view/%5Btoken%5D/page.tsx), [lib/send-booking-pending-email.ts](../../lib/send-booking-pending-email.ts), [lib/send-booking-email.ts](../../lib/send-booking-email.ts)) and explicitly named the "public guest-facing support code" in [PROJECT_STATE.md](PROJECT_STATE.md), [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md), and [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md). Introducing a second identifier would have meant two reference systems, two migration risks, and a years-long deprecation tail; centralizing the existing one into a named helper achieves every product goal (human-friendly identifier, safe for WhatsApp/support use, future-ready for payment-lookup and arrival-messaging flows) with zero schema or env impact.

The audit explicitly considered and rejected the alternatives:

- A new `bookings.booking_reference` text column. Rejected — duplicates an identifier already derived from the primary key; adds a migration with no observable guest benefit; collision-prevention logic (the only argument for a separate column) is unnecessary at Oraya's booking volume given uuid v4 first-8-hex entropy and is already handled by the `ambiguous` branch of the new resolver.
- A short opaque token (e.g. base32 nanoid) separate from `bookings.id`. Rejected — same migration cost, plus historical bookings would need backfill; the existing reference is already in production emails and the guest already knows it as theirs.

**Impact:**

- New file [lib/booking-reference.ts](../../lib/booking-reference.ts). Three exports: `formatBookingReference(id) -> string | null`, `normalizeBookingReference(value) -> string | null`, `resolveBookingByReference(reference) -> Promise<BookingReferenceResolution>`. Type-and-helper module; no runtime side-effects at import time (the Supabase admin client is already lazy-Proxy-loaded).
- The `resolveBookingByReference` discriminated union returns `not_found` / `ambiguous` / `found`. The `found` variant exposes only `booking_id`, `status`, `villa`, `check_in`, `check_out` — the same fields the guest already sees on `/booking/view/[token]`. Sensitive fields (phone, email, payment ledger, `payment_link_*`, raw payload, admin notes) are never returned by the resolver; identity verification is the caller's job.
- [ARCHITECTURE.md](ARCHITECTURE.md) gains a "Booking identity model" section formalizing the public / private split and documenting the primary / fallback WhatsApp identity flow.
- **No schema, no env, no new dependency, no new route.** The three existing call sites that compute `.slice(0, 8).toUpperCase()` are left untouched (minimal diff; the email senders are listed as locked surfaces in [AGENT_RULES.md](AGENT_RULES.md) §4, so even a no-op refactor was deferred). The helper has no callers in this commit; it is scaffolding for the next WhatsApp / payment-lookup PR.
- `tsc --noEmit` clean. `npm run build` clean.

**Reversible?:** yes — trivially. Delete the new file, revert the ARCHITECTURE.md section, add a superseding entry here. No data persisted; no external consumer locked in.

**Supersedes:** does not supersede a prior decision. Formalizes a convention that has been informally documented across [PROJECT_STATE.md](PROJECT_STATE.md), [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md), and [/docs/phases/PHASE_16B_PLAN.md](../phases/PHASE_16B_PLAN.md) since Phase 16A but had no central code module.

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
