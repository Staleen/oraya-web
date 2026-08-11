# Phase 16B — session migration prompt (2026-08-11)

Paste the block below into a fresh session to continue without restarting. It carries state only — the permanent Project Instructions are not repeated here.

---

```
Continue Oraya Phase 16B. Do not restart, do not re-audit what is already recorded below, and do not convert discussion into implementation without my explicit approval.

# Active objective
Finish the money → confirmation → guest-notification chain, per
/docs/system/PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md.
Dispatchable agent prompts for M1–M5 are already written in
/docs/system/PHASE_16B_M1_M5_AGENT_PROMPTS.md.

# Repo state
- master @ 7604a1f. PR #136 (Cursor Ops-payments handover doc) is MERGED.
- PRs #128–#135 merged: plaintext /pts/v2/payments fix, success redirect, one-click card refund,
  production Ops Payments desk, search/purge/dismiss, settle-protect immutability hotfix.
- Unpushed local branch `claude/phase-16b-money-confirmation-audit` (commit e11ca91) contains the
  audit + mission doc. Two further docs were written but not yet committed:
  PHASE_16B_M1_M5_AGENT_PROMPTS.md and this file.
- The old PHASE_16B_OPS_PAYMENTS_PRODUCTION_MISSION.md is CLOSED — every P0/P1/P2 item is done.

# CRITICAL environment fact
The checkout at C:\Users\David\Documents\Codex\2026-08-07\...\oraya-web-phase16b has a CORRUPTED
working tree: files on disk are older than its own HEAD (lib/payments/credit-libanais.ts lacks
exports that HEAD exports; 20+ files show phantom modifications), because the filesystem denies
git's unlink. Do not build, test, or dispatch agents from it. Use a fresh
`git clone https://github.com/Staleen/oraya-web.git` + `npm ci`.

# Audit findings — confirmed, do not re-derive
Confirmation and money are two halves that never call each other.
- Confirmation writers: app/api/ops/bookings/[id], app/api/admin/bookings/[id], app/api/booking-action.
  All three → lib/booking-guest-dispatch.ts → confirmation email + Phase 16C WhatsApp Arrival Guide.
  None of them reads payment_status, amount_paid, or the ledger.
- Money paths: (B1) app/api/payments/unified-checkout-complete — booking's own card link — sends the
  guest NOTHING. (B2) app/api/payments/requests/unified-checkout-complete — receipt only if the
  payment request has a booking_id. (B3) app/api/ops/payments/transactions — manual receipt, sends a
  receipt. (B4) the CyberSource webhook handler — sends nobody anything, ever.
- Live 2026-08-11: 20 bookings confirmed + unpaid, 3 of which had already received the Arrival Guide
  WhatsApp having paid $0. Two rows are paid_in_full with amount_total NULL (legacy).
- Verdict: money layer safe, confirmation layer safe, the connection between them is missing.
- Correct and deliberate — keep: confirmation is an availability decision, not a money event.

# Verified on live Supabase (nxsdgjtqrhturlojtjlb, read-only, 2026-08-11)
- sql/phase-16b-provider-refund-settle-protect.sql IS ALREADY APPLIED. Do not re-run it.
- All four refund RPCs exist (claim / confirm / fail / record).
- One pending refund row remains: 2f605db7, idempotency oraya-rfnd-99ba8ae6-msns4glt, $1.00.

# Open operator items (mine, not an agent's)
1. Ops → Resolve refund on 7863958223886680704897 → "No refund in Business Center" →
   note "credit failed 102 DINVALIDDATA" → Release refund lock.
2. Business Center: Authorization Reversal (void) on 7863969294066269704890 and
   7863958223886680704897. Not Settle, not Refund. Claude must not perform this — it moves money.
3. Ops: clear both attention attempts via "No charge in BC" with the void note.
4. NetCommerce: escalate Decision Manager reject 481 on merchant 06385000.

# Exact next expected action
Dispatch M1 (void / auth-reversal + reason 481 classification) from
/docs/system/PHASE_16B_M1_M5_AGENT_PROMPTS.md to a coding agent, from a FRESH clone.
Then M2 → M4 → M5, strictly one at a time; M1 and M2 both touch lib/payments/ and must never run
in parallel.

# Unapproved — do not treat as decided
Apple Pay enrollment. Auto-reconcile via the Business Center transaction-search API. Guest /pay
redesign. Any Phase 15 surface. Phase 16D PIN pool. Turning payment_gated_arrival_guide on before
M4 ships and I decide.

# Standing constraints
payments_live_enabled stays OFF outside an approved window. Feature branches only, never master.
Claim-before-provider; unknown outcomes → ambiguous/reconciliation, never auto-retried.
Reverse ≠ refund. Never destroy ledger history. Migrations additive and human-run — paste any SQL
in full inline, never a path alone. No secrets or PAN anywhere. Business Center is the source of
truth for whether money moved; the Oraya ledger follows it.

Verify every technical claim above against current /docs/system/ before acting on it.
```

---

## Companion files a new session should be given

| File | Why |
|---|---|
| `docs/system/PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md` | The audit and the M0–M6 plan |
| `docs/system/PHASE_16B_M1_M5_AGENT_PROMPTS.md` | Ready-to-paste agent prompts |
| `docs/system/PHASE_16B_OPS_PAYMENTS_SESSION_HANDOVER.md` | Cursor's PR #128–#135 arc and CyberSource findings |
| `docs/system/PHASE_16B_CARD_PRODUCTION_ACTIVATION_MISSION.md` | Steps 5–7 still open |
| `docs/system/AGENT_RULES.md` | Mandatory behaviour + final-report format |

## Commit these three docs

They are new files, safe to add even from a checkout whose tracked files are stale:

```bash
git add docs/system/PHASE_16B_MONEY_TO_CONFIRMATION_AUDIT_AND_MISSION.md \
        docs/system/PHASE_16B_M1_M5_AGENT_PROMPTS.md \
        docs/system/PHASE_16B_SESSION_MIGRATION_2026-08-11.md
git commit -m "Docs: Phase 16B money-to-confirmation audit, M1-M5 agent prompts, session migration"
git push -u origin claude/phase-16b-money-confirmation-audit
```

Then open the PR against `master` and squash-merge — docs only, no behaviour change.
