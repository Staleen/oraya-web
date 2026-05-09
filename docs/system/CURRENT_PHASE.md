# Current Phase — AI Project Bootstrap

**Updated:** 2026-05-09
**Status:** in progress

This file is rewritten at every phase transition. Treat it as a snapshot, not a log.

---

## Active phase

**AI Project Bootstrap / persistent memory setup.**

Establishing `/docs/system/` as the durable, repo-tracked source of truth so future ChatGPT, Claude Code, Codex, and Cursor sessions can self-orient without depending on long chat threads or fragile chat memory.

This phase does **not** ship product features. It is documentation infrastructure that unlocks safe Phase 16 execution.

## Active objective

Stand up the full `/docs/system/` doc set so that any new AI session can:

1. Read 6–8 short files and have an accurate picture of where Oraya is.
2. Know which systems are locked, which are open, and what the current task is.
3. Receive handoffs in a consistent format.
4. Be challenged with evidence before its "done" reports are accepted.

## Just completed

- **Environment variable audit** — every `process.env.*` read mapped, scoped, and risk-rated.
  - **New:** [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) — per-variable audit (scope, files, required-by-environment, source, Vercel placement, risk if missing, rotation notes).
  - **Updated:** [/.env.example](../../.env.example) — switched empty values to explicit `replace_with_*` placeholders, added "where to get it" source notes, cross-linked to the audit doc.
  - **Updated:** [/.gitignore](../../.gitignore) — explicit entries for `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.test`, plus `*.local` variants. Closed a real gap where `.env.production` was previously not protected by the `.env*.local` pattern.
- **Doc-set scaffolding (this phase)** — created PROJECT_STATE.md, CURRENT_PHASE.md (this file), AGENT_RULES.md, ARCHITECTURE.md, DECISIONS_LOG.md, KNOWN_BUGS.md, AGENT_HANDOFF_TEMPLATE.md, CHATGPT_PROJECT_INSTRUCTIONS.md inside `/docs/system/`.
- **Persistent AI memory milestone achieved** — `/docs/system/` is established as the durable, version-controlled AI memory layer for all coding agents. ChatGPT, Claude Code, Codex, and Cursor sessions can now self-orient from a fixed reading list instead of long chat histories.
- **ChatGPT Project continuity validated successfully** — the ChatGPT Project orchestrator pattern (instructions field driven by [CHATGPT_PROJECT_INSTRUCTIONS.md](CHATGPT_PROJECT_INSTRUCTIONS.md), handoffs driven by [AGENT_HANDOFF_TEMPLATE.md](AGENT_HANDOFF_TEMPLATE.md)) preserves project state across new chats without depending on chat memory.
- **Historical knowledge layer created** — `/docs/phases/`, `/docs/archive/`, `/docs/lessons/` stand up as the durable archive of past phases, recurring AI-session lessons, the real ChatGPT → human → coding-agent → PR workflow, the legacy root-doc map, and the structured catalog of observed agent failure patterns. Files: [/docs/phases/PHASE_INDEX.md](../phases/PHASE_INDEX.md), [/docs/archive/SESSION_LESSONS.md](../archive/SESSION_LESSONS.md), [/docs/archive/AI_WORKFLOW.md](../archive/AI_WORKFLOW.md), [/docs/archive/LEGACY_DOC_MAP.md](../archive/LEGACY_DOC_MAP.md), [/docs/lessons/KNOWN_AGENT_FAILURE_PATTERNS.md](../lessons/KNOWN_AGENT_FAILURE_PATTERNS.md).
- **First small validation task executed end-to-end** — [KNOWN_BUGS.md](KNOWN_BUGS.md) #1 resolved (Option B: `RESEND_FROM_EMAIL` removed from `.env.example` and from the active [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) inventory; from-address remains hardcoded in `lib/send-*-email.ts`). Recorded in [DECISIONS_LOG.md](DECISIONS_LOG.md) under "2026-05-09 — `RESEND_FROM_EMAIL` removed from env contract; from-address stays hardcoded". This exercised the doc-set, the [AGENT_HANDOFF_TEMPLATE.md](AGENT_HANDOFF_TEMPLATE.md), and the worktree → PR workflow without touching locked systems.

## Open issues to be aware of right now

Not blockers for this phase — but every agent working in the next session should know:

- **Missing `RESEND_API_KEY` is a stealth failure.** Bookings still write but emails silently no-op (only a log). No user-facing alarm exists. See [KNOWN_BUGS.md](KNOWN_BUGS.md).
- **Missing `NEXT_PUBLIC_SITE_URL` on preview links to production.** Email CTA links from preview deployments would point at `https://stayoraya.com` (the `lib/brand.ts` fallback). See [KNOWN_BUGS.md](KNOWN_BUGS.md).
- **Vercel env vars are not yet manually set.** `.env.example` and `ENVIRONMENT_MAP.md` are accurate, but the human still needs to populate Vercel's env panel using the recommended-next-steps section of [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md).

## Out of scope this phase

- No code/product changes.
- No schema changes.
- No `master` edits (worktree → PR only).
- No Phase 16 implementation. Phase 16 is **planning context only** (see [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md)).

## Next recommended steps

In order:

1. **Human action:** populate Vercel + Supabase + Resend values per the recommended-next-steps section of [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md). Then redeploy to confirm no env-related runtime errors in production logs.
2. **Human action:** paste [CHATGPT_PROJECT_INSTRUCTIONS.md](CHATGPT_PROJECT_INSTRUCTIONS.md) into the ChatGPT Project's Instructions field.
3. **First small validation task** — completed (see "Just completed" above). The [AGENT_HANDOFF_TEMPLATE.md](AGENT_HANDOFF_TEMPLATE.md) workflow is validated end-to-end.
4. **Begin Phase 16A architecture audit** (WhatsApp AI Butler readiness) per [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md). Architecture/audit only — no implementation.
