# Known Agent Failure Patterns — Catalog

**Updated:** 2026-05-09
**Companion to:** [/docs/archive/SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) (the narrative version). This file is the **structured catalog** — short rows, scan-friendly, designed for "did this fail before?" lookups during PR review.

**Use during PR review:** scan this list against the agent's diff. If you can match the pattern, push back on the PR before merging.

**Severity scale:**

- **🔴 Critical** — has caused or could cause production data loss, security regression, or silent core-flow break.
- **🟠 High** — degrades trust, breaks parity, or hides operational risk.
- **🟡 Medium** — visible quality issue or footgun for the next agent.
- **🟢 Low** — cosmetic / annoyance.

**Format:**

```
### #N — Short pattern name

- **Severity:**
- **Category:** completion-claim | drift | unsafe-refactor | locked-system | desync | env | merge | overengineering | parallelization
- **Symptom:** what it looks like in a PR or report.
- **Root cause:** why agents make this mistake.
- **Detection cue (in PR review):** what to grep / look at.
- **Mitigation rule:** which doc/section governs this.
- **Narrative:** [/docs/archive/SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §<n>
```

---

## A. Fake completion claims

### #1 — "Done" without build/typecheck output

- **Severity:** 🟠 High
- **Category:** completion-claim
- **Symptom:** agent's final report says "build passes" or "no errors" without pasting the exit codes from `npx tsc --noEmit` and `npm run build`.
- **Root cause:** agent inferred success from absence of obvious errors mid-edit; never actually ran the commands.
- **Detection cue:** report missing the literal exit codes; no relevant build-output excerpt.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §7 + §8.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §7.3.

### #2 — "No risks identified" with no stated check

- **Severity:** 🟠 High
- **Category:** completion-claim
- **Symptom:** the Risks section reads "no risks identified" without naming the specific verification that produced that conclusion.
- **Root cause:** boilerplate completion. Agent has been trained that confidence-language closes the report.
- **Detection cue:** absence of a sentence like "verified by running X" or "no callers of the renamed function in `lib/`".
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §7 — risk callouts must name the check.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §7.3.

### #3 — Inventing test results

- **Severity:** 🔴 Critical
- **Category:** completion-claim
- **Symptom:** the Tests section claims "all tests pass" for a surface that has no tests, or claims a custom test was run when none was added to the diff.
- **Root cause:** agent confabulated a test run to satisfy the report format.
- **Detection cue:** `git diff` shows no test files added or run; report claims test results anyway.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §7 — "If no test exists, say so explicitly — do not invent tests."
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §7.3.

### #4 — Out-of-scope section is "n/a" when scope was actually skipped

- **Severity:** 🟡 Medium
- **Category:** completion-claim
- **Symptom:** report claims everything in scope was done; later inspection shows part of the task was deferred or quietly skipped.
- **Root cause:** agent prefers to look complete; "n/a" is the path of least friction.
- **Detection cue:** compare in-scope items in the original prompt against actual diff coverage.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §7 — "what I did not do" must be honest.

---

## B. Architecture drift

### #5 — Inventing schema columns or tables

- **Severity:** 🔴 Critical
- **Category:** drift
- **Symptom:** code references `bookings.cancelled_at`, `members.tier`, or any column not in the actual schema.
- **Root cause:** agent assumes "this column obviously exists" because the feature talks about it. Reality: the schema is locked and the feature may not have a backend yet (e.g. cancellation visibility added in 15I.11 with **no** cancellation backend).
- **Detection cue:** new code reads a column not enumerated in [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md) or referenced anywhere else in the repo.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4 + [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) constraint #2.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §3.1.

### #6 — Inventing routes

- **Severity:** 🟠 High
- **Category:** drift
- **Symptom:** client code calls `/api/payments`, `/api/whatsapp`, `/api/cancellations`. None exist.
- **Root cause:** Phase 16 planning context leaked into the agent's mental model.
- **Detection cue:** new fetch URL not present in [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md) "Public surface" / "Admin surface" tables.
- **Mitigation rule:** [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) constraint #9 (no Phase 16 implementation).
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §3.4.

### #7 — Inventing helper modules

