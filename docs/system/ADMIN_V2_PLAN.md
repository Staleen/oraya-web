# Admin v2 — Remediation & Restyle Plan

**Created:** 2026-08-01
**Source:** `docs/system/ADMIN_UI_AUDIT.md` (128 findings: 18 High / 56 Medium / 54 Low)
**Status at plan time:** 32 findings addressed (G1–G9, merged). 96 open: **1 High, 40 Medium, 54 Low**.
**Goal:** finish the audit *and* make the admin stop feeling like old software — as two tracks that do not block each other.

---

## 0. The finding that reframes the restyle

The audit measures correctness. It does not measure why the admin *looks* dated. That was measured separately for this plan:

| Measure | Value |
|---|---|
| Admin code | ~19,650 lines across ~30 components |
| Inline `style={{ … }}` objects | **1,340** |
| Hardcoded hex colors | **262 occurrences, 20+ distinct shades** |
| Constants in `components/admin/theme.ts` | 9 colors, 3 style objects |
| `tailwind.config.ts` | exists, but the admin uses **zero** Tailwind classes |

Among those 262 literals are **six different reds** (`#e07070` ×45, `#f4b3b3`, `#f08b8b`, `#f2a7a7`, `#e78f8f`, `#d9a2a2`) and **six different golds** (`#c5a46d`, `#e2ab5a`, `#f0bd67`, `#e7b66d`, `#c9b27f`, `#d99644`). `theme.ts` defines no success, danger, or warning constant at all, which is why every component invented its own.

**Consequence: there is no design system in the code, so there is nothing to restyle.** Changing the look today means hand-editing 1,340 inline style objects across 30 files. Any "make it look modern" attempt that starts by tweaking colors will stall on contact with this.

This is also *why* it feels old. The visual symptoms the audit happened to catch are all downstream of it:

