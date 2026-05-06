# ORAYA PROJECT STATE - SOURCE OF TRUTH

This file defines the current system architecture, constraints, and rules.

If any instruction conflicts with this file:
STOP and ask before proceeding.

Guest-facing visual and UX conventions are summarized in **`DESIGN_SYSTEM.md`** (reference only; does not override this file).

---

## CURRENT PHASE

Phase 13 -> COMPLETE | Phase 14 -> COMPLETE (14M closure) | Phase 15A -> COMPLETE (readiness audit) | Phase 15B -> COMPLETE (security hotfix) | Phase 15C -> COMPLETE (event inquiry calendar parity with stay picker) | Phase 15D -> COMPLETE (security cleanup + smoke test) | Phase 15E -> COMPLETE (local env parity + secret hygiene) | Phase 15F.1 -> COMPLETE (contact email consistency hotfix) | Phase 15F.2 -> COMPLETE (email identity hello standard) | Phase 15F.3 -> COMPLETE (privacy + legal communication alignment) | Phase 15F.4 -> COMPLETE (trust layer + legal entity + testimonial intake) | Phase 15F.5 -> COMPLETE (manual testimonial manager + feedback request tool) | Phase 15F.6 -> COMPLETE (completed reservations history + feedback follow-up) | Phase 15F.7 -> COMPLETE (manual feedback email trigger + tracking) | **Phase 15G -> COMPLETE** (event services consolidation: 15G.1 taxonomy + 15G.5–7 + 15G.10–13 as documented below) | **Phase 15H -> COMPLETE** (event quote line-item manager + **15H.1** admin proposal UI: included/excluded split, totals breakdown, `roundMoney`; no schema change) | **15I.1 -> COMPLETE** (payment foundation: booking ledger columns + admin overview + manual record; see Phase 15I.1 below) | **15I.2 -> COMPLETE** (admin booking expanded-card UX cleanup: collapsible secondary sections, revenue estimate block removed; no booking/payment/pricing/proposal logic change; see 15I.2 below) | **15I.3 -> COMPLETE** (booking flow UX restructure; see 15I.3 below) | **15I.3.1 -> COMPLETE** (booking flow fixes + token redirect) | **15I.3.4 -> COMPLETE** (logo consistency homepage + book) | **15I.4 -> COMPLETE** (public light/dark theme: `data-theme` + CSS variables on homepage + `/book`; default light, localStorage persistence, explicit dark only; see 15I.4 below) | **15I.5 -> COMPLETE** (heated pool strict-notice override when prior confirmed stay had heated pool within 24h; see 15I.5 below) | **15I.6 -> COMPLETE** (public theme extension: homepage + `/book` tokens to remaining public routes; see 15I.6 below) | **15I.7 -> COMPLETE** (trust + legal public theme: booking view, confirmation, auth recovery, legal hub; see 15I.7 below) | **15I.8 -> COMPLETE** (public micro-polish: scrims, press states, cards, links, section tone, reduced motion; see 15I.8 below) | **15I.9 -> COMPLETE** (Adaptive booking flow — Instant vs Reserve guest UX; payment execution **Phase 16**) | **15I.10 -> COMPLETE** (Instant booking admin control — villa toggles in `settings`) | **15I.11 -> COMPLETE** (cancellation & refund **policy visibility** on booking trust surfaces → `/legal/refund`) | **Phase 15 -> COMPLETE** (umbrella: public trust layer + theme + route coverage; see **Phase 15 closure** below)**

### Phase 15 closure

**Phase 15** (umbrella) is **COMPLETE** as the **public trust layer** — theme, guest-facing booking/legal consistency, micro-polish, adaptive `/book` UX (UI-only instant path), admin instant toggles, **instant booking visual system** (icon + badges + early eligibility messaging), **instant vs request copy clarity**, **live admin booking/dashboard refresh without full page reload** (silent polling + Supabase Realtime best-effort + in-page toasts; preserves tabs/filters/scroll), and **cancellation/refund policy visibility** on key booking surfaces. **Payment execution** for instant checkout remains **Phase 16**.

- **Theme system:** `data-theme="light"` / `"dark"` on `<html>` with shared **`--oraya-*`** tokens; default light; dark is an explicit user choice (`oraya-theme` in `localStorage`).
- **Route coverage:** Homepage, `/book`, villa pages, join/login, events inquiry, and trust/legal surfaces use the same token vocabulary and nav/footer patterns where applicable.
- **Micro-polish:** Global utilities (press, cards, CTAs, links, section background easing) in **`app/globals.css`**; reduced-motion behavior; keyboard **focus-visible** on homepage villa cards.
- **Design system:** **`DESIGN_SYSTEM.md`** documents **micro-interaction utilities** and remains the guest-facing reference alongside this file.
- **Cancellation/refund visibility:** Guest **`/book`** Step 4 (review), **`/booking/view/[token]`**, and **`/booking-confirmed`** link to **`/legal/refund`** with careful copy (no automatic refund implied). No cancellation/refund backend in Phase 15.
- **Admin live data:** After password auth, **`AdminDataProvider`** refetches **`/api/admin/data`** on a **45s** interval (silent, state-only) and subscribes to **`postgres_changes`** on **`public.bookings`** when Realtime is enabled; row-level visibility still follows Supabase RLS for the subscribing role — polling remains the reliable path if Realtime does not fire. Toasts notify inserts/status changes without resetting UI chrome.

**Phase 15 refinement (guest `/book` UX):** Default flow is **Reserve Your Stay** (premium positioning); **Instant Book** is secondary when eligible. **Bedrooms, guests, add-ons, and special requests** share one **Stay Setup** step; **Review & Submit** is a single follow-on step. Villa card **starting prices** use **`getVillaEntryPrice`** (same 1-bedroom entry logic as homepage `formatVillaFromPrice`). When a stay is **not** instant-eligible, the UI **auto-advances** to Stay Setup after dates (no forced decision screen).

**Phase 15 fix (preselected villa + mobile Step 1 density):** Visiting `/book?villa=…` from a villa page **normalizes** the query (`+` / encoding), **collapses** full villa cards into a compact “{villa} selected” row with **Change villa**, and **scrolls** to the date section after auth when the villa stays collapsed (viewport-aware, no forced jump when already visible). On **narrow screens**, Step 1 keeps **dates + estimated total + eligibility headline** prominent; **detail lines**, **rates note**, and **eligibility subcopy** move under a **Booking details** accordion so **Reserve / Instant** cards sit higher after dates are chosen.

**Phase 15 final polish (`/book`):**

- Instant Book converted to **secondary** action (compact outline + icon + popover).
- **Reserve** remains the **primary** flow (dominant card).
- **Mobile input zoom** fixed (16px minimum on form fields at ≤640px via `.oraya-book-input-zoom-fix`).
- **Guest contact** priority improved (**name → WhatsApp/phone → email → country**).
- **Stay Setup** layout optimized: bedrooms / guest counts → guest details when applicable → add-ons → estimated total → special requests → navigation → **Hosted Experiences last**.
- **Special requests** collapsed behind a **+** row (expand for textarea; preview when collapsed if text exists).
- **Hosted Experiences** moved **below** Back / Continue so the CTA is not blocked.

Sub-phases **15A–15H** and **15I.1–15I.11** above record incremental work; they are not repeated here.

### Phase 15I.9 — Adaptive booking flow (Instant vs Reserve UX)

- **Status:** COMPLETE (guest UI; payment execution **Phase 16**).
- **Guest behavior:** After villa + dates, eligible stays may show **Instant Book** vs **Reserve Your Stay**; instant path uses a **review + payment placeholder** only (no booking persisted from that path, no payment execution).

