# Session Lessons — Recurring AI-Session Pitfalls

**Updated:** 2026-05-09
**Authority:** historical / advisory. Not a substitute for [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) — that is the enforced behavior contract. This file is the *narrative* version of "things we learned the hard way" so future agents understand *why* the rules exist.

These lessons are aggregated from real ChatGPT, Claude Code, Codex, and Cursor sessions on the Oraya codebase across Phases 8–15. Examples are paraphrased to remove noise; the patterns are real.

---

## 1. Recurring mistakes

### 1.1 Treating chat memory as authoritative

**Pattern:** an agent (or the human directing it) acts on a "fact" remembered from an earlier conversation that no longer matches the repo.

**Real examples seen:**
- Agent referenced an old `bookings` schema column that was renamed two phases ago.
- Agent assumed Tailwind utility colors were valid because "we agreed to migrate" — that migration was abandoned (see [/CLAUDE.md](../../CLAUDE.md) "Key conventions"). Inline styles + hardcoded constants are locked.
- Agent invoked a deprecated API path that had been split into `/api/booking-action/*` during Phase 3B.

**Why it keeps happening:** chat threads are long, drift across providers, and have no diff history. ChatGPT memory and Cursor long-context tabs are *not* version-controlled.

**Mitigation now codified:** the [/docs/system/](../system/) directory is the source of truth. Every agent must list which `/docs/system/` files it read in its first response — see [AGENT_RULES.md](../system/AGENT_RULES.md) §1.

### 1.2 "Helpful" refactors no one asked for

**Pattern:** the agent is asked to add a small feature and decides to "clean up" adjacent code, rename a helper, or extract a component "while I'm here".

**Real examples seen:**
- Renamed an exported function and broke imports across three other files.
- Moved an inline style block into a Tailwind class set, breaking visual parity.
- Replaced a hardcoded color constant with `var(--oraya-*)` in a server component that did not have CSS context.

**Why it keeps happening:** agents are trained to demonstrate competence; opportunistic refactors look like value.

**Mitigation now codified:** [AGENT_RULES.md](../system/AGENT_RULES.md) §2 minimal-diff rule. "Change only what the task requires."

### 1.3 Skipping the read list

**Pattern:** the agent jumps into edits without reading [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) and [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md), then violates a locked-system rule.

**Real examples seen:**
- Edited `/api/bookings` POST validation without approval (locked surface).
- Adjusted iCal `DTEND` semantics (inclusive vs exclusive) — would have caused booking double-booking on calendar sync.
- Touched the email trigger system (`lib/send-*-email.ts`) for a UI-only task.

**Mitigation now codified:** every handoff prompt begins with the explicit read list (see [/docs/system/AGENT_HANDOFF_TEMPLATE.md](../system/AGENT_HANDOFF_TEMPLATE.md)). The agent must list which files it actually read in its first response.

### 1.4 Pushing directly to `master`

**Pattern:** following the legacy "Auto-backup rule (MANDATORY)" snippet in [/CLAUDE.md](../../CLAUDE.md) literally — running `git push origin master` from the worktree.

**Why it keeps happening:** the snippet is in two prominent places ([/CLAUDE.md](../../CLAUDE.md) and [/AGENTS.md](../../AGENTS.md)) and reads as authoritative.

