# ORAYA PROJECT STATE - SOURCE OF TRUTH

This file defines the current system architecture, constraints, and rules.

If any instruction conflicts with this file:
STOP and ask before proceeding.

---

## CURRENT PHASE

Phase 12 -> COMPLETE | Phase 13 -> IN PROGRESS

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

- `/api/bookings` - submission, validation, overlap logic
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

- No backend changes
- No API changes
- No booking logic changes
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
