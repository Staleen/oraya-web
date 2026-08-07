# Native WhatsApp Flow "Stay Request" — canonical artifacts (Phase 16A closeout)

**Flow "Stay Request" = WhatChimp Flow ID `40377`, published and immutable.** Meta-published
Flows cannot be edited in place; any change requires creating a v2 Flow and re-importing.
**The JSON in this folder is the canonical source for any future v2 re-import.**

Production cutover: 2026-07-31 (see [DECISIONS_LOG.md](../../../docs/system/DECISIONS_LOG.md)
entries 2026-07-31 and 2026-08-02, and
[PHASE_16A_NATIVE_WHATSAPP_FLOW_AUDIT.md](../../../docs/system/PHASE_16A_NATIVE_WHATSAPP_FLOW_AUDIT.md)).

## Files

| File | What it is |
|---|---|
| `oraya-stay-request-whatchimp-v4.json` | **Canonical Flow JSON (v4)** actually published as Flow `40377`. Single terminal `STAY_DETAILS` screen (Flow JSON `version: "7.3"`) with embedded banner image, full name, DatePicker check-in/check-out, villa, exact guests (`1`–`8` + `more_than_8`), bedrooms (`1`–`3`), optional requests. This file — not the two-screen draft in the audit doc — is the re-import source for any future v2. |
| `whatsappbot_oraya_book_a_stay_v7.txt` | **v7 bot-flow export** ("Oraya Book a Stay v7 - Native Flow"): Start Bot Flow node carrying v6's 90 trigger phrases verbatim (English / Arabic / Arabizi / French) → WhatsApp Flow node launching Flow `40377` with the guest-facing wrapper message. |
| `whatsappbot_stay_form_launcher_export.txt` | **"stay form" launcher export**: the permanent private test entrance. Exact keyword `stay form` → the same WhatsApp Flow node / wrapper launching Flow `40377`. |
| `whatsappbot_stay_handoff_reply.txt` | **Post-submit handoff reply export** ("Stay Request - Website Handoff", internal trigger `orayainternalhandoffreply2026`): sends the secure `#oraya_prefill_url#` continuation with the static `https://stayoraya.com/book` fallback. |
| `oraya-flow-banner.png` | Banner image used at the top of the Flow (also embedded base64 inside the canonical JSON). |

## Caveats

- **Wrapper copy in these exports predates the 2026-08-01 funnel hardening.** The v7 and
  launcher exports still show the original wrapper containing the direct-booking link. On
  2026-08-01 the live wrapper was rewritten with a "Book now" button and the direct link was
  removed from the wrapper (the fallback link now lives only in the post-submit handoff
  reply). The live WhatChimp tenant is authoritative for current wrapper copy. The wrapper
  text is duplicated in THREE tenant locations that must always change together: the v7
  flow, the greeting-menu node, and the "stay form" launcher.
- **The archived v6 full export is intentionally NOT in this folder.** The operator's v6
  full export contains a live `X-Butler-Secret` value and must never be committed. v6
  remains intact on the tenant (triggers cleared) as the rollback path; the closest in-repo
  v6 topology reference is the tracked round-trip re-exports in
  [`../roundtrips/`](../roundtrips/).
- No file in this folder contains a secret (verified before commit).