### Phase 15I.10 — Instant booking admin control

- **Status:** COMPLETE — **control layer only**.
- **Storage:** Per-villa flags in existing **`settings`** rows (`instant_booking_villa_mechmech`, `instant_booking_villa_byblos`).

### Phase 15I.11 — Cancellation & refund policy visibility

- **Status:** COMPLETE — trust-layer copy and links only (**`/legal/refund`**); no workflow or schema changes.

---

## COMPLETED PHASES

Phase 1 - Brand Identity  
Phase 2 - Public Website  
Phase 3 - Booking System Core  
Phase 3B - Secure Email Actions  
Phase 4 - Production Hardening  
Phase 5 - Calendar Sync & Availability  
Phase 6 - Customer Experience Layer  
Phase 7 - Admin Console Restructure  
Phase 8 - Pricing Foundation:
- 8F.1 Pricing display + warnings
- 8G Seasonal pricing (engine + admin CRUD)
- 8H Validation layer (UI-only, non-blocking)
- 8I Pricing visibility (per-night breakdown + source labeling)
Phase 9 - Enforcement Layer:
- 9A Server pricing mirror / audit mode
- 9B Server validation dry run
- 9C Admin pricing hard validation
- 9D Timezone correction layer
- 9E Pricing persistence snapshot
- 9F Pricing consistency & snapshot safety
- 9G Booking pricing enforcement
Phase 10 - Add-on Operations Layer:
- 10A Add-on preparation controls + server dry run
- 10B Add-on availability UX + strict/soft model
- 10C Add-on snapshot persistence
- 10D Add-on approval status
- 10E Admin operational visibility
- 10F Dynamic add-ons management
- 10G Add-on admin validation
- 10H Add-ons admin UI cleanup
Phase 11 - Add-on Operational Enforcement & Visibility:
- 11A Add-on operational audit mode during booking creation
- 11B Strict add-on operational enforcement
- 11D Admin visibility for add-on operational flags
- 11 Final operational polish
Phase 12B - Villa-specific add-ons:
- Per-villa add-on applicability (applicable_villas field)
- Admin UI for villa scoping on add-ons
Phase 12C - Add-on commercial layer:
- Percentage-based pricing model
- Display-order and recommended flag
- Add-on descriptions
Phase 12D - Early/late checkout + same-day risk:
- Same-day checkout / same-day checkin detection
- Admin visibility for operational risk flags
- Guest-side same-day warning display
Phase 12E - Monetization Layer:
- 12E.1 Dead-day detection (guest UI)
- 12E.2 Discount application UI (guest)
- 12E.3 Discounted price persistence in snapshot
- 12E.4 Admin visibility for discounted offers
- 12E.5 Guest offer visibility (UI polish)
- 12E.6 Offer tracking metadata in snapshot
- 12E.7 Server-side offer validation (anti-forgery)
- 12E.8 Admin insights (offer usage, savings visibility)
Phase 12F - Analytics & Revenue Metrics:
- 12F Add-on revenue metric (dashboard analytics tile)
Phase 12G - Revenue Optimization Layer:
- 12G.1 Revenue opportunity detection (5 types per booking)
- 12G.2 Admin Revenue Opportunities panel (dashboard)
- 12G.3 Booking-level revenue hints (detail modal)
- 12G.4 Guest smart suggestions (Step 3 add-ons)
- 12G.5 Admin advisory insights (below analytics)

Completed stabilization work:
- Booking reliability: overlap protection, confirm/cancel persistence
- Email system: notifications, verification, secure action links
- Booking UX: 3-step booking flow
- Calendar automation: cron-job.org sync every 10 minutes
- Timezone standardization: Asia/Beirut display, UTC storage
- Phase 7 - Step 2: Admin Component Extraction
- Phase 7 - Step 3: Admin Layout + Shared Data Provider

---

## SYSTEM STATUS

- Pricing engine supports:
  - base / weekday / weekend / seasonal
- Pricing is:
  - server-side enforced for booking creation
- Per-night pricing breakdown available in booking UI
- Pricing source labeling implemented
- Validation layer exists in admin and on the booking server path
- Seasonal pricing integrated end-to-end
- Pricing snapshots persist on new bookings
- Add-on snapshots persist on new bookings
- Strict add-on operational violations are enforced server-side
- Approval-required and soft-rule add-ons remain non-blocking
- Dead-day monetization implemented end-to-end
- Discounted add-ons supported (UI + snapshot + admin visibility)
- Offer tracking metadata persisted (`offer_applied`, `offer_type`, `original_price`, `savings`)
- Server-side validation prevents forged discount input
- Admin UI surfaces offer usage and savings
- Guest UI displays discounted pricing with contextual messaging
- Add-on revenue metric visible in admin dashboard analytics
- Revenue opportunity detection runs client-side across 5 signal types (offer_available, no_addons, high_value, operational_risk)
- Admin Revenue Opportunities panel surfaces up to 8 actionable items per load
- Booking modal shows per-booking revenue hints
- Guest Step 3 shows smart suggestion banner + per-add-on microcopy
- Admin advisory insights derived from analytics data (top add-ons, offer rate, cross-sell gaps)
- Password reset flow: forgot-password page + reset-password page (Supabase email recovery)
- Login page: "Forgot password?" link + post-reset confirmation banner

---

## ARCHITECTURE DECISIONS

- Frontend: Next.js App Router
- Backend: Supabase (Postgres + Auth)
- Emails: Resend
- Hosting: Vercel

Core logic:
- Booking overlap protection is server-side and authoritative
- Booking API remains stable and minimal
- Booking dates are stored as date-only strings (`YYYY-MM-DD`)
- Stay dates must never use JS Date parsing
- Pricing engine is UI/display layer only
- Booking system does NOT depend on pricing engine for validation or storage

Calendar:
- External cron (`cron-job.org`) triggers sync
- iCal uses UTC with exclusive `DTEND` semantics
- Calendar sync is operational and belongs under `/admin/calendar`

Email system:
- Token-based secure actions use signed, expiring HMAC tokens
- Email triggers happen after booking creation
- PNG-only assets are used for email compatibility

Add-ons:
- Stored per booking as JSON snapshot (`bookings.addons`)
- Source of truth is the Supabase `addons` table
- Add-ons remain optional, but strict operational violations can block booking creation
- Add-ons belong under `/admin/rates`

Admin architecture target:
- `/admin/dashboard`
- `/admin/bookings`
- `/admin/calendar`
- `/admin/rates`
- `/admin/media`
- `/admin/members`
- `/admin/settings`

Admin rules:
- Dashboard is overview only, with no destructive actions
- Bookings is for booking operations
- Calendar is for iCal export/import and sync status
- Rates is for add-ons now and villa pricing later
- Media is its own section
- Members is its own section
- Settings contains system configuration only

UI:
- Admin UI follows the existing inline-style system unless explicitly changed.
- Do not replace existing styling with Tailwind utilities
- Time display uses `Asia/Beirut`
- Admin time format is 24-hour

---

## LOCKED SYSTEMS - DO NOT MODIFY

The following systems are production-stable and must not be changed unless explicitly approved:

- `/api/bookings` - submission, validation, overlap logic (CORE LOCKED)
- Allowed exception:
  - Non-blocking enrichment of `pricing_snapshot` during booking creation
  - Must NOT:
    - affect booking acceptance/rejection
    - modify validation rules
    - alter response structure
    - introduce new required fields
- `/api/bookings/availability`
- `/api/booking-action/*`
- `/api/calendar/*`
- `/api/cron/*`
- `/api/admin/*`
- Admin confirm/cancel flow
- Email trigger system
- Authentication system
- Token system (`booking_action_tokens`)
- Calendar sync logic
- Database schema and existing tables/columns
- iCal logic (`DTSTART`, `DTEND`, `DTSTAMP`)