- **Severity:** 🟠 High
- **Category:** drift
- **Symptom:** import from `lib/payments.ts` or `lib/whatsapp/*` — neither exists. Real helpers are `lib/payment-foundation.ts` (manual ledger) and there is no WhatsApp module.
- **Root cause:** agent named a module by what would be useful, not what exists.
- **Detection cue:** import path does not match anything under `lib/` in `git ls-files`.
- **Mitigation rule:** read [/docs/system/ARCHITECTURE.md](../system/ARCHITECTURE.md) before importing; `grep` before referencing.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §3.3.

### #8 — Inventing env vars

- **Severity:** 🔴 Critical
- **Category:** env
- **Symptom:** code reads `process.env.STRIPE_SECRET_KEY`, `process.env.WHATSAPP_TOKEN`, etc.
- **Root cause:** Phase 16 leak.
- **Detection cue:** any `process.env.*` symbol not in [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md).
- **Mitigation rule:** [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md) is exhaustive — if it is not there, the var does not exist.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §3.2.

### #9 — Re-introducing duplicate state

- **Severity:** 🟡 Medium
- **Category:** drift / overengineering
- **Symptom:** new `useState` for booking date range while a single-source-of-truth state already exists in the same component.
- **Root cause:** the booking flow has been restructured several times (13C → 15I.3); agents recognize "we need state for X" without checking the current solution.
- **Detection cue:** new state setter overlaps semantically with an existing one in the same file.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §2 minimal-diff.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §4.5.

---

## C. Unsafe refactors

### #10 — Opportunistic "cleanup" outside scope

- **Severity:** 🟠 High
- **Category:** unsafe-refactor
- **Symptom:** small feature task ships a diff that touches 12 unrelated files.
- **Root cause:** agent demonstrating competence; "while I'm here" rationalization.
- **Detection cue:** files in the diff that are not in the original prompt's "in scope" list.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §2 minimal-diff.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §1.2.

### #11 — Migrating inline styles to Tailwind utilities

- **Severity:** 🔴 Critical (visual regressions ship silently)
- **Category:** unsafe-refactor / locked-system
- **Symptom:** diff replaces inline `style={{ color: GOLD }}` with `className="text-gold"` or similar.
- **Root cause:** agent perceives Tailwind as "more correct" and tries to standardize.
- **Detection cue:** diff removes hardcoded color/font constants in favor of Tailwind classes.
- **Mitigation rule:** [/CLAUDE.md](../../CLAUDE.md) "Key conventions" + [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) constraint #10. Convention is **locked**.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §4.1.

### #12 — Replacing `<img>` with `next/image` for SVG logos

- **Severity:** 🟡 Medium
- **Category:** unsafe-refactor
- **Symptom:** `OrayaEmblem.tsx` / `OrayaLogoFull.tsx` are converted from inline SVG components to `<Image>` calls.
- **Root cause:** "next/image is the right way" pattern matching.
- **Detection cue:** removed inline SVG markup; added `next/image` import.
- **Mitigation rule:** [/CLAUDE.md](../../CLAUDE.md) "Key conventions" — SVGs are inlined as React components by design.

### #13 — Renaming exports

- **Severity:** 🟠 High
- **Category:** unsafe-refactor
- **Symptom:** `export function foo` becomes `export function fooHandler`; imports across the repo break.
- **Root cause:** agent improving naming locally without scanning callers.
- **Detection cue:** new TypeScript errors after the rename, or fix-up edits in unrelated files in the same PR.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §2 — "Do not rename, reorganize, or 'clean up' unrelated code."

---

## D. Touching locked systems

### #14 — Editing `/api/bookings` without explicit approval

- **Severity:** 🔴 Critical
- **Category:** locked-system
- **Symptom:** diff modifies `app/api/bookings/route.ts` for a UI-only or unrelated task.
- **Root cause:** agent thinks the API "needs" a change to support the UI request.
- **Detection cue:** diff touches `app/api/bookings/`; prompt did not name that file.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4 (locked) + [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) "LOCKED SYSTEMS — DO NOT MODIFY".

### #15 — Adjusting iCal `DTEND` semantics

- **Severity:** 🔴 Critical (calendar double-bookings)
- **Category:** locked-system
- **Symptom:** changing `DTEND` from exclusive to inclusive (or vice versa) "to match user expectations".
- **Root cause:** agent unfamiliar with iCal RFC 5545 — exclusive end is **the** standard.
- **Detection cue:** diff edits `lib/calendar/*` or `app/api/calendar/*` for a non-calendar task.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4 + §10 (date discipline).
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §4.2.

### #16 — Changing `/api/bookings` response shape

