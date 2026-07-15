# Villa Byblos — Guest Documents (source package)

Two documents, one identity. Self-contained except Google Fonts (Playfair Display + Lato).

## Files
- `Villa Byblos House Book print.html` — the 9-page printed House Book (A4, static, lives in the villa)
- `Villa Byblos Arrival Guide mobile.html` — the 8-screen continuous mobile guide (sent before arrival)
- `css/oraya-tokens.css` — Oraya palette + typography tokens
- `css/system-print.css` — A4 print system (page grounds, hybrid layout classes, pagination)
- `css/system-mobile.css` — mobile component system (screens, buttons, steps, photo slots)
- `assets/` — Oraya SVG marks, logo and real scannable QR codes

## Dynamic merge fields (mobile guide only; confirmed-booking only)
`{{guestName}}` `{{stayDates}}` `{{bookingReference}}` `{{gatePin}}` `{{frontDoorPin}}`

Render these ONLY when a booking is confirmed. No access codes are hardcoded anywhere in this package. Access codes and merge fields never appear in the printed House Book or on public Explore pages.

## QR targets (House Book print; real scannable codes in assets/)
- Location (`oraya-qr-maps-byblos.svg`): https://www.google.com/maps/search/?api=1&query=34.106387,35.661531
- Living List (`oraya-qr-living-list-byblos.svg`): https://stayoraya.com/explore/byblos
- Website (`oraya-qr-stayoraya.svg`): https://stayoraya.com

## Mobile link targets
- Google Maps: https://www.google.com/maps/search/?api=1&query=34.106387,35.661531
- Living List: https://stayoraya.com/explore/byblos
- WhatsApp: https://wa.me/96171140041
- Website: https://stayoraya.com

## PDFs
- House Book: print `Villa Byblos House Book print.html` to A4, margins 0, background graphics ON → 9 pages.
- Arrival Guide one-page PDF must be generated from HTML by the coding agent using a custom viewport and PDF height (page size = 390px × full content height; no A4/Letter paper size).
