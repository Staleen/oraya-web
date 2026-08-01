# Oraya ChatGPT Orchestrator Protocol

**Version:** 2.0  
**Purpose:** Reference playbook supporting the Oraya Project Instructions.  
**Not a task handoff:** Active task continuity belongs in a migration prompt. Technical truth belongs in the current repository `/docs/system/` files.

---

## 1. Context architecture

Oraya work uses three layers:

| Layer | Function | Storage |
|---|---|---|
| Project Instructions | Mandatory operating behavior for every chat | ChatGPT Project settings |
| Migration prompt | Active task continuity and exact stopping point | First message or attachment in the new task chat |
| Repository documentation | Current technical and operational truth | `/docs/system/`, preferably from live repository access |

Do not merge these layers into one oversized prompt.

### Conflict handling

- Workflow behavior: Project Instructions govern.
- Current technical facts: `/docs/system/` governs.
- Active business decisions: David’s latest explicit decision governs, subject to documented conflicts being identified and updated.
- Migration prompts preserve continuity but do not override newer repository facts.
- Agent reports are claims until supported by evidence.

---

## 2. New-chat intake

When a new task chat begins with a migration prompt:

1. Extract:
   - active objective;
   - confirmed decisions;
   - unapproved ideas;
   - completed and merged work;
   - unmerged or unverified work;
   - observed bugs or behavior;
   - evidence supplied;
   - outstanding decisions;
   - exact expected next step.

2. Read the relevant current project sources.

3. Check timestamps and versions. Uploaded files may be stale snapshots.

4. Identify conflicts instead of silently choosing convenient facts.

5. Continue from the handoff point. Do not repeat earlier discovery unless evidence is missing or stale.

6. Remain in discussion mode when the migration prompt says implementation was not approved.

---

## 3. Decision-state model

Use these labels internally and make them visible when confusion is likely:

### Confirmed
David explicitly approved the behavior.

### Observed
A screenshot, transcript, log, export, test, or live behavior shows something happened.

### Hypothesized
A possible explanation. It must be verified by repository inspection or runtime evidence.

### Proposed
A product or technical option still under discussion.

### Implemented, unverified
An agent claims or appears to have made the change, but required evidence or human testing is incomplete.

### Merged
David confirms the PR was approved and merged.

Only **Confirmed** requirements should enter an implementation prompt. Only **Merged** work should be treated as durable project state.

---

## 4. Choosing the next action

Use the smallest correct action:

| Situation | Action |
|---|---|
| Business behavior is still being designed | Discuss; no agent prompt |
| Requirements are clear but approval is missing | Summarize task definition and wait |
| Root cause is unknown or risk is broad | Read-only audit prompt |
| Root cause and outcome are clear | Implementation prompt |
| Agent report lacks evidence | Narrow evidence request |
| Agent changed wrong scope | Revision prompt |
| Evidence is complete but UI/runtime needs checking | Human verification checklist |
| Work is approved and merged | Recommend required docs/state follow-up |

Do not use an implementation agent merely to answer a question that repository inspection can answer.

---

## 5. Compact prompt construction

Use `/docs/system/AGENT_HANDOFF_TEMPLATE.md`, but keep task-specific content compact.

### Required task payload

1. **Objective** — one sentence.
2. **Business context** — at most two to four non-discoverable facts.
3. **Authorization** — audit/docs/UI/production logic/API/locked path.
4. **Scope** — behavior or bounded surfaces.
5. **Out of scope** — adjacent risks.
6. **Protected behavior** — what must remain unchanged.
7. **Schema/dependencies** — forbidden unless explicitly approved.
8. **Acceptance criteria** — observable results.
9. **Verification** — standard plus focused checks.
10. **Final report** — exact `AGENT_RULES.md` evidence structure.

### Exclude

- phase autobiography;
- architecture copied from docs;
- generic framework explanations;
- full migration prompt;
- full prior agent reports;
- long code excerpts;
- speculative implementation;
- repeated safety rules;
- file paths guessed without evidence.

### Prompt size

