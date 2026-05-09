# AI Workflow — How Oraya Actually Ships Changes

**Updated:** 2026-05-09
**Authority:** descriptive. The behavior contract for agents is [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md). This file describes the *operational* workflow around it — who does what, in what order, with which tool.

---

## 1. The actual flow

```
Human + ChatGPT (Project)            Coding agent              Repository
──────────────────────────           ──────────────────        ───────────
1. discuss task / refine             ─────────────────         ─────────────
2. ChatGPT drafts handoff prompt
   (uses AGENT_HANDOFF_TEMPLATE.md)
3. Human reviews + approves prompt
4. Human pastes prompt into agent ─► reads /docs/system/*
                                     plans the change
                                     opens worktree/branch
                                     edits files
                                     runs typecheck + build
                                     commits to branch
                                     opens PR via `gh pr create` ──► PR
5. Human reviews PR (diff,
   build output, agent's report)
6. Human asks ChatGPT to verify
   the agent's report against
   the AGENT_RULES.md checklist
7. Human merges PR ────────────────────────────────────────────► master
8. Vercel deploys master to
   stayoraya.com
```

The defining property of this flow: **no automated step closes the loop.** Every transition between roles requires a human decision.

## 2. Roles

| Actor | Role | What they may do | What they may not do |
|---|---|---|---|
| **Human (David)** | Owner / approver / merger | Approve prompts, dispatch agents, review PRs, merge to `master`, populate Vercel env, run prod validation | n/a |
| **ChatGPT (Project)** | Orchestrator / prompt author / report verifier | Generate handoff prompts following [/docs/system/AGENT_HANDOFF_TEMPLATE.md](../system/AGENT_HANDOFF_TEMPLATE.md); challenge agent reports; suggest doc updates | Edit code; merge PRs; "start" any task; assume chat memory beats `/docs/system/` |
| **Claude Code** | Executing agent (long-context implementation, refactor support) | Edit code on a worktree branch; run typecheck/build; commit; push; open a PR | Push to `master`; merge own PR; modify locked systems; invent secrets |
| **Codex** | Executing agent (isolated parallel coding) | Same as Claude Code, on its own branch | Same constraints |
| **Cursor Editor Chat** | Executing agent (long-context interactive) | Same as Claude Code | Same constraints |
| **Cursor Cloud Agent** | Executing agent (audits, regression/security fixes) | Same as Claude Code; well-suited for read-only audits and isolated PR-bug fixes | Same constraints |

The role split is documented in [/AGENTS.md](../../AGENTS.md) "Multi-agent workflow". This file expands the operational detail.

## 3. Branch / worktree strategy

### 3.1 Default flow — feature branches off `master`

```
master ──┬──────────────────────────────────────► (production)
         │
         └─► claude/<slug>     (worktree-style branch from a Claude Code session)
         └─► agent/<task-id>   (Codex / Cursor Cloud)
         └─► feat/<short-name> (human-driven feature work)
         └─► fix/<short-name>  (human-driven hotfix)
         └─► docs/<short-name> (documentation-only changes)
```

