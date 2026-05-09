# Agent Rules — Claude Code · Codex · Cursor · ChatGPT-driven sessions

**Audience:** every AI coding agent that touches this repo (Claude Code, Codex, Cursor Chat, Cursor Cloud, or any future tool).
**Authority:** this file is enforced. Violations are grounds for human reverting the change.
**Updated:** 2026-05-09

This file is intentionally short. Read it fully before your first edit.

---

## 1. Source-of-truth reading order (mandatory)

Before any code change, read in order:

1. [PROJECT_STATE.md](PROJECT_STATE.md) — current state and non-negotiable constraints.
2. [CURRENT_PHASE.md](CURRENT_PHASE.md) — what is and is not in scope right now.
3. **This file** — how to behave.
4. [ARCHITECTURE.md](ARCHITECTURE.md) — system shape.
5. [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) — secret model.
6. [KNOWN_BUGS.md](KNOWN_BUGS.md) — open issues.
7. [DECISIONS_LOG.md](DECISIONS_LOG.md) — why the constraints exist.

Acknowledge in your first response which of these you have read. If you skip them, your output is not trusted.

## 2. Minimal-diff rule

- Change only what the task requires. Do not opportunistically refactor.
- Prefer the smallest possible patch that satisfies the task.
- Do not rename, reorganize, or "clean up" unrelated code.
- Do not migrate inline styles to Tailwind utilities. Do not migrate hardcoded color/font constants. The current convention is locked (see [/CLAUDE.md](../../CLAUDE.md)).

## 3. No architecture redesign without approval

- Do **not** introduce new infrastructure (new database, new queue, new auth provider, new ORM, new framework).
- Do **not** change the public/server boundary of any existing module.
- Do **not** redesign the booking pipeline, the email trigger system, the token system, calendar sync, or admin auth.
- If a task seems to require any of the above, **stop and ask the human** before writing code.

## 4. Locked systems — must not be modified

The following are stable production surfaces. Touching them requires an explicit, written approval in the task prompt naming the file path:

- `/api/bookings` (submission, validation, overlap logic)
- `/api/bookings/availability`
- `/api/booking-action/*`
- `/api/calendar/*`
- `/api/cron/*`
- `/api/admin/*`
- Admin confirm/cancel flow
- Email trigger system (`lib/send-*-email.ts`)
- Authentication (admin password, signed cookies, Supabase auth)
- Token system (`booking_action_tokens`, `lib/booking-action-token.ts`)
- Calendar sync logic (`lib/calendar/*`, iCal `DTSTART`/`DTEND`/`DTSTAMP` semantics)
- Existing Supabase schema (every table and every existing column)

The exhaustive locked list lives in [/PROJECT_STATE.md](../../PROJECT_STATE.md) under "LOCKED SYSTEMS — DO NOT MODIFY". If both files disagree, the more conservative reading wins.

Allowed exception: **non-blocking, advisory-only** enrichment inside existing `jsonb` snapshot fields (e.g. `pricing_snapshot`, `addons`) is permitted, provided it does not affect booking acceptance, validation, or response shape.

## 5. No direct `master` edits

- All work happens on a **feature branch** or **worktree branch**, never directly on `master`.
- The auto-backup snippet `git push origin master` in [/CLAUDE.md](../../CLAUDE.md) is **legacy guidance** from before the PR workflow. Override it.
- Correct workflow: commit on your branch → `git push origin <your-branch>` → open a PR via `gh pr create` → human review → human merges.
- Do **not** merge your own PRs.
- Do **not** push `--force` to a shared branch.
- Do **not** rewrite history on a shared branch.

## 6. No secret exposure

- Real values for `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`, `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, or any other server-only env var **must never appear** in commits, code, comments, PR descriptions, chat output, or screenshots.
- Server-only env vars **must never** be referenced from a `"use client"` file or any `NEXT_PUBLIC_*` name.
- Do **not** create or modify real `.env` files. `.env.example` is the only env file under version control and contains placeholders only.
- See [ENVIRONMENT_MAP.md](ENVIRONMENT_MAP.md) for the full secret inventory.

## 7. No fake completion reports

A task is **not** "done" because the agent decided so. "Done" requires:

- Files changed (full list with paths).
- Build/typecheck output (`npx tsc --noEmit` and `npm run build` exit codes; paste the relevant lines, not the whole log).
- Tests run (which command, exit code, and any failure summary). If no test exists, say so explicitly — do not invent tests.
- Risks introduced — even if zero, state "no risks identified after [specific check]" so the human knows what was checked.
- An honest "what I did not do" section — anything in scope you skipped, deferred, or were unsure about.

If the task could not be completed, say so plainly. Do not paper over partial work with optimistic language.

## 8. Mandatory final-report format

Every task ends with a structured report in this shape:

```
## Files changed
- path/to/file.ts (created | modified | deleted) — one-line reason

## Build / typecheck
- `npx tsc --noEmit`: <exit code> — <relevant output or "clean">
- `npm run build`: <exit code> — <relevant output or "clean">

## Tests
- <command>: <exit code> — <pass count / fail count / "no tests for this surface">

## Risks
- <bullet list, or "no risks identified after <check>">

## Out of scope / not done
- <bullet list, or "n/a">

## Verification the human should run
- <one or two specific commands or click-paths>
```

## 9. No surprise dependency additions

- Adding an npm package requires explicit approval in the task prompt.
- If a task seems to need a new dependency, **stop and ask** which package, version, and why before installing.
- Audit transitive risk: do not pull a heavyweight tree (e.g. a full ORM) for a 20-line task.

## 10. Time/date discipline

- Database stores UTC. Display in `Asia/Beirut`.
- Admin time format is 24-hour.
- Stay dates (`check_in`, `check_out`) are date-only strings (`YYYY-MM-DD`) and must **never** pass through `new Date()` or any JS Date parsing.
- iCal `DTEND` is exclusive end date. Do not change this.

## 11. Documentation discipline

- If you change behavior covered by a `/docs/system/` file, **update that file in the same PR**.
- If you discover an inconsistency between a doc and the code, flag it in the final report. Do not silently make the code match the doc, or vice versa.
- New durable decisions get an entry in [DECISIONS_LOG.md](DECISIONS_LOG.md).
- Newly-discovered bugs get an entry in [KNOWN_BUGS.md](KNOWN_BUGS.md), even if you are not fixing them.

## 12. Agent-specific notes

- **Claude Code:** the auto-backup `git push origin master` line in [/CLAUDE.md](../../CLAUDE.md) is overridden by rule 5 above. Push to your worktree/feature branch and open a PR.
- **Codex / Cursor Cloud:** if running with isolated working trees, ensure your branch name follows the `agent/<task-id>` or `claude/<slug>` pattern already used in this repo.
- **Cursor Chat:** when working in long contexts, re-read [PROJECT_STATE.md](PROJECT_STATE.md) and [CURRENT_PHASE.md](CURRENT_PHASE.md) every ~30 turns. Memory drift is the #1 source of regressions.
- **ChatGPT (orchestrator):** you do not edit code directly. Generate prompts that follow [AGENT_HANDOFF_TEMPLATE.md](AGENT_HANDOFF_TEMPLATE.md) and force the executing agent to comply with this file.
