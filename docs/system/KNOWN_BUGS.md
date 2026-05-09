# Known Bugs & Open Issues

**Updated:** 2026-05-09

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

<!-- New entries go above this line, lowest # at the top. Closed entries can be moved to a "Closed" section below or stay in place with status: closed + date. -->

## Closed / wontfix

(none yet)
