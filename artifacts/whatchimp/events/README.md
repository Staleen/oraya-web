# Oraya Event Quick Intake v6 — WhatChimp event flow

Minimal revision of the existing WhatChimp event flow export. **Documentation + WhatChimp export artifacts only — no app/backend code, no API, no schema, no secret changes.**

## Files

| File | Role |
|---|---|
| `Oraya_Event_Request_Short_Flow.original-export.txt` | **Preserved original** export (`whatsapp-bot_1833876_20260708221039.txt`), byte-identical backup. SHA-256 `71dcf24eebab69c77db2d42d3a600d6d44badcaaf78594d47d64e98b44b8d558`. Do not edit. |
| `Oraya_Event_Quick_Intake_v6.txt` | **Revised, importable** event flow. Import this into a WhatChimp **test copy** first. |

## What the revised bot does

A fast, three-field qualifier that always hands off to the website event inquiry surface. It does **not** duplicate the website inquiry flow.

1. **Event type** — multiple-choice (`questionType: "multiple"`, → `oraya_event_type`, field `58466`).
   The 9 choices are the canonical types from `lib/event-types.ts` `CANONICAL_EVENT_TYPES`:
   Private Celebration · Gender Reveal · Baptism / First Communion · Wedding / Engagement ·
   Graduation Celebration · Family Gathering / Reunion · Dinner Event · Wellness Retreat · Corporate Event.
2. **Preferred villa** — Mechmech / Byblos multiple-choice (→ `oraya_event_villa`, field `58464`)
3. **Approx. attendees** — multiple-choice (`questionType: "multiple"`, → `oraya_event_guest_count`, field `58474`).
   Choices: 5 guests · 10 guests · 15 guests · 20 guests · 25+ guests. Stored as the label text
   (`replyType: "Text"`, since "25+ guests" is not a bare number).

All three qualifying questions are tap-to-select — there is no free typing or numeric input in this flow.
4. Existing **Event Lead Submit** HTTP API (integration `7074`) fires — unchanged.
5. **Summary + handoff** message echoes the three fields and sends the guest to
   `https://stayoraya.com/events/inquiry`, stating this is an inquiry, not a confirmed booking.

### No longer asked (removed nodes)

- Event **date** (node 3, `oraya_event_date_text`) — the guest chooses the date on the website.
- **Full name** / contact details (node 6, `oraya_full_name`).
- **Special requests / setup / services** (node 9, `oraya_event_special_requests`).

There was never an "overnight hosts" or add-ons/catering question in this export; none was added.

### Handoff URL — canonical (non-www) on purpose

The guest-facing link is **`https://stayoraya.com/events/inquiry`** (no `www`). The canonical Oraya
web origin is `https://stayoraya.com`; `www.stayoraya.com` is reserved for WhatChimp **server-to-server
HTTP API** calls only and must never be given to a guest (see
`docs/system/BUTLER_PLAYBOOK.md` "Canonical Oraya web origin" and `KNOWN_BUGS.md` #11). The task brief's
example copy showed `www.stayoraya.com/events/inquiry`; this was changed to the non-www canonical host
to comply with that rule and the task's own acceptance criterion #8 ("canonical domain stayoraya.com only").

## Labels

Kept on the trigger + input-flow nodes: `oraya_lead_event`, `oraya_high_intent`, `oraya_pending_followup`.
Removed: `oraya_needs_human` (327896) and `oraya_vip_lead` (329639) — a normal event inquiry should not be
auto-flagged VIP or urgent.

## HTTP API 7074 — kept, but verify the request body outside the export

The flow export contains only the **integration ID** (`7074` "Oraya Event Lead Submit - Production"),
never its URL, headers, secret, or request body — those live in WhatChimp's HTTP API settings. The call
node is preserved unchanged. **Operator action:** confirm the `7074` request body does not depend on the
three removed fields (`oraya_event_date_text`, `oraya_full_name`, `oraya_event_special_requests`). If the
body maps them, they will now submit empty (harmless — stored in `whatsapp_leads.raw_payload`), but the
body should be trimmed to the three retained fields for cleanliness. This could not be changed from the
export and requires the WhatChimp UI.

## Main-menu routing (out of scope, documented only)

The Greeting / Main Menu "Plan an Event" choice should route into this revised flow. That wiring lives in
the separate menu flow and was **not** modified here.

## Human test steps

1. Import `Oraya_Event_Quick_Intake_v6.txt` into WhatChimp as a **test copy** (not production).
2. Point the Main Menu "Plan an Event" choice at the test flow.
3. Send: `Birthday at Mechmech for around 20 people.`
4. Confirm all three steps are **tap-to-select** (event type = 9 canonical choices, villa = Mechmech/Byblos,
   attendees = 5/10/15/20/25+ guests) — no free typing or number entry — then it summarizes them and sends
   `https://stayoraya.com/events/inquiry`.
5. Confirm it does **not** ask for event dates, services, add-ons, setup, contact details, or overnight hosts.
6. Confirm it does **not** say the event is confirmed, available, priced, or approved.
