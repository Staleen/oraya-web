# Open Questions — Phase 16C Guest Welcome Guide

**Updated:** 2026-06-07 — final confirmation set applied. Guide has no major content-blocking open items.

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
| Image policy | Approach | Concept images with discreet "Concept image — replace with approved final image." label |

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

| Item | What is needed |
|------|---------------|
| Diesel stove pricing | If Oraya wants to publish the additional diesel charge, confirm the amount or rate |
| Late checkout pricing | If Oraya wants to publish discounted late-checkout or night-checkout rates, confirm the amounts |
| Final image approval | Current images are concept images and must be replaced with approved villa photography before any guest distribution |

---

## Future production integration

These are not content questions. They are technical tasks required to move from design prototype to live guest product.

| Integration item | Notes |
|-----------------|-------|
| Booking data personalization | In production, guest name, villa name, stay dates, and booking reference are sourced from the booking row and injected into the guide. The prototype uses static placeholders. |
| Per-villa PDF generation | Each stay requires a correctly composed 7-page PDF: the correct Page 3 variant (Byblos or Mechmech), guest-specific data, and the booking QR code. Tooling TBD (e.g. Puppeteer, print-on-demand). |
| Villa variant selection | Production must ensure the Byblos PDF contains Page 3A and the Mechmech PDF contains Page 3B. Both are included in the prototype for review. |
| QR code generation | Navigation QR (Maps link) and booking-view QR must be generated per stay. Maps links are confirmed. Booking-view link is already live at `/booking/view/[token]`. |
| Guest portal integration | If the digital guide is served as a web page, it requires a signed guest-facing route (e.g. `/guest/guide/[token]`) and booking-row hydration. |
| Access-code (PIN) delivery — Phase 16D | Gate and front-door PINs are delivered via a separate, confirmed-guest secure channel. This is Phase 16D scope — not part of this static prototype. |
| Digital guide delivery channel | How and when the digital guide URL reaches the guest (WhatsApp butler, email, or both) is a Phase 16D+ workflow decision. |
