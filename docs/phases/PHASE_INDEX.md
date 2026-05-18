# Oraya — Phase Index

**Updated:** 2026-05-09
**Authority:** descriptive only. The current state is in [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md). The full historical detail log is in [/PROJECT_STATE.md](../../PROJECT_STATE.md). When this index disagrees with either, the system docs win.

This file is the **master index** of every Oraya delivery phase. One row per phase (or sub-phase cluster), kept short on purpose. For any "why" that does not fit in one line, follow the link to the source-of-truth doc.

---

## Legend

- **Status:** ✅ complete · 🟡 in progress · ⏳ planned · 🔒 closed (do not reopen without production blocker)
- **Scope** is intentionally one line. Detail lives in the linked file.

## Reading order

1. This file — high-level phase map.
2. [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) — current authoritative summary.
3. [/PROJECT_STATE.md](../../PROJECT_STATE.md) — historical detail log per phase.
4. [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md) — forward-looking plan.

---

## Phase 1 — Brand Identity

- **Status:** ✅ complete
- **Scope:** brand direction, color system, typography, logo system. Locked the inline-style + hardcoded color/font convention.
- **Major systems introduced:** brand tokens (`GOLD`, `BEIGE`, `MIDNIGHT`, etc.), `OrayaEmblem.tsx`, `OrayaLogoFull.tsx`, Playfair Display + Lato.
- **Authoritative refs:** [/CLAUDE.md](../../CLAUDE.md), [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md).

## Phase 2 — Public Website

- **Status:** ✅ complete
- **Scope:** marketing surface — homepage, villa pages, footer, navigation.
- **Major systems introduced:** App Router shell, `SiteNav.tsx`, `SiteFooter.tsx`, public sections rhythm.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) "COMPLETED PHASES".

## Phase 3 — Booking System Core

- **Status:** ✅ complete · 🔒 locked surface
- **Scope:** stay-booking submission, availability check, server-side overlap protection.
- **Major systems introduced:** `/api/bookings`, `/api/bookings/availability`, `bookings` table, member auth path.
- **Authoritative refs:** [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md) "Public surface" + "Locked".

## Phase 3B — Secure Email Actions

- **Status:** ✅ complete · 🔒 locked surface
- **Scope:** signed-token confirm/cancel/view links from transactional emails.
- **Major systems introduced:** `booking_action_tokens` table, `lib/booking-action-token.ts`, HMAC signing model, `/api/booking-action/*`.
- **Authoritative refs:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4 "Locked systems".

## Phase 4 — Production Hardening

- **Status:** ✅ complete
- **Scope:** error handling, fallbacks, logging discipline, deployment readiness.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) "COMPLETED PHASES".

## Phase 5 — Calendar Sync & Availability

- **Status:** ✅ complete · 🔒 locked surface
- **Scope:** iCal export per villa, daily Vercel Cron sync, blocking-source ingestion, UTC + exclusive `DTEND` semantics.
- **Major systems introduced:** `/api/calendar/[villa].ics`, `/api/cron/calendar-sync`, `lib/calendar/*`, `CRON_SECRET`.
- **Authoritative refs:** [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md), [/vercel.json](../../vercel.json).

## Phase 6 — Customer Experience Layer

- **Status:** ✅ complete
- **Scope:** guest-side polish on the booking flow; lifecycle messaging.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) "COMPLETED PHASES".

## Phase 7 — Admin Console Restructure

- **Status:** ✅ complete · 🔒 admin auth locked
- **Scope:** `/admin/*` console, signed `oraya_admin` cookie, shared admin data provider.
- **Major systems introduced:** `lib/admin-auth.ts`, `AdminDataProvider`, `/admin/{dashboard,bookings,calendar,rates,media,members,settings}`.
- **Authoritative refs:** [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md) "Admin surface".

## Phase 8 — Pricing Foundation

- **Status:** ✅ complete (display-only by design until Phase 9)
- **Sub-phases:** 8F.1 display + warnings · 8G seasonal pricing · 8H validation (UI-only) · 8I per-night breakdown.
- **Major systems introduced:** base/weekday/weekend/seasonal pricing engine; per-night breakdown; pricing source labels.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) Phase 8 block.

## Phase 9 — Pricing Enforcement Layer

- **Status:** ✅ complete · 🔒 locked surface (server pricing path)
- **Sub-phases:** 9A audit-mode mirror · 9B server validation dry-run · 9C admin hard validation · 9D timezone correction · 9E persistence snapshot · 9F snapshot safety · 9G server enforcement.
- **Major systems introduced:** server-side pricing enforcement on booking creation; `pricing_snapshot` jsonb on `bookings`; UTC/Beirut discipline at the date layer.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) Phase 9 block.

## Phase 10 — Add-on Operations Layer

