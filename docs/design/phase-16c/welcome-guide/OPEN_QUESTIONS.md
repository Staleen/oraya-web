# Open Questions — Phase 16C Guest Welcome Guide

**Updated:** 2026-06-07 — final confirmation set applied + asset integration + A4 print rebuild. 9 provided images integrated. AI image generation unavailable in this environment — missing slots remain as CSS placeholders with prompts in `IMAGE_PROMPTS.md`.

---

## Closed / Answered by David

The following items were resolved by the 2026-06-07 confirmation set and are now reflected in the prototype.

| Category | Resolved item | Applied value |
|----------|--------------|---------------|
| Checkout | Checkout time | 11:00 AM |
| Checkout | Late checkout wording | "Late checkout may be available on request. Extended checkout, including night checkout, can be arranged at discounted pricing when available and confirmed by Oraya." |
| Location | Villa Byblos display label | Mastita, Jbeil |
| Location | Villa Mechmech display label | Mechmech, Sama |
| Location | Villa Byblos Maps link | https://maps.app.goo.gl/1a1Ybf4o6Qyzy7xh7 |
| Location | Villa Mechmech Maps link | https://maps.app.goo.gl/2A4jAeUKWP8G9GbVA |
| Parking | Confirmed parking wording | "Inside the gate fits two cars comfortably. If you have extra cars, you may park outside the gate." |
| Arrival timing | Late arrival / early arrival | "Late arrival is fine. If you would like to arrive early, please request it in advance so the villa can be prepared accordingly." |
| Access troubleshoot | Gate / PIN / lost access | "If the gate does not open, the PIN does not work, or you cannot access the villa, message Oraya on WhatsApp or call us directly." |
| Support | Concierge model | 24/7. "If you need help at any time, message us on WhatsApp or call us." |
| Support | WhatsApp / Call number | +961 71 140 041 |
| Support | Caretaker mentions | Removed — single support model is Oraya concierge only |
| Wi-Fi | Network (both villas) | ORAYA |
| Wi-Fi | Password (both villas) | Oraya2026 |
| Byblos — AC | Confirmed wording | "Each room has an air conditioner. The controller is mounted on the wall next to the light switch. The units support cooling and heating." |
| Byblos — Hot water | Confirmed wording | Solar-heated tank, heats during day, maintains through night |
| Byblos — Pool | Confirmed wording | "The pool is available for guest use and is maintained before your stay. It is kept covered to help protect it from leaves and insects." Note: not called "heated." |
| Byblos — Pool cover | Confirmed wording | "Remove the pool cover manually before use and place it back after you finish using the pool." |
| Byblos — Kitchen | Confirmed wording | "The kitchen is fully operational and includes a kettle, microwave, gas cooktop, stove, cutlery, and glassware." |
| Byblos — BBQ | Confirmed wording | "The outdoor area includes a functional BBQ/kitchenette section with a barbecue kit. After using the BBQ, make sure it is fully turned off." |
| Byblos — TV | Confirmed wording | "The living room includes one Smart TV." |
| Mechmech — Hot water | Confirmed wording | Labeled switch, approx. 15 minutes during summer |
| Mechmech — Kitchen | Confirmed wording | Same as Byblos |
| Mechmech — BBQ | Confirmed wording | Outside the winter glass room, under roof — barbecue kit, turn off after use |
| Mechmech — TV | Confirmed wording | "The living room includes one Smart TV. The winter room also includes a TV." |
| Mechmech — Heating | Confirmed wording | Heating on before arrival, same switch area as water heater, radiator valves per room |
| Mechmech — Fireplace | Confirmed wording | Traditional Lebanese diesel stove heater, full tank, may charge for additional diesel, oven compartment and warming surface |
| Mechmech — Winter Room | Confirmed wording | "Accessible from the kitchen or from outside. Panoramic glass view, kitchenette, TV, lounge seating." |
| Mechmech — Pool cover | Confirmed wording | Cover both villas, Mechmech-specific: "If the pool is heated for your stay, replacing the cover helps retain heat. If not heated, not required unless instructed by Oraya." |
| Garbage | Confirmed wording | "Every room has a small garbage bin. Each villa has two large garbage cans outside. Please place garbage only in the outdoor garbage cans and not on the street." |
| Bathrooms | Confirmed wording | "Towels and amenities are provided. Hot water is prepared through the villa's heating system. During summer, turn on the labeled switch and allow approximately 15 minutes." |
| Restricted areas | Confirmed wording | "Mechanical, electrical, plumbing, security systems, security cameras, and storage rooms are restricted areas. Please do not access, adjust, or tamper with them." |
| House expectations — Visitors | Confirmed | Up to 20 visitors. Event/celebration options via Oraya. |
| House expectations — Restricted areas | Confirmed | Same as above |
| House expectations — Smoking | Confirmed | "Smoking is allowed. Please smoke responsibly and take care of the property." |
| House expectations — Pool safety | Confirmed | "No diving in the pool." |
| House expectations — Children | Confirmed | "Children and underage guests must be supervised by an adult at all times." |
| House expectations — Property care | Confirmed | "Please treat the villa, furniture, equipment, and outdoor areas with care throughout your stay." |
| Emergency — Police | Confirmed number | 112 |
| Emergency — Red Cross | Confirmed number | 140 |
| Emergency — Removed | Fire (175), Civil Defense (125) not included | Removed per David's instruction |
| Emergency — Medical / pharmacy | Approach | "For nearby medical or pharmacy guidance, contact Oraya Concierge." |
| Emergency — Procedure | Confirmed wording | "Step outside and move away from the danger zone. Once safe, contact the appropriate emergency service and inform Oraya as soon as possible." |
| Image policy | Approach | Concept images with discreet "Concept image" overlay label. 9 provided images integrated. Missing images documented with generation prompts in `IMAGE_PROMPTS.md`. AI image generation is not available in this environment — all missing slots remain as CSS placeholders. |