- **B-22** — letters used as icons: `R` for reset, `x` for close, `C`/`X` in status circles, `>`/`v` for chevrons
- **B-19** — a fake "Sort by: Newest" dropdown, styled to look exactly like the real `<select>` next to it, but inert
- **B-21** — "Confirm booking" rendered as a red destructive gradient, next to a neutral Cancel
- **ME-9** — `CHARCOAL` (#2E2E2E) text on the `#1F2B38` shell: ~1.1:1 contrast, effectively invisible — and it labels the "Approved (show on homepage)" checkbox
- **B-28** — bare `dd/mm/yyyy --:--` datetime inputs with no labels
- **X-8** — the palette duplication above, filed as a Low

Fixing those six one at a time is the wrong move. They are symptoms; **V1 + V2 below are the cure**, and they take these out for free.

---

## Track A — Correctness & operations

Finishing the audit. Ordered by operator impact. Each batch is sized for one PR and grouped by shared files so batches don't collide.

### A-tier — do first

**G10 · Provider & shell hygiene** — `AdminDataProvider.tsx`, `theme.ts`
`X-1` `X-2` `X-3` `X-5` `X-6` `X-7`
Highest leverage in the plan. X-1 alone: the provider's global `error` is never cleared on a successful reload, so **one transient poll failure leaves a permanent error banner on every admin page** until a hard refresh. X-2: `setPollingPaused` doesn't cover Realtime refreshes, so the clobbering Remediation 5.2 exists to prevent can still happen. X-3: sign-out is fire-and-forget — the UI says signed out while the 7-day cookie may survive, which matters on a shared machine.

**G11 · Concurrency & money integrity** — `BookingsTable.tsx`, `drafts.ts`, `settings/page.tsx`, `rates/page.tsx`
`B-13` `B-16` `S-8` `R-6`
The only remaining group that can silently lose real data. B-13: `amount_paid` is computed client-side from a snapshot up to 45s stale and written as an absolute value, so two operators recording payments in the same window overwrite each other's ledger. S-8: `payment_public_settings` is one JSON blob written whole — a stale editor overwrites every payment field. R-6: add-on save is two non-atomic POSTs; a second-phase failure leaves the live site serving a new price under old operational rules while the operator is told the save failed.

**G12 · Guest-send disclosure** — `PaymentSection.tsx`, `ProposalSection.tsx`, `AddonRows.tsx`, `BookingsTable.tsx`
`B-8` `B-10` `B-14`
Completes what G3 started. B-10: "Request deposit", "Record payment", "Send reminder", "Send proposal" each email the guest from one unconfirmed click, and only the reminder card says so — the operator believes they are editing a ledger while messaging the guest. B-8: "Approve all add-ons & confirm" approves every add-on *before* the confirm dialog, so choosing Cancel leaves them irreversibly approved.

**G13 · Calendar source management** — new `POST/PATCH/DELETE /api/admin/calendar-sources` + `CalendarSyncPanel.tsx`
`C-2` (the last open High) `C-3` `C-5` `C-6` `C-7` `C-8` **+ new: silent-sync-failure monitoring**
The biggest single build here, because no API exists yet. Today, fixing a rotated Airbnb feed URL or disabling a broken feed **requires running SQL in Supabase by hand**.

> **Correction 2026-08-01 — finding C-1 was withdrawn as false.** External sync does **not** run daily. An external **cron-job.org** job calls `/api/cron/calendar-sync` **every 10 minutes** (documented at `PROJECT_STATE.md:137`, confirmed against the run log). The `vercel.json` daily cron is only a backup, capped at daily by Vercel's Hobby plan. Earlier drafts of this plan repeated the audit's error and framed G13 around 24-hour staleness — that framing is wrong and has been removed.
>
> **The real gap this exposes:** `/api/cron/calendar-sync` returns **HTTP 200 with `ok: true` even when every feed fails** — `sources_failed` is reported in the body, not the status code. So cron-job.org's dashboard shows an unbroken wall of green "200 OK" whether Airbnb's feed loaded or failed 144 times a day. Nobody would notice a dead feed. Two fixes, both belong in G13:
>
> 1. Return a non-2xx status (or a distinct body the scheduler can alarm on) when `sources_failed > 0`, so the external monitor actually monitors something.
> 2. Surface per-source last-success age in the panel with a staleness threshold, so a silently-dead feed is visible in the admin — this is what `C-5` (frozen relative timestamps) currently prevents.
>
> **Single point of failure worth knowing:** the 10-minute schedule lives in a third-party account, not in this repo. If that job is disabled, its free tier lapses, or `CRON_SECRET` is rotated without updating it, sync silently drops to once a day and the only signal is a "last synced" timestamp the panel doesn't currently make legible.

### B-tier — completeness

**G14 · Members** — `M-3` `M-4` `M-5` `M-6` `M-7` `M-8` `M-9`
No search on an ever-growing table (M-4); no member edit anywhere because the API has only DELETE, so a wrong phone number needs SQL (M-6); no booking count shown before a delete that detaches bookings (M-5).

**G15 · Settings** — `S-4` `S-5` `S-6` `S-7` `S-9` `S-10` `S-12` `S-13`
S-4: four save flows have no try/catch — a network failure leaves the button stuck on "Saving..." forever. S-6: the Whish payment rail can be enabled but `whish_number` has no editor, so guests get a rail with no destination. S-7: the gateway readiness panel shows a **false green "Zero missing requirements"** while loading or after a failed fetch. S-10: the sitewide WhatsApp number accepts any string including empty, then confirms "Saved".

**G16 · Rates & media** — `R-5` `R-7` `R-8` `R-9` `R-10`–`R-15` `ME-3` `ME-4` `ME-6` `ME-7` `ME-8`
R-7: add-on Remove has no confirmation and becomes a permanent DB delete on Save. R-5: helper text still claims percentage pricing is inert metadata while it reprices live guest quotes. ME-6: media reorder is HTML5 drag-only, so **cover images cannot be changed from a phone at all**.

**G17 · Leads** — `L-2` `L-5` `L-7`–`L-15`
L-2: the leads list never refreshes — new WhatsApp leads arriving during a shift are invisible until a full browser reload. L-5: the guest's raw date words are hidden whenever the normalizer produced something, so a mis-normalized date can't be checked against what the guest actually typed.

### C-tier — polish

**G18 · Bookings polish** — `B-9` `B-15` `B-17` `B-18` `B-20` `B-23` `B-24` `B-26` `B-27` `B-29` `B-30` `B-31`
**G19 · Dashboard polish** — `D-1` `D-7` `D-8` `D-9` `D-10` `D-11` `D-12` `D-13` `D-14`
**G20 · Login** — `A-1` `A-2` `A-3` (A-1: a rate-limited operator typing the *correct* password is told it's wrong)

> **Deferred into Track B, not fixed here:** `B-19` `B-21` `B-22` `B-25` `B-28` `ME-9` `ME-10` `R-12` `X-4` `X-8` `L-15`. These are visual or layout findings. Fixing them in inline styles now means doing the work twice.

---

## Track B — The v2 look

Runs in parallel with Track A. V1 and V2 are prerequisites for everything after them — do not start V3 before they land.

### V1 · Design tokens
Replace the 9-constant `theme.ts` with a real token set: color roles (surface, border, text-primary/secondary/muted, **success / danger / warning / info** — currently absent), a spacing scale, a type scale, radii, elevation, and one breakpoint constant. Collapse the six reds to one danger role and the six golds to a gold ramp. Closes **X-8**.

Decision needed: keep inline styles bound to tokens, or adopt the CSS variables already used on the guest side (`DESIGN_SYSTEM.md`). The guest site has a real token layer; the admin never got one. Reusing it is the cheaper path and makes the two halves of the product look related.

### V2 · Primitives
Build the component layer the admin never had: `Button` (primary/secondary/danger/ghost), `Badge`, `Card`, `Field` (label + input + error, closing **B-28**), `Table`, `Modal` (with Escape + focus trap, closing **D-13** and **L-12**), `EmptyState`, `Banner`. This is where the 1,340 inline style objects collapse. Add a small icon set — closing **B-22**.

### V3 · Migrate page by page
Onto V1+V2, in Track A's order so batches don't fight: shell → dashboard → bookings → leads → the rest. Each page's visual findings die on contact: **B-19** (delete the fake dropdown), **B-21** (Confirm stops being red), **ME-9** (invisible checkbox label), **R-12** (error borders surviving blur), **ME-10** (unstable row key stealing focus every keystroke).

### V4 · Responsive
One shared `useIsMobile` hook (matchMedia + listener) replacing the non-reactive `window.innerWidth` read repeated across **seven** components at two different breakpoints — closes **X-4**, plus **B-25**, **ME-6**, **L-15**. Right now a phone can render the desktop layout on first paint and rotating the device leaves the wrong layout until unrelated state changes.

### V5 · The actual aesthetic
Only now: density, typographic hierarchy, spacing rhythm, motion, empty-state illustration. This is the step that answers "it feels like old software" — and it's cheap once V1–V4 exist, because it becomes editing tokens instead of 1,340 style objects.

---

## Sequencing

```
Track A:  G10 → G11 → G12 → G13 → G14 → G15 → G16 → G17 → G18 → G19 → G20
Track B:  V1 → V2 ─────────────→ V3 (follows A's page order) → V4 → V5
```

Do **G10 and V1 first**, in that order or together — G10 removes the permanent false error banner, V1 unblocks everything visual. They touch the same file (`theme.ts`) and should land as one PR or back-to-back.

## Ground rules for the coding agents

1. One batch per PR, named for its G/V number. Never mix Track A and Track B in a PR except G10+V1.
2. Update `docs/system/ADMIN_UI_AUDIT.md` status lines in the same PR that fixes a finding — that file is the source of truth for what's done.
3. State explicitly in the commit body when a change is display-only vs. mutation-behavior, as G2–G9 did.
4. Never commit a file with a credential in its name or contents.
5. Guest-facing pricing and quote computation stay untouched unless the finding is specifically about them.