- **Status:** ✅ complete
- **Sub-phases:** 10A prep controls + dry-run · 10B availability UX (strict/soft) · 10C snapshot persistence · 10D approval status · 10E admin visibility · 10F dynamic admin · 10G admin validation · 10H UI cleanup.
- **Major systems introduced:** `addons` table as source of truth, snapshot rows on `bookings.addons`, strict/soft model.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) Phase 10 block.

## Phase 11 — Add-on Operational Enforcement & Visibility

- **Status:** ✅ complete · 🔒 strict-rule semantics locked
- **Sub-phases:** 11A audit mode · 11B strict enforcement · 11D admin flag visibility · 11 final polish.
- **Major systems introduced:** `runAddonAudit` (`lib/addon-audit.ts`), strict rule fail-closed at booking creation.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) Phase 11 block.

## Phase 12 — Add-on Commercial + Operational Maturation

- **Status:** ✅ complete
- **Sub-phases:** 12B per-villa applicability · 12C commercial layer (percent / recommended / descriptions) · 12D early/late checkout + same-day risk · 12E.1–12E.8 dead-day monetization, discount UI, snapshot persistence, anti-forgery, admin insights · 12F add-on revenue metric · 12G.1–12G.5 revenue opportunity detection + admin/guest hints.
- **Major systems introduced:** `applicable_villas` field, percent pricing, recommended flag, dead-day offer engine + tracking metadata, revenue opportunity panel.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) Phase 12 block.

## Phase 13 — Real-world Validation & Stabilization

- **Status:** ✅ complete
- **Sub-phases (selected):** 13A calendar verification · 13B password reset · 13C–13C.4 booking-purpose UX, stay vs event split, bedroom-based stay setup · 13D–13E.1 guest detail page + smart event recs · 13F–13H pricing intelligence + bedroom-factor seasonal · 13I guest detail page · 13J pre-payment review · 13K payment readiness audit · 13L.1–13L.5 manual payment tracking · 13N revenue optimization · 13Z trust/legal/conversion polish.
- **Major systems introduced:** `/legal/*` pages, `pricing_snapshot.internal_intelligence` (admin-only), manual payment columns, feedback request UX.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) Phase 13 block.

## Phase 14 — Growth, Operations, Event System Hardening

- **Status:** ✅ complete
- **Sub-phases:** 14A admin pending workflow · 14B event/stay separation · 14C event availability design · 14D event add-ons architecture · 14E admin event services foundation · 14F event inquiry service selection · 14G event proposal workflow · 14H proposal acceptance · 14I event confirmation + payment flow · 14J event availability enforcement · 14K alternative date suggestions · 14L conflict resolution actions · 14M conflict decision polish · 14N event-type taxonomy refactor (4 → 23 types).
- **Major systems introduced:** event proposal model on `bookings` (additive jsonb), `lib/calendar/event-block.ts`, event setup-day blocking, conflict-aware admin UX, `/events/inquiry`.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) Phase 14 block.

## Phase 15 — Production & Growth Readiness (Trust + Theme Umbrella)

- **Status:** ✅ complete · 🔒 closed (no reopen without production blocker)
- **Sub-phases:** 15A audit · 15B security hotfix · 15C event/stay calendar parity · 15D security cleanup · 15E env parity · 15F.1–15F.7 contact email standardization, trust layer, testimonial intake, manual feedback email · 15G.1–15G.13 event services consolidation (canonical taxonomy, seed catalog, proposal workflow QA, line-item manager) · 15H + 15H.1 event quote line-item manager + pricing rounding · 15I.1 payment foundation (ledger columns) · 15I.2 admin booking UX cleanup · 15I.3–15I.3.4 booking flow restructure + token redirect + logo consistency · 15I.4 public light/dark theme · 15I.5 heated-pool carry-over · 15I.6–15I.7 public theme extension to all public surfaces + auth/legal · 15I.8 public micro-polish · 15I.9 adaptive `/book` UX (Instant vs Reserve, UI only) · 15I.10 instant booking admin control · 15I.11 cancellation/refund visibility.
- **Critical post-close fixes:** auto-advance suppression, `/api/settings` allowlist, `/api/members` bearer auth, addon audit fail-closed.
- **Major systems introduced:** `data-theme` token system + `oraya-theme` localStorage key, `--oraya-*` CSS variables, `instant_booking_villa_*` settings flags, payment-foundation columns (`payment_stage`, `amount_total`, `amount_due`, `payment_last_at`), event proposal line-item manager, `lib/heated-pool-carryover.ts`.
- **Important:** Instant booking exists as **UI only** today — payment execution is Phase 16 work.
- **Authoritative refs:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) Phase 15 block, [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md).

## AI Project Bootstrap (cross-phase) — `/docs/system/` source of truth

