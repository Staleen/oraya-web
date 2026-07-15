# Oraya — Welcome Book Exploration

This is **not a component library.** There is no JS bundle and no components to
import. It is a **brand + content seed** for one job: designing new professional
directions for Oraya's **printed A4 villa welcome book**.

Your job is to **invent the layout system.** Grid, rhythm, hierarchy, section
structure, page count, cover concept, illustration language — all open, all yours.
What is fixed is the brand (palette, type pairing, tone), the facts, and the print
frame. Read `guidelines/03-exploration-brief.md` before designing; it is the task.

## Setup — no provider, plain CSS

Link the entry stylesheet and everything else follows through its `@import`
closure. There is nothing to wrap, no theme provider, no registration order.

```html
<link rel="stylesheet" href="styles.css">
```

`styles.css` pulls in `tokens/color.css`, `tokens/type.css` (which loads Playfair
Display + Lato from Google Fonts), and `tokens/print.css`. Skip the link and you
get no palette, no fonts, and no page frame.

## The styling idiom — CSS custom properties + a thin primitive layer

**Style with `var(--oraya-*)` tokens and your own CSS.** The `.oraya-*` classes
below are a *foundation*, not a layout kit — use them where they enforce a hard
rule, and write your own CSS for everything compositional.

**Colors** (brand constants — never add or alter hues):
`--oraya-gold` `--oraya-gold-deep` `--oraya-terracotta` `--oraya-olive`
`--oraya-beige` `--oraya-beige-light` `--oraya-ivory` `--oraya-page`
`--oraya-charcoal` `--oraya-midnight` `--oraya-muted`
`--oraya-gold-10` `--oraya-gold-28` (faint fills, soft hairlines)

**Type** — `--oraya-font-display` (Playfair Display: titles, large numerals,
italic accents — **display only**) and `--oraya-font-body` (Lato: **all** body and
functional copy). *Identity rule: body copy is never set in the serif.*
`--oraya-eyebrow-tracking` is the letterspaced-uppercase label voice.
Type scale and hierarchy are **open** — the serif's italic and its dramatic scale
range are explicitly under-explored (see `guidelines/04-v2-critique.md`).

**Print** — `--oraya-page-width` (210mm) `--oraya-page-height` (297mm)
`--oraya-margin` (14mm) `--oraya-bleed` (3mm) `--oraya-danger-zone` (5mm — no
critical content inside it) `--oraya-hairline` (0.5pt — never draw a thinner rule;
it must survive a plain office printer).

**Primitive classes**:

| Class | Use |
|---|---|
| `.oraya-page` | One A4 page. Modifiers: `--bleed` `--midnight` `--ivory` `--beige` `--beige-light` |
| `.oraya-display` `.oraya-display--italic` `.oraya-body` `.oraya-eyebrow` `.oraya-caption` | The type voices |
| `.oraya-rule` `.oraya-rule--soft` `.oraya-gem` `.oraya-arch` | Gold hairline, rotated-square gem, arched top (optional motifs) |
| `.oraya-photo-slot` + `--portrait` (cover hero) / `--landscape` (3:2 plate) | Photo slots. **Real villa photography does not exist yet** — empty, these render as an intentional gold-washed field with a gem, never an empty "PHOTO" box. Add `.is-filled` + `background-image` to upgrade in place. |
| `.oraya-qr-slot` | QR/map placeholder frame. **Never draw a real QR** — production tooling generates them. |
| `.oraya-panel` `.oraya-fact__label` `.oraya-fact__value` | High-clarity operational form. Checkout and emergency content **must** stay list/panel shaped, however editorial the rest becomes. |

## Where the truth lives

- `styles.css` and `tokens/*.css` — every token and primitive, with its rule.
- `guidelines/03-exploration-brief.md` — **the task**: quality bar, print
  constraints, photo-slot rules, what to explore.
- `guidelines/01-brand-context.md` — palette, type, motifs, voice.
- `guidelines/02-content-brief.md` — the approved facts. **Content reference only,
  never a layout map.** Regroup and re-sequence freely; drop nothing; invent nothing.
- `guidelines/04-v2-critique.md` — why the current prototype is only 8.7/10.
  The listed failures (ledger monoculture, single-column monotony, timid type) are
  the bar to clear.
- `guidelines/00-seed-rules.md` — the hard rules.

## Idiomatic snippet

```html
<link rel="stylesheet" href="styles.css">

<section class="oraya-page oraya-page--midnight" style="display:grid; grid-template-rows:1fr auto; gap:12mm;">
  <div class="oraya-photo-slot oraya-photo-slot--landscape oraya-arch"></div>
  <div>
    <p class="oraya-eyebrow">Villa Byblos · Mastita, Jbeil</p>
    <h1 class="oraya-display" style="font-size:46pt; margin:4mm 0 6mm; color:var(--oraya-ivory);">
      The House <em class="oraya-display--italic">Book</em>
    </h1>
    <hr class="oraya-rule" style="width:28mm;">
  </div>
</section>
```

Compose the page with your own grid; reach for `var(--oraya-*)` for every colour,
face and measure.

---

## Contents of this project

```
styles.css                    entry stylesheet — link this
tokens/color.css              brand palette
tokens/type.css               Playfair Display + Lato, the eyebrow voice
tokens/print.css              A4 frame, margins, bleed, hairline floor
guidelines/00-seed-rules.md   hard rules for any exploration
guidelines/01-brand-context.md   palette, typography, motifs, voice
guidelines/02-content-brief.md   approved facts (content reference only)
guidelines/03-exploration-brief.md   THE TASK — read this first
guidelines/04-v2-critique.md     what the current prototype gets wrong
```

No `_ds_bundle.js`, no component cards: this seed intentionally ships zero
components so that nothing anchors the exploration to existing code.
