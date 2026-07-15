# Phase 16C — Photo Slot Manifest

Production photo-slot contract for the two A4 print guides:

- `oraya-guest-welcome-guide-print-byblos.html`
- `oraya-guest-welcome-guide-print-mechmech.html`
- shared stylesheet `oraya-print-a4.css`

**Purpose.** The print guides are not yet final print-grade: several image slots still hold
concept renders, generic stock, or blank placeholders. This manifest is the single source of
truth that lets David (and future agents) know **exactly which real photo belongs in each slot**,
what it must look like, and how to drop it in without touching layout, text, or page count.

This document is descriptive only. It changes **no** HTML/CSS/PDF. Actual swaps happen later,
per the agent instructions at the bottom.

---

## 1. Page reference

Both villas render to a **10-page PDF** (cover + 8 numbered leaves + back cover). Slot pages below
use the physical PDF page and the printed footer (`X / 9`).

| PDF page | Footer | Section | Image slots on this page |
|---|---|---|---|
| 1 | (cover) | Cover | `*.cover.hero` |
| 4 | 4 / 9 | Arrival & Access → Arrival sequence | `*.arrival.gate_keypad`, `*.arrival.frontdoor_lock` (device photos) |
| 6 | 6 / 9 | Comfort & Using the Villa — continued | all feature-grid photo slots |

The cover (`.pp-cover__img`) is full-bleed. Feature-grid photos (`.pp-feature-photo > img.concept-img`)
sit in fixed-height slots: **125px** tall standard, **155px** tall for the wide card. Blank slots use
`.pp-feature-photo--placeholder` with a `PHOTO` hint. All heights, cropping (`object-fit: cover;
object-position: center`) and the warm arched top corners are owned by CSS — a photo swap needs **no**
CSS change.

---

## 2. Status legend

- **real** — an actual photograph of the real villa (print-ready). *None of the scene slots are here yet.*
- **concept (render)** — architectural/3D render of the villa. Presentable but not a photo.
- **concept (stock)** — generic stock image, not this villa. Misrepresents the actual space.
- **missing** — blank placeholder (`PHOTO`). Not printable as-is.
- **device (real)** — real product photo of the actual hardware (acceptable as final).

---

## 3. Slot registry — Villa Byblos

### `byblos.cover.hero`
- **Villa / Page / Section:** Byblos / p1 / Cover
- **Current source:** `assets/concept/byblos-exterior.png` — **concept (render)**
- **Target filename / folder:** `assets/photos/byblos/byblos-cover-hero.jpg`
- **Orientation / Aspect / Min res:** portrait / A4 full-bleed (~3:4, 210:297) / **2480 × 3508 px** (300 dpi A4), +3mm bleed preferred
- **Should show:** the real Villa Byblos exterior — hero establishing shot, golden-hour/evening if possible, lit windows, full façade and entrance.
- **Cropping:** center-weighted; the scrim darkens top and bottom for the ORAYA wordmark and the title block — keep the building mass in the central band, allow generous sky/foreground for crop.
- **Priority:** **HIGH**

### `byblos.pool.main`  *(wide card — 155px slot)*
- **Villa / Page / Section:** Byblos / p6 (6/9) / Comfort & Using the Villa — continued → "Pool & Pool Cover"
- **Current source:** blank `PHOTO` placeholder — **missing**
- **Target filename / folder:** `assets/photos/byblos/byblos-pool-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 (crops to ~3.5:1 letterbox) / **2000 × 1333 px**
- **Should show:** the real pool and terrace, cover visible or folded, loungers/setting.
- **Cropping:** full content-width band; keep waterline/subject vertically centered — top and bottom crop hard to 155px.
- **Priority:** **HIGH** (blank)

### `byblos.kitchen.main`
- **Villa / Page / Section:** Byblos / p6 (6/9) / "Kitchen"
- **Current source:** `assets/concept/kitchen.jpg` — **concept (stock)**, *shared with Mechmech*
- **Target filename / folder:** `assets/photos/byblos/byblos-kitchen-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** the actual Byblos kitchen — cooktop, counters, appliances mentioned in copy (kettle, microwave, gas cooktop, stove).
- **Cropping:** center subject; ~2:1 crop.
- **Priority:** **MEDIUM** (generic stock, reused across both villas)