- **Severity:** 🔴 Critical (breaks guest redirect to `/booking/view/[token]`)
- **Category:** locked-system
- **Symptom:** removing or renaming the `token` field; adding new required fields the client does not handle.
- **Root cause:** agent extending the API to expose more data without considering the consumer.
- **Detection cue:** changes to the response object in `app/api/bookings/route.ts` POST.
- **Mitigation rule:** [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) constraint #1.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §4.3.

### #17 — Modifying email-trigger system for non-email task

- **Severity:** 🟠 High
- **Category:** locked-system
- **Symptom:** `lib/send-*-email.ts` edited as part of a UI or admin task.
- **Root cause:** agent saw the imports and "improved" them.
- **Detection cue:** diff includes `lib/send-*-email.ts` files for a task that was not about email.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §4.

### #18 — Reverting fail-closed safety

- **Severity:** 🔴 Critical
- **Category:** locked-system / unsafe-refactor
- **Symptom:** `runAddonAudit` errors changed from fail-closed (block insert) to log-and-continue.
- **Root cause:** agent saw the audit error path as "harsh" and softened it.
- **Detection cue:** diff weakens an `if (auditResult.error) throw` to `if (auditResult.error) console.warn`.
- **Mitigation rule:** [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) — Phase 15 critical regression fix locks fail-closed semantics.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §4.6.

---

## E. UI / backend desync

### #19 — Frontend assumes a field that backend does not write

- **Severity:** 🟠 High
- **Category:** desync
- **Symptom:** UI displays `booking.cancellation_reason` — backend never sets it because there is no cancellation flow.
- **Root cause:** UI was built ahead of backend in another phase, and a later agent added a real read assuming the data exists.
- **Detection cue:** new UI-side property access for a field not written anywhere in the API.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §1 — read ARCHITECTURE.md.

### #20 — Backend writes a field UI never reads

- **Severity:** 🟡 Medium
- **Category:** desync / overengineering
- **Symptom:** new column or jsonb field populated; no UI surfaces it; no admin tool reads it.
- **Root cause:** agent over-engineered the data model.
- **Detection cue:** persistence diff with no consumer diff.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §2 minimal-diff.

### #21 — Settings allowlist drift

- **Severity:** 🔴 Critical (security regression)
- **Category:** desync / locked-system
- **Symptom:** `/api/settings` returns admin-only keys to the public.
- **Root cause:** agent added a new setting and exposed it via `/api/settings` without checking the allowlist that was the Phase 15 critical fix.
- **Detection cue:** diff to `/api/settings/route.ts` that adds a key not previously allowlisted; settings keys widening.
- **Mitigation rule:** [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) — Phase 15 critical regression: public `/api/settings` is allowlisted to guest-safe keys only.

### #22 — Admin live-update assumption

- **Severity:** 🟡 Medium
- **Category:** desync
- **Symptom:** code assumes Realtime delivers an update; misses when Realtime is unavailable.
- **Root cause:** agent reads "Realtime" without reading the surrounding "best-effort, polling is reliable" notes.
- **Detection cue:** UI logic that only reacts to Realtime events without a polling fallback.
- **Mitigation rule:** Phase 15 closure note — Realtime is best-effort, 45s silent poll is the reliable path.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §6.5.

---

## F. Env hallucinations

### #23 — Reading server-only env vars from a client component

- **Severity:** 🔴 Critical (secret leak)
- **Category:** env / locked-system
- **Symptom:** `process.env.SUPABASE_SERVICE_ROLE_KEY` referenced from a `"use client"` file or `NEXT_PUBLIC_*` name.
- **Root cause:** agent missed the client/server boundary.
- **Detection cue:** any of `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET`, `BOOKING_ACTION_SECRET`, `CRON_SECRET`, `RESEND_API_KEY` accessed inside a client component or rebound to a `NEXT_PUBLIC_*` name.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §6 + [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md).
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §4.4.

### #24 — Inventing a new env var

- **Severity:** 🟠 High
- **Category:** env / drift
- **Symptom:** `process.env.SOMETHING` not in `.env.example` or [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md).
- **Root cause:** agent assumed a config knob is the right shape for a new behavior.
- **Detection cue:** new `process.env.*` symbol; no corresponding `.env.example` entry in the same PR.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §6 + every new var documented in [/docs/system/ENVIRONMENT_MAP.md](../system/ENVIRONMENT_MAP.md).
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §3.2.