**Mitigation now codified:** [AGENT_RULES.md](../system/AGENT_RULES.md) §5 explicitly overrides the snippet. Tracked as bug [#5 in KNOWN_BUGS.md](../system/KNOWN_BUGS.md). Final fix is a doc-cleanup pass — until then, the agent rule is authoritative.

---

## 2. Common drift patterns

### 2.1 Doc / code drift

After a real code change, the related `/docs/system/` doc was not updated. A later session reads the stale doc and assumes the code matches.

**Discipline:** [AGENT_RULES.md](../system/AGENT_RULES.md) §11 — if you change behavior covered by a `/docs/system/` doc, update that doc in the same PR.

### 2.2 Cross-provider drift

ChatGPT and Cursor disagreed about whether Phase 15I.10 included instant-booking *payment execution*. It did not — instant booking is UI-only until Phase 16. Each provider had built up its own assumption from different parts of the chat history.

**Discipline:** [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) is the only authoritative answer to "what is shipped today". Memory-loaded "facts" must be verified against it.

### 2.3 Silent locked-system creep

Agents over time are tempted to enrich pricing snapshots, add validation, or "improve" the email trigger flow. The locked list grows in importance as the system stabilizes — exactly when agents have the most context to be tempted.

**Discipline:** [AGENT_RULES.md](../system/AGENT_RULES.md) §4. The exception (non-blocking, advisory-only enrichment inside existing `jsonb` snapshot fields) is narrow and must be explicit in the task prompt.

---

## 3. Hallucination risks specific to this repo

### 3.1 Inventing schema columns

Agents have proposed columns that "obviously should exist" (e.g. a `bookings.cancelled_at`). They do not. Phase 15I.11 added cancellation/refund **visibility** but no cancellation backend.

**Mitigation:** ask before assuming. Schema is locked — see [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4 + [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) constraint #2.

### 3.2 Inventing env vars or secret values

A previous session made up a Stripe key path because Phase 16B mentions payments. Phase 16 is **not implemented**. There is no Stripe integration today.

**Mitigation:** [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md) is the exhaustive list. If a variable is not there, it does not exist.

### 3.3 Inventing helper functions

Agents have called `lib/payments.ts` and `lib/whatsapp/*` helpers that do not exist. The repo has `lib/payment-foundation.ts` (manual ledger contract only) and no WhatsApp module.

**Mitigation:** read [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md) before calling lib helpers. If unsure, `grep` for the symbol before referencing it.

### 3.4 Inventing routes

`/api/payments`, `/api/whatsapp`, `/api/cancellations` — none exist. Real route inventory is in [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md).

### 3.5 Date / timezone hallucinations

JS `Date` parsing of `YYYY-MM-DD` gets shifted by the runtime timezone, causing off-by-one stay dates. Stay dates are **date-only strings** and must never go through `new Date()`.

**Mitigation:** [AGENT_RULES.md](../system/AGENT_RULES.md) §10. iCal `DTEND` is exclusive — also locked.

---

## 4. Implementation anti-patterns

### 4.1 Trying to migrate inline styles to Tailwind utilities

Tailwind custom color/font classes were unreliable in this repo's history. Inline styles + hardcoded constants are **locked**. Do not migrate even if the styles look ugly. See [/CLAUDE.md](../../CLAUDE.md) "Key conventions".

### 4.2 Replacing the calendar `DTEND` model

iCal `DTEND` is **exclusive end date** by design — both for the export and the conflict-detection helpers in `lib/calendar/*`. Adjusting this breaks every existing integration, calendar import, and operational range computation (see Phase 14J event setup-day blocking).

### 4.3 Changing the booking response shape

`/api/bookings` returns a token used by the guest redirect flow ([app/booking/view/[token]/page.tsx](../../app/booking/view/%5Btoken%5D/page.tsx)). Adding required fields to the response or renaming existing ones breaks the guest path silently.

### 4.4 Server-side reads inside `"use client"` files

`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`, `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `RESEND_API_KEY` must **never** be referenced from a client component or any `NEXT_PUBLIC_*` name. See [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md).

### 4.5 Re-introducing duplicate state

The booking flow has been restructured several times (Phase 13C → 15I.3). Each restructure tempted agents to add helper state that already existed elsewhere. Look for an existing single-source-of-truth state hook before adding a new one.

### 4.6 Reverting fail-closed safety

Phase 15 critical post-close fix made `runAddonAudit` errors **fail closed before insert**. An agent later "simplified" this to log-and-continue. Bookings would have been accepted with unverified add-ons. The fix was reverted to fail-closed.

**Discipline:** if a behavior is fail-closed, treat that as a property, not an implementation detail.

---

## 5. Deployment mistakes

### 5.1 Preview emails pointing at production

`NEXT_PUBLIC_SITE_URL` falls back to `https://stayoraya.com` if unset. A preview deployment that triggered a real email path embedded **production** links into the preview. Tracked as bug [#3](../system/KNOWN_BUGS.md).

### 5.2 Missing `RESEND_API_KEY` is a silent failure

Bookings still write; no email goes out; no alarm. A misconfigured Vercel env (or a key rotated and not re-added) would result in zero confirmations being delivered. Tracked as bug [#2](../system/KNOWN_BUGS.md).

### 5.3 `.env.production` was not git-ignored before 2026-05-09

The previous `.env*.local` glob did **not** match `.env.production`. The 2026-05-09 audit closed the gap. Anyone who saved a prod env snapshot under that name before the fix would have committed it. Verify with `git check-ignore -v <file>` after touching `.gitignore`.

### 5.4 Vercel env values diverging from `.env.example`

`.env.example` is accurate by policy; Vercel's panel can drift independently. After every audit, the human must re-verify Vercel's panel against the audit. Tracked as bug [#4](../system/KNOWN_BUGS.md).

### 5.5 Cron contract changes break daily sync silently

`vercel.json` runs `/api/cron/calendar-sync` daily; Vercel injects `Authorization: Bearer ${CRON_SECRET}`. Renaming the route, the env var, or the schedule without updating `vercel.json` results in zero runs and no alert.

---

## 6. Debugging lessons

### 6.1 Reproduce against the live schema, not your assumption

Always confirm the relevant Supabase table shape before adding a column read or write. Schema is locked — additive `jsonb` enrichment is the only allowed extension, and only inside existing snapshot fields.

### 6.2 Check the snapshot, not the engine

For payment, pricing, and add-on questions, the **persisted snapshot** on the booking row is authoritative for that booking. The pricing engine and add-on definitions can change later; the snapshot does not. Read the snapshot first.

### 6.3 UTC in the DB, `Asia/Beirut` in the UI, **never** parse stay dates

Confirmed/cancelled timestamps are UTC ISO. Stay `check_in` / `check_out` are date-only strings. If the bug looks like a one-day shift, it is almost always a `Date` parsing leak — search for `new Date(checkIn)`-style calls.

### 6.4 Email failures hide in Resend logs, not the app

If guests are not receiving confirmations, check Resend dashboard before the application logs. The send paths log a warning when the key is missing but otherwise return silently on Resend failures.

### 6.5 Realtime is best-effort, not a guarantee

Admin live updates use a **45s silent poll** plus a Realtime subscription. The poll is the reliable path; Realtime is opportunistic. If a UI is "not updating", check the polling tick before suspecting Realtime.

### 6.6 The booking pipeline is the integration test

When in doubt, run a real booking through `/api/bookings` against a preview deployment. The pipeline exercises overlap, pricing, add-on audit, snapshotting, email triggers, and token issuance in one shot.

---

## 7. Workflow lessons (operational, not code)

### 7.1 Audits before implementations

Phase 15A (production readiness audit) and Phase 14C (event availability audit) caught risks that would have been expensive to surface mid-implementation. Phase 16 mandates an architecture/audit pass first — see [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md).

### 7.2 One agent per file path

Two agents editing overlapping files produces merge conflicts that erase one agent's work without anyone noticing the loss. See [/AGENTS.md](../../AGENTS.md) "Coordination rules" and [/docs/archive/AI_WORKFLOW.md](AI_WORKFLOW.md) "Safe parallelization".

### 7.3 Done means evidence, not optimism

A "done" report without `npx tsc --noEmit` and `npm run build` exit codes is not done. See [AGENT_RULES.md](../system/AGENT_RULES.md) §7 + §8.

### 7.4 PR review is a safety layer, not a formality

Direct-to-`master` pushes erase the review checkpoint that would have caught the mistakes in this file. PR review is **the** mechanism that turns "I think it works" into "we agreed it works".

---

## 8. Where to take a new lesson

If a session uncovers a new failure mode:

1. **One-line entry** in [/docs/lessons/KNOWN_AGENT_FAILURE_PATTERNS.md](../lessons/KNOWN_AGENT_FAILURE_PATTERNS.md) (the structured catalog).
2. **Narrative entry** here if the lesson needs explanation longer than a sentence.
3. **Rule update** in [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) only if the failure is preventable by a behavior change agents must adopt.
4. **Bug entry** in [/docs/system/KNOWN_BUGS.md](../system/KNOWN_BUGS.md) if the failure is a real production-impacting issue, not just an agent behavior.

Never delete an entry. Outdated lessons get a follow-up "superseded by …" line and stay in place.
