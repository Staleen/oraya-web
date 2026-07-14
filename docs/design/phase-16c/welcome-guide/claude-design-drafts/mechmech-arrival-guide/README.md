# Villa Mechmech — Mobile Arrival Guide (source package)

Open `Villa Mechmech Arrival Guide mobile.html` — self-contained except Google Fonts (Playfair Display + Lato, loaded in css/oraya-tokens.css).

## Files
- `Villa Mechmech Arrival Guide mobile.html` — the 8-screen continuous mobile guide
- `css/oraya-tokens.css` — Oraya palette + typography tokens
- `css/system-mobile.css` — mobile component system (screens, buttons, steps, photo slots)
- `assets/` — Oraya SVG marks and logo used by the guide

## Dynamic merge fields (confirmed-booking only)
`{{guestName}}` `{{stayDates}}` `{{bookingReference}}` `{{gatePin}}` `{{frontDoorPin}}`

Render these ONLY when a booking is confirmed. No access codes are hardcoded anywhere in this package. Access codes never appear in the printed House Book or on public Explore pages.

## Confirmed link targets
- Google Maps: https://www.google.com/maps/search/?api=1&query=34.130333,35.773083
- Living List: https://stayoraya.com/explore/mechmech
- WhatsApp: https://wa.me/96171140041
- Website: https://stayoraya.com

## One-page PDF
One-page PDF must be generated from HTML by the coding agent using a custom viewport and PDF height (page size = 390px × full content height; no paper size).