Recent real branches (from `git log`): `claude/stupefied-bose-2dde44` (worktree-style), `claude/secure-members-profile` (PR #3), `claude/phase-15-critical-regressions` (PR #4), `docs/system-bootstrap` (PR #7).

### 3.2 Worktree usage (Claude Code)

Claude Code in a worktree means edits happen in `.claude/worktrees/<name>/` on a branch named after the worktree. The push target is **the worktree branch**, never `master`. The PR is opened from the worktree branch into `master`.

Verify your branch before pushing:

```bash
git rev-parse --abbrev-ref HEAD     # should show claude/<slug> or agent/<task-id>, NOT master
git status                          # clean working tree before commit
```

### 3.3 Branch naming conventions

- `claude/<descriptor>` — Claude Code sessions, often worktree-backed.
- `agent/<task-id>` — Codex or Cursor Cloud autonomous runs.
- `feat/<short-name>` — human-led feature work.
- `fix/<short-name>` — human-led hotfix.
- `docs/<short-name>` — documentation only.
- `chore/<short-name>` — config / tooling / non-feature housekeeping.

These are conventions, not enforced. New AI sessions: match the existing pattern in `git log` rather than inventing new prefixes.

### 3.4 Never directly to `master`

- Do **not** run `git push origin master` from any agent context.
- The legacy snippet in [/CLAUDE.md](../../CLAUDE.md) and [/AGENTS.md](../../AGENTS.md) is overridden by [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §5 and tracked as bug [#5 in KNOWN_BUGS.md](../system/KNOWN_BUGS.md).
- If you find yourself on `master`, check out a new branch *before* committing:
  ```bash
  git checkout -b claude/<slug>
  ```

### 3.5 Force-push policy

- **Allowed:** force-push to your own short-lived branch before a PR is opened.
- **Forbidden:** force-push to `master`, force-push to a branch that already has a PR + review activity, force-push that rewrites another agent's commits.

## 4. Review strategy

### 4.1 Two layers of review

1. **PR review (mandatory):** the human reads the diff, the agent's final report, and the build/typecheck output before merging. Every PR needs this — including documentation-only PRs.
2. **ChatGPT verification (recommended):** for non-trivial agent runs, the human asks ChatGPT to verify the agent's final report against [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §7 and §8 before merging. This catches "looks-fine-on-skim" reports that omit risks or skip the build output.

### 4.2 What a good PR review checks

- **Diff scope:** are all changed files inside the declared in-scope set in the agent prompt? Anything outside scope is a red flag.
- **Locked-system check:** did the diff touch any path listed in [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4 or [/PROJECT_STATE.md](../../PROJECT_STATE.md) "LOCKED SYSTEMS"? If yes, was that explicitly approved in the prompt?
- **Doc parity:** if the diff changes behavior covered by a `/docs/system/` doc, is that doc updated in the same PR?
- **Build output:** is `npx tsc --noEmit` and `npm run build` exit code pasted in the report?
- **Risk callout:** is there a real risk section, or just "no risks identified" with no specific check named?
- **Out-of-scope honesty:** is there an explicit "what I did not do" list?
- **Secret check:** no real values for `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`, `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `RESEND_API_KEY` anywhere — code, comments, or PR body.

### 4.3 Audit-only runs

For risky phases (e.g. Phase 15A, Phase 14C), the first agent run is **read-only audit** — the agent reads the code, documents risks and unknowns, but does not edit anything. The human reviews the audit, then dispatches an implementation agent with explicit scope. Phase 16 is required to start this way per [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md).

### 4.4 Re-roll the prompt, not the diff

If an agent's PR is wrong, prefer **closing the PR and re-dispatching with a refined prompt** over forcing the agent to "fix it" in the same branch. The first run anchors the agent's mental model; iterating in the same context tends to compound the original misunderstanding.

## 5. Safe parallelization rules

Multiple agents *can* run simultaneously, but only under specific conditions.

### 5.1 Always-safe parallelization

- **Different file sets, no shared imports.** Agent A edits `app/admin/bookings/page.tsx`; agent B edits `app/legal/refund/page.tsx`. No shared module → no merge conflict risk.
- **Read-only audits.** Any number of audit-only agents can run in parallel. They produce reports, not commits.
- **Documentation only on disjoint files.** One agent on `/docs/system/KNOWN_BUGS.md`, another on `/docs/phases/PHASE_INDEX.md`.

### 5.2 Conditionally safe (requires care)

- **Same surface, different routes.** Agent A on `/api/admin/bookings/[id]` (PATCH), agent B on `/api/admin/event-services/sync` — both under `/api/admin/*` but on different files. Safe **if** neither agent edits a shared helper in `lib/` that the other relies on. If either touches a shared `lib/admin-auth.ts`, serialize.
- **Frontend + backend split.** One agent on `app/book/page.tsx`, another on `app/api/bookings/route.ts`. Safe only if the contract between them is fixed (no field renames, no response-shape changes).

### 5.3 Never parallelize

- **Two agents on the same file.** This produces silent overwrites — git's merge can pick one agent's version and erase the other's, depending on resolution order.
- **Two agents on the same locked surface.** Locked surfaces (`/api/bookings`, `/api/booking-action/*`, calendar sync, email triggers, schema) are conflict-sensitive. One change at a time.
- **Two agents on the booking pipeline contract.** The pipeline reaches across `/api/bookings`, `lib/calendar/availability.ts`, `lib/addon-audit.ts`, `lib/payment-foundation.ts`, and the snapshot persistence path. Coordinated changes only — single PR or strict sequencing.
- **Implementation + refactor on the same surface.** A "refactor while implementing" agent will fight a "minimal diff" agent on the same file.

### 5.4 If in doubt, serialize

The cost of serializing two agents (one waits) is hours. The cost of two agents silently clobbering each other is a regression that ships to production undetected. Default to serial unless the parallelization is obviously safe.

## 6. Doc-update discipline

Every change that affects behavior covered by a `/docs/system/` file updates that doc **in the same PR**. This is enforced by [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §11.

The historical knowledge layer (this file's directory + [/docs/phases/](../phases/) + [/docs/lessons/](../lessons/)) is updated *after* the change is real, not before. If a phase concept is invented mid-thought, leave it out of the index until it ships.

## 7. Anti-patterns to recognize on sight

- **"Let me also clean up …"** — opportunistic refactor. Reject.
- **"This will require a small schema change."** — locked. Stop and ask.
- **"I'll push directly to master to save a step."** — never. Branch + PR.
- **"No risks identified."** with no stated check — challenge before merging.
- **"I read the docs."** with no list of which ones — re-prompt for the list.
- **"I'll add Stripe / WhatsApp / a PIN service."** — Phase 16 work, planning only. Architecture/audit pass required first.

## 8. When this workflow does not work

If a task genuinely needs a different flow (e.g. a true emergency hotfix that cannot wait for a PR review), the human takes the wheel directly. Agents do not get to declare emergencies. The protocol there:

1. Human commits to a hotfix branch (`fix/<short-name>`).
2. Human pushes the branch.
3. Human merges via PR with self-review (still goes through PR — no direct master push).
4. Human writes the postmortem entry in [/docs/system/DECISIONS_LOG.md](../system/DECISIONS_LOG.md).

Even an emergency keeps the PR step. The point of the workflow is auditable history, not perfect process.

---

## Cross-links

- Behavior contract for agents: [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md)
- Handoff prompt template: [/docs/system/AGENT_HANDOFF_TEMPLATE.md](../system/AGENT_HANDOFF_TEMPLATE.md)
- ChatGPT orchestrator instructions: [/docs/system/CHATGPT_PROJECT_INSTRUCTIONS.md](../system/CHATGPT_PROJECT_INSTRUCTIONS.md)
- Codex / Cursor coordination notes: [/AGENTS.md](../../AGENTS.md)
- Failure-pattern catalog: [/docs/lessons/KNOWN_AGENT_FAILURE_PATTERNS.md](../lessons/KNOWN_AGENT_FAILURE_PATTERNS.md)
- Narrative version of past mistakes: [/docs/archive/SESSION_LESSONS.md](SESSION_LESSONS.md)
