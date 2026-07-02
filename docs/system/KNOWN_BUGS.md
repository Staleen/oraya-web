# Known Bugs & Open Issues

**Updated:** 2026-06-17

Living list of bugs, gaps, and operational pitfalls that are **known** but **not yet fixed** (or accepted as a permanent trade-off). New AI sessions: read this before assuming production is in a clean state.

**Severity scale:**

- **🔴 Critical** — production-impacting, data-loss risk, security risk, or breaks core user journey. Fix immediately.
- **🟠 High** — degrades user trust, enables silent failures, or creates operational risk. Fix this phase.
- **🟡 Medium** — observable rough edge, technical debt, or footgun for future agents. Fix opportunistically.
- **🟢 Low** — cosmetic or doc-only.

**Format:**

```
### #N — Short title
- **Severity:**
- **Area:**
- **Description:**
- **Status:** open | in-progress | won't-fix | wontfix-with-rationale
- **Recommended fix path:**
- **Discovered:** YYYY-MM-DD (source)
```

---

### #1 — `RESEND_FROM_EMAIL` is documented and slotted in `.env.example` but consumed by zero code paths

- **Severity:** 🟡 Medium
- **Area:** Email / configuration hygiene
- **Description:** `RESEND_FROM_EMAIL` previously appeared in [/.env.example](../../.env.example) and is referenced in [/README.md](../../README.md), but no code read it. Every `lib/send-*-email.ts` defines a hardcoded constant `FROM_EMAIL = "Oraya Reservations <bookings@stayoraya.com>"` and uses that in the Resend `from:` field. Setting the env var did nothing — silently. Future operators could have set it expecting an override and gotten confused.
- **Status:** **closed (resolved 2026-05-09)** — Option B taken. `RESEND_FROM_EMAIL` removed from [/.env.example](../../.env.example) and from the [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) inventory. From-address remains hardcoded in `lib/send-*-email.ts`. See [DECISIONS_LOG.md](DECISIONS_LOG.md) — 2026-05-09 entry "`RESEND_FROM_EMAIL` removed from env contract; from-address stays hardcoded". Future configurability is a separate approved implementation task. The remaining mention in [/README.md](../../README.md) is informational ("currently hardcoded… unless you later wire `RESEND_FROM_EMAIL`") and accurate; can be tightened in a future README pass.
- **Recommended fix path:** n/a — resolved.
- **Discovered:** 2026-05-09 ([ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) audit)
- **Resolved:** 2026-05-09

---

### #2 — Missing `RESEND_API_KEY` is a silent failure (no user-facing alarm)

- **Severity:** 🟠 High
- **Area:** Email / observability
- **Description:** Every `lib/send-*-email.ts` checks for `RESEND_API_KEY` and **returns silently** (with a `console.warn`) if it is missing. Bookings still write to Postgres; no email goes out; no error surfaces to guest, admin, or any monitoring system. A misconfigured Vercel env (or a key rotated and not re-added) would result in zero confirmations being delivered while bookings continue to land — invisible until a guest complains.
- **Status:** open
- **Recommended fix path:**
  1. Add a startup or healthcheck assertion: e.g. a `/api/health` endpoint that returns 503 if `RESEND_API_KEY` is unset in production.
  2. Or, narrower: in each `lib/send-*-email.ts`, when missing in production, write a structured log line that the existing log-aggregation surface picks up.
  3. Or, broader: track delivery in `bookings.email_status` and surface "delivery failed" in the admin dashboard.
- **Discovered:** 2026-05-09 ([ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) audit)

---

### #3 — `NEXT_PUBLIC_SITE_URL` unset on preview links to production

- **Severity:** 🟡 Medium (high if preview emails are sent to real guests)
- **Area:** Email / preview parity
- **Description:** All transactional email senders fall back to `SITE_URL` from [/lib/brand.ts](../../lib/brand.ts) (`https://stayoraya.com`) when `NEXT_PUBLIC_SITE_URL` is unset. A preview deployment that sends a test email will embed links pointing at **production**, not at the preview. Guests testing on preview would land on real production data. No code error — purely an operational footgun.
- **Status:** open
- **Recommended fix path:**
  1. Set `NEXT_PUBLIC_SITE_URL` to the per-deployment Vercel URL on the **Preview** environment in Vercel's env panel. (Production keeps `https://stayoraya.com`.)
  2. Document in [/.env.example](../../.env.example) (already done in the 2026-05-09 audit pass) and in onboarding.
  3. Optional code-side hardening: if `NODE_ENV !== "production"` and `NEXT_PUBLIC_SITE_URL` is unset, throw at module load — no silent fallback to production URLs from non-prod environments.
- **Discovered:** 2026-05-09 ([ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) audit)

---

### #4 — Vercel env values not yet manually populated

