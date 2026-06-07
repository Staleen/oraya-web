# Phase 16C — Guest Welcome Guide Design Prototype

## Concept: The Compendium

The Compendium is a two-mode guest welcome system for Oraya villa stays:

1. **Digital guide** — a mobile-first journey rail sent to the guest before they travel. Eight sequential steps walk the guest from pre-departure through checkout. No app required; opens in any browser.

2. **Printed in-villa manual** — a physical A5 booklet kept inside the villa. Seven pages. Print-ready via browser File → Print. Covers the same journey in print-optimised layout with more detail for reference during the stay.

Both modes live in a single HTML file. The print media query hides the digital guide and renders only the print pages when the user prints, at true A5 dimensions.

---

## Why The Compendium was selected

Direction 2 was selected over the two alternatives because:

- It separates the digital arrival experience (time-sensitive, phone-first, step-by-step) from the in-villa reference guide (unhurried, comprehensive, print-friendly).
- The journey rail is purpose-built for sequential arrival — it is not a generic FAQ or navigation menu.
- The A5 manual fits the physical villa environment: a guest who is cooking, managing the pool, or preparing to check out can pick up the booklet without reaching for a phone.
- Airbnb's digital arrival guide structure was used as **product-logic inspiration only** — the visual execution is Oraya: Playfair Display, gold accents, charcoal text, generous white space.

---

## File structure

```
docs/design/phase-16c/welcome-guide/
├── README.md                         ← this file
├── oraya-guest-welcome-guide.html    ← prototype (digital guide + print manual)
├── oraya-guest-welcome-guide.css     ← all styles; no external CSS dependencies
├── CONTENT_MATRIX.md                 ← content status per block
└── OPEN_QUESTIONS.md                 ← items requiring David's input before production
```

---

## How to review this prototype

**In a browser:**
1. Open `oraya-guest-welcome-guide.html` in Chrome, Safari, or Firefox.
2. Resize to ~390px wide to see the mobile digital guide.
3. Resize to 1024px+ to see the desktop layout.
4. Scroll down past the digital guide to reach the print manual preview section.

**Print preview:**
1. Open the file in a browser.
2. File → Print (or Ctrl+P / Cmd+P).
3. The digital guide disappears; the print manual renders as A5 pages.
4. Set paper size to A5, margins to default or none.

---

## Placeholder policy

Every piece of operational content in this prototype is classified one of three ways, marked with coloured badges:

| Badge | Meaning |
|-------|---------|
| **Confirmed** | Fact is verifiable from public sources (e.g. Lebanese emergency numbers) |
| **Placeholder** | A real value exists but has not been provided yet (e.g. Wi-Fi credentials) |
| **Requires David Confirmation** | No value has been provided and none has been assumed |

**Nothing has been invented.** No Wi-Fi credentials, GPS coordinates, phone numbers, checkout times, parking instructions, house rules, or operational procedures appear unless they are clearly marked as placeholders or require confirmation.

See `OPEN_QUESTIONS.md` for the full list of items blocked on David's input.

---

## What is not production-ready

- All image placeholder areas require real villa photography (correctly matched to their context — kitchen → kitchen, BBQ → BBQ, pool → pool).
- All items marked "Requires David Confirmation" must be resolved before any copy is shown to a guest.
- Placeholder items (Wi-Fi, PINs, guest name, dates, address) are populated dynamically in the production version — this prototype uses static placeholder strings.
- The digital guide has no backend. In production, the guest-specific URL includes a signed token; the page hydrates from the booking row.
- Page 3 exists in two variants (Byblos / Mechmech). Only the correct variant is printed per stay. The switching logic is not automated in this prototype — it is managed at print time.
- No push notifications, no offline-mode service worker, and no WhatsApp integration are implemented in this prototype.

---

## Branch and scope

This prototype lives in `/docs/design/` and is a **static design artifact only**. It does not touch any production route, API, database schema, authentication system, or existing page. It is safe to open, review, and print without affecting any running system.

Branch: `claude/optimistic-mcnulty-5e085f`