### `byblos.barbecue.main`
- **Villa / Page / Section:** Byblos / p6 (6/9) / "Barbecue"
- **Current source:** `assets/concept/barbecue.jpg` — **concept (stock)**, *shared with Mechmech*
- **Target filename / folder:** `assets/photos/byblos/byblos-barbecue-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** the actual outdoor BBQ / kitchenette area.
- **Cropping:** center the grill; ~2:1 crop.
- **Priority:** **MEDIUM** (generic stock, reused)

### `byblos.bathroom.main`
- **Villa / Page / Section:** Byblos / p6 (6/9) / "Bathrooms"
- **Current source:** blank `PHOTO` placeholder — **missing**
- **Target filename / folder:** `assets/photos/byblos/byblos-bathroom-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** a representative clean bathroom — vanity, towels/amenities as described.
- **Cropping:** center; ~2:1 crop. Avoid mirrors capturing the photographer.
- **Priority:** **HIGH** (blank)

### `byblos.garbage.area`
- **Villa / Page / Section:** Byblos / p6 (6/9) / "Garbage"
- **Current source:** blank `PHOTO` placeholder — **missing**
- **Target filename / folder:** `assets/photos/byblos/byblos-garbage-area.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** the two outdoor garbage cans / collection area referenced in copy.
- **Cropping:** center the bins; tidy framing; ~2:1 crop.
- **Priority:** **HIGH** (blank)

---

## 4. Slot registry — Villa Mechmech

### `mechmech.cover.hero`
- **Villa / Page / Section:** Mechmech / p1 / Cover
- **Current source:** `assets/concept/mechmech-exterior.png` — **concept (render)**
- **Target filename / folder:** `assets/photos/mechmech/mechmech-cover-hero.jpg`
- **Orientation / Aspect / Min res:** portrait / A4 full-bleed (~3:4) / **2480 × 3508 px**, +3mm bleed preferred
- **Should show:** the real Villa Mechmech exterior hero — façade, winter glass room if visible, evening light.
- **Cropping:** as `byblos.cover.hero` — building in the central band, room for scrim top/bottom.
- **Priority:** **HIGH**

### `mechmech.pool.main`
- **Villa / Page / Section:** Mechmech / p6 (6/9) / "Pool & Pool Cover"
- **Current source:** `assets/concept/mechmech-03-garden.png` — **concept (render)** *(shows garden/terrace, not clearly the pool — see §9)*
- **Target filename / folder:** `assets/photos/mechmech/mechmech-pool-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** the real Mechmech pool and terrace (heated-pool cover if applicable).
- **Cropping:** center waterline/subject; ~2:1 crop.
- **Priority:** **MEDIUM** (render present; possible better on-disk source — see §9)

### `mechmech.kitchen.main`
- **Villa / Page / Section:** Mechmech / p6 (6/9) / "Kitchen"
- **Current source:** `assets/concept/kitchen.jpg` — **concept (stock)**, *shared with Byblos*
- **Target filename / folder:** `assets/photos/mechmech/mechmech-kitchen-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** the actual Mechmech kitchen; copy also references the winter-room kitchenette (sink + counter).
- **Cropping:** center; ~2:1 crop.
- **Priority:** **MEDIUM** (generic stock, reused)

### `mechmech.barbecue.main`
- **Villa / Page / Section:** Mechmech / p6 (6/9) / "Barbecue"
- **Current source:** `assets/concept/barbecue.jpg` — **concept (stock)**, *shared with Byblos*
- **Target filename / folder:** `assets/photos/mechmech/mechmech-barbecue-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** the covered outdoor BBQ outside the winter glass room (per copy).
- **Cropping:** center the grill; ~2:1 crop.
- **Priority:** **MEDIUM** (generic stock, reused)

