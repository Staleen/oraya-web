# Agent Handoff Template

Copy-paste-ready prompt for ChatGPT (or a human) to send to Claude Code, Codex, Cursor Chat, or Cursor Cloud. Fill the four bracketed sections, send, then verify the agent's final report against the structure required at the bottom.

---

## Template (copy from here)

```
You are working on the Oraya production codebase.

# Read these files first (in this order, before any code change)
1. /docs/system/PROJECT_STATE.md       — current state and non-negotiable constraints
2. /docs/system/CURRENT_PHASE.md       — what is in scope right now
3. /docs/system/AGENT_RULES.md         — how you must behave (mandatory)
4. /docs/system/ARCHITECTURE.md        — system shape (when relevant)
5. /docs/system/ENVIRONMENT_MAP.md     — secret model (when touching env or auth)
6. /docs/system/KNOWN_BUGS.md          — open issues to be aware of
7. /docs/system/DECISIONS_LOG.md       — why constraints exist

In your first response, list which of those files you read. If you skipped any, stop and explain why.

# Task
[ONE-SENTENCE OBJECTIVE — what success looks like]

[OPTIONAL: 2–4 bullets of context the agent cannot infer from the docs]

# Rules (in addition to AGENT_RULES.md)
- Documentation only / production logic OK / API behavior OK — pick one and state it.
- Do not modify locked systems listed in AGENT_RULES.md rule 4 unless this prompt explicitly names the file path.
- Do not edit any real .env file. .env.example is the only env file under version control.
- Do not invent secrets or test credentials.
- Do not push to master. Push to your worktree/feature branch and open a PR.
- Minimal diff. No opportunistic refactors.
- Stop and ask if a constraint conflicts with the task.

# Scope
- In scope: [files / directories / surfaces the agent may touch]
- Out of scope: [files / directories / surfaces the agent must not touch]
- Schema changes: forbidden / allowed in [specific table] only.
- New dependencies: forbidden / allowed only with explicit name + version (state if allowed).

# Verification required (the agent must run these and paste output)
- `npx tsc --noEmit`     — typecheck must pass
- `npm run build`        — build must pass
- [OPTIONAL: route-specific curl, lint, or screenshot]

# Final report format (mandatory — see AGENT_RULES.md §8)
## Files changed
- path (created | modified | deleted) — one-line reason

## Build / typecheck
- `npx tsc --noEmit`: <exit code> — <relevant output or "clean">
- `npm run build`:    <exit code> — <relevant output or "clean">

## Tests
- <command>: <exit code> — <pass/fail count or "no tests for this surface">

## Risks
- <bullet list, or "no risks identified after <specific check>">

## Out of scope / not done
- <bullet list, or "n/a">

## Verification the human should run
- <one or two specific commands or click-paths>
```

---

## How to use this template

1. **Fill the four bracketed sections** (`Task`, `Rules`, `Scope`, `Verification required`). Leave the rest verbatim — including the read-list and report format.
2. **Pick the right agent.** Claude Code / Codex / Cursor Cloud all accept this format. Use Cursor Chat for long-context tasks; use Cloud for isolated parallel work.
3. **One agent per file path.** Do not run two agents on overlapping files. See [/AGENTS.md](../../AGENTS.md) "Coordination rules".
4. **When the agent reports back, verify before approving:**
   - Did it actually list the files it read?
   - Are the build/typecheck exit codes pasted, or only claimed?
   - Are the "Risks" honest or boilerplate? A "no risks identified" with no specific check is suspicious.
   - Did it stay inside the declared scope?
5. **Approve the PR yourself.** Agents do not merge their own PRs.

## Example (filled)

For a real-world example of a small, low-risk task:

```
You are working on the Oraya production codebase.

# Read these files first (in this order, before any code change)
1. /docs/system/PROJECT_STATE.md       — current state and non-negotiable constraints
2. /docs/system/CURRENT_PHASE.md       — what is in scope right now
3. /docs/system/AGENT_RULES.md         — how you must behave (mandatory)
4. /docs/system/ENVIRONMENT_MAP.md     — secret model (when touching env or auth)
5. /docs/system/KNOWN_BUGS.md          — open issues to be aware of

In your first response, list which of those files you read.

# Task
Resolve KNOWN_BUGS.md #1 by removing RESEND_FROM_EMAIL from .env.example and adding a one-line decision entry to DECISIONS_LOG.md noting the from-address stays hardcoded.

# Rules
- Documentation only — no production logic, no API behavior, no schema changes.
- Do not edit any lib/send-*-email.ts file (the constant stays).
- Do not push to master.

# Scope
- In scope: /.env.example, /docs/system/DECISIONS_LOG.md, /docs/system/KNOWN_BUGS.md (mark #1 closed).
- Out of scope: any lib/, any app/, any other doc.

# Verification required
- `npx tsc --noEmit` — typecheck must pass (no code change so should be a no-op).
- `git diff --stat` — must show exactly the three files above.

# Final report format (mandatory — see AGENT_RULES.md §8)
[as in template]
```
