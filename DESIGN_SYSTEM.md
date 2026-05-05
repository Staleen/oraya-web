# Oraya — Design System

Reference for guest-facing and public-site work. **Source of truth for token values:** `app/globals.css` (`html[data-theme="light"]` / `html[data-theme="dark"]`). Prefer CSS variables over hardcoded hex in new UI unless matching a fixed brand asset.

---

## 1. Brand direction

- **Oraya** is **premium private villa** hospitality in Lebanon—curated stays and events, **not** a generic marketplace or Airbnb-style template.
- **Tone:** calm, curated, private, trusted, **warm luxury**. Copy and layout should feel assured and quiet, not loud or promotional.
- **Visual goal:** ivory/sand warmth with disciplined navy structure and gold as a single accent—not multi-color marketing chrome.

---

## 2. Color system

### Themes

- **Light (default):** warm ivory/sand page and surfaces, **deep navy** primary text, **gold** accents and CTAs.
- **Dark (user-selected only):** **deep navy** shell, **warm ivory** primary text, **gold** accents. Same brand gold in both themes.

### Core tokens (public shell + body)

Use these names in new components; map via inline `style` or CSS as the project already does.

| Token | Role |
|--------|------|
| `--oraya-bg` | Page background wash (ivory/sand in light, midnight in dark). |
| `--oraya-surface` | Cards / elevated panels. |
| `--oraya-surface-muted` | Secondary panels, stripes, subtle grouping. |
| `--oraya-ink` | Primary text (navy in light; ivory-tint in dark). |
| `--oraya-text-muted` | Supporting copy, meta, disclaimers. |
| `--oraya-gold` | Accent, borders-on-gold, focus hints, brand emphasis. |
| `--oraya-border` | Default hairline dividers and field borders (theme-tinted). |
| `--oraya-gold-cta-text` | **Label/icon fill on solid gold buttons** (navy `#1f2b38` in both themes for contrast). |

**Legacy:** `:root` still exposes `--color-*` aliases; new work should prefer `--oraya-*`.

**Booking flow:** additional tokens (`--oraya-book-*`, `--oraya-nav-*`, hero, footer, calendar) are defined in the same file—extend the system there rather than one-off colors.

---

## 3. Typography rules

### Families

- **Serif (emotional / brand):** Playfair Display—**section titles, hero headlines, editorial quotes.** Not for dense UI or long forms.
- **Sans (functional):** Lato—**navigation, labels, inputs, buttons, cards, booking steps, tables, legal microcopy.**

Stack names in code (see `app/layout.tsx`): `var(--font-playfair)`, `var(--font-lato)`.

### Hierarchy (target ranges)

Apply letter-spacing and uppercase only where the existing site uses micro-caps (labels, kicker lines).

| Role | Serif (Playfair) | Sans (Lato) |
|------|------------------|-------------|
| **Hero / major headline** | ~clamp(1.8rem, 3.5vw, 3rem), weight 400 | — |
| **Section H2** | ~clamp(1.5rem, 5vw, 2rem)–32px, weight 400 | — |
| **Kicker / eyebrow** | — | ~9–11px, wide letter-spacing, uppercase |
| **Body** | — | ~13–15px, weight 300–400 |
| **Label / input** | — | ~11px, uppercase labels; ~13px field text |
| **Button / CTA** | — | ~11px, letter-spacing ~1.5–2px, uppercase for primary actions |

**Mobile:** keep the same roles; use `clamp()` or slightly tighter section padding so type does not dominate small viewports.

---

## 4. Spacing system

Base unit: **8px**. Prefer multiples for margin, padding, gap, and section vertical rhythm.

| Name | Value | Typical use |
|------|-------|-------------|
| **xs** | 8px | Tight stacks, icon gaps, inline control padding. |
| **sm** | 16px | Card padding (compact), list gaps. |
| **md** | 24px | Standard block spacing, form field spacing. |
| **lg** | 32px | Section interior padding (mobile). |
| **xl** | 48px | Section breaks (tablet / small desktop). |
| **2xl** | 64px | Large section padding (desktop). |
| **3xl** | 96px+ | Hero / full-bleed section vertical rhythm (often `py-12` / `md:py-28` patterns on marketing pages). |

**Rule:** avoid arbitrary values (e.g. `13px`, `19px`) unless matching an existing pattern or optical adjustment—document why in the PR or adjacent comment.

---

## 5. Section rhythm

Standard marketing block order:

1. **Label (kicker)** — small, uppercase, gold or muted.
2. **Heading** — serif, one clear idea per section.
3. **Divider** — short gold hairline (~40px wide), breathing room above/below.
4. **Description** — sans, muted or body color, max width for readability (~34ch–520px where applicable).
5. **Content** — cards, grids, media.
6. **CTA** — primary or secondary (see below).

### Spacing between steps (relative to 8px scale)

- Kicker → heading: **sm–md** (16–24px).
- Heading → divider: **md** (24px).
- Divider → description: **md–lg** (24–32px).
- Description → content: **lg–xl** (32–48px).
- Content → CTA: **lg–xl** (32–48px); increase if CTA is the only action in the section.