---

## Still intentionally excluded

These values exist but are not included in the static prototype by design.

| Item | Reason |
|------|--------|
| Real gate PIN | Intentionally hidden sensitive access credential — delivered to guest before arrival via a separate, secure channel (Phase 16D) |
| Real front-door PIN | Same as above |

Placeholders in prototype: `[Gate PIN — provided before arrival]` and `[Front-door PIN — provided before arrival]`.

---

## Still needs a future business decision

These are not blocking prototype review. They require an Oraya decision before appearing in a guest-facing guide.

| # | Item | What is needed |
|---|------|---------------|
| 2 | Diesel stove pricing | If Oraya wants to publish the additional diesel charge, confirm the amount or rate. Currently shown as "may charge for additional diesel" with no figure. |
| 3 | Late / night checkout pricing | If Oraya wants to publish discounted late-checkout or night-checkout rates, confirm the amounts. Currently shown as "discounted pricing when available and confirmed by Oraya" with no figure. |
| 4 | Final image approval | 9 provided concept images are integrated and labeled "Concept image." 10 image slots remain prompt-only (no file yet). Final guest distribution requires either approved villa photography or explicit David approval to use concept images as-is. |

---

## Future production requirements

These are not content questions. They are technical tasks required before this prototype can reach guests.

| # | Item | Notes |
|---|------|-------|
| 1 | PIN delivery (Phase 16D) | Gate and front-door PINs are withheld from the guide by design. Phase 16D will establish the confirmed-guest secure channel for PIN delivery — separate from this guide. |
| 5 | Production PDF generation | Each stay requires a server-generated 7-page PDF (Byblos or Mechmech variant) with guest name, stay dates, booking reference, and QR codes injected. Source files are the print HTML files in this folder. Recommended engine: Puppeteer or equivalent headless Chromium. Browser print is the review fallback only — it is not the production delivery path. See `GUEST_GUIDE_ENGINE_PLAN.md`. |
| 6 | Guest portal integration | The digital guide needs a signed guest-facing route (`/booking/view/[token]/guide`) with booking-row hydration (guest name, villa, dates, ref). No guest portal route exists yet. See `GUEST_GUIDE_ENGINE_PLAN.md`. |
| 7 | Admin preview / download | Admin needs a view at `/admin/bookings/[id]/guide` to preview the guest guide for a specific booking, download the generated PDF, and trigger send. Not yet implemented. See `GUEST_GUIDE_ENGINE_PLAN.md`. |
| 8 | WhatsApp / email send workflow | How and when the guest receives the guide link (WhatsApp butler, email, or both) and who triggers it (auto on confirmation vs. manual admin send) is undecided. See `GUEST_GUIDE_ENGINE_PLAN.md`. |

---

## Future format option

| # | Item | Notes |
|---|------|-------|
| 9 | Optional A5 booklet | An A5 saddle-stitched booklet was considered and deferred. If Oraya wants a premium physical booklet for high-value stays, the A4 print files are the design source. The A5 adaptation would require a new print stylesheet and page layout pass. Not in scope for Phase 16C or 16D. |