Prompt size is not the objective; signal density is. When the task becomes large because several independent outcomes are bundled together, split it into bounded sequential tasks.

---

## 6. Audit-first protocol

Use a read-only audit when:

- current behavior is disputed;
- root cause is unknown;
- the migration prompt may be stale;
- multiple systems or vendors are involved;
- a locked surface may be required;
- the requested change could alter architecture;
- the implementation agent would need to guess.

The audit report should contain:

- files and call paths inspected;
- verified current behavior;
- confirmed root cause or explicit uncertainty;
- constraints discovered;
- minimal recommended change;
- expected files/surfaces;
- risks;
- proposed verification;
- no code changes.

Audit results are not implementation approval. Review them with David before producing the implementation prompt.

---

## 7. Agent report audit

### Required evidence

- exact file paths and change type;
- branch/worktree and PR information when applicable;
- `npx tsc --noEmit` command, exit code, relevant output;
- `npm run build` command, exit code, relevant output;
- focused test commands and results;
- diff/scope confirmation;
- risks tied to checks;
- out-of-scope/not-done;
- human verification steps.

### Red flags

- “Done” without changed paths;
- “Passed” without exit codes;
- “No risks” without checks;
- behavior claim without reproduction;
- unexpected schema, env, auth, payment, booking, or admin changes;
- unrelated cleanup;
- documentation omitted despite durable behavior change;
- direct push to `master`;
- agent self-merge;
- screenshots without identifying environment or route.

### Review outcomes

Use exactly one:
- **Recommend approval**
- **Recommend approval after human verification**
- **Recommend revision**
- **Insufficient evidence to approve**

State the reason and the next action.

---

## 8. File and source hygiene

Project source uploads are snapshots unless connected to a live source.

- Keep one canonical copy of each file.
- Do not upload duplicate versions with similar names.
- Remove or replace stale versions after repository documentation changes.
- Preserve filenames matching repository paths where practical.
- Check the document’s “Updated” or “Last updated” date before relying on it.
- Prefer live GitHub repository access when available.
- Do not place secrets, `.env` values, private credentials, or sensitive production exports in project sources.

Recommended core source set:

1. `PROJECT_STATE.md`
2. `CURRENT_PHASE.md`
3. `AGENT_RULES.md`
4. `ARCHITECTURE.md`
5. `ENVIRONMENT_MAP.md`
6. `KNOWN_BUGS.md`
7. `DECISIONS_LOG.md`
8. `AGENT_HANDOFF_TEMPLATE.md`
9. task-specific playbooks such as `BUTLER_PLAYBOOK.md`
10. this protocol

Do not store old task migration prompts as permanent project-wide sources unless the whole project is dedicated to that one task. Old migrations can contaminate unrelated chats.

---

## 9. Migration prompt structure

A migration prompt should be compact but complete:

```text
# Active objective

# Confirmed business decisions

# Explicitly unapproved ideas

# Current technical state
- merged
- implemented but unverified
- not started

# Evidence already available

# Current observed behavior

# Outstanding questions or risks

# Exact next expected action

# Files the new chat must read

# Guardrails
- continue; do not restart
- do not convert discussion into implementation without approval
- verify technical claims against current /docs/system/
- challenge agent completion claims
```

Avoid embedding permanent Project Instructions or full repository summaries.

---

## 10. Maintenance

Update the Project Instructions or this protocol only when the orchestration method changes.

Update repository docs when the product or system changes.

Update the migration prompt when the active task changes.

Recommended maintenance after a merged documentation change:

1. Refresh the live GitHub source, or delete and upload the revised file.
2. Remove stale duplicates.
3. Start the next chat with the latest migration prompt.
4. Ask the new chat to identify the latest dates of the files it used.

---

## 11. Summary

- **Project Instructions:** mandatory behavior.
- **This protocol:** detailed reference.
- **Migration prompt:** active task continuity.
- **`/docs/system/`:** technical truth.
- **Coding-agent prompt:** compact execution contract.
- **Agent report:** untrusted until evidenced.
- **Merge:** the point at which project state becomes durable.
