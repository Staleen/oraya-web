# Image Credits — Phase 16C Guest Welcome Guide

**Updated:** 2026-06-07

This file documents the source, license status, and concept-only classification of every image used in the Oraya guest welcome guide prototype.

---

## Status summary

| Category | Count | Status |
|----------|-------|--------|
| Provided by David (Oraya assets) | 9 images | Integrated — "Concept image" label shown |
| Royalty-free / web-sourced | 0 images | Not downloaded — see note below |
| CSS placeholders (prompt-only) | 10 slots | Awaiting image generation or photography |

---

## Web image download — unavailable in this session

Royalty-free images were requested from Unsplash, Pexels, Pixabay, and Wikimedia Commons. The Claude Code environment has web fetch capability for text/HTML content only. Binary file downloads (JPEG, PNG) are not supported in this environment.

**Result:** No royalty-free images were downloaded. All missing image slots remain as CSS placeholder blocks with generation-ready prompts in `IMAGE_PROMPTS.md`.

**To add royalty-free images manually:**
1. Search [Unsplash](https://unsplash.com), [Pexels](https://www.pexels.com), [Pixabay](https://pixabay.com), or [Wikimedia Commons](https://commons.wikimedia.org) using the keywords below.
2. Download under the applicable license (Unsplash License, Pexels License, Pixabay License, or CC0/CC BY).
3. Save to `docs/design/phase-16c/welcome-guide/assets/concept/` using the target filename from `IMAGE_PROMPTS.md`.
4. Replace the `<div class="image-placeholder ...">` block in the relevant print HTML file with `<div class="concept-img-wrap concept-img-wrap--small">` + `<img>` + `<span class="concept-img-label">Concept image</span>`.
5. Add a row to this file with source URL, license, and relevance note.

---

## Provided images — David's asset set

These images were provided directly by David and are already integrated in the prototype. They are labeled "Concept image" throughout the guide and require David's explicit approval before guest distribution.

| File | Used in | Source | License | Relevance |
|------|---------|--------|---------|-----------|
| `byblos-exterior.png` | Print Page 1 hero · Digital Step 2 Byblos card | Provided by David (Oraya asset) | Oraya / David — confirm before guest distribution | Modern stone villa night exterior; no pool visible |
| `mechmech-exterior.png` | Print Page 1 hero (Mechmech) · Digital Step 2 Mechmech card | Provided by David (Oraya asset) | Oraya / David — confirm before guest distribution | Winter night exterior; pool and glass pergola visible |
| `mechmech-01-exterior.png` | In assets folder (duplicate of mechmech-exterior) | Provided by David (Oraya asset) | Oraya / David | Identical to mechmech-exterior.png |
| `mechmech-pool.png` | Print Page 3 pool (Mechmech) · Digital Step 6 Mechmech pool | Provided by David (Oraya asset) | Oraya / David — confirm before guest distribution | Night pool shot; warm fireplace glow inside villa |
| `mechmech-05-pool.png` | In assets folder (duplicate of mechmech-pool) | Provided by David (Oraya asset) | Oraya / David | Identical to mechmech-pool.png |
| `mechmech-03-garden.png` | Print Page 4 pool/outdoor section · Both villas | Provided by David (Oraya asset) | Oraya / David — confirm before guest distribution | Daytime pool and terrace; stone wall, wood facade |
| `mechmech-02.png` | Print Page 1 hospitality detail · Digital Step 7 | Provided by David (Oraya asset) | Oraya / David — confirm before guest distribution | Oraya branded robe; ORAYA gold emblem visible |
| `mechmech-04.png` | Print Page 4 bathrooms · Digital Step 6 | Provided by David (Oraya asset) | Oraya / David — confirm before guest distribution | Oraya branded towels; ORAYA gold emblem; 4 sizes |
| `mechmech-06.png` | Print Page 4 bathrooms · Digital Step 6 | Provided by David (Oraya asset) | Oraya / David — confirm before guest distribution | Oraya branded toiletries; 4 products; gold emblem |

**All provided images carry the "Concept image" overlay label.** This label is intentional and must remain until David explicitly approves each image for guest distribution.

---

## Missing image slots — prompts ready, no file yet

The following 10 image slots are CSS placeholders. Generation prompts are in `IMAGE_PROMPTS.md`. No royalty-free images were downloaded in this session.

| Target filename | Section | Suggested search terms (Unsplash / Pexels / Pixabay) |
|----------------|---------|-------------------------------------------------------|
| `gate-driveway-concept.jpg` | Page 2 arrival · Step 3 gate | "luxury villa gate", "private estate entrance", "stone boundary wall gate" |
| `gate-keypad-concept.jpg` | Page 2 arrival · Step 3 keypad | "keypad gate", "numeric keypad security", "outdoor access panel" |
| `front-door-keypad-concept.jpg` | Page 2 arrival · Step 5 keypad | "smart lock door", "front door keypad", "electronic door lock" |
| `byblos-kitchen-concept.jpg` | Page 3 Byblos kitchen · Page 4 kitchen | "modern villa kitchen", "luxury kitchen interior", "Mediterranean kitchen" |
| `mechmech-kitchen-concept.jpg` | Page 3 Mechmech kitchen | "mountain villa kitchen", "cozy winter kitchen", "stone kitchen interior" |
| `byblos-bbq-concept.jpg` | Page 3 Byblos BBQ · Page 4 BBQ | "outdoor BBQ terrace", "villa barbecue area", "outdoor kitchen Mediterranean" |
| `mechmech-bbq-winter-concept.jpg` | Page 3 Mechmech BBQ | "outdoor BBQ covered pergola", "barbecue glass room", "winter outdoor kitchen" |
| `winter-room-concept.jpg` | Page 3 Mechmech winter room | "glass conservatory lounge", "panoramic glass room", "winter garden interior" |
| `fireplace-diesel-stove-concept.jpg` | Page 3 Mechmech fireplace | "cast iron stove heater", "traditional stove interior", "metal wood stove" |
| `garbage-bins-concept.jpg` | Page 4 garbage section | "outdoor garbage cans stone wall", "clean bins villa", "outdoor waste bins" |
| `byblos-pool-concept.jpg` | Page 3 Byblos pool · Page 4 pool | "outdoor villa pool", "private pool terrace", "luxury pool Mediterranean" |

**License requirements for manually sourced images:**
- Unsplash: Unsplash License (free for commercial/editorial use, no attribution required but appreciated)
- Pexels: Pexels License (free for commercial/editorial use)
- Pixabay: Pixabay License / CC0 (free for commercial use, no attribution required)
- Wikimedia Commons: Check individual image license (must be CC0, CC BY, or CC BY-SA)
- No copyrighted hotel/villa photography from commercial sources
- No visible brand logos, recognizable faces, or misleading property-specific features

---

## Concept-only reminder

Every image in this prototype — whether provided by David or (once added) sourced from royalty-free libraries — is **concept-only**:

- It carries a "Concept image" overlay label in the HTML
- It requires final approval before any guest distribution
- Provided images require David's explicit approval
- Royalty-free images are legally usable but must be confirmed as appropriate for the section

Production-final images should come from either:
1. Approved villa photography commissioned by Oraya
2. AI-generated images reviewed and approved by David
3. Royalty-free images explicitly approved by David for each section

No image in this prototype should be sent to guests without David's review.