---

## HARD CONSTRAINTS

- No destructive backend changes
- No API response shape changes
- No booking logic changes
- Allowed exception:
  - Controlled backend enrichment inside existing JSON snapshot fields (e.g. `pricing_snapshot`, `addons`)
  - This enrichment must be:
    - Non-blocking
    - Advisory only (not used for validation or booking decisions)
    - Not exposed to guest-facing UI
- No calendar sync logic changes
- No database schema changes
- No authentication changes
- Pricing engine implementation is allowed during Phase 8, but must remain display-only and must not enforce booking totals server-side yet.
- Pricing must remain display-only until Phase 9
- No server-side pricing enforcement before Phase 9
- No new features during restructuring
- No duplicate data sources
- Booking must work with or without add-ons
- Add-ons may block booking only for explicit strict operational violations
- Keep changes minimal, surgical, and reversible

---

## DATA & TIME RULES

- Supabase timestamps are stored in UTC ISO format
- Server/Vercel runtime must not be assumed as local time
- Display timezone for Oraya operations is `Asia/Beirut`
- Admin timestamps use 24-hour format
- Stay dates (`check_in`, `check_out`) are date-only strings
- Stay dates must not be passed through JS `Date` parsing
- iCal `DTEND` remains exclusive end date

---

## KNOWN LIMITATIONS (PHASE 8)

- Seasonal overlaps resolved by list order (no enforcement)
- Seasonal minimum stay is not enforced
- Validation is non-blocking
- Weekend logic uses UTC (not Asia/Beirut)
- Pricing not persisted server-side
- Overlap warnings may duplicate (O(n^2))
- No strict invalid date validation (e.g. Feb 30)
- No analytics dashboard for offer performance (UI only visibility)
- Offer logic currently limited to dead-day timing add-ons
- No dynamic pricing adjustments beyond predefined rules

---

## NEXT PHASE

Phase 13 — Real-world validation & stabilization:
- 13A Calendar sync verification + cron health [COMPLETE — code correct, external config issue]
- 13B Password reset flow (forgot password → email → new password) [COMPLETE]
- 13C Guest Website UX Upgrade [COMPLETE]
  - Booking purpose: card-based selection (5 types) replacing old dropdown
  - Step 3 add-ons: "Enhance Your Booking" heading + subcopy
  - Event-aware advisory panel (per purpose, advisory only)
  - Commercial layer teaser (static copy)
  - Review summary: "Booking purpose" label
- 13C Hotfix [COMPLETE]
  - Auto-select Extra Bedding when sleeping guests = 8 (locked, helper text)
  - Simplified guest pricing display (totals only)
  - Event Inquiry mode foundation: Preferred Event Area + Requested Services + notes append
- 13C.2 Stay vs Event Inquiry Separation [COMPLETE — superseded by 13C.3]
  - Introduced page mode state inside /book (later removed in 13C.3 — events moved to a dedicated inquiry route)
- 13C.3 Architectural split: Stay (/book) vs Event Inquiry (/events/inquiry) [COMPLETE]
  - `#events` remains the homepage marketing anchor
  - New dedicated route `app/events/inquiry/page.tsx` — 4-step event inquiry flow (Event Basics → Services → Host Details → Review)
  - All event inquiry CTAs route to `/events/inquiry`
  - `/events/inquiry` shows NO pricing — only "Pricing is tailored based on your event size, services, and date."
  - `/events/inquiry` submits via existing `/api/bookings` with structured `[Event Inquiry]` notes block (no schema change)
  - Backend, API, and schema remain unchanged
  - /book stripped back to stay-only: removed mode state, switchMode, isEventInquiry, EVENT_AREAS, EVENT_SERVICES, BOOKING_PURPOSES, EVENT_ADVISORY, eventArea, eventServices, inquiryPricingPanel
  - /book Step 2 keeps a single CTA card "Planning something more than a stay?" → routes to /events/inquiry
  - /book Step 3: review summary stay-only ("Booking Summary"); confirmation copy unified to "Your booking request will be reviewed and confirmed by Oraya."
  - Submit button always "Submit Booking Request"
  - /book bundle dropped from 35.3 kB → 17.5 kB
- 13C.4 Bedroom-based stay setup UX [COMPLETE]
  - /book Step 2 now leads with bedroom selection (1, 2, or 3 bedrooms) instead of overnight guest count
  - Estimated guests remains secondary and maps safely to the existing `sleeping_guests` API field
  - Structured `[Stay Setup]` notes are appended in the existing message field without changing payload shape
- 13D Guest booking detail page (view token, persistent link) — pending approval
- 13E Dynamic pricing optimization — pending approval
- 13E.1 Smart Event Recommendations (frontend-only) [COMPLETE]
  - Event-type-based guidance card on `/events/inquiry`
  - Recommended services button adds advisory service selections without auto-selecting by default
  - Services grouped visually by setup, hospitality, production, and guest flow
  - Event summary upgraded with overview + requested services sections
  - No pricing added and no backend/API/schema changes
- 13F Pricing Intelligence Layer [COMPLETE]
  - Controlled snapshot enrichment implemented for admin advisory use only
  - 3BR base pricing model used internally
  - Bedroom factors: 1BR=0.6, 2BR=0.8, 3BR=1.0
  - Admin-only revenue estimate metadata persisted in `pricing_snapshot.internal_intelligence`
  - Guest UI does not expose internal pricing
  - No schema/API response changes
- 13G Admin Pricing Intelligence UX Polish [COMPLETE]
  - Admin-only display for internal pricing intelligence
  - Safe fallback for older bookings
  - No guest UI exposure
  - No schema/API changes
- 13G.1 Admin Revenue Value Display + Intelligence Attachment Fix [COMPLETE]
  - Admin bookings UI displays numeric stay value, add-ons value, and estimated total
  - Internal intelligence now attaches reliably for new bookings when `pricing_snapshot` exists
  - Safe fallback metadata persists if intelligence computation is unavailable
  - Guest UI remains unchanged and does not expose internal pricing
  - No schema/API response changes
- 13G.2 Admin Rental Price Display + Revenue Snapshot Debug [COMPLETE]
  - Admin revenue panel now shows stay/add-ons/total values where persisted data exists
  - Works for pending and confirmed bookings
  - Revenue display no longer depends entirely on internal intelligence
  - No guest UI exposure
  - No schema/API response changes
- 13H Seasonal Bedroom-Based Pricing Integration [COMPLETE]
  - Bedroom factor applied after seasonal/weekday/weekend full-villa rate selection
  - Homepage from-price aligned with the 1-bedroom weekday entry model
  - `pricing_snapshot` stores full-villa and bedroom-adjusted stay values plus nightly breakdown metadata
  - Admin revenue estimate uses adjusted stay value when present
  - No event pricing exposure
  - No schema/API response changes
- 13H.2 Admin Decision Intelligence [COMPLETE]
  - Pending booking decision panel
  - Revenue total / add-ons / bedroom / guest load visibility
  - Pending conflict advisory copy
  - Existing data only
  - No schema/API changes
- 13H.3 Admin Booking Comparison Layer [COMPLETE]
  - Overlapping pending bookings comparison
  - Side-by-side revenue visibility
  - Advisory recommendation hints
  - No auto decision logic
  - No schema/API changes
- 13H.4 Admin Approval Optimization [COMPLETE]
  - Approval area advisory warning for higher-value overlaps
  - Clearer confirm/cancel action grouping
  - No auto-decision logic
  - No backend/API/schema changes
