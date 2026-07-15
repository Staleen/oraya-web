# Villa Mechmech — The House Book (A4 print, source package)

Open `Villa Mechmech House Book print.html` — self-contained except Google Fonts (Playfair Display + Lato). Print: A4, margin 0, background graphics ON. One page per `.hy` block (9 pages).

STATIC document — lives inside the villa. Contains NO guest name, NO stay dates, NO booking reference, NO gate PIN, NO front-door PIN, NO access codes. The Arrival Guide is a separate document and must never be bound into this print PDF.

## Provenance
Packaged from the Claude Design "welcome book" project source `directions/mechmech-housebook.js` (draft 1, cloned from the approved Villa Byblos template). Format conversion only — page content unchanged; asset paths remapped to this bundle's `assets/`. The shared css and marks are byte-identical copies from the Byblos package (`Villa-Byblos-Guest-Documents-Source-final/`).

## Files
- `Villa Mechmech House Book print.html` — the 9-page A4 House Book (Cover, Essentials, Welcome letter, Around Villa Mechmech, Living Spaces, House Notes, Checkout, Emergency & Contacts, Farewell)
- `css/oraya-tokens.css` — Oraya palette + typography tokens (identical to Byblos package)
- `css/system-print.css` — A4 print component system, incl. `.hy` page blocks (identical to Byblos package)
- `assets/` — Oraya SVG marks, logo, Mechmech area plate, and QR codes

## QR targets
- `oraya-qr-maps-mechmech.svg` — Villa Mechmech in Google Maps; per the Mechmech Arrival Guide: https://www.google.com/maps/search/?api=1&query=34.130333,35.773083 (verify by scan before print)
- `oraya-qr-living-list-mechmech.svg` — https://stayoraya.com/explore/mechmech (machine-decode verified; replaces the earlier generic `oraya-qr-living-list.svg`, which failed QR decoding entirely and carried an unconfirmed target)
- `oraya-qr-stayoraya.svg` — https://stayoraya.com

## Editable placeholders (intentional)
Restaurant/café and practical-service names on the "Around Villa Mechmech" page remain `[bracketed placeholders]` — the living-list QR carries the current list.

## Content notes pending David's confirmation
Carried over from the Claude Design source (deliberate content evolutions, not errors):
- Locality: "Mechmech · near Annaya · Mount Lebanon"
- Welcome letter villa specs: three floors, 3 bedrooms, 2 full bathrooms + guest WC, heated pool, winter glass room, outdoor kitchen, pergola, BBQ area, gated parking
- "Heated pool" stated unconditionally (site treats it as a paid add-on)
- Visitors policy: "approved by Oraya in advance"
- Area facts + drive times: Saint Charbel · Annaya (~5–10 min), Laklouk (~25–35 min), Baatara (~45–60 min)
- Checkout list simplified to 7 items ("Dishes to sink", …)