- **Severity:** 🟠 High (until done)
- **Area:** Deployment readiness
- **Description:** [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) and [/.env.example](../../.env.example) are accurate, but Vercel's Project → Settings → Environment Variables has not been re-verified against the audit. If a variable is missing or stale in Vercel, a redeploy could hit it with no obvious signal.
- **Status:** open — human action item.
- **Recommended fix path:** follow the "Recommended next steps" section of [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) — set/verify each variable per environment scope (Production / Preview / Development), mark sensitive ones, then redeploy and check production logs for env-related throws.
- **Discovered:** 2026-05-09

---

### #5 — `git push origin master` snippet in `/CLAUDE.md` is legacy advice

- **Severity:** 🟢 Low (doc-only) — but a real footgun if an agent follows it literally
- **Area:** Documentation / agent workflow
- **Description:** [/CLAUDE.md](../../CLAUDE.md) contains an "Auto-backup rule (MANDATORY)" snippet `git add -A && git commit -m "…" && git push origin master`. Current operational rule is to push to feature/worktree branches and open PRs (see [AGENT_RULES.md](AGENT_RULES.md) rule 5). An agent that obeys CLAUDE.md literally would push directly to `master`, bypassing review.
- **Status:** open
- **Recommended fix path:** edit [/CLAUDE.md](../../CLAUDE.md) to replace the `master` push with feature-branch + `gh pr create`. Or add a one-line note pointing to [AGENT_RULES.md](AGENT_RULES.md) as the authoritative workflow. Defer until next doc-cleanup pass to avoid scope creep on the bootstrap phase.
- **Discovered:** 2026-05-09 (during AI bootstrap doc set)

---

### #6 — Website-CTA WhatsApp continuity: booking reference inside trigger message is lost; bot redundantly asks for it

- **Severity:** 🟠 High — degrades premium hospitality UX on the primary returning-guest entry point.
- **Area:** WhatsApp Butler / `/api/butler/identify` / WhatChimp Guest Identification v2 flow
- **Description:** the website "Continue on WhatsApp" CTA opens WhatsApp pre-filled with a context line like `"Hello Oraya — booking reference A0B8CECB"`. The Guest Identification v2 trigger correctly fires on the `"booking reference"` substring, but the 8-character hex value `A0B8CECB` is never captured into a custom field — WhatChimp's Condition / save-to-custom-field primitives can route on substring matches but cannot run a regex capture to lift a token out of the trigger message body. The flow therefore reaches the HTTP API call at Node 7 (`/api/butler/identify`) with `booking_reference` empty. For a fresh visitor with no prior `whatsapp_leads.linked_booking_id`, the orchestrator's priority chain falls through to `ask_for_booking_reference`, and the bot asks the guest to type the reference they had just provided in the trigger message. Naive recovery (passing the entire trigger message into the existing `booking_reference` field and letting `normalizeBookingReference` strip non-hex chars) is unsafe — the string `"Hello Oraya — booking reference A0B8CECB"` contains valid hex letters scattered through "Hello/Oraya/booking/reference" and would be silently mis-extracted as `EAABEFEE`, producing a confidently-wrong "I couldn't find that booking" response.
- **Status:** **closed (resolved 2026-05-23)** — `/api/butler/identify` now accepts an optional `message_text` body field. When `booking_reference` is absent and `message_text` is present, the route extracts the first word-boundary-anchored 8-character hex token via [lib/butler/extract-booking-reference.ts](../../lib/butler/extract-booking-reference.ts) (regex `/\b[0-9A-Fa-f]{8}\b/`) and forwards it as the `booking_reference` to the orchestrator unchanged. Existing callers that pass `booking_reference` explicitly continue to win; `message_text` never overrides an explicit reference. No naive hex stripping is performed anywhere on this path. No schema changes; no locked-API touches; no auth changes; no payment-file touches.
- **Recommended fix path:** n/a — resolved.
- **Discovered:** 2026-05-23 (live production traffic + WhatChimp flow export `whatsapp-bot_1858233_20260523090930.txt` audit).
- **Resolved:** 2026-05-23
- **Follow-up (2026-05-23):** the BACKEND closure of #6 is correct, but live testing then verified that WhatChimp specifically cannot deliver inbound-message text into the HTTP API body — see new entry #7 below. The production operator path therefore uses an explicit booking-reference input step triggered by the website CTA markers (`#ORAYA_REF:` / `#ORAYA_CHANGE:`); `message_text` is forward-compatible code that activates the moment a future channel — or a future WhatChimp version — exposes inbound text. See [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) "Website CTA marker routing" for the current operator routing.

---

### #7 — WhatChimp does not expose inbound message text as a usable variable; auto-extract paths cannot run on this platform today