- 13I Guest Booking Detail Page [COMPLETE]
  - Secure persistent guest view link verified (existing HMAC-signed token via verifyViewToken)
  - Stay booking detail display includes bedroom setup
  - Event inquiry detail display hides pricing
  - Email view links already integrated
  - No admin intelligence exposure
  - No event pricing exposure
  - No schema/API changes
- 13J Guest Pre-Payment Review Layer [COMPLETE]
  - Final stay review clarified before submission
  - Guest sees estimated booking total before request submission
  - No payment implementation
  - No event inquiry pricing
  - No admin intelligence exposure
  - No schema/API changes
- 13K Payment Readiness Audit [COMPLETE]
  - Booking lifecycle audited (request → admin review → confirm/cancel → guest view)
  - Pricing snapshot readiness reviewed (adjusted_stay_subtotal, addons_snapshot, estimated_total, bedrooms_to_be_used all persisted)
  - Future payment fields identified (payment_status, deposit_amount, amount_paid, payment_method, transaction_id, refund_status, payment_provider_metadata)
  - Recommended architecture: request-first → admin confirms availability → deposit link issued post-approval (HMAC-signed, leveraging existing booking_action_tokens pattern)
  - Event inquiries: payment must remain off-flow; pricing is bespoke and quoted manually
  - No payment implementation
  - No schema/API changes
- 13L.1 Manual Payment Tracking [COMPLETE]
  - Payment tracking schema added
  - Admin can request deposit
  - Admin can record Whish / cash / bank transfer / manual payments
  - Admin can record refund state
  - No guest payment UI yet
  - No Stripe / card gateway integration
  - No booking validation changes
- 13L.2 Guest Payment Instructions [COMPLETE]
  - Secure booking view displays payment instructions for stay bookings
  - Payment status is reflected to guests after admin request / payment recording
  - No online payment processing
  - Event inquiries remain pricing / payment hidden
  - No schema / API changes
- 13L.3 Payment Email Flow [COMPLETE]
  - Payment requested email implemented
  - Payment received email implemented
  - Payment reminder template prepared
  - Emails link to secure booking view
  - No Stripe / payment processing
  - No schema / API changes
- 13L.4 Payment UX Polish [COMPLETE]
  - Whish-first UX improvements
  - Payment reference copy UX
  - Clearer balance display
  - Overdue payment warning
  - Admin payment status visual polish
  - No Stripe / payment processing
  - No schema / API changes
- 13L.5 Payment Reminder & Overdue Control [COMPLETE]
  - Admin-triggered payment reminder
  - Overdue escalation UI
  - Cron-ready reminder function prepared
  - No auto-cancel logic
  - No Stripe / payment processing
  - No schema / API changes
- 13N Revenue Optimization Layer [COMPLETE]
  - Relative revenue priority badges (high/medium/low — only on overlapping pendings, no thresholds)
  - Best booking highlight for overlaps
  - Payment due-soon indicator (24h window, distinct from existing overdue)
  - Refined dead-day hints (subtle heading)
  - Admin decision clarity helper
  - No threshold-based scoring
  - No automation decisions
  - No backend/API/schema changes
- 13Z Phase 13 Closure — Trust, Legal, Conversion Polish [COMPLETE]
  - All 4 legal pages live (/legal/privacy, /legal/terms, /legal/refund, /legal/payment) with shared layout
  - Trust layer implemented (homepage Why Oraya section + Guest Experiences placeholders)
  - Guest experience placeholders added (no fake reviews)
  - Payment trust clarified (Payment Policy page covers Whish/bank/cash + post-confirmation flow)
  - Domain consistency fixed (hello@stayoraya.com everywhere; admin placeholder updated)
  - Pricing disclaimer microlabel updated to comparison-aware copy
  - No system logic changes
  - Phase 13 fully complete
Phase 14 — Growth, Operations, and Event System Hardening

Purpose:
- improve admin workflow
- separate stay and event operations
- add safer operational guidance
- improve conversion and trust
- prepare future channel/payment/growth features

Phase 14 rules:
- No backend/API/schema changes unless explicitly approved per task
- Event availability enforcement requires separate approval
- No auto-cancel or auto-confirm logic
- Admin guidance must remain advisory unless explicitly approved
- Guest-facing pricing must remain accurate and consistent
- Event pricing remains custom/manual until explicitly implemented
- Payment remains manual/hybrid unless card gateway phase is approved

- 14A Admin Pending Workflow Cleanup [COMPLETE]
  - Conflicting pending requests visually grouped as Conflict / On Hold (frontend-only detection vs confirmed bookings)
  - No auto-cancel logic — Cancel button preserved, optional WhatsApp link if guest_phone exists
  - Pending cards compact by default with expandable details (reuses existing renderCompactRow pattern)
  - Full decision details preserved in expanded state
  - No schema/API changes
- 14B Event System Separation + Blocking Audit [COMPLETE]
  - Event vs Stay classification added in admin (frontend-only via event_type + [Event Inquiry] marker)
  - Event Inquiries separated visually into their own admin pending group, distinct from Stay Requests
  - Event Inquiry compact-card badge with event_type label
  - Expanded event card shows "Event pricing is customized after review" disclaimer
  - Event operational rules defined (single-day, multi-day) — see audit doc below
  - No availability changes implemented yet — audit only
  - No schema/API changes
- 14C Event Availability Enforcement Design [COMPLETE]
  - Current availability logic audited
  - Event blocking model defined
  - Implementation plan prepared
  - Backend implementation not yet applied
  - Explicit approval required before enforcement
- 14D Event Add-ons Architecture [COMPLETE]
  - Existing add-on engine audited
  - Event service requirements defined
  - Existing add-ons table + metadata settings path are sufficient for the foundation
  - Admin UI plan prepared under the existing Rates / Add-ons area
  - No event pricing exposed
  - No schema/API changes applied
- 14E Event Services Admin Foundation [COMPLETE]
  - Add-on metadata extended for event services
  - Admin add-ons manager separates Stay Add-ons and Event Services
  - Event type applicability and quantity settings added
  - Data stored in existing settings JSON
  - No schema/API changes
  - No guest event pricing exposure
- 14F Event Inquiry Service Selection [COMPLETE]
  - `/events/inquiry` now loads admin-managed Event Services
  - Event-type filtering implemented
  - Quantity selection supported
  - Selected services included in inquiry notes
  - No event pricing exposed
  - No schema/API changes
- 14G Event Proposal Workflow [COMPLETE]
  - Admin can draft and send custom event proposals
  - Proposal is visible on the secure guest booking view
  - Proposal email is sent through the existing secure token link
  - Event remains custom and manual
  - No automatic confirmation or payment
  - Schema added additively
- 14H Event Proposal Acceptance [COMPLETE]
  - Guests can accept or decline event proposals
  - Admin sees proposal response state
  - Proposal expiry is handled visually only
  - No auto-confirmation or payment is triggered
- 14I Event Confirmation + Payment Flow [COMPLETE]
  - Event confirmation is gated by proposal acceptance
  - Manual confirm action is added for accepted event inquiries
  - Payment request reuses the existing manual payment system
  - No auto-confirmation or auto-payment is triggered
  - No schema/API changes
- 14J Event Availability Enforcement [COMPLETE]
  - `lib/calendar/event-block.ts` — shared helpers: `addDaysToDateOnly`, `isEventBookingRow`, `getOperationalRange`, `rangesOverlap`
  - `lib/calendar/availability.ts` — rewritten to use event-block helpers; confirmed events return operational range (check_in - 1 day, check_out); `findAvailabilityConflict` accepts `incomingIsEvent` flag
  - `/api/bookings` POST — detects event inquiry and passes `incomingIsEvent: true` to conflict check
  - `/api/admin/bookings/[id]` PATCH — passes `isExistingEventInquiry` to conflict check on confirm
  - `/api/booking-action` POST — passes `bookingIsEvent` to conflict check on confirm
  - Admin UI: confirmed event cards show operational block range (setup day note)
  - No schema/API response changes
