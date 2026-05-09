# Decisions Log

Durable architectural and operational decisions. Append-only — never edit a past entry except to add a follow-up dated link below it. If a decision is reversed, add a new entry that explicitly supersedes the old one.

**Format:**

```
## YYYY-MM-DD — <short title>

**Decision:** what was decided.
**Reason:** why.
**Impact:** what changes (files, processes, future work).
**Reversible?:** yes / no / hard.
**Supersedes:** (optional) date + title of older entry this replaces.
```

---

## 2026-05-09 — `RESEND_FROM_EMAIL` removed from env contract; from-address stays hardcoded

**Decision:** `RESEND_FROM_EMAIL` is no longer part of the Oraya env contract. It has been removed from [/.env.example](../../.env.example) and removed from the active inventory in [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md). The Resend `from:` value remains hardcoded as `Oraya Reservations <bookings@stayoraya.com>` (the `FROM_EMAIL` constant in each `lib/send-*-email.ts`) for the foreseeable future.

**Reason:** the variable was reserved but consumed by zero code paths (KNOWN_BUGS.md #1). Leaving it in `.env.example` and the audit doc created false expectations: an operator setting it in Vercel would see no effect, silently, with no log line to indicate the setting was inert. Removing the variable from the contract makes the current behavior — a hardcoded sender — the documented behavior, and removes a footgun. A configurable sender is fine to add later, but only as an explicit, approved implementation task that wires `process.env.RESEND_FROM_EMAIL` into each `lib/send-*-email.ts` and reintroduces the variable in `.env.example` and the env map at the same time. This commit performs none of that wiring.

**Impact:**

- [/.env.example](../../.env.example) — `RESEND_FROM_EMAIL=…` line plus its two preceding comment lines removed; replaced with a short comment that points readers at this decision entry.
- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) — row removed from the at-a-glance inventory table; per-variable section replaced with a "removed by decision" notice; Vercel checklist note about non-sensitive variables updated; "expected gap" and "known gap" follow-up bullets removed.
- [KNOWN_BUGS.md](KNOWN_BUGS.md) — entry #1 flipped to `closed (resolved 2026-05-09)` with a pointer to this entry. Numbering preserved so the other open bugs keep their IDs.
- [CURRENT_PHASE.md](CURRENT_PHASE.md) — open-issues bullet removed, "Just completed" bullet added, "Next recommended steps" item renumbered.
- **No code changed.** No `lib/send-*-email.ts` file was modified in this commit. Email send behavior is identical before and after.
- The historical reference in the 2026-05-09 "Environment audit baseline" entry below ("including `RESEND_FROM_EMAIL` reserved-but-unused") is preserved as-is per the append-only rule of this log — it accurately describes what the audit found at that moment.
- A stale informational mention remains in [/README.md](../../README.md) ("currently hardcoded… unless you later wire `RESEND_FROM_EMAIL`"). It is still factually accurate (current state: hardcoded; future state: would require wiring) and was outside the explicit scope of the cleanup task. It can be tightened in a future README pass.

**Reversible?:** yes — easy. To reintroduce, perform the wiring work in `lib/send-*-email.ts` and re-add the variable to `.env.example` and `ENVIRONMENT_MAP.md` in the same PR. Do not re-add the variable without the wiring; that would re-create the original footgun.

**Supersedes:** does not supersede a prior decision; resolves [KNOWN_BUGS.md](KNOWN_BUGS.md) entry #1.

---

## 2026-05-09 — `/docs/system/` is the AI source of truth

**Decision:** all AI-facing project documentation lives in [`/docs/system/`](.) as version-controlled Markdown. ChatGPT chat memory and side-channel notes are no longer authoritative. New AI sessions read this directory first.

**Reason:** chat threads are ephemeral, drift across providers (ChatGPT / Claude Code / Codex / Cursor), and have no diff history. Repo-tracked docs are durable, reviewable, and reachable from every agent. Long ChatGPT conversations were starting to disagree with the actual repo state.

**Impact:**

- Created `/docs/system/{PROJECT_STATE,CURRENT_PHASE,AGENT_RULES,ARCHITECTURE,DECISIONS_LOG,KNOWN_BUGS,AGENT_HANDOFF_TEMPLATE,CHATGPT_PROJECT_INSTRUCTIONS}.md`. (`ENVIRONMENT_MAP.md` already created in the prior commit.)
- Existing root-level docs ([/PROJECT_STATE.md](../../PROJECT_STATE.md), [/AGENTS.md](../../AGENTS.md), [/CLAUDE.md](../../CLAUDE.md), [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md), [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md)) are kept intact and remain valid where they don't conflict with `/docs/system/`. The new `/docs/system/PROJECT_STATE.md` is the authoritative summary; the root `/PROJECT_STATE.md` is the historical detail log.
- Every PR that changes behavior described in a `/docs/system/` file must update that file in the same PR (see [AGENT_RULES.md](AGENT_RULES.md) rule 11).
- ChatGPT Project Instructions field will be populated from [CHATGPT_PROJECT_INSTRUCTIONS.md](CHATGPT_PROJECT_INSTRUCTIONS.md) so every new chat starts with the same orientation.

**Reversible?:** yes — but reverting means losing the cross-agent consistency benefit; not recommended.

---

## 2026-05-09 — `.gitignore` explicitly protects all `.env*` variants

**Decision:** `.gitignore` lists every Next.js env-file variant by name (`.env`, `.env.local`, `.env.development`, `.env.development.local`, `.env.production`, `.env.production.local`, `.env.test`, `.env.test.local`) instead of relying solely on `.env*.local` glob.

**Reason:** the previous pattern `.env*.local` matched `.env.production.local` but **not** `.env.production`. Anyone saving a prod env snapshot under that name would have committed it. The hole is closed and made obvious by listing every variant.

**Impact:**

- [/.gitignore](../../.gitignore) updated.
- `.env.example` (placeholders only) remains the single tracked env file.
- Verified with `git check-ignore -v` against all variants.

**Reversible?:** yes, but no reason to.

---

## 2026-05-09 — `.env.example` uses explicit `replace_with_*` placeholders

**Decision:** `.env.example` switched from empty values (`KEY=`) to explicit placeholder values (`KEY=replace_with_<thing>`) plus per-variable "where to get it" comments. Cross-links to [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).

**Reason:** empty values are easy to overlook and easy to commit unfilled. A literal `replace_with_*` placeholder both documents intent and fails loudly in tooling that validates env var format. The "where to get it" notes shorten onboarding from minutes-of-grep to one read.

**Impact:** [/.env.example](../../.env.example) updated. Local devs and Vercel admins now see the source for each value inline.

**Reversible?:** yes.

---

## 2026-05-09 — Environment audit baseline

**Decision:** [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) is the single source of truth for every `process.env.*` read in the repo. Re-audited on every release that touches API routes, lib helpers, or `vercel.json`.

**Reason:** secrets sprawl across `.env.example`, README, AGENTS.md, CLAUDE.md, and ad-hoc Vercel notes had drifted. One canonical map removes guesswork around scope, risk, and rotation.

**Impact:**

- [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) created (10 variables documented, including `RESEND_FROM_EMAIL` reserved-but-unused and `NODE_ENV` system-managed).
- Three open issues surfaced and now tracked in [KNOWN_BUGS.md](KNOWN_BUGS.md).

**Reversible?:** no — once the audit baseline exists, future agents are expected to keep it current.

---

<!-- New entries go above this line, newest first. Old entries never deleted. -->