- **Severity:** 🟡 Medium — platform constraint, not a code defect. Documented so future agents do not wire against a capability that does not exist on the current production tenant.
- **Area:** WhatsApp Butler / WhatChimp variable model / operator-side flow design
- **Description:** the WhatChimp UI variable picker — the canonical way to reference dynamic values inside Condition nodes, save-to-custom-field steps, and HTTP API request bodies — exposes only **six** system fields on the production Oraya tenant: first name, last name, label, email, phone number, chat ID. There is no "last user message" / "last incoming text" / "trigger message" / "user input" variable. There is no Condition operator that runs against the message body. The HTTP API node body cannot interpolate the inbound message text. The implication for any flow design pattern that relies on lifting the user's text into a custom field or into an outbound request body is that the pattern is not achievable on this tenant. This blocks the auto-extract path that PR #47 wired on `/api/butler/identify` from being reached on the production WhatChimp tenant, even though the backend code is correct and forward-compatible with channels that DO expose inbound text.
- **Status:** **open (operator-side platform constraint; backend remains forward-compat)**. No code action required. The production operator routing for the website CTA markers uses an explicit reference-input step downstream of the marker trigger, captures the user's typed reply into `oraya_booking_reference`, and merges back into the existing identity flow. See [BUTLER_PLAYBOOK.md](BUTLER_PLAYBOOK.md) "Website CTA marker routing" → "Verified WhatChimp platform limitation" + "Operator manual steps required in WhatChimp" for the documented flow.
- **Recommended fix path:** none required for the backend. Operator-side: if WhatChimp later exposes an inbound-text variable, the operator can add `"message_text": "<the-new-variable>"` to HTTP API 7219's body and the existing extractor activates automatically — no Oraya code change. Independently: if Oraya adds a non-WhatChimp channel (Telegram, Messenger, direct WhatsApp Cloud API) that does expose inbound text, the same backend already supports it.
- **Discovered:** 2026-05-23 (live operator UI verification).

---

### #8 — AI / WhatChimp wrong-domain response risk: `www.oraya.com.lb` is not the Oraya web origin

- **Severity:** 🟠 High — guests routed at a non-existent domain lose access to the booking flow, the booking-view page, and every email CTA target.
- **Area:** AI Training / WhatChimp Bot Reply / generic AI assistants outside this repo / human ops copy
- **Description:** the canonical Oraya web origin is `https://stayoraya.com` and only `https://stayoraya.com`. This is the host every transactional email helper builds links from (`lib/brand.ts` `SITE_URL` fallback), every `/legal/*` page is served from, every `/booking/view/[token]` link points at, and every `/api/payments/checkout` return URL lands at. Despite this, generic AI assistants outside Oraya (including external WhatChimp configurations and untrained chat surfaces) have on occasion produced replies that name `www.oraya.com.lb` (or `oraya.com.lb`, or `oraya.com`) as if those were Oraya web properties. They are not. There is no LB-TLD Oraya web property today. This is **not** a domain migration — it is a wrong-domain bug whenever it appears.
- **Status:** open — operator-side AI Training discipline + documentation hardening.
- **Recommended fix path:**
  1. Make the canonical-origin invariant explicit in all AI-facing docs (PROJECT_STATE.md, BUTLER_PLAYBOOK.md, DECISIONS_LOG.md — landed 2026-06-03).
  2. Ensure WhatChimp Bot Reply / AI Training templates never reference any host other than `https://stayoraya.com`.
  3. If a guest reports they were directed at `oraya.com.lb` from any AI surface, treat it as a high-priority operator-side configuration bug.
  4. Optional: server-side hardening — a future task could add a 301 redirect from `oraya.com.lb` to `stayoraya.com` if the LB TLD is ever registered defensively. Not in scope today.
- **Discovered:** 2026-06-03 (reconciliation pass — risk surfaced from external observations of generic AI behavior, not from production traffic against Oraya's own surfaces).

---

### #9 — NetCommerce / CyberSource declined-card sandbox validation still needs provider vector

- **Severity:** 🟡 Medium — payment QA / open validation item, not a production bug.
- **Area:** Phase 16B / NetCommerce / CyberSource Unified Checkout sandbox validation
- **Description:** PR #64 passed the approved-card sandbox path and NetCommerce confirmed successful testing before the implementation merged on 2026-07-02. Normal behavior leaves `bookings.status` as `PENDING`; the temporary Preview QA auto-confirm exception was removed after external testing. Declined-card validation is still incomplete because the attempted decline-style sandbox card authorized. Oraya needs the official NetCommerce/CyberSource declined-card vector or decline trigger before declaring decline handling validated.
- **Status:** open — waiting on NetCommerce/CyberSource test vector or trigger.
- **Recommended fix path:**
  1. Ask NetCommerce/CyberSource for the official declined-card sandbox vector or configured decline trigger.
  2. Re-run the declined-card browser flow on a dedicated sandbox Preview.
  3. Confirm the declined attempt does not mark payment paid and remains retryable.
  4. Keep production payment disabled until production credentials, webhook/MLE reconciliation, production env setup, and explicit production enablement are complete.
- **Discovered:** 2026-06-17 (PR #64 Preview sandbox validation).

---

<!-- New entries go above this line, lowest # at the top. Closed entries can be moved to a "Closed" section below or stay in place with status: closed + date. -->

## Closed / wontfix

(none yet)