- 14K Alternative Date Suggestions [COMPLETE]
  - `lib/calendar/alternative-dates.ts` — pure helper `findAlternativeDateSuggestions`; returns up to 3 safe alternatives (Previous, Next, Same weekday next week)
  - Stay and event inquiry suggestions both supported
  - Event setup-window blocking from 14J respected (candidate operational range expanded by -1 day for event inquiries)
  - `conflictSuggestionsMap` useMemo in `BookingsTable.tsx` — computed from confirmed bookings already in memory
  - Admin Conflict / On Hold expanded card shows "Suggested Alternatives" section with date ranges and reasons
  - Empty state: "No safe alternative dates found nearby."
  - Advisory copy: "Use these dates to offer the guest an alternative manually."
  - No auto-reschedule, no auto-confirm, no auto-cancel logic
  - No schema/API changes
- 14L Conflict Resolution Actions [COMPLETE]
  - `buildAlternativeOfferMessage` module-level function — pure, takes guestName + original dates + suggestion + isEvent flag
  - Stay message: "Your requested stay dates are not available due to an existing confirmed booking."
  - Event message: "Your requested event date is not available due to venue scheduling."
  - Each suggestion row in Conflict / On Hold expanded card gets a "Prepare offer" toggle button
  - Offer panel shows prepared message text, WhatsApp link (when phone exists, message pre-encoded in URL), Copy message button
  - Copy button shows "Copied!" for 2 s, then resets
  - `activeOfferKey` / `copiedOfferKey` state — one panel open at a time; toggling same button closes it
  - No auto-reschedule, no backend writes, no guest exposure
  - No schema/API changes
- 14M Admin Conflict Decision Polish [COMPLETE]
  - Conflict decision hierarchy clarified
  - Compact reason labels preserved
  - Cancel warning clarified
  - Event/stay wording cleaned up
  - No backend/API/schema changes
- 14N Event Type Taxonomy Refactor + Event Services UX [COMPLETE]
  - EVENT_TYPES expanded from 4 → 23 ordered types in guest inquiry
  - EVENT_RECOMMENDATIONS extended to cover all 23 new types (stay/family/corporate/production/etc.)
  - Legacy aliases kept for "Baptism / Family Gathering" and "Wedding / Engagement" — old stored requests remain readable
  - EVENT_TYPE_OPTIONS in AddonsEditor updated to 23 new types + 2 legacy options at bottom
  - Event type selector layout changed to 2-column responsive grid
  - Event service cards visually distinct: blue-tinted border/background
  - Compact row shows "Recommended" badge and applicable event types summary for event services
  - "Recommended add-ons" → "Recommended services" wording in event service edit panel
  - No backend/API/schema changes

Phase 15 — Production & growth readiness

- 15A Production Readiness Audit [COMPLETE]
  - Full system audited
  - Launch blockers identified
  - Production checklist prepared
  - No feature changes implemented
- 15B Security + Reliability Hotfix [COMPLETE]
  - BOOKING_ACTION_SECRET fallback removed
  - admin API routes protected server-side
  - admin_password no longer exposed
  - admin password verification moved server-side
  - CRON_SECRET enforced
  - no booking/pricing/availability logic changes
- 15D Security Cleanup + Smoke Test [COMPLETE]
  - temporary env debug route removed
  - admin API auth smoke-tested
  - cron authorization smoke-tested
  - proposal schema verified
  - no feature logic changed
- 15E Local Environment Parity [COMPLETE]
  - required env vars documented
  - local testing requirements clarified
  - secret hygiene verified
  - no runtime logic changed
- 15F.1 Contact Email Consistency Hotfix [COMPLETE]
  - public contact + reply paths aligned to primary inbox alias (superseded by hello@ in 15F.2)
  - transactional reply-to audited
  - no booking/payment/schema logic changed
- 15F.2 Email Identity Standardization [COMPLETE]
  - public email unified to hello@stayoraya.com
  - reply-to updated across all emails
  - admin email hidden from user-facing surfaces
  - no logic changes
- 15F.3 Privacy + Legal Communication Alignment [COMPLETE]
  - legal pages aligned with current booking/payment/event model
  - privacy page prepared for access automation
  - email footer/contact copy standardized
  - no logic changes
- 15F.4 Trust Layer + Legal Entity + Testimonial Intake [COMPLETE]
  - legal identity placeholder added safely (footer, legal layout, homepage footer); **TODO:** replace placeholder legal identity with registered entity details when available (no invented registration / VAT / license / S.A.L. / address)
  - human operations reassurance added (homepage, booking flow, event inquiry)
  - direct booking trust copy improved (review before confirmation, payment after review, support email, automated arrival details only after confirmation and operational review)
  - testimonial admin intake prepared without fake reviews (`settings` key `guest_testimonials`, JSON array; admin Settings UI)
  - approved-only public testimonial display on homepage via public `/api/settings?key=guest_testimonials`
  - no booking/payment/pricing/availability logic changes
- 15F.5 Manual Testimonial Manager + Feedback Request Tool [COMPLETE]
  - admin testimonial manager added (structured fields + approved toggle + order + remove; still persisted as `guest_testimonials` JSON in settings — no schema change)
  - approved-only publishing clarified in admin; homepage unchanged (approved-only via existing parser)
  - manual feedback request tool on confirmed booking cards: prepared copy, clipboard, optional WhatsApp and mailto links — **no** automatic feedback emails, cron, or auto-publish
  - event inquiries use alternate line: “We hope your event experience with Oraya went well.”
  - no booking/pricing logic changes
- 15F.6 Completed Reservations History + Feedback Follow-up [COMPLETE]
  - completed/checked-out reservations separated visually (today > `check_out` ISO date; admin-only, no `status` DB change)
  - feedback request tool emphasized in Completed / Checked-out (compact “Prep FB” shortcut + primary styling); de-emphasized copy in Confirmed / Upcoming expanded view
  - stay vs event wording in history rows (`Event dates · …` vs stay range; proposal total when available)
  - **Feedback request tracking:** not persisted anywhere today — UI shows “Not tracked in system (manual only)”. Optional future schema (e.g. `feedback_invite_sent_at` on `bookings` or settings log) was **not** applied pending explicit approval
  - no automatic feedback emails; no schema changes in this phase
- 15F.7 Manual Feedback Email Trigger [COMPLETE]
  - additive `bookings` columns (run `sql/phase-15f7-feedback-email-tracking.sql` in Supabase): `feedback_requested_at`, `feedback_requested_channel`, `feedback_request_count`
  - admin-only `POST /api/admin/bookings/[id]/send-feedback` (`requireAdminAuth`); Resend + shared transactional footer; stay vs event body copy; **no** cron, auto-send on dates, or testimonial auto-publish
  - 24-hour duplicate guard on `feedback_requested_at` (response: `Feedback already requested recently`); resend allowed after cooldown; confirmation modal before send
  - Completed / Checked-out expanded card: send / resend + status line; compact row shows last requested time when logged; manual prepare / WhatsApp / copy unchanged
  - no booking pricing, payment totals math, or availability logic changes
