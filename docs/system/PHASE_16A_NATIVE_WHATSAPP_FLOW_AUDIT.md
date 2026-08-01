# Phase 16A — Meta-native WhatsApp Flow architecture audit

**Date:** 2026-07-30

**Scope:** documentation/read-only audit only

**Recommendation:** **Proceed after external verification.** The Oraya lead contract can ingest the requested stay fields without a backend or schema change, and it already returns the secure `prefill_url`. The smallest production path is nevertheless gated on two WhatChimp tenant capabilities that the repository and public documentation do not prove: attaching/launching the existing Meta-owned Flow ID, and forwarding the complete submission to the existing authenticated Lead Submit integration while retaining `prefill_url` for the next WhatsApp reply.

This audit does not approve or publish a Flow. It does not change the locked Book a Stay v6 flow. It treats the proposed Meta-native flow as a parallel candidate until the end-to-end tests below pass.

## Executive conclusion

1. `POST /api/butler/lead` already accepts full name, normalized check-in/check-out, villa, exact guest count, and special requests. Bedroom count is accepted and retained in `raw_payload`, which is exactly where the existing `/api/butler/prefill` reader expects it.
2. The endpoint already returns `{ ok, lead_id, message, prefill_url }`. No new Oraya response field is needed to send the existing secure website handoff.
3. The secure `/book?h=...` hydration currently includes villa, dates, sleeping guests, bedroom count, and full name. It does **not** hydrate special requests. The requests are still persisted on the lead, but the guest would have to re-enter them on `/book` unless a separately approved backend/UI change is made.
4. A static Meta Flow does not require a Meta Flow data endpoint. On terminal `complete`, the submitted payload returns as an inbound Flow reply (`interactive.nfm_reply.response_json`) to the webhook owner for the WhatsApp Business Account.
5. WhatChimp documents a webhook fired on Flow submission and an HTTP API option for WhatChimp-created Flow forms. That is evidence that WhatChimp can receive and forward form data in general. It is **not** evidence that this Oraya tenant can select a Flow created directly in Meta by existing Flow ID, add the required `X-Butler-Secret` header, transform the payload, consume Oraya's response, and use `prefill_url` in the continuing conversation.
6. Until those points are verified in the live tenant using a disposable trigger and test contact, the direct-Meta webhook path would require new webhook ownership, routes, secrets, Graph subscription/configuration, replay/idempotency handling, and an outbound sender. That is materially larger and is not recommended for the first implementation.

## Sources and evidence standard

### Repository evidence

- Butler lead route and response: [`app/api/butler/lead/route.ts`](../../app/api/butler/lead/route.ts)
- Lead normalization and accepted aliases: [`lib/butler/leads.ts`](../../lib/butler/leads.ts)
- Secure handoff token: [`lib/butler/prefill-token.ts`](../../lib/butler/prefill-token.ts)
- Public prefill projection: [`app/api/butler/prefill/route.ts`](../../app/api/butler/prefill/route.ts)
- `/book` hydration decisions: [`lib/booking/butler-prefill-hydration.ts`](../../lib/booking/butler-prefill-hydration.ts) and [`app/book/page.tsx`](../../app/book/page.tsx)
- Lead schema evidence: [`sql/phase-16a2e-whatsapp-leads.sql`](../../sql/phase-16a2e-whatsapp-leads.sql)
- v6 field and integration contract: [`docs/system/BUTLER_PLAYBOOK.md`](BUTLER_PLAYBOOK.md), [`scripts/whatchimp/natural-intake-profile.json`](../../scripts/whatchimp/natural-intake-profile.json), and [`artifacts/whatchimp/V6_DEPENDENCIES.md`](../../artifacts/whatchimp/V6_DEPENDENCIES.md)
- Relevant tests: [`lib/butler/leads-absent-dates.test.mts`](../../lib/butler/leads-absent-dates.test.mts), [`lib/butler/prefill-token.test.mts`](../../lib/butler/prefill-token.test.mts), and [`lib/booking/butler-prefill-hydration.test.mts`](../../lib/booking/butler-prefill-hydration.test.mts)

### Current external documentation

