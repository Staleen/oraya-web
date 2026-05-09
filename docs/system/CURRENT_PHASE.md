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

## Open issues to be aware of right now

Not blockers for this phase — but every agent working in the next session should know:

- **`RESEND_FROM_EMAIL` is reserved but unused.** It appears in `.env.example` and Vercel slots, but no code path reads it. The Resend `from:` is hardcoded in each `lib/send-*-email.ts`. Either wire it up or drop it. See [KNOWN_BUGS.md](KNOWN_BUGS.md).
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
3. **Use [AGENT_HANDOFF_TEMPLATE.md](AGENT_HANDOFF_TEMPLATE.md)** for the very next agent task — even if it's small — to validate the workflow end-to-end.
4. **First small validation task** (suggested): clean up the unused `RESEND_FROM_EMAIL` either by wiring it (option A: replace the `FROM_EMAIL` constant in each `lib/send-*-email.ts` with `process.env.RESEND_FROM_EMAIL ?? "Oraya Reservations <bookings@stayoraya.com>"`) or by removing it from `.env.example` (option B). This exercises the doc-set, the handoff template, and PR review without touching locked systems.
5. **Begin Phase 16A architecture audit** (WhatsApp AI Butler readiness) per [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md). Architecture/audit only — no implementation.
