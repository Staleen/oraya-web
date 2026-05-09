# Legacy Doc Map — Root-Level Markdown Files

**Updated:** 2026-05-09
**Purpose:** explain what each pre-`/docs/system/` root-level Markdown file is for, what is still authoritative, what is historical only, and where future updates should go. New AI sessions should read this once before treating any root-level doc as canonical.

---

## At a glance

| Root file | Status | Authoritative? | Migration target |
|---|---|---|---|
| [/PROJECT_STATE.md](../../PROJECT_STATE.md) | ✅ retained | Historical detail log only — current state lives in [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) | Keep as-is. New phase entries continue here for now; durable summary moves into `/docs/system/`. |
| [/CLAUDE.md](../../CLAUDE.md) | ⚠️ partially superseded | Brand/tooling conventions = authoritative. "Auto-backup rule (MANDATORY)" snippet (`git push origin master`) is **legacy** — overridden by [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §5. | Edit the snippet on next doc-cleanup pass (KNOWN_BUGS #5). Keep brand/conventions block. |
| [/AGENTS.md](../../AGENTS.md) | ⚠️ partially superseded | "Multi-agent workflow" coordination rules = authoritative. "Auto-backup rule (MANDATORY)" snippet = legacy (same problem as CLAUDE.md). | Same as CLAUDE.md — edit the snippet, keep the coordination rules. |
| [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md) | ✅ authoritative for design | Yes — guest-facing visual + UX conventions. `app/globals.css` is the source-of-truth for token *values*; this doc explains *how* to use them. | Stays at root. Cross-link from [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md). |
| [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md) | ✅ authoritative (planning context only) | Yes — Phase 16 roadmap, dependencies, risk notes, and explicit "must NOT be implemented yet" list. | Stays at root until Phase 16 begins. At kickoff, fold into a new [/docs/system/CURRENT_PHASE.md](../system/CURRENT_PHASE.md) for that phase. |
| [/README.md](../../README.md) | ✅ authoritative (developer onboarding) | Yes — minimal: stack, dev server, brand pointers. | Stays at root. Update only if dev-server commands or stack change. |
| [/.env.example](../../.env.example) | ✅ authoritative | Yes — single tracked env file. Every `process.env.*` read in the repo must be reflected here. | Stays at root. The audit doc is [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md). |
| [/.gitignore](../../.gitignore) | ✅ authoritative | Yes — explicit per-variant `.env*` protection (2026-05-09 audit). | Stays at root. |
| [/vercel.json](../../vercel.json) | ✅ authoritative | Yes — cron schedule + auth contract. | Stays at root. |

---

## Detailed entries

### [/PROJECT_STATE.md](../../PROJECT_STATE.md) (root) — historical detail log

- **What it is:** the long-form per-phase change log going back to Phase 1, including every Phase 15I.x and 15G.x sub-phase with implementation specifics.
- **What remains authoritative:** the historical record itself. Anything past-tense, dated, or attached to a specific sub-phase remains the canonical record of *what shipped when*.
- **What is no longer authoritative:** the "CURRENT PHASE" header at the top is a snapshot from when the file was last updated, not a live signal. The live snapshot is [/docs/system/CURRENT_PHASE.md](../system/CURRENT_PHASE.md).
- **What is no longer authoritative (II):** the "AGENT EXECUTION RULES" footer is superseded by [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md). Both say roughly the same thing, but `/docs/system/AGENT_RULES.md` is the enforced version.
- **Migration direction:** *Historical entries stay here.* Going forward, new phase scaffolding lives in [/docs/phases/PHASE_INDEX.md](../phases/PHASE_INDEX.md) (one-line per phase) and the current-phase narrative lives in [/docs/system/CURRENT_PHASE.md](../system/CURRENT_PHASE.md). When a phase closes, append a one-line summary to PHASE_INDEX.md and a short detail block here.

### [/CLAUDE.md](../../CLAUDE.md) — Claude-specific instructions

- **What it is:** project-level Claude Code instructions, project-specific Supabase setup snippets (settings table, addons table, bookings table SQL), and Oraya brand/tooling conventions.
- **Authoritative:** the "Project", "Dev server", and "Key conventions" sections (color/font constants, inline-style rule, SVG inlining, `next.config.mjs` constraint). The Supabase SQL snippets are historical-but-true — they reflect the live schema and are useful for first-time setup; they are not migrations to re-run.
- **Not authoritative (overridden):** the "Auto-backup rule (MANDATORY)" snippet that says `git push origin master`. Tracked as bug [#5 in KNOWN_BUGS.md](../system/KNOWN_BUGS.md). Use feature/worktree branches and PRs per [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §5.
- **Migration direction:** brand and conventions content stays here for Claude Code's automatic load. The auto-backup snippet gets replaced in the next doc-cleanup pass.

### [/AGENTS.md](../../AGENTS.md) — Codex-specific instructions

- **What it is:** project-level Codex instructions, mirrored from CLAUDE.md plus a "Multi-agent workflow (Phase 16 readiness)" block defining roles and coordination rules.
- **Authoritative:** the "Multi-agent workflow" + "Coordination rules" block. Roles (ChatGPT = orchestration, Cursor Editor Chat = main implementation, Cursor Cloud = audits / regression / security, Claude / Claude Code = deep implementation, Codex = isolated parallel) are the operational source.
- **Not authoritative:** same auto-backup snippet problem as CLAUDE.md. Same fix path.
- **Migration direction:** the multi-agent role description should eventually move into [/docs/archive/AI_WORKFLOW.md](AI_WORKFLOW.md) so all roles are documented in one place; the AGENTS.md file then becomes a thin pointer for Codex to load on session start.

### [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md) — guest-facing design system

- **What it is:** brand direction, color tokens, typography, spacing, section rhythm, micro-interaction utilities, theme behavior. Long, detailed, and matches the production code.
- **Authoritative:** yes, for everything visual on guest-facing surfaces. Token *values* live in `app/globals.css`; this doc explains the *system*.
- **Migration direction:** stays at root. New AI sessions doing UI work should read it. The system docs cross-link to it ([/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) constraint #10 references the locked inline-style convention).

### [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md) — Phase 16 roadmap

- **What it is:** the planning context for Phase 16 — five sub-phases (16A WhatsApp, 16B Payments, 16C Manual, 16D Smart Lock, 16E Rewards), dependencies, risk notes, and a "Must NOT be implemented yet" boundary.
- **Authoritative:** yes. The "Must NOT be implemented yet" list is enforced by [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) constraint #9 and [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §3.
- **Migration direction:** stays at root for now. When Phase 16A actually starts, the kickoff replaces [/docs/system/CURRENT_PHASE.md](../system/CURRENT_PHASE.md) and PHASE_16_PLAN.md becomes a historical reference.

### [/README.md](../../README.md) — developer onboarding

- **What it is:** minimal — stack name, dev-server commands, brand pointers.
- **Authoritative:** yes for what it covers. Short by design.
- **Migration direction:** keep short. Resist scope creep — onboarding pointers belong here, durable architecture goes in [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md).

### [/.env.example](../../.env.example), [/.gitignore](../../.gitignore), [/vercel.json](../../vercel.json)

- **Authoritative:** yes, all three. They are the actual operational contracts.
- **Cross-references:** [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md) is the audit/explanatory layer; the files above are the truth.

---

## SQL helper files in [/sql/](../../sql/)

The repository contains additive migration helpers under `/sql/` (e.g. `phase-15f7-feedback-email-tracking.sql`, `phase-15i1-payment-foundation.sql`). They are **historical** — they were run once in Supabase by the human and remain in the repo as a paper trail, not as a re-run target.

**Do not** re-run these blindly against production. Schema is locked per [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4 and [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) constraint #2.

---

## Where future updates go

| Type of change | Where it goes |
|---|---|
| New durable architectural decision | [/docs/system/DECISIONS_LOG.md](../system/DECISIONS_LOG.md) (newest first) |
| New phase | One-line entry in [/docs/phases/PHASE_INDEX.md](../phases/PHASE_INDEX.md); detail block in [/PROJECT_STATE.md](../../PROJECT_STATE.md); narrative in [/docs/system/CURRENT_PHASE.md](../system/CURRENT_PHASE.md) while active |
| New env var | [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md) + [/.env.example](../../.env.example) (placeholder + "where to get it") |
| New known bug | [/docs/system/KNOWN_BUGS.md](../system/KNOWN_BUGS.md) (numbered) |
| New AI failure mode (catalog) | [/docs/lessons/KNOWN_AGENT_FAILURE_PATTERNS.md](../lessons/KNOWN_AGENT_FAILURE_PATTERNS.md) |
| New AI failure mode (narrative) | [/docs/archive/SESSION_LESSONS.md](SESSION_LESSONS.md) |
| New design rule | [/DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md) (root, kept) |
| New tooling/setup snippet | [/CLAUDE.md](../../CLAUDE.md) (Claude-loaded) and/or [/AGENTS.md](../../AGENTS.md) (Codex-loaded), with cross-link from [/docs/system/](../system/) |
| New behavior change in any locked surface | [/docs/system/](../system/) doc(s) updated **in the same PR** (per [AGENT_RULES.md](../system/AGENT_RULES.md) §11) |

---

## Migration direction (summary)

1. **Operational doctrine** (rules for agents, env model, locked systems, current phase, decisions, bugs) lives in `/docs/system/`. It is short, durable, and version-controlled. New AI sessions read it first.
2. **Historical knowledge** (per-phase index, narrative lessons, workflow detail, this map, failure patterns) lives in `/docs/{phases,archive,lessons}/`. It explains *why* the doctrine looks the way it does.
3. **Pre-existing root docs** stay at root for compatibility (CLAUDE.md and AGENTS.md are loaded automatically by their respective tools; README is conventional; DESIGN_SYSTEM is referenced by PROJECT_STATE; PHASE_16_PLAN is the active roadmap; PROJECT_STATE.md is the historical detail log).
4. **No deletions.** When a root doc is superseded in part, mark it here and link to the replacement. Outdated content stays in place with a note rather than being removed.

This map is the safety net that lets a new AI session find every doc without re-deriving the structure from scratch.