- Meta's official WhatsApp Business Platform collection shows a published Flow being launched by `flow_id`, with `flow_message_version`, a business-supplied `flow_token`, `flow_action`, and an optional first-screen payload: [Send Published Flow by ID](https://www.postman.com/meta/whatsapp-business-platform/request/ftdtf2c/send-published-flow-by-id).
- Meta's official Flow tools repository provides static `complete` payload and Flow-response webhook examples: [WhatsApp/WhatsApp-Flows-Tools](https://github.com/WhatsApp/WhatsApp-Flows-Tools), including the [static contact Flow](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/articles/llama-chatbot-flows/contact-us.json) and [Flow webhook example](https://github.com/WhatsApp/WhatsApp-Flows-Tools/blob/main/examples/webhook/nodejs/flows-webhook/server.js).
- Meta's official webhook model sends subscribed events to the configured HTTPS webhook for the WABA: [Webhook Payload Reference](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference).
- Meta's official collection distinguishes message webhooks from Flow data-endpoint encryption/configuration: [WhatsApp Business Platform official workspace](https://www.postman.com/meta/whatsapp-business-platform/overview).
- WhatChimp states that a published Flow can have a submission webhook and that every submission is POSTed to the configured URL: [Webhook for WhatsApp Flows](https://help.whatchimp.com/docs/webhooks/webhook-for-whatsapp-flows).
- WhatChimp's current Flow-form guide documents WhatChimp-created forms, custom-field assignments, an optional HTTP API, post-submit bot reply, report data, and a WhatsApp Flows component: [WhatsApp Flow Forms](https://help.whatchimp.com/docs/bot-manager/whatsapp-flow-forms).

Meta technical claims in this document are limited to those official Meta sources. WhatChimp behavior is classified separately because it is vendor/tenant evidence, not part of Meta's contract.

## Current-state contract audit

### `POST /api/butler/lead`

The route:

- requires `X-Butler-Secret` through `requireButlerAuth`;
- parses one JSON object;
- normalizes it with `normalizeLeadInput`;
- inserts exactly one `whatsapp_leads` row;
- then best-effort mints a two-hour prefill token from the new lead ID;
- returns `prefill_url` as a guest-facing `https://stayoraya.com/book?h=...` URL when `BUTLER_PREFILL_SECRET` is configured;
- still returns a successful lead response with `prefill_url: null` if token generation is unavailable.

The route has no idempotency key or duplicate-submission guard. Calling it twice creates two leads. Parallel rollout must therefore guarantee one terminal submission has exactly one writer.

### Field-to-contract mapping

| Native Flow field | Canonical completion value | Existing `/api/butler/lead` input | Persistence | Secure `/book` hydration | Conclusion |
|---|---|---|---|---|---|
| Full name | non-empty string | `oraya_full_name` (also `full_name` / `name`) | `whatsapp_leads.name` | `full_name` | Supported end-to-end. |
| Check-in | `YYYY-MM-DD` | `normalized_check_in` (also `oraya_check_in` / `check_in`) | `normalized_check_in` date | `check_in` when the complete range is valid | Supported. Keep as a date-only string; never parse guest text with JavaScript `Date`. |
| Check-out | `YYYY-MM-DD` | `normalized_check_out` (also `oraya_check_out` / `check_out`) | `normalized_check_out` date | `check_out` when later than check-in | Supported. Invalid/reversed ranges are sanitized to no prefilled range. |
| Villa | `Villa Mechmech`, `Villa Byblos`, or `flexible` | `oraya_villa` (also `villa`) | `villa` | the two canonical villa labels hydrate; `flexible` intentionally leaves villa unselected | Supported. The approved `flexible` option means “Flexible / recommend for me”; it must not be presented as a selected villa on `/book`. |
| Exact overnight guests | string `"1"` through `"8"`, or `more_than_8` | `oraya_guest_count` (also `guest_count` / `guests`) | `guest_count` text | values 1–8 hydrate `sleeping_guests`; `more_than_8` does not | Supported. Use discrete choices. WhatChimp must route `more_than_8` to human review instead of the standard lead message, mirroring v6. |
| Bedroom selection | string `"1"`, `"2"`, or `"3"` | No dedicated top-level normalized column. Put `oraya_bedroom_count` in `raw_payload` (a top-level field is also retained when the entire body is used as the fallback raw payload). | `raw_payload.oraya_bedroom_count` | `bedroom_count` accepts `1`, `2`, `3` and `"N bedroom(s)"` | Supported without schema change, provided the submission transformation preserves this key inside `raw_payload`. |
| Optional requests | trimmed string or omitted | `oraya_special_requests` (also `special_requests`) | `special_requests` text, capped at 4,000 characters | **Not projected by `/api/butler/prefill` and not applied by `/book`** | Lead capture supported; website hydration gap remains. Do not claim full handoff parity. |
| Request type | `"stay"` | `oraya_request_type` or `request_type` | `request_type` | not guest-hydrated | Set explicitly to protect stay/event separation. |
| Source | `"meta_native_flow"` | `source` | `source` | returned diagnostically | Supported. Do not use the default `"whatchimp"` if rollout reporting must distinguish native Flow leads from v6. |
| Subscriber ID | WhatChimp subscriber ID, if available | `oraya_subscriber_id` or accepted aliases | `whatsapp_subscriber_id` plus raw payload | not guest-hydrated | Recommended for identity continuity; availability depends on WhatChimp's submission context. |
| Flow/session identity | Meta `flow_token`, Flow ID, message/submission identifiers | unknown keys inside `raw_payload` | `raw_payload` | not guest-hydrated | Preserve for audit and duplicate investigation. It is not currently enforced as an idempotency key. |

The source label is set statically in the Flow's completion payload and forwarded verbatim by the WhatChimp adapter; the adapter must not override it.

### Exact adapter body

If WhatChimp can transform the terminal response through the existing Lead Submit HTTP integration, the request body should be:

```json
{
  "source": "<response.source>",
  "request_type": "stay",
  "oraya_full_name": "<response.oraya_full_name>",
  "normalized_check_in": "<response.normalized_check_in>",
  "normalized_check_out": "<response.normalized_check_out>",
  "oraya_villa": "<response.oraya_villa>",
  "oraya_guest_count": "<response.oraya_guest_count>",
  "oraya_special_requests": "<response.oraya_special_requests-or-empty>",
  "oraya_subscriber_id": "<WhatChimp subscriber id when exposed>",
  "oraya_chat_id": "<WhatChimp chat id when exposed>",
  "raw_payload": {
    "oraya_bedroom_count": "<response.oraya_bedroom_count>",
    "flow_id": "<Meta Flow ID>",
    "flow_token": "<response.flow_token>",
    "submission": "<the complete decoded response object>"
  }
}
```

The HTTP integration must call `https://www.stayoraya.com/api/butler/lead` directly, set `Content-Type: application/json`, send the existing `X-Butler-Secret` header without exposing its value, and map response `prefill_url` into the existing `oraya_prefill_url` field. A `3xx` is failure; the repository's documented WhatChimp exception requires the direct `www` API host. The link returned to the guest remains the canonical non-`www` `https://stayoraya.com/book?h=...`.

## Does the lead response contain everything needed?

Yes for the existing completion pattern. The route returns:

```json
{
  "ok": true,
  "lead_id": "<uuid>",
  "message": "Lead received. The Oraya team will review it.",
  "prefill_url": "https://stayoraya.com/book?h=<opaque-token>"
}
```

WhatChimp only needs `prefill_url` to send the established secure continuation. `lead_id` is useful for diagnostics but must not be shown as a booking number. The prefill URL:

- is minted only after the lead insert succeeds;
- has a two-hour TTL;
- identifies a lead, not a booking;
- does not bypass website availability, pricing, add-ons, guest validation, booking creation, or payment;
- may legitimately be `null`, in which case the existing static `https://stayoraya.com/book` fallback remains available.

## How a completed Flow can reach Oraya

### Path A — WhatChimp receives and forwards the submission

```text
Guest opens Meta-owned Flow launched in WhatChimp
  → guest completes terminal review
  → Meta delivers nfm_reply to the WABA channel/webhook owner
  → WhatChimp exposes the decoded submission
  → exactly one WhatChimp HTTP integration calls POST /api/butler/lead
  → Oraya inserts one lead and returns prefill_url
  → WhatChimp sends the existing request-safe confirmation + prefill_url
  → guest continues on /book?h=...
```

**Advantages:** reuses the live Butler secret, lead route, prefill response mapping, conversational continuation, subscriber context, and operator surface. No Oraya route, secret, schema, or dependency change.

**Unresolved:** public WhatChimp documentation proves submission webhooks for WhatChimp-managed flows, but does not prove all of the following for an externally created Meta Flow:

1. it can attach/select the existing Meta Flow ID without recreating ownership;
2. its bot component can launch that Flow ID;
3. it exposes the complete decoded `response_json`, including `flow_token`;
4. it can transform field names and nest `raw_payload`;
5. it can add `X-Butler-Secret` on the submission call;
6. it can consume Oraya's JSON response and place `prefill_url` in a subsequent bot reply;
7. the configured submission webhook and bot HTTP API cannot both fire for one completion.

This is the preferred path only after a live tenant proof.

### Path B — direct Meta messages webhook

```text
Guest completes Flow
  → Meta sends interactive.nfm_reply.response_json to the subscribed app webhook
  → new Oraya webhook verifies Meta and deduplicates the event
  → webhook calls/reuses lead normalization and persists one lead
  → an outbound sender sends the prefill_url and continuation copy
```

Meta's webhook is the protocol-native completion path. The repository currently has no Meta messages-webhook receiver, verification handshake route, WABA/app subscription ownership, Meta verification secret contract, Graph access-token contract, replay/idempotency store, or generic outbound WhatsApp sender.

Therefore this path requires new routes and environment configuration at minimum, plus an idempotency decision. It may also require schema/storage if a durable event claim cannot be safely represented with existing data. It is out of scope for the smallest implementation and must not be improvised inside `/api/butler/lead`.

### Path C — Meta Flow data endpoint

A Flow data endpoint is for `data_exchange`: encrypted calls while the Flow is open, dynamic screen data, business validation, and server-driven navigation. It is not required for a static form whose terminal `complete` payload is delivered through the normal messages webhook.

Using it here would require:

- a new public Flow endpoint;
- Meta business encryption-key registration and private-key custody;
- encrypted request decryption and encrypted response handling;
- endpoint health and error handling;
- a decision about whether lead creation occurs on a terminal data exchange or on the subsequent message webhook;
- deduplication if both surfaces can observe completion.

It should be introduced only if a later requirement truly needs server-side validation or dynamic availability inside the Flow. The approved architecture explicitly keeps availability, pricing, add-ons, booking creation, and payment on the website, so no such requirement exists for the initial native intake.

## Can WhatChimp launch the Meta-owned Flow and expose the payload?

**Not confirmed.**

Meta confirms that any authorized sender can launch a published Flow by its `flow_id`, subject to WABA/phone ownership and permissions. WhatChimp confirms that its own Flow product can launch published forms, store fields, call an HTTP API, send a post-submit reply, and attach submission webhooks. Neither source confirms that this tenant accepts an arbitrary already-created Meta Flow ID or exposes its full response in the exact automation context required here.

Required proof is a screen recording or export from the production tenant showing:

- the WhatsApp Flows component selecting or accepting the supplied Meta Flow ID;
- the Flow's displayed Meta ID and owning WABA;
- a test completion's decoded payload;
- the single downstream integration and its response mapping;
- no second webhook/integration firing for the same completion.

Do not publish, clone, replace, or import the production candidate merely to answer this question. Use a draft/disposable Flow and test bot or vendor support confirmation tied to the Oraya tenant.

## Proposed canonical Flow JSON

The user-supplied candidate JSON was not present in the attachment or repository, so no candidate-specific line-by-line validation was possible. The following is the implementation target to validate in Meta's builder before any publication. It is intentionally static: no `data_api_version`, `endpoint_uri`, availability call, pricing, booking creation, or payment.

The Flow uses a review screen and deterministic choices. Required fields are enforced by components; exact guest/bedroom counts cannot become ranges. The check-out-after-check-in relationship must be verified in Meta's current builder. If the builder cannot enforce a cross-field date expression in a static Flow, retain the review warning and allow the existing lead normalizer to drop a reversed range so `/book` asks for dates again—do not add a data endpoint solely for this first release.

```json
{
  "version": "7.3",
  "routing_model": {
    "STAY_DETAILS": ["STAY_REVIEW"],
    "STAY_REVIEW": []
  },
  "screens": [
    {
      "id": "STAY_DETAILS",
      "title": "Request a private stay",
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "name": "stay_form",
            "children": [
              {
                "type": "TextBody",
                "text": "Share your stay details. This is a request; Oraya will confirm availability personally."
              },
              {
                "type": "TextInput",
                "name": "oraya_full_name",
                "label": "Full name",
                "required": true
              },
              {
                "type": "DatePicker",
                "name": "normalized_check_in",
                "label": "Check-in",
                "required": true
              },
              {
                "type": "DatePicker",
                "name": "normalized_check_out",
                "label": "Check-out",
                "required": true
              },
              {
                "type": "RadioButtonsGroup",
                "name": "oraya_villa",
                "label": "Villa",
                "required": true,
                "data-source": [
                  {
                    "id": "Villa Mechmech",
                    "title": "Villa Mechmech"
                  },
                  {
                    "id": "Villa Byblos",
                    "title": "Villa Byblos"
                  },
                  {
                    "id": "flexible",
                    "title": "Flexible / recommend for me"
                  }
                ]
              },
              {
                "type": "Dropdown",
                "name": "oraya_guest_count",
                "label": "Overnight guests",
                "required": true,
                "data-source": [
                  { "id": "1", "title": "1 guest" },
                  { "id": "2", "title": "2 guests" },
                  { "id": "3", "title": "3 guests" },
                  { "id": "4", "title": "4 guests" },
                  { "id": "5", "title": "5 guests" },
                  { "id": "6", "title": "6 guests" },
                  { "id": "7", "title": "7 guests" },
                  { "id": "8", "title": "8 guests" },
                  { "id": "more_than_8", "title": "More than 8 guests" }
                ]
              },
              {
                "type": "RadioButtonsGroup",
                "name": "oraya_bedroom_count",
                "label": "Bedrooms to prepare",
                "required": true,
                "data-source": [
                  { "id": "1", "title": "1 bedroom" },
                  { "id": "2", "title": "2 bedrooms" },
                  { "id": "3", "title": "3 bedrooms" }
                ]
              },
              {
                "type": "TextArea",
                "name": "oraya_special_requests",
                "label": "Optional requests",
                "required": false
              },
              {
                "type": "Footer",
                "label": "Review request",
                "on-click-action": {
                  "name": "navigate",
                  "next": {
                    "type": "screen",
                    "name": "STAY_REVIEW"
                  },
                  "payload": {
                    "oraya_full_name": "${form.oraya_full_name}",
                    "normalized_check_in": "${form.normalized_check_in}",
                    "normalized_check_out": "${form.normalized_check_out}",
                    "oraya_villa": "${form.oraya_villa}",
                    "oraya_guest_count": "${form.oraya_guest_count}",
                    "oraya_bedroom_count": "${form.oraya_bedroom_count}",
                    "oraya_special_requests": "${form.oraya_special_requests}"
                  }
                }
              }
            ]
          }
        ]
      }
    },
    {
      "id": "STAY_REVIEW",
      "title": "Review your request",
      "terminal": true,
      "data": {
        "oraya_full_name": {
          "type": "string",
          "__example__": "Rana Khoury"
        },
        "normalized_check_in": {
          "type": "string",
          "__example__": "2026-08-10"
        },
        "normalized_check_out": {
          "type": "string",
          "__example__": "2026-08-13"
        },
        "oraya_villa": {
          "type": "string",
          "__example__": "Villa Mechmech"
        },
        "oraya_guest_count": {
          "type": "string",
          "__example__": "4"
        },
        "oraya_bedroom_count": {
          "type": "string",
          "__example__": "2"
        },
        "oraya_special_requests": {
          "type": "string",
          "__example__": "A cot, if available"
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "TextHeading",
            "text": "Please check your stay details"
          },
          {
            "type": "TextBody",
            "text": "Name: ${data.oraya_full_name}\nDates: ${data.normalized_check_in} to ${data.normalized_check_out}\nVilla: ${data.oraya_villa}\nOvernight guests: ${data.oraya_guest_count}\nBedrooms: ${data.oraya_bedroom_count}\nOptional requests: ${data.oraya_special_requests}"
          },
          {
            "type": "TextCaption",
            "text": "Submitting creates a stay request, not a confirmed booking. Oraya will review availability and pricing on the website."
          },
          {
            "type": "Footer",
            "label": "Submit stay request",
            "on-click-action": {
              "name": "complete",
              "payload": {
                "source": "meta_native_flow",
                "request_type": "stay",
                "oraya_full_name": "${data.oraya_full_name}",
                "normalized_check_in": "${data.normalized_check_in}",
                "normalized_check_out": "${data.normalized_check_out}",
                "oraya_villa": "${data.oraya_villa}",
                "oraya_guest_count": "${data.oraya_guest_count}",
                "oraya_bedroom_count": "${data.oraya_bedroom_count}",
                "oraya_special_requests": "${data.oraya_special_requests}"
              }
            }
          }
        ]
      }
    }
  ]
}
```

Implementation validation must use the then-current Meta schema/preview tool. If Meta rejects empty optional interpolation on the review screen, use an explicit `"None"` display value or a conditional review component supported by the current schema; do not make the requests field required merely to satisfy interpolation.

The approved `flexible` villa value is retained on the lead but intentionally does not preselect a villa on `/book`. The approved `more_than_8` guest value must branch in WhatChimp to human review instead of the standard lead message, mirroring v6; it must not be treated as a numeric guest count.

## New route, secret, schema, and dependency assessment

| Candidate path | New Oraya route | New secret/config | Schema change | Dependency | Assessment |
|---|---:|---:|---:|---:|---|
| WhatChimp launches + transforms + calls existing Lead Submit | No | No, reuses existing Butler secret/integration; tenant config changes only | No | No | Smallest and recommended after proof. |
| WhatChimp Flow submission webhook posts directly to `/api/butler/lead` | Probably no route, but only if it supports custom header and compatible body | No new secret if it can send existing header | No | No | Public docs do not prove header, transformation, or response consumption. Verify. |
| Direct Meta messages webhook into Oraya | Yes | Yes: webhook verification/app subscription and outbound Graph credentials/config | Idempotency storage decision required; no safe assumption | Possibly no package, but crypto/HTTP implementation required | Larger follow-up, not initial path. |
| Meta Flow data endpoint | Yes | Yes: business encryption key/private key and endpoint configuration | No necessary schema for the endpoint itself, but completion idempotency still must be solved | Prefer built-ins; exact design requires separate approval | Unnecessary for static intake. |

No schema change or new npm dependency is justified by the approved initial scope.

## Parallel fallback and duplicate prevention

The native Flow must run beside v6 without sharing the same trigger.

### Safe rollout

1. Keep every current v6 trigger, node, integration, field mapping, and Lead Submit path unchanged.
2. Create one **new, narrow pilot trigger/postback** such as an operator-only quick reply or exact phrase `native stay pilot`. Do not add broad triggers such as `book`, `booking`, `stay`, or `reservation`.
3. The pilot trigger launches only the native Flow. It must not also enter v6.
4. The native Flow has exactly one completion writer:
   - either WhatChimp's Flow webhook, or
   - a post-submit HTTP API integration,
   - never both.
5. Give native leads `source = meta_native_flow` so `/admin/leads` and Supabase can distinguish them from v6. The value comes from the Flow completion payload and the adapter forwards it verbatim.
6. Preserve `flow_token` and any message/submission identifier inside `raw_payload` for duplicate investigation.
7. Do not use retry-on-timeout unless the operator can prove the first call did not insert. The current lead route is not idempotent.
8. Send the request-safe completion only after the one Lead Submit call succeeds. If `prefill_url` is null, use the existing static `/book` fallback without retrying the lead insert.

### Cutover after validation

Only after the full matrix passes:

1. export and archive the current production WhatChimp configuration;
2. move one production entry point from v6 to the native Flow;
3. keep v6 published and reachable through a private fallback trigger/postback;
4. monitor lead counts and duplicate `flow_token` values through the agreed observation window;
5. expand traffic gradually.

### Rollback

Rollback is configuration-only:

1. remove/disable the native pilot or production trigger;
2. restore the original v6 trigger/postback from the pre-change export;
3. leave the Meta Flow published but unlaunched, or deprecate it only through a separately approved operator action;
4. do not delete native lead rows; label duplicates and retain them as audit evidence;
5. no code, schema, secret, booking, payment, or token rollback is required on the recommended path.

## Protected behavior and exact implementation scope

### Allowed follow-up implementation

- Construct and validate one static, stay-only Meta Flow from the JSON target above.
- Configure one narrow WhatChimp pilot launcher.
- Map the decoded completion payload into the existing Lead Submit integration.
- Preserve bedroom selection and Flow identifiers in `raw_payload`.
- Map returned `prefill_url` into the existing continuation reply.
- Add test evidence and operator documentation only.

### Must remain untouched

- production Book a Stay v6 and all of its current triggers/integrations until validation passes;
- event handling, which continues directly to `https://stayoraya.com/events/inquiry`;
- `/api/butler/lead`, `/api/butler/prefill`, `/book` hydration, and `/api/bookings`;
- availability, pricing, add-ons, booking creation, payment, email, admin confirmation, auth, token, and calendar systems;
- Guest Identification and confirmed-guest/template automation;
- Supabase schema and npm dependencies.

The initial native Flow must not claim availability, quote final pricing, collect payment, create a booking, or confirm a stay.

## End-to-end test matrix

| Test | Expected result | Evidence to retain |
|---|---|---|
| Meta JSON validation | Draft validates with the current schema; both screens preview; back/edit/review works. | Builder validation output and Flow draft ID (no secrets). |
| Required fields | Empty name/date/villa/guest/bedroom cannot submit. Optional requests may be empty. | Screen recording. |
| Date order | Check-out after check-in succeeds. Same/reversed dates are blocked by the Flow if supported; otherwise Oraya stores no normalized range and `/book` asks for dates again. | Submission payload + lead row. |
| Villa mapping | Both named villa choices persist exact canonical labels and hydrate the correct `/book` villa; `flexible` persists without preselecting a villa. | Three lead rows + three opened handoff URLs. |
| Exact guest count | Every value 1–8 reaches `guest_count` unchanged and hydrates `sleeping_guests`; `more_than_8` routes to human review and is not treated as numeric. | Payload/lead samples for boundaries 1 and 8 plus the overflow transcript. |
| Bedrooms | Values 1–3 persist in `raw_payload.oraya_bedroom_count` and hydrate `/book`. | Payload, lead raw payload, `/book` screenshot. |
| Full name | Name persists to `whatsapp_leads.name` and hydrates guest full name when the field is untouched. | Lead + `/book` screenshot. |
| Optional requests empty | Lead succeeds, no fabricated `"null"` guest request appears. | Lead row. |
| Optional requests populated | Text persists to `whatsapp_leads.special_requests`; `/book` does not hydrate it (known limitation). | Lead row + `/book` screenshot documenting the gap. |
| Single writer | One terminal submission creates exactly one lead and one continuation reply. | Flow token/message ID correlated to one lead ID. |
| Retry/network ambiguity | No automatic second insert; operator can identify ambiguous completion by Flow identifiers. | Logs/lead query. |
| Prefill success | Lead response contains non-null canonical `prefill_url`; link hydrates allowed fields and strips `h` after processing. | WhatChimp mapping + browser recording. |
| Prefill unavailable | One lead still exists; bot sends static `/book` fallback and does not call Lead Submit again. | WhatChimp transcript + lead count. |
| Auth failure | Missing/wrong Butler header fails closed; no lead and no raw server error reaches guest. | Integration test result without secret value. |
| Direct-host rule | Configured API host returns direct `2xx`; no `3xx` accepted. Guest link remains non-`www`. | WhatChimp API test metadata. |
| Event separation | Event phrases still go directly to `/events/inquiry`; native stay Flow never opens. | WhatsApp transcript. |
| Trigger isolation | Pilot phrase opens native Flow only; normal Book a Stay path still opens v6 only. | Two transcripts. |
| v6 regression | Existing v6 readiness smoke test remains fully green. | Completed `PHASE_16A_PRODUCTION_READINESS.md` checklist. |
| Booking authority | Continuing from the native Flow still uses `/book` and the locked `/api/bookings`; Flow completion alone creates no booking/payment. | Lead present before website submit; booking absent until `/book` submit. |
| Rollback | Disabling pilot restores v6 behavior without deployment or data change. | Before/after transcript and exported config. |

## Human inputs and blockers

Required before implementation:

1. Meta Flow ID, Flow status, first-screen ID, owning WABA, and attached phone-number ID—identifiers only, no access tokens.
2. A fresh production WhatChimp export/configuration snapshot showing the current v6 triggers and the Lead Submit integration mapping. Do not commit secret values.
3. Tenant proof or WhatChimp support confirmation that an existing Meta-owned Flow ID can be selected/launched.
4. One captured test submission showing the complete decoded payload and `flow_token`.
5. Confirmation of which single WhatChimp mechanism will call Oraya: Flow webhook **or** HTTP API/post-submit integration.
6. Confirmation that the chosen mechanism can send the existing secret header and map the JSON response `prefill_url` into a follow-up reply.
7. The desired narrow pilot trigger/postback and test phone(s).
8. Meta builder validation result for schema version and the date-order behavior.
9. The operator's acceptance of the known special-requests handoff gap, or a separately scoped approval to extend prefill behavior later.

No secret value should be requested or supplied to an agent.

## Smallest implementation sequence

1. Obtain the external identifiers/evidence above.
2. Validate the canonical static JSON as an unpublished/draft Flow; the received candidate comparison is recorded in Appendix A.
3. In a disposable WhatChimp test bot, prove existing Meta Flow ID launch and full completion-payload access.
4. Prove one authenticated call to the existing Lead Submit integration and response mapping to `oraya_prefill_url`.
5. Run the full matrix with a narrow pilot trigger while v6 remains unchanged.
6. Export the tested WhatChimp configuration and record the exact single-writer design.
7. Launch a small parallel production pilot.
8. Observe duplicates, handoff success, and field parity.
9. Only through a separate approved operator change, move a production intake entry point from v6; retain v6 as immediate rollback.

## Proposed follow-up implementation prompt outline

```text
Objective:
Validate and pilot the approved static Meta-native Oraya stay Flow beside locked v6.

Inputs supplied by human:
- Meta Flow/WABA/phone/first-screen identifiers
- redacted production WhatChimp export
- proof of existing-Flow-ID selection and decoded submission payload
- chosen single submission writer and narrow pilot trigger

Allowed:
- validate/revise the Flow JSON against current Meta schema
- configure an unpublished/draft Meta asset and disposable WhatChimp test bot
- reuse the existing Lead Submit integration and prefill_url mapping
- produce test evidence and operator documentation

Forbidden:
- production v6 edits/removal
- /api/butler/lead, /api/butler/prefill, /book, /api/bookings changes
- Meta data endpoint or direct webhook implementation
- schema/dependency/secret changes
- event, availability, pricing, payment, email, auth, token, calendar changes

Acceptance:
- every test in PHASE_16A_NATIVE_WHATSAPP_FLOW_AUDIT.md passes
- exactly one lead per completion
- secure /book handoff hydrates the supported fields
- known special-requests hydration gap is explicitly accepted
- rollback to v6 is demonstrated
- no Flow is published or production trigger changed without final human approval
```

## Final recommendation

**Proceed after external verification.**

The repository side is ready for a no-code integration: existing lead ingest, persistence, secure handoff generation, and `/book` hydration cover every required structured field except special-requests hydration. There is no justification for `/api/butler/flow-submit`, a Meta data endpoint, schema work, or new dependencies.

Production work is blocked only on platform evidence: confirm that WhatChimp can launch the existing Meta-owned Flow, expose the complete submission, invoke the existing authenticated Lead Submit integration exactly once, and use the returned `prefill_url`. If any of those fail, stop and scope the direct Meta webhook architecture separately rather than quietly expanding this pilot.

## Appendix A — Candidate v3 draft analysis (received after initial audit)

The candidate v3 Flow JSON was received after the initial audit was written. It is a useful starting draft, not a production artifact. The canonical JSON above remains stay-only and incorporates two approved choices from the candidate/v6 behavior:

- villa option `flexible` — **Flexible / recommend for me**; it is retained on the lead and intentionally leaves `/book` without a preselected villa;
- guest option `more_than_8` — **More than 8 guests**; WhatChimp routes it to human review instead of the standard lead message, mirroring v6.

The candidate-to-canonical disposition is:

| # | Candidate v3 finding | Canonical disposition |
|---|---|---|
| 1 | The request-type selector mixes stay and event intake, so an event guest is forced through stay dates, villa, guest count, and preferences. | **Resolved:** the canonical Flow is stay-only. The existing event route continues directly to `https://stayoraya.com/events/inquiry`. |
| 2 | Guest count is unrestricted text. | **Resolved:** the canonical Flow uses discrete values 1–8 plus the approved `more_than_8` human-review branch. |
| 3 | Bedroom selection is missing. | **Resolved:** the canonical Flow requires 1, 2, or 3 bedrooms and preserves the value for the existing prefill reader. |
| 4 | The terminal screen submits preferences without a review/confirmation screen. | **Resolved:** `STAY_REVIEW` echoes the structured request and states that submission is a request, not a confirmed booking. |
| 5 | Check-in and check-out have no proven past-date or cross-field ordering constraint. | **Intentionally not papered over:** current Meta-builder support must be verified before publication. The existing lead normalizer safely drops a reversed range so `/book` asks for dates again; no data endpoint is added solely for this validation. |
| 6 | “Show available add-ons” promises a dynamic list the static Flow does not provide. | **Intentionally dropped:** add-ons remain website-owned and are omitted from the canonical Flow. |
| 7 | The separately produced candidate review recorded `example` schema keys rather than Meta's `__example__` form; the candidate copy later reproduced in the conversation already used `__example__`. | **Resolved:** the canonical JSON consistently uses `__example__`; the live Meta builder remains the validation authority. |
| 8 | `flexible` does not map to either canonical website villa and therefore cannot preselect `/book`. | **Retained intentionally:** it is now an approved option meaning Oraya should recommend; the lead preserves it and `/book` correctly remains unselected. |
| 9 | There is no durable source/`flow_token` provenance strategy. | **Resolved:** the Flow statically emits `source = meta_native_flow`; WhatChimp forwards it verbatim, supplies a launch-time `flow_token`, and preserves the token, Flow ID, and complete decoded submission in `raw_payload`. |
| 10 | Flow JSON version `7.3` and component behavior were not validated against the live Meta builder. | **Intentionally gated:** implementation must validate the canonical draft using the current Meta schema/preview tool before publication; the audit does not claim builder acceptance. |
| 11 | The candidate lacks input helper/error copy and a documented label-length check. | **Intentionally deferred to builder validation:** required fields and concise labels are present in the canonical draft; any schema-supported helper/error copy is added only after the live builder confirms the component contract. |

The candidate's completion payload also did not itself save a lead, generate `prefill_url`, or define a single-writer continuation. That responsibility remains outside Flow JSON: WhatChimp must expose the decoded completion, call the existing authenticated `/api/butler/lead` integration exactly once, and map the returned `prefill_url`. The platform proof remains a hard gate.

## Document provenance

This PR version is the authoritative audit. A separate 247-line, session-produced audit of the same scope exists outside the repository; it informed the candidate comparison above but must not be treated as current or used instead of this file.