### `mechmech.bathroom.main`
- **Villa / Page / Section:** Mechmech / p6 (6/9) / "Bathrooms"
- **Current source:** blank `PHOTO` placeholder — **missing**
- **Target filename / folder:** `assets/photos/mechmech/mechmech-bathroom-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** a representative clean Mechmech bathroom — vanity, towels/amenities.
- **Cropping:** center; ~2:1 crop; avoid photographer in mirror.
- **Priority:** **HIGH** (blank)

### `mechmech.fireplace.main`
- **Villa / Page / Section:** Mechmech / p6 (6/9) / "Fireplace & Diesel Stove"
- **Current source:** `assets/concept/fireplace-diesel.jpg` — **concept (stock)**
- **Target filename / folder:** `assets/photos/mechmech/mechmech-fireplace-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** the actual traditional Lebanese diesel stove in the winter glass room — tank, oven compartment, warming surface.
- **Cropping:** center the stove; ~2:1 crop.
- **Priority:** **MEDIUM** (generic stock)

### `mechmech.winter_room.main`
- **Villa / Page / Section:** Mechmech / p6 (6/9) / "Winter Room"
- **Current source:** blank `PHOTO` placeholder — **missing**
- **Target filename / folder:** `assets/photos/mechmech/mechmech-winter-room-main.jpg`
- **Orientation / Aspect / Min res:** landscape / 3:2 / **1500 × 1000 px**
- **Should show:** the winter glass room — panoramic glazing, kitchenette, TV, lounge seating.
- **Cropping:** show the glass/view and seating; center; ~2:1 crop.
- **Priority:** **HIGH** (blank)

---

## 5. Shared device & brand assets (accounted for — **not** villa-photo slots)

These appear in both guides and are **not** part of the replacement contract. Do not swap unless
the hardware/branding itself changes.

| Slot id | Page / Section | Current source | Status | Priority |
|---|---|---|---|---|
| `shared.arrival.gate_keypad` | p4 (4/9) / Arrival sequence | `assets/concept/keypad-gate.png` | device (real) | LOW |
| `shared.arrival.frontdoor_lock` | p4 (4/9) / Arrival sequence | `assets/concept/lock-frontdoor.png` | device (real) | LOW |
| `shared.tv.logo_webos` | p5 (5/9) / TV & Entertainment | `assets/concept/logo-webos.png` | brand logo | do-not-replace |
| `shared.tv.logo_cablevision` | p5 (5/9) / TV & Entertainment | `assets/concept/logo-cablevision.png` | brand logo | do-not-replace |

Device tiles use `object-fit: cover` in a tall tile; if ever replaced, provide ~**1000 × 1200 px**
portrait/square product shots on a clean background.

---

## 6. Recommended final asset folder structure

Keep concept/render files where they are (as fallback + credits history); add a dedicated
production-photo tree so real and concept assets never mix:

```
docs/design/phase-16c/welcome-guide/assets/
├── concept/                 ← existing renders / stock (KEEP as fallback)
└── photos/                  ← NEW — real, print-grade photographs (sRGB JPEG)
    ├── byblos/
    │   ├── byblos-cover-hero.jpg
    │   ├── byblos-pool-main.jpg
    │   ├── byblos-kitchen-main.jpg
    │   ├── byblos-barbecue-main.jpg
    │   ├── byblos-bathroom-main.jpg
    │   └── byblos-garbage-area.jpg
    ├── mechmech/
    │   ├── mechmech-cover-hero.jpg
    │   ├── mechmech-pool-main.jpg
    │   ├── mechmech-kitchen-main.jpg
    │   ├── mechmech-barbecue-main.jpg
    │   ├── mechmech-bathroom-main.jpg
    │   ├── mechmech-fireplace-main.jpg
    │   └── mechmech-winter-room-main.jpg
    └── shared/              ← only if device/brand assets are ever re-shot
```

## 7. Filename convention

`{villa}-{area}[-{descriptor}].jpg`

- lowercase, hyphen-separated (slot-id dots → hyphens: `byblos.pool.main` → `byblos-pool-main.jpg`)
- **JPEG, sRGB**, quality ≥ 85 (covers ≥ 90)
- villa prefix always (`byblos-` / `mechmech-`) even inside the villa folder, so files stay
  self-identifying if moved
- no spaces, no capitals, no version suffixes in the committed name (use git history for versions)

---

## 8. Missing high-priority photos (blank placeholders — cannot print as-is)

1. `byblos.pool.main`
2. `byblos.bathroom.main`
3. `byblos.garbage.area`
4. `mechmech.bathroom.main`
5. `mechmech.winter_room.main`

**Also HIGH but currently render-only (present, not real):**

