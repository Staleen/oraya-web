# Phase 16 Plan — Canonical General Roadmap

This document is Oraya's canonical forward-looking Phase 16 roadmap. Current implementation truth remains in [/docs/system/PROJECT_STATE.md](docs/system/PROJECT_STATE.md) and [/docs/system/CURRENT_PHASE.md](docs/system/CURRENT_PHASE.md); historical phase detail remains in [/PROJECT_STATE.md](PROJECT_STATE.md) and [/docs/system/DECISIONS_LOG.md](docs/system/DECISIONS_LOG.md).

**Last updated:** 2026-08-09.

This roadmap records business workstream boundaries and status only. A planned phase is **not** implementation authorization. Every materially new Phase 16 workstream still begins with the architecture/audit pass required by [/docs/system/AGENT_RULES.md](docs/system/AGENT_RULES.md) and the non-negotiable constraints in [/docs/system/PROJECT_STATE.md](docs/system/PROJECT_STATE.md).

---

## Canonical domain reminder

The single canonical Oraya web origin is **`https://stayoraya.com`** and only `https://stayoraya.com`. AI Training, WhatChimp Bot Reply, and generic AI assistants must not name another host as an Oraya web property. See [/docs/system/KNOWN_BUGS.md](docs/system/KNOWN_BUGS.md) and [/docs/system/BUTLER_PLAYBOOK.md](docs/system/BUTLER_PLAYBOOK.md).

---

## Consolidated roadmap

| Phase | Workstream | Status | General outcome |
|---|---|---|---|
| **16A** | WhatsApp AI Butler & Guest Identification | ✅ Complete | Native WhatsApp stay intake, secure website handoff, and identity-safe booking support. |
| **16B** | Complete Payment System | 🟡 Active closeout | Oraya's complete payment-request, collection, ledger, reconciliation, refund, and provider-activation system. |
| **16C** | Guest Experience & Arrival Guide | ✅ Complete | House Books, Explore guides, the private personalized Arrival Guide, and approved delivery paths. |
| **16D** | Smart Access & Arrival Automation | ⏳ Planned | Secure guest-access credential lifecycle and arrival automation. |
| **16E** | Guest Operations & Automated Hospitality | ⏳ Planned | The restored operational-messaging layer for coordinated pre-arrival, arrival, stay, and checkout hospitality. |
| **16F** | Membership, Loyalty & CRM | ⏳ Planned | Member benefits, loyalty, recognition, retention, and customer-relationship operations. |
| **16G** | SEO & Organic Growth | ⏳ Planned | Broader search discovery, organic acquisition, and measurable search growth. |
| **16H** | Multilingual & International Guest Experience | ⏳ Planned | A coherent international guest experience across Arabic, French, and English. |
| **16I** | Reputation, Reviews & Guest Retention | ⏳ Planned | Review, feedback, reputation, and repeat-stay lifecycle. |
| **16J** | Revenue & Business Intelligence | ⏳ Planned | Broader commercial, conversion, occupancy, pricing, and profitability intelligence. |

### Cross-phase closeout — Ops migration

The migration from `/admin` to `/ops` is a **cross-phase operational closeout**, not a numbered Phase 16 workstream. Its execution plan, gates, and current batch truth remain in [/docs/system/OPS_MIGRATION_PLAN.md](docs/system/OPS_MIGRATION_PLAN.md). Shipped `/ops` capabilities remain current production truth and are not reclassified as future Phase 16J work.

---

## Status and boundary notes

- **16A is complete for its approved production scope.** Future WhatsApp enhancements require fresh scoped tasks and do not reopen 16A automatically.
- **16B is active closeout, not complete.** NetCommerce/CyberSource is one workstream inside the complete payment system. Provider configuration, evidence, and deliberate activation gates remain authoritative; no method is live merely because it appears in the phase boundary.
- **16C is complete for its approved scope.** Existing House Book, Explore, Arrival Guide, email/manual/WhatChimp delivery work remains 16C history. Smart access and PIN delivery remain excluded and belong to 16D.
- **16E restores the operational-messaging layer.** Earlier roadmap evolution absorbed WhatsApp into the much larger 16A scope and left this hospitality-operations layer unnamed. It is restored as Guest Operations & Automated Hospitality.
- **Membership moved from old 16E to 16F.** Existing member accounts remain shipped truth; the planned loyalty/CRM outcome is broader and is not complete merely because authentication and profiles exist.
- **16G does not erase shipped SEO foundations.** Existing metadata, favicon declarations, `/robots.txt`, and `/sitemap.xml` remain complete technical foundations; 16G is the broader organic-growth workstream.
- **16J does not erase shipped `/ops` metrics.** Existing operational reporting remains live; 16J is the broader future business-intelligence workstream.

---

## Governance for planned phases

- New Phase 16D–16J work requires a fresh approved task and an architecture/audit pass before implementation.
- Do not infer schema, vendors, dependencies, secrets, APIs, or production activation from this roadmap.
- Preserve the locked booking, payment, auth, token, calendar, email, and schema boundaries unless a future approved task explicitly names an exception.
- Update `/docs/system/` and the decision log in the same PR whenever a future phase changes durable behavior, architecture, environment requirements, known risks, or status.
- Historical A–E roadmap text may remain in historical records only when it is clearly marked as superseded by the 2026-08-09 consolidated roadmap decision.

---

## Supersession

This A–J roadmap supersedes the older forward-looking A–E map last recorded in this file on 2026-06-03. Historical delivery records are preserved; their phase names and completion evidence are not deleted. See [/docs/system/DECISIONS_LOG.md](docs/system/DECISIONS_LOG.md), 2026-08-09, "Consolidated Phase 16 roadmap becomes the canonical general roadmap."