- 15G Event Services Consolidation [COMPLETE]
  - **15G.1** Event Type Taxonomy Consolidation + Normalization [COMPLETE]
    - `lib/event-types.ts` — `CANONICAL_EVENT_TYPES` (9), `CANONICAL_EVENT_TYPE_VALUES`, `CanonicalEventType`, `normalizeEventType()`; `NORMALIZATION_MAP` for legacy strings
    - Guest inquiry + admin selectors use canonical types; filters normalize `applicable_event_types`; no schema change
  - **15G.5** Event Services Default Configuration [COMPLETE]
    - `lib/event-service-seed.ts` — 18 canonical event services with full defaults (price, `pricing_model` / operational `pricing_unit`, categories per spec, advance notice as `preparation_time_hours` + `cutoff_type: before_booking`, enforcement soft, approval flags, quantity bounds, `display_order`, `applicable_event_types` including `SEED_APPLICABLE_ALL_EVENT_TYPES` expansion; catering “per person” stored as `per_person_per_day` + operational `per_guest`; legacy `matchAliases` for idempotent merge (e.g. old “Tables and chairs” → Full Seating)
    - `app/api/admin/event-services/sync/route.ts` — upserts addons + `addon_operational_settings`: match by stable `id` then label/aliases; repair price when null/0/90; set `applies_to` when missing/`stay`; fill empty category / empty applicable types; preserve non-empty category and non-placeholder prices; `operational_settings_changed` in JSON response
    - `app/events/inquiry/page.tsx` — fallback catalog uses `expandSeedApplicableEventTypes`; recommendations updated to new service labels (line-level guest estimates added in **15G.7**)
  - **15G.6** Event Services Price + Description Repair [COMPLETE]
    - `lib/event-service-seed.ts` — each canonical service includes `description` (guest-safe copy); `findSeedForAddonRow()` for id/label/alias matching on legacy rows
    - `app/api/admin/event-services/sync/route.ts` — repair canonical addon price when null, non-finite, ≤0, or placeholder **90** (never treat 0 as intentional); post-pass upsert for matched rows missed in main loop; merge operational `description` from seed; `Array.from` for Map upsert batch (TS downlevel)
    - `app/events/inquiry/page.tsx` — optional service descriptions on inquiry step 2; no per-service price display (non-binding setup total added in **15G.7**)
    - Admin description remains in operational settings JSON (no new `addons.description` column); `AddonsEditor` guest description field unchanged
  - **15G.7** Event Inquiry UX + Pricing Estimate Connection [COMPLETE]
    - `lib/event-inquiry-handoff.ts` — stay→event session handoff with `lockId` + URL `?prefill=book&hl=` (PII not in query string); `lib/event-inquiry-pricing.ts` + `lib/event-inquiry-message.ts` — attendee cap 30, line subtotals, `[EventSetupEstimate]` JSON in `bookings.message` (no schema change)
    - `app/book/page.tsx` — “Plan your event” writes handoff when villa + dates exist; pre-fills guest contact when in guest mode
    - `app/events/inquiry/page.tsx` — consumes handoff; villa change clears dates only when switching villa; attendees capped (UI + `goNext` + submit); per-guest / `per_person_per_day` quantities default to attendee count and sync unless manually edited; service qty max capped at 30; **estimated event setup total** on steps 2–3 with required disclaimer copy; 3-step flow (merged review + **Submit Event Inquiry**); estimate persisted for admin
    - `app/api/bookings/route.ts` — event inquiries: `day_visitors` 1–30 validation
    - `components/admin/BookingsTable.tsx` — event inquiry card: sections (basics, selected services with unit/line when estimate present, subtotal, guest, notes); clearer calendar vs estimate disclaimer
  - **15G.10** Event Proposal Workflow QA Fix (enhanced with auto financial fields) [COMPLETE]
    - Admin: proposal draft save no longer resets `proposal_status` after **sent** / **accepted**; clearing local draft after **send proposal** so server timestamps and status drive the UI; **Send** disabled once accepted, **Resend** when already sent; overlap / revenue comparison uses **event setup estimate** vs **stay subtotal**; pending compact row + conflict cards show submitted time, inquiry vs stay, event type, estimate, proposal flow hints; Decision Signal uses event setup estimate for event inquiries; requested services UX with **Approved / Declined** badges
    - Proposal panel auto-fields (`BookingsTable`): **total** defaults from inquiry estimate when `proposal_total_amount` unset; **deposit** defaults to 50% of total rounded **up** to $100 (`computeProposalDepositFromTotal`); **deadline** defaults to event `check_in` − 7 days (`computeDefaultProposalValidUntilInputValue`, or safe “today EOD” when sooner); local flags **`depositAutoSyncDisabled`** (manual deposit edit, or saved deposit ≠ formula) stops deposit auto-sync when **total** changes; **`deadlineManuallyEdited`** (any deadline field edit, or persisted `proposal_valid_until`) preserves admin deadline; `buildInitialProposalDraftFromBooking` + `updateProposalDraft(booking, …)` so first partial update inherits full defaults
    - Guest `booking/view`: status pill **Proposal accepted · Awaiting confirmation**; **Your note** shows guest text only (no raw estimate JSON); proposal **Pricing** table (Service / Qty / Unit / Subtotal); **Payment deadline** label; shared payment method labels
    - `lib/send-event-proposal-email.ts` + `app/api/admin/bookings/[id]/route.ts` — proposal email HTML table + totals + payment methods + **Review & accept** CTA; `buildProposalEmailLineItems` + `parseEventSetupEstimateFromMessage`; optional `admin_status` on `proposal_included_services` JSON (approved/declined)
  - **15G.11** Event Inquiry Minimum Service Validation [COMPLETE]
    - `lib/event-service-requirements.ts` — `getRequiredEventServiceGroups(eventType)` and `getMissingRequiredEventServiceGroups()`; canonical groups (seating / decoration / catering / staff / lighting); event-type → required-group map (Wedding requires lighting, others omit)
    - `app/events/inquiry/page.tsx` Step 2: live status hint (green “complete” / amber missing-list); Continue + Submit blocked with `“To prepare this event properly, please include the required setup for your selected event type. Missing: …”`
    - No schema/API changes
  - **15G.12** Event Proposal / Calendar / Payment Basis QA Fix [COMPLETE]
    - `app/events/inquiry/page.tsx` — `<DayPicker>` `defaultMonth` + key reset uses `dateRange.from`, so handed-off August dates open August (not today); recommendation chip list now derives from `resolveRecommendedPackSeedIds` so the labels match what **Add recommended setup** actually applies
    - `lib/event-service-exclusivity.ts` — Umbrellas / shaded areas removed from auto-applied recommended pack (paid line only when manually selected; seed price stays $150 with description; sync repairs $0/null/placeholder)
    - `lib/send-booking-pending-email.ts` + `lib/send-booking-request-email.ts` — guest-visible Notes section uses `extractEventInquiryGuestNotesLine` for event inquiries (no raw `[Event Inquiry]` / `[EventSetupEstimate]` JSON in guest or admin emails)
    - `lib/send-event-proposal-email.ts` — fixed-layout pricing table with right-aligned `nowrap` numeric cells and `word-break` labels (mobile-safe); guest-facing labels: **Final event total**, **Deposit required**, **Balance due**, **Payment deadline**
    - `app/booking/view/[token]/page.tsx` — guest-facing proposal block now reads **Final event total** / **Deposit required** / **Balance due** (admin still uses internal “Proposal total”)
    - `components/admin/BookingsTable.tsx` — **`getBookingPaymentBasis(booking)`**: confirmed event inquiries use `proposal_total_amount` / `proposal_deposit_amount` as the payment basis (not stay subtotal); `recordPayment`, “Estimated total”, and remaining-balance derive from this basis; `getPaymentDraft` defaults Request-deposit deposit + due date from `proposal_deposit_amount` + `proposal_valid_until`; advanced “excluded / optional / notes” fields collapsed into a single `<details>` until used; admin compact pending row reordered to `[kind · event_type] · [dates] · [villa] · Submitted X · Est. setup $Y · proposal hint`; “Accepted · Awaiting deposit” pill + “Confirm event (after deposit)” button + “Proposal accepted — awaiting deposit confirmation. Confirm event after deposit received.” copy
    - No schema/API/availability/conflict logic changes
    - Typecheck + `next build` pass
  - **15G.13** Add-ons Filtering + Admin Editing Fix [COMPLETE]
    - `app/book/page.tsx` — stay add-on fetch now filters `applies_to ∈ {stay, both}`; event-only services no longer appear in the stay flow (the event inquiry filter at `app/events/inquiry/page.tsx:617` already enforced `{event, both}`)
    - `lib/addon-operations.ts` — new `normalizeAddonAppliesTo()` coerces legacy / typo values (`events`, `event_only`, `stays`, `stay_only`, `all`, `any`, `stay+event`) onto the canonical `stay | event | both` set; `parseOperationalFields` calls it so existing settings normalize on load — no destructive migration
    - `components/admin/AddonsEditor.tsx` — Save button now opens the first invalid row and shows a top-level red banner with the blocking error count + first message, so empty-label / duplicate-label / invalid-price errors stop being silent; `handleSaveClick` wraps `saveAddons` (existing field-level error highlighting unchanged)
    - UX declutter: removed redundant “Event Services are managed here…” paragraph (already covered by section heading); guest description editor collapsed into a `<details>` summary that opens automatically when the field has content; rates page intro condensed; sync hint shortened
    - No booking / pricing / proposal / payment / availability logic touched; `/api/admin/addons` upsert path unchanged so price / currency / pricing_model / quantity / approval / event applicability / display_order / villa mapping / `applies_to` all preserve through save
    - Typecheck + `next build` pass
Phase 15H — Event Quote Line-Item Manager [COMPLETE]
- **No schema change.** `proposal_included_services` is JSONB; new optional fields (`unit_price`, `line_total`, `source`, `notes`) added per-row. Server normalizer in `app/api/admin/bookings/[id]/route.ts` now accepts/validates them; legacy rows without the new fields keep working
- **Admin quote builder (`components/admin/BookingsTable.tsx`):** new `ProposalLineItemDraft` working state replaces the old "checkbox + free-form total" model. Each row is editable (label / quantity / unit_label / unit price / internal note); guest-requested services seed in with `source: "requested"`, custom rows added via **+ Add custom service** carry `source: "custom"` and have a **Remove** action. Per-row **Include / Exclude** toggle: excluded rows persist with `admin_status: "declined"` and drop out of the total + the guest view
- **Computed total:** proposal total is now read-only and derived from `sum of included line totals`. Deposit is **manual** (admin-editable; suggested 50% copy only; no auto-sync to line total)
- **Save / send (`saveEventProposalDraft`, `sendEventProposal`):** save persists every line (included + excluded) plus the computed total. Send runs `validateProposalForSend()` first — blocks on no included billable line, missing label, qty ≤ 0, missing/invalid unit price, total ≤ 0, deposit > total, no payment methods, no deadline. Yellow inline banner shows the blocking reason; the **Send proposal** button disables while invalid
- **Original inquiry preserved:** `parseRequestedEventServicesFromMessage` snapshot rendered in a collapsed "Original guest request" `<details>` panel; never mutated by proposal edits
- **Guest view (`app/booking/view/[token]/page.tsx`):** pricing table now reads admin-set `unit_price` / `line_total` directly (estimate fallback only for legacy proposals), shows `unit_label` next to the service name, and surfaces the **Final event total** in a footer row under the table; declined services are filtered out of the "Included services" chip list
- **Email (`lib/send-event-proposal-email.ts` via `buildProposalEmailLineItems`):** same precedence — admin price wins, estimate fallback for legacy data; `unit_label`, `source`, `notes` carried through
- No payment portal added; no auto-confirm; no auto-payment; stay booking flow / stay pricing / availability untouched
- `npx tsc --noEmit` + `next build` pass
- **15H.1** Proposal Pricing Corrections [COMPLETE]
  - Deposit is manual (no auto-sync)
  - Rounding applied to all monetary values in the proposal breakdown (`roundMoney` / `sumMoney` for line math; breakdown rows use `roundMoney` for subtotal, final total, deposit, remaining balance)
  - Included vs excluded services split in UI (two sections: **Included services (billable)** vs **Optional / excluded services**; same row editor + toggle; no duplicate `lineItems` state)
  - Totals breakdown panel: Subtotal (included), Final total, Deposit required (manual), Remaining balance = final − deposit
  - No booking/payment API/email/guest proposal logic changed in this step

Phase 15 remains active (documentation + future sub-phases only unless product reopens scope).

**15I.1 Payment Foundation [COMPLETE]**
- SQL: `sql/phase-15i1-payment-foundation.sql` — adds `payment_stage` (default `none`), `amount_total`, `amount_due`, `payment_last_at` (`payment_status`, `amount_paid`, `deposit_amount`, `payment_method` unchanged)
- `lib/payment-foundation.ts` — contract total = stay estimated total vs event `proposal_total_amount`; `amount_due` = total − paid; ledger stage `none` | `unpaid` | `partially_paid` | `fully_paid` (guest-facing **workflow** still uses legacy `payment_status`: `payment_requested`, `deposit_paid`, `paid_in_full`)
- Admin `BookingsTable`: **Payment Overview** (totals, deposit, ledger badge, last payment date) + **Record payment** persists foundation fields alongside existing behavior; no guest page, gateway, or booking-creation changes
- No payment portal, no gateway integration, no user payment flow in this step

**15I.2 Admin Booking UX Cleanup [COMPLETE]**
- Expanded booking cards decluttered with collapsible sections (proposal, payment, guest inquiry detail, calendar & operations, feedback, add-ons when present)
- Revenue estimate block removed from booking cards (payment overview + proposal totals remain authoritative)
- Proposal / payment / feedback / operational detail grouped cleanly; long helper copy folded into short labels and `<details>` / “View details” toggles where appropriate
- Critical warnings remain visible when relevant (conflicts, validation, payment overdue, proposal send errors, missing guest email, failed actions)
- No booking, payment, pricing, proposal, API, schema, guest page, or email behavior changes

**15I.3 Booking Flow UX Restructure [COMPLETE]**
- Booking steps reorganized around user actions (4-step flow: villa/dates → stay setup → add-ons → review/submit)
- Long explanatory text moved lower/collapsed into compact “Booking details” sections
- Villa cards in booking flow now use homepage cover imagery path with clear starting-price bedroom basis labels
- Step 2 prioritizes bedroom selection and total visibility before lower-priority context sections
- Step 4 includes payment opportunity placeholders (deposit/full) with no gateway processing or auto-confirm behavior
- Readability improved (larger body/label/button text, reduced dense uppercase treatment, better muted contrast/spacing)
- Updated logo asset applied in booking flow and brand metadata image references
- No booking/pricing/backend logic changed

**15I.3.1 Booking Flow Fixes [COMPLETE]**
- Intro/disclaimer moved to bottom collapsible section
- Identity banner moved out of top flow
- Step 2 prioritizes bedroom selection and estimate
- Submit booking now receives a token-bearing `/api/bookings` success response and redirects to `/booking/view/[token]`
- Loading state no longer stuck
- No booking/pricing/backend logic changed

**15I.3.4 Logo Consistency Fix [COMPLETE]**
- homepage and booking flow now use same updated full logo asset
- old inline full-logo rendering removed/replaced
- no layout or booking logic changed

**15I.4 Public Light / Dark Theme [COMPLETE]**
- **Scope:** homepage (`app/page.tsx`), booking flow (`app/book/page.tsx`), shared `LegalEntityNotice`, global tokens (`app/globals.css`), root layout script (`app/layout.tsx`), `components/PublicThemeToggle.tsx`
- **`data-theme="light"` | `data-theme="dark"`** on `<html>`; default SSR **`light`**; `beforeInteractive` script reads `localStorage` key `oraya-theme` when set to `light`/`dark`, else **first visit stays light** (no system preference); **dark is only applied when the user has chosen dark** (stored value or toggle), not from OS theme
- **Tokens** (non-exhaustive): `--oraya-bg`, `--oraya-surface`, `--oraya-surface-muted`, `--oraya-text` (via `--oraya-ink`), `--oraya-text-muted`, `--oraya-gold`, `--oraya-gold-cta-text` (navy on gold fills), `--oraya-border`, `--oraya-hero-overlay`, `--oraya-book-*`, `--oraya-footer-*`, `--oraya-band-*`, calendar/popover variables; **`light`** = ivory/sand shell; **`dark`** = midnight/navy shell (public surfaces and nav align with Oraya midnight, not inverted light tokens)
- **Toggle:** top-right on homepage nav (with Reserve / account); top-right on `/book` (loading, auth gate, main flow); **light → moon (switch to dark), dark → sun (switch to light)**; `aria-label` + `title`; compact on narrow widths; **initial render shows moon/`Dark` (no `···` placeholder)**; state syncs from `data-theme` in `useLayoutEffect` before paint
- **Documented recent UI (no separate phase id):** homepage mobile polish, homepage footer 2-column mobile link grid, `/book` UI polish — already shipped before 15I.4
- **Not in scope:** admin dashboard theming, booking/API/schema/pricing/payment logic, print/PDF
- **Verify:** `next build` + Vercel deployment success on closing commit

**15I.5 Heated pool prep carry-over (strict notice override) [COMPLETE]**
- **Rule:** Heated pool keeps strict advance-notice enforcement by default; **override** only when: same villa; immediately prior **confirmed** stay (latest `check_out` ≤ new `check_in`); **≤ 24h** between prior `check_out` and new `check_in` (UTC date-only); prior `addons_snapshot` includes heated pool (`id === heated_pool` or label exactly `heated pool`, snapshot row not `declined`).
- **Server:** `POST /api/bookings` loads prior row, computes waiver set for selected heated-pool add-on(s), passes `strict_preparation_waivers` into `runAddonAudit` (`lib/addon-audit.ts`). No pricing/schema change.
- **Guest UI:** `GET /api/bookings/availability?villa&check_in` returns `heated_pool_carryover` (advisory); `/book` shows green note when carry-over applies and short-notice strict would otherwise block.
- **Files:** `lib/heated-pool-carryover.ts`, `lib/addon-audit.ts`, `app/api/bookings/route.ts`, `app/api/bookings/availability/route.ts`, `app/book/page.tsx`

**15I.6 Public theme extension (homepage + `/book` design language) [COMPLETE]**
- **Nature:** **Theme extension only** — reused existing `--oraya-*` tokens from `app/globals.css`, `/book` calendar + step styling patterns, and `PublicThemeToggle` (`variant="public"` on shell pages). **No new design system** and **not a redesign**; layouts, copy, booking/event logic, APIs, admin, and print/PDF unchanged except where hardcoded colors had to map to variables for light/dark consistency.
- **Routes covered:** `/join`, `/login`, `/events/inquiry`, `/villas/mechmech`, `/villas/byblos`; shared public chrome: `components/SiteNav.tsx`, `components/SiteFooter.tsx`.
- **Files (representative):** `components/SiteNav.tsx`, `components/SiteFooter.tsx`, `app/join/page.tsx`, `app/login/page.tsx`, `app/events/inquiry/page.tsx`, `app/villas/mechmech/page.tsx`, `app/villas/byblos/page.tsx`.
- **Verify:** `npm run build` success; production deploy via Vercel on the closing commit (confirm in Vercel dashboard).

**15I.7 Public theme — post-booking, auth recovery, legal [COMPLETE]**
- **Nature:** Extended existing `--oraya-*` / `--oraya-book-*` tokens and `PublicTrustShell` / `LegalTopBar` + `PublicThemeToggle` to high-trust public surfaces only. **No booking/auth/API logic changes**; no layout restructures beyond shared chrome (nav + theme) already used on other public pages.
- **Routes:** `/booking/view/[token]`, `/booking-confirmed`, `/forgot-password`, `/reset-password`, `/legal/*` (layout + policy pages).
- **Files (representative):** `components/PublicTrustShell.tsx`, `components/LegalTopBar.tsx`, `app/booking/view/[token]/page.tsx`, `app/booking-confirmed/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/legal/layout.tsx`, `app/legal/terms/page.tsx`, `app/legal/privacy/page.tsx`, `app/legal/payment/page.tsx`, `app/legal/refund/page.tsx`, `components/CopyValueButton.tsx`, `components/BookingViewMemberLink.tsx`.
- **Verify:** `npm run build` success; Vercel production deploy for closing commit (confirm in dashboard).

**15I.8 Public micro-polish (homepage, book, villas, shared trust UI) [COMPLETE]**
- **Nature:** CSS-first polish only on **public** surfaces. **No** booking/auth/API/schema/pricing/add-on logic, admin, print/PDF, media upload, or payment behavior changes.
- **Imagery:** Villa hero + gallery scrims and `/book` villa thumbnails use **token-derived** gradients (`--oraya-villa-*`, `--oraya-book-villa-thumb-scrim`) from `--oraya-hero-overlay` / `--oraya-hero-canvas` / `--oraya-surface` — lighter than legacy fixed `rgba(0,0,0,0.65)`; caption copy uses `--oraya-hero-tagline` where applicable.
- **Interaction:** Shared utilities in `app/globals.css`: `.oraya-pressable` (≈0.98 active scale, ~180ms transitions), `.oraya-cta-gold-hover`, `.oraya-cta-nav-reserve`, `.oraya-cta-hero-ghost`, `.oraya-cta-book-guest`, `.oraya-cta-book-back`, `.oraya-card-interactive` (+ optional `--border` for ring), `.oraya-link-nav` / `.oraya-link-text` / `.oraya-link-cta` / `.oraya-link-footer`, `.oraya-section-tone` (background cross-fade on theme change).
- **Accessibility:** `prefers-reduced-motion: reduce` disables press/card transforms and shortens transitions; hero entrance/pulse animations suppressed; `scroll-behavior: auto` on `html`.
- **Files (representative):** `app/globals.css`, `app/page.tsx`, `app/book/page.tsx`, `app/villas/mechmech/page.tsx`, `app/villas/byblos/page.tsx`, `components/PublicTrustShell.tsx`, `components/CopyValueButton.tsx`.
- **Verify:** `npm run build` success; Vercel production deploy for closing commit (confirm in dashboard).

---

## AGENT EXECUTION RULES

When working on this project:

1. Always read `PROJECT_STATE.md` before making changes.
2. Never assume missing logic; ask if unclear.
3. Prefer extraction over refactor.
4. Prefer reuse over duplication.
5. Do not introduce new patterns during restructuring.
6. Do not modify backend behavior unless explicitly approved.
7. Keep changes minimal and reversible.
8. Preserve UI exactly unless explicitly instructed.
9. If a task conflicts with this file, stop and ask.
10. Do not reinterpret the architecture without approval.

---

## ENGINEERING RULE

If any instruction conflicts with this file:
STOP and ask before proceeding.