### #25 — Pasting a real secret into the diff

- **Severity:** 🔴 Critical (immediate rotation required)
- **Category:** env
- **Symptom:** any value matching a real Supabase / Resend / cron / admin secret pattern in a code, comment, doc, or PR body.
- **Root cause:** agent confused "test value" with "real value" or copied from clipboard.
- **Detection cue:** sk-, key-, jwt-shaped strings; Bearer tokens that look real; URLs with embedded credentials.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §6.
- **Action if detected:** rotate the secret immediately, then close PR.

### #26 — Dropping `NEXT_PUBLIC_SITE_URL` fallback assumption

- **Severity:** 🟠 High (preview emails point at production)
- **Category:** env
- **Symptom:** preview deployment sends real-looking emails embedding `https://stayoraya.com` URLs.
- **Root cause:** the fallback in `lib/brand.ts` is `https://stayoraya.com`; preview never set `NEXT_PUBLIC_SITE_URL`.
- **Detection cue:** preview emails with prod URLs.
- **Mitigation rule:** [/docs/system/KNOWN_BUGS.md](../system/KNOWN_BUGS.md) #3.

---

## G. Incorrect merge assumptions

### #27 — Pushing to `master`

- **Severity:** 🔴 Critical (bypasses review)
- **Category:** merge
- **Symptom:** `git push origin master` from agent context.
- **Root cause:** legacy snippet in [/CLAUDE.md](../../CLAUDE.md) and [/AGENTS.md](../../AGENTS.md) — both still say `git push origin master`.
- **Detection cue:** any commit appearing on `master` without a corresponding merged PR.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §5 (overrides the snippet) + [/docs/archive/AI_WORKFLOW.md](../archive/AI_WORKFLOW.md) §3.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §1.4.

### #28 — Self-merging a PR

- **Severity:** 🔴 Critical (no human review)
- **Category:** merge
- **Symptom:** PR opened and merged in the same agent run.
- **Root cause:** agent treats the merge as the natural end of "task complete".
- **Detection cue:** `gh pr merge` invocation in agent's command log.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §5 — "Do not merge your own PRs."

### #29 — Force-pushing to a shared branch

