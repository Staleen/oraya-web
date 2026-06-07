# Open Questions — Phase 16C Guest Welcome Guide

Items below are blocked on David's input before the guide can be shown to any guest. Grouped by topic. Nothing has been assumed or invented in the prototype.

---

## 1. Access & Arrival

**Q1.1 — Villa addresses**
What is the full street address of each villa?
- Villa Byblos address: [required]
- Villa Mechmech address: [required]

*Blocks: digital step 2, print p. 1, navigation QR code.*

**Q1.2 — GPS coordinates**
What are the GPS coordinates for each villa? (Needed to generate the navigation QR code and static map image.)
- Villa Byblos: [required]
- Villa Mechmech: [required]

*Blocks: digital step 2, print p. 1 — map and QR.*

**Q1.3 — Parking**
Where should guests park at each villa? How many vehicles fit? Any restrictions (vehicle type, size)?
- Villa Byblos: [required]
- Villa Mechmech: [required]

*Blocks: digital step 4, print p. 2.*

**Q1.4 — Late arrival procedure**
What should a guest do if they arrive late (after a certain hour)? Is there a caretaker on call? Is there an emergency contact for after-hours access issues?

*Blocks: digital step 5 (troubleshoot), print p. 2.*

**Q1.5 — Emergency caretaker contact**
Who should a guest call if they cannot access the villa and cannot reach Oraya via WhatsApp? Name and number.

*Blocks: print p. 2 troubleshoot, print p. 7 emergency contacts.*

---

## 2. Utilities — Villa Byblos

**Q2.1 — AC / Cooling — Byblos**
What type of air conditioning system does Villa Byblos have? Where are the controls / remote? Any thermostat or zone notes a guest should know?

**Q2.2 — Hot water — Byblos**
Is there any warm-up wait time for hot water? Electric or gas? Any notes guests need to know (e.g. boiler reset, limited tank, solar backup)?

**Q2.3 — Pool — Byblos**
How does the heated pool work? Is there a control panel? Where is the cover and how is it operated? Any restriction on hours of use? Is the pool always accessible or does it need to be switched on?

**Q2.4 — Kitchen — Byblos**
What type of hob (gas, induction, electric)? What appliances are in the kitchen? Anything guests must or must not do when using the kitchen?

**Q2.5 — BBQ — Byblos**
Where is the BBQ located? Gas or charcoal? Step-by-step ignition and shutdown. Who is responsible for cleaning?

**Q2.6 — TV / Entertainment — Byblos**
How does the TV work? Is it a smart TV? Any streaming accounts provided? Remote location and basic operation.

---

## 3. Utilities — Villa Mechmech

**Q3.1 — Heating — Mechmech**
What type of heating system (radiator, underfloor, split AC/heat, or combination)? Where are the controls?

**Q3.2 — Fireplace — Mechmech**
Where is the fireplace? What fuel does it use — diesel or wood? Step-by-step ignition process. What should a guest do if it does not ignite? Safety notes.

**Q3.3 — Winter Room — Mechmech**
What is the "winter room"? Where is it located? How do guests access it? What is it used for?

**Q3.4 — Hot water — Mechmech**
Same questions as Q2.2 above, for Villa Mechmech.

**Q3.5 — Kitchen — Mechmech**
Same questions as Q2.4 above, for Villa Mechmech.

**Q3.6 — BBQ — Mechmech**
Same questions as Q2.5 above, for Villa Mechmech.

**Q3.7 — TV / Entertainment — Mechmech**
Same questions as Q2.6 above, for Villa Mechmech.

---

## 4. Using the Villa (both villas)

**Q4.1 — Bathrooms**
Any specific notes guests should know about the bathrooms — shower operation, hot water wait time, towel policy, anything villa-specific?

**Q4.2 — Garbage**
Where are the bins inside the villa? Where is the outdoor bin or dumpster? Is there a collection schedule guests should be aware of?

**Q4.3 — Restricted areas**
Which areas of the property are off-limits to guests? Utility rooms, staff quarters, equipment areas, neighboring boundaries?

**Q4.4 — Shared or neighboring areas**
Are there any shared paths, access routes, or neighboring properties guests should be aware of?

---

## 5. House Expectations

**Q5.1 — Visitors**
Are guests permitted to invite additional visitors during their stay? If yes, is there a maximum number? Any hours restriction?

**Q5.2 — Events and gatherings**
Are events, parties, or large gatherings permitted at the villas? If yes, under what conditions?

**Q5.3 — Smoking**
Is smoking permitted? If yes, where (indoors / designated outdoor area only)?

**Q5.4 — Pool safety rules**
Does Oraya have any specific pool safety requirements for guests — supervision of children, no-diving zones, pool hours, etc.?

**Q5.5 — Children and supervision**
Any guidance specific to family stays with young children (pool, kitchen access, supervision)?

**Q5.6 — Property care expectations**
How does Oraya expect guests to treat furnishings, outdoor areas, and equipment during their stay? What is the expectation for the villa condition at checkout?

---

## 6. Checkout

**Q6.1 — Checkout time**
What is the standard checkout time?

**Q6.2 — Late checkout policy**
Is late checkout available on request? What is the process (WhatsApp request, fee, cut-off)?

---

## 7. Safety and Emergency

**Q7.1 — Nearest hospital**
What is the nearest hospital to each villa? Name and address.
- Near Byblos: [required]
- Near Mechmech: [required]

**Q7.2 — Nearest pharmacy**
What is the nearest pharmacy to each villa?
- Near Byblos: [required]
- Near Mechmech: [required]

**Q7.3 — Property emergency procedure**
If there is a property emergency (gas smell, structural concern, flooding, electrical failure) what should a guest do? Is there a shutoff procedure they need to know?

---

## 8. Oraya Support / WhatsApp

**Q8.1 — Oraya WhatsApp concierge number**
What is the WhatsApp number guests should contact for support?

*Blocks: digital steps 1, 3, 5, 7, 8; print pp. 1, 2, 7.*

**Q8.2 — Support hours**
What hours is the concierge available via WhatsApp?

---

## 9. Photography

**Q9.1 — Villa photography for 20 required images**
See `CONTENT_MATRIX.md` image inventory (items 1–19) for the full list. Key priority images:

- Signature exterior of each villa (print p. 1 hero)
- Gate and gate keypad for each villa
- Front-door keypad for each villa
- Kitchen for each villa (correctly labeled — must match the right villa)
- BBQ for each villa (correctly labeled)
- Pool — Byblos
- Fireplace — Mechmech

All images must be correctly attributed to the right villa. Substitution of unrelated images is not permitted.

---

## 10. Personalization & Production Workflow

**Q10.1 — Guest name personalisation**
In the production version, the guest's name appears on the digital guide header and print page 1. Is the name sourced from the booking row (`bookings.member_id` → `auth.users.user_metadata.full_name`) or from a separate input?

**Q10.2 — How is the digital guide delivered?**
Via WhatsApp (butler flow), email, or both? Before or after booking confirmation?

**Q10.3 — How is the print manual produced?**
Does Oraya print and bind it in-house, or is there a print service? Who generates the per-stay PDF (correct villa variant, guest name, dates)?

**Q10.4 — PIN delivery**
How and when are the gate and front-door PINs sent to the guest? Via WhatsApp? At what point before arrival?

**Q10.5 — Page 3 villa variant — manual or automated?**
When printing the manual, the correct Page 3 variant (Byblos or Mechmech) must be selected. Is this a manual print process or should the production system produce a single pre-composed PDF per stay?