---

## 6. Button system

- **Primary (gold CTA):** Solid `--oraya-gold` fill; label uses `--oraya-gold-cta-text` (navy) or `--oraya-on-gold-text` (white) per existing pattern—**default new marketing CTAs to gold fill + readable navy label** unless on a dark-on-gold exception already in code.
- **Secondary (outline):** Transparent or surface fill; border `0.5px`–`1px` gold or `--oraya-border`; text `--oraya-ink` or gold on hover.
- **Ghost / text CTA:** No fill; underline or bottom border in gold at rest or hover; same sans uppercase treatment as primary for consistency.

**Density:** **one primary gold CTA** per logical section or viewport (above the fold). Secondary actions use outline or ghost. Do not compete with two identical solid-gold buttons in the same glance.

---

## 8. Micro-interaction utilities

Defined in **`app/globals.css`** (block after `.oraya-text-muted`). Use these **classes** on public/guest UI for consistent hover, press, focus partners, and theme transitions—**without** one-off `onMouseEnter` / `onMouseLeave` where a class suffices.

| Class | Purpose | When to use |
|--------|---------|-------------|
| **`.oraya-pressable`** | Adds ~**180ms** transitions on transform, shadow, background, border, color; **`active`** scale to **0.98** (subtle press). | Primary/secondary **buttons**, pill actions, emblem/home links that should feel tactile. Pair with fill/outline utilities below. |
| **`.oraya-card-interactive`** | **Hover** (fine pointer only): soft elevation shadow; optional **`--border`** variant adds a light gold ring + shadow. **`a.oraya-card-interactive:active`** scales to **0.995**. | Marketing **cards**, full-card links, tiles that are interactive. **Do not** rely on hover-only affordances for touch-only tasks. |
| **`.oraya-cta-gold-hover`** | Solid gold control: **hover** (not `:disabled`) warms fill to **`#d4b98a`**. | **`<button>`** or **`<a>`** with gold background + readable label (`--oraya-gold-cta-text` / `--oraya-on-gold-text`). |
| **`.oraya-link-nav`** | Uppercase nav-style **link**: **hover** shifts color to **`--oraya-gold`**; no underline. | **Desktop nav** items (Our villas, Experience, etc.). |
| **`.oraya-link-text`** | **Underline** with gold-tinted decoration; **hover** strengthens underline + text toward gold. | Inline **mailto**, “Sign in”, legal adjacency, body **text links** where underline aids scan. |
| **`.oraya-link-cta`** | **No** text underline; **bottom border** hairline that strengthens on **hover**. | **Social strip**, “marketing underline” CTAs that are not full buttons. |
| **`.oraya-link-footer`** | Muted **footer column** links: **hover** to gold (`!important` over inline footer color). | **`SiteFooter`** and homepage footer link columns. |
| **`.oraya-section-tone`** | **`background-color`** transition ~**320ms** when **`data-theme`** changes. | Major **`<section>`** / wrappers that switch surface with light/dark toggle. |

**Related (same file, not duplicated in the table):** `.oraya-cta-nav-reserve` (outline Reserve → gold fill on hover), `.oraya-cta-hero-ghost` (hero outline CTAs), `.oraya-cta-book-guest` / `.oraya-cta-book-back` (booking flow ghosts)—compose with **`.oraya-pressable`** where press feedback is desired.

**Interaction rules**

- **Hover:** Elevation and gold hovers apply under **`@media (hover: hover) and (pointer: fine)`** where specified (cards); touch devices do not get fake hover states.
- **Active / press:** **`.oraya-pressable`** and **`a.oraya-card-interactive`** use transform scale; avoid combining with **layout-affecting** hover (no extra margin/padding on hover).
- **Reduced motion:** Under **`prefers-reduced-motion: reduce`**, transitions collapse to **0.01ms**, **active transforms are disabled**, and **`a.oraya-villa-card-link:focus-visible`** uses a slightly tighter **outline-offset**. **`scroll-behavior`** on **`html`** is **`auto`**.

**Homepage villa cards (accessibility):** add **`oraya-villa-card-link`** on the full-card **`<a>`** for a **`:focus-visible`** outline (gold/ink mix). Does not replace visible focus for other controls.

---

## 9. Implementation notes (do not regress)

- Public pages use **`data-theme="light"` | `"dark"`** on `<html>`; default is light; dark is explicit user choice (`localStorage` key `oraya-theme`).
- **Colors and fonts:** project convention uses **inline styles** for themed colors and typography on key pages—not Tailwind color/font utility classes (utilities were unreliable for custom theme).
- **SVG logos:** inline React components, not `<img>` / `next/image` for SVGs.
- **Admin** surfaces may diverge; this document targets **guest / public** experience first.

---

*Last aligned with `app/globals.css`, micro-interaction utilities, and public booking/home patterns. Update this file when intentionally changing brand tokens, utilities, or section patterns.*