- **Severity:** 🔴 Critical (rewrites another agent's commits)
- **Category:** merge
- **Symptom:** `git push --force` to a branch with prior PR/review activity.
- **Root cause:** agent rebased to clean up history.
- **Detection cue:** force-push events on a branch with multiple authors or open PR comments.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §5 + [/docs/archive/AI_WORKFLOW.md](../archive/AI_WORKFLOW.md) §3.5.

### #30 — Skipping the doc-update-in-same-PR rule

- **Severity:** 🟠 High
- **Category:** merge / drift
- **Symptom:** behavior change in a `/docs/system/`-covered surface lands without a doc update; next session reads the stale doc.
- **Root cause:** agent finished the code task and missed the doc obligation.
- **Detection cue:** diff changes a locked or doc-covered surface; no `/docs/system/` files modified.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §11.
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §2.1.

---

## H. Overengineering

### #31 — Adding npm dependencies for trivial tasks

- **Severity:** 🟠 High (transitive risk)
- **Category:** overengineering
- **Symptom:** `lodash`, `date-fns`, `axios`, etc. added for a handful of lines that could be inlined.
- **Root cause:** agent reaches for a familiar library.
- **Detection cue:** `package.json` change in a PR with no prior approval to add dependencies.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §9 — explicit approval required for new packages.

### #32 — Building a generic system for a one-off problem

- **Severity:** 🟡 Medium
- **Category:** overengineering
- **Symptom:** "Plugin architecture" / "config-driven X" introduced for a single villa setting.
- **Root cause:** agent over-anticipating future flexibility.
- **Detection cue:** new abstraction with one consumer; lots of config, little behavior.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §3 — no architecture redesign without approval.

### #33 — Adding tests "while we're here"

- **Severity:** 🟡 Medium
- **Category:** overengineering
- **Symptom:** new test infrastructure (Jest config, fixture builders) added in a feature PR.
- **Root cause:** agent assumed the project has a test culture; it does not.
- **Detection cue:** test framework files in a feature PR.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §2 minimal-diff. If tests are wanted, request as separate task.

### #34 — Adding logging libraries for a missing log line

- **Severity:** 🟡 Medium
- **Category:** overengineering
- **Symptom:** `pino` / `winston` / `debug` introduced where `console.log` would do.
- **Root cause:** "we should have proper logging" reflex.
- **Detection cue:** new logging dep + a single consumer.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §9.

---

## I. Parallel-agent conflicts

### #35 — Two agents on the same file

- **Severity:** 🔴 Critical (silent overwrite)
- **Category:** parallelization
- **Symptom:** PR-A and PR-B both modify `app/admin/bookings/page.tsx`; merging A first makes B's merge silently drop A's changes (or vice versa).
- **Root cause:** parallel dispatch without checking file overlap.
- **Detection cue:** two open PRs touching identical files; identical sections being rewritten.
- **Mitigation rule:** [/docs/archive/AI_WORKFLOW.md](../archive/AI_WORKFLOW.md) §5.3 — never parallelize same-file edits.

### #36 — Implementation + refactor on the same surface in parallel

- **Severity:** 🟠 High
- **Category:** parallelization
- **Symptom:** one agent adds a feature; another agent renames the helpers the first relies on.
- **Root cause:** agents do not coordinate; the human dispatched both without checking.
- **Detection cue:** one PR's tests fail because of another PR's refactor.
- **Mitigation rule:** [/docs/archive/AI_WORKFLOW.md](../archive/AI_WORKFLOW.md) §5.3 — never parallelize implementation + refactor on the same surface.

### #37 — Merge order assumption

- **Severity:** 🟡 Medium
- **Category:** parallelization
- **Symptom:** agent A produces work that depends on agent B's PR being merged first; B merges later or not at all.
- **Root cause:** unstated dependency between two parallel runs.
- **Detection cue:** PR description references "after #N is merged"; the human merges out of order.
- **Mitigation rule:** [/docs/archive/AI_WORKFLOW.md](../archive/AI_WORKFLOW.md) §5.4 — if in doubt, serialize.

### #38 — Same-surface audit + edit run together

- **Severity:** 🟡 Medium
- **Category:** parallelization
- **Symptom:** read-only audit agent and implementation agent both running on the same surface; audit's findings are stale by the time it reports.
- **Root cause:** audit is meant to land first to inform implementation, but they were dispatched in parallel.
- **Detection cue:** audit references code that no longer exists by the time the human reads it.
- **Mitigation rule:** Audit-only first, implementation second. Phase 16 mandates this — see [/PHASE_16_PLAN.md](../../PHASE_16_PLAN.md) §"Suggested first audit for 16A".

---

## J. Date / time pitfalls

### #39 — Parsing stay dates with `new Date()`

- **Severity:** 🔴 Critical (off-by-one stays)
- **Category:** drift / locked-system
- **Symptom:** `new Date(booking.check_in)` shifts dates by ±1 depending on runtime timezone.
- **Root cause:** agent treats date-only strings like ISO timestamps.
- **Detection cue:** any `new Date(<thing that is a YYYY-MM-DD>)` near booking flow code.
- **Mitigation rule:** [/docs/system/AGENT_RULES.md](../system/AGENT_RULES.md) §10 + [/docs/system/PROJECT_STATE.md](../system/PROJECT_STATE.md) "Time/date discipline".
- **Narrative:** [SESSION_LESSONS.md](../archive/SESSION_LESSONS.md) §3.5 + §6.3.

### #40 — Using local time for weekend/seasonal logic

- **Severity:** 🟠 High
- **Category:** drift
- **Symptom:** weekend detection drifts depending on runtime timezone.
- **Root cause:** Phase 8 known limitation — weekend logic uses UTC, not Asia/Beirut. Don't change to local without scope.
- **Detection cue:** new `getDay()` calls in pricing/seasonal code without UTC discipline.
- **Mitigation rule:** [/PROJECT_STATE.md](../../PROJECT_STATE.md) "Phase 8 known limitations".

---

## How to add a new pattern

1. **Pick the right category** (A–J above) and append in numerical order.
2. **Keep rows short.** Long explanations belong in [/docs/archive/SESSION_LESSONS.md](../archive/SESSION_LESSONS.md).
3. **Always link the mitigation rule** — agents should be able to navigate from "I almost did this" to "the rule that says don't".
4. **Never delete a row.** Reverse "no longer applies" rationale: add a follow-up note instead.
5. **Severity is for triage, not blame.** Use it to help the human decide PR-block-vs-comment.
