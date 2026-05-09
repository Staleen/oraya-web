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