- **Status:** 🟡 in progress
- **Scope:** documentation infrastructure. Stand up `/docs/system/` as the durable, repo-tracked AI memory layer so future ChatGPT, Claude Code, Codex, and Cursor sessions self-orient without depending on chat history.
- **Major systems introduced:** [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md), [CURRENT_PHASE.md](../system/CURRENT_PHASE.md), [AGENT_RULES.md](../system/AGENT_RULES.md), [ARCHITECTURE.md](../system/ARCHITECTURE.md), [ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md), [KNOWN_BUGS.md](../system/KNOWN_BUGS.md), [DECISIONS_LOG.md](../system/DECISIONS_LOG.md), [AGENT_HANDOFF_TEMPLATE.md](../system/AGENT_HANDOFF_TEMPLATE.md), [CHATGPT_PROJECT_INSTRUCTIONS.md](../system/CHATGPT_PROJECT_INSTRUCTIONS.md), and the historical knowledge layer this index belongs to.
- **Authoritative refs:** [/docs/system/CURRENT_PHASE.md](../system/CURRENT_PHASE.md), [/docs/system/DECISIONS_LOG.md](../system/DECISIONS_LOG.md) "2026-05-09 — `/docs/system/` is the AI source of truth".

## Phase 16 — In Progress (16A lead-intake + identity continuity shipped; 16B planning context)

- **Status:** 🟡 in progress
- **Sub-phases:**
  - **16A** WhatsApp AI Butler — 🟡 in progress as an **intake + website continuation channel**. Read-only foundation (`/api/butler/health|event-types|addons|availability|normalize-dates`), lead intake (`/api/butler/lead` + `whatsapp_leads` + `/admin/leads`), secure website handoff (`/api/butler/prefill` + `?h=…` on `/book`), and lead → booking identity continuity (best-effort `whatsapp_leads.linked_booking_id` writer on `/api/bookings` POST) are all shipped. **Per the 2026-05-18 product decision, `POST /api/butler/flow-submit` is deferred indefinitely** — WhatsApp does not create bookings; final submission happens on the website. Outstanding 16A operational work: human-escalation routing, AI prompt tuning (in WhatChimp, not this repo), Vercel env wiring. Smart-lock PIN / access-code delivery is **not** Phase 16A — see 16D.
  - **16B** Payment processing + refunds — ⏳ provisioned. Architecture plan in [/docs/phases/PHASE_16B_PLAN.md](PHASE_16B_PLAN.md). **Starts only after a `bookings` row exists.** No implementation yet.
  - **16C** Guest manual — ⏳ planned. Pre-arrival, during-stay, house rules, troubleshooting.
  - **16D** Smart lock — ⏳ planned. PIN issuance / revocation, check-in / check-out validity windows, guest access delivery, cancellation hooks. The 8-character booking reference on `/booking/view/[token]` is a public **support code**, not an access PIN — access credentials are this phase's scope, not Phase 16A or Phase 16B.
  - **16E** Membership points & rewards — ⏳ planned. Earn / redeem, admin control, anti-abuse.
- **Authoritative refs:** [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md) (forward-looking roadmap), [/docs/phases/PHASE_16B_PLAN.md](PHASE_16B_PLAN.md) (Phase 16B architecture / schema decision / WhatsApp payment branching / roadmap), [/docs/system/CURRENT_PHASE.md](../system/CURRENT_PHASE.md) (rolling phase snapshot). Implementation continues to be gated on architecture/audit pass per [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §3 and `PROJECT_STATE.md` constraint #9.

---

## Cross-cutting systems (introduced or matured across phases)

| System | First introduced | Hardened by | Authoritative file |
|---|---|---|---|
| Booking pipeline (`/api/bookings` + overlap) | Phase 3 | Phase 9, Phase 14J, Phase 15 critical fix | [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4 |
| Booking action tokens (HMAC) | Phase 3B | Phase 15B | [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4 |
| Calendar sync + iCal | Phase 5 | Phase 14J (event setup-day blocking) | [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md) |
| Pricing engine + snapshot | Phase 8–9 | Phase 13F/H, Phase 15G (event proposal estimate) | [/PROJECT_STATE.md](../../PROJECT_STATE.md) |
| Add-on engine + audit | Phase 10–11 | Phase 12B/C/D, Phase 15 critical fix (fail-closed) | [/PROJECT_STATE.md](../../PROJECT_STATE.md) |
| Event proposal workflow | Phase 14G–14I | Phase 15G/H (line-item manager, rounding) | [/PROJECT_STATE.md](../../PROJECT_STATE.md) |
| Theme system (`data-theme`) | Phase 15I.4 | Phase 15I.6–15I.8 | [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md) |
| Payment foundation (manual) | Phase 13L.1 | Phase 15I.1 (ledger columns) | [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) |
| Admin live updates (poll + Realtime) | Phase 15 closure | n/a | [/PROJECT_STATE.md](../../PROJECT_STATE.md) |
| `/docs/system/` AI memory | AI Project Bootstrap | this historical layer | [/docs/system/DECISIONS_LOG.md](../system/DECISIONS_LOG.md) |

---

<!-- New phases: append above the cross-cutting table; never delete a row. Update statuses in place. -->
