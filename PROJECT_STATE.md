# ORAYA PROJECT STATE - SOURCE OF TRUTH

This file defines the current system architecture, constraints, and rules.

If any instruction conflicts with this file:
STOP and ask before proceeding.

---

## CURRENT PHASE

Phase 8 - Pricing Foundation

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

Completed stabilization work:
- Booking reliability: overlap protection, confirm/cancel persistence
- Email system: notifications, verification, secure action links
- Booking UX: 3-step booking flow
- Calendar automation: cron-job.org sync every 10 minutes
- Timezone standardization: Asia/Beirut display, UTC storage
- Phase 7 - Step 2: Admin Component Extraction
- Phase 7 - Step 3: Admin Layout + Shared Data Provider

---

## CURRENT STEP

Phase 7 - Step 4: Split Admin Routes (IN PROGRESS)

Rules:
- No UI change
- No logic change
- No API change
- No route change
- No styling change
- Preserve DOM structure and rendering order

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
- Add-ons must remain optional and non-blocking
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
- Inline styles only during current admin restructure
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
- No pricing engine implementation yet
- No new features during restructuring
- No duplicate data sources
- Booking must work with or without add-ons
- Add-ons must not affect booking core flow
- Keep changes minimal, surgical, and reversible

---

## CURRENT STEP UI CONSTRAINTS

During Phase 7 Step 2:

- Preserve exact DOM structure
- Preserve rendering order
- Preserve current visual design
- No visual redesign
- No layout changes
- No sidebar introduction yet
- No route splitting yet
- Component extraction only

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