6. `byblos.cover.hero` — real Byblos exterior needed
7. `mechmech.cover.hero` — real Mechmech exterior needed

---

## 9. Unclear slots — need David's decision

1. **Mechmech pool source.** `mechmech.pool.main` currently points at `mechmech-03-garden.png`
   (a garden/terrace render), while the assets folder already contains pool-specific renders
   `mechmech-05-pool.png` and `mechmech-pool.png`. Should the pool card switch to the actual
   pool render now (a zero-cost `src` swap), or wait for a real photo?
2. **Covers: render vs photo.** Are the architectural renders acceptable as final print, or must
   both covers be real exterior photographs? (Affects whether `*.cover.hero` stays HIGH.)
3. **Shared stock images.** `kitchen.jpg` and `barbecue.jpg` are the **same file reused in both
   villas**, and `fireplace-diesel.jpg` is generic stock. Confirm each should be replaced with the
   real per-villa photo (recommended) — otherwise both guides keep showing an identical, non-actual
   kitchen and BBQ.
4. **Garbage composition.** Confirm what `byblos.garbage.area` should depict (the two outdoor cans /
   collection point) and whether it should appear at all vs. staying icon/text only.

---

## 10. Instructions for future coding agents — replace a placeholder safely

**Guardrails:** never change layout, text, page count, QR codes, phone numbers, map links, PIN
placeholders, emergency content, or checkout time. Photo work touches only image markup + assets.

**Method A — drop-in at the current path (zero HTML change).** Save the real photo over the exact
current `src` file. ⚠️ Only safe for **villa-unique** sources. Do **not** overwrite the shared
`kitchen.jpg` / `barbecue.jpg` this way — it would change both villas at once.

**Method B — new asset (recommended).** For each slot:
1. Place the file at its Target path under `assets/photos/{villa}/…` (per §6).
2. **If the slot currently has an `<img>`** (concept/render): change only the `src` to the new path,
   update `alt`, and remove the `<span class="concept-img-label">Concept image</span>` once it is a
   real photo.
3. **If the slot is a blank placeholder**, replace:
   ```html
   <div class="pp-feature-photo pp-feature-photo--placeholder">
     <span class="pp-feature-photo__hint">PHOTO</span>
   </div>
   ```
   with the real-image markup (mirrors the existing populated cards — keeps the 125px slot height,
   `object-fit: cover`, and arched top from CSS untouched):
   ```html
   <div class="pp-feature-photo">
     <img src="assets/photos/{villa}/{file}.jpg" alt="…" class="concept-img">
   </div>
   ```
   (For the **wide** Byblos pool card, keep the parent `.pp-feature-card--wide` — do not change it.)
4. Do **not** edit `oraya-print-a4.css` — all sizing/cropping/arch styling is already correct.
5. Keep the source oriented and sized per this manifest; the export pipeline downsamples
   `concept-img` to ≤1400px wide JPEG, so provide ≥1500px wide (covers ≥2480px).
6. **Re-export** the committed PDFs with the canonical script only:
   `node docs/design/phase-16c/welcome-guide/export-reference-pdfs.js`
7. **Verify** after export: both guides exactly **10 pages**; cover full-bleed (~99.9% width fill);
   inside geometry unchanged (~92% fill, ~30px side margins); no overflow/clipping; contents still
   `Comfort & Using the Villa … 5–6`. (See the session's verification approach in git history.)
8. Update `IMAGE_CREDITS.md` (source/licence) and flip the slot's status in this manifest to **real**.

---

## 11. David's upload checklist

- [ ] Covers shot **portrait**, everything else **landscape**.
- [ ] Meet the min resolution per slot (covers 2480×3508; feature photos ≥1500×1000; wide pool ≥2000×1333).
- [ ] sRGB, well-lit, level horizon, no photographer in mirrors.
- [ ] Rename to the Target filename in §3–4 (convention in §7).
- [ ] Drop into `assets/photos/byblos/` or `assets/photos/mechmech/`.
- [ ] Confirm each cover is the **actual** villa exterior.
- [ ] Answer the §9 decisions (Mechmech pool source, render-vs-photo covers, shared stock, garbage).
- [ ] Hand the batch (or matching filenames) to an agent to wire in + re-export per §10.
