# Order Desk — as built

The house design system, as it actually exists in this repo.
Supersedes `DESIGN-BRIEF.md`, which described the app *before* this work and
is kept only for its history of what was wrong.

**Register:** Republic — cold, systematic, print-shop-as-institution.
**Held constraint:** *every panel is a print ticket.* Hairline 1px frames,
mono spec furniture, radius 0 everywhere, borders not shadows.

---

## 1. Where the system lives

`app/globals.css` is the single source of truth. Every colour, the radius,
the motion duration and the two font faces are declared there as CSS custom
properties and mapped into the Tailwind v4 theme.

**Change an ink there and it changes everywhere.** Do not reintroduce raw hex
into a component — add a token instead.

### Inks

| Token | Value | Use |
|---|---|---|
| `--ink-black` | `#111111` | Text, rules, frames |
| `--ink-muted` | `#5f594e` | Secondary text (4.5:1 on the blank) |
| `--ink-warn` | `#6b4e0f` | Caution text on `--surface-warn` |
| `--shirt-blank` | `#f4f1ea` | Page ground, panel tint |
| `--paper` | `#ffffff` | Panel fill above the ground |
| `--rule` | `#d8d2c4` | 1px hairline frame |
| `--gorilla-green` | `#2e7d32` | Brand. Never replace. |
| `--gorilla-green-dark` | `#1b5e20` | Hover/pressed step |
| `--green-bright` | `#5dbb63` | Ink-on-black surfaces only |
| `--rush-red` | `#b23a2e` | Rush, late, error. Never decorative. |
| `--rush-red-dark` | `#8c2c22` | Hover/pressed step |
| `--surface-ok` / `--surface-warn` / `--surface-rush` | pale tints | Status panels |

### Type

- **Space Grotesk** — display and UI (`--font-display`)
- **JetBrains Mono** — spec furniture *only* (`--font-spec`), via `.spec`

Use `.spec` for things that are **real values**: quantities, ticket numbers,
timestamps, sizes, counts. Mono is a signal that a number means something.
Never decorative.

> Historical note: the app rendered in **Arial** for its entire life. Geist was
> loaded in `layout.tsx` and thrown away by a `font-family: Arial` line in
> `globals.css` on the very next file. Do not put a `font-family` on `body`.

### Structure

Radius `0`. Borders, not shadows — a hard offset `3px 3px 0` is permitted,
blur never. Motion is 120ms linear and functional only.

---

## 2. Affordances

`components/ui/Chip.tsx` is the canonical selection control and carries the
house rules once. `OptionSelector` and `QuantitySelector` are most of the
form, and both delegate to it.

| State | Treatment |
|---|---|
| Hover | **Ink inversion** (fill/text swap), 120ms linear |
| Focus | 2px `--gorilla-green` outline, 2px offset — **never removed** |
| Active | 2px translate |
| Disabled | 40% opacity + `not-allowed`, no hover. Never a grey fill. |
| Loading | Mono label. No spinner. |

Selected chips also carry a **heavier border**, so the state survives
greyscale and colour-blindness. Colour is never the only signal.

---

## 3. What is deliberately NOT tokenised

This is the important part. Three categories of colour in this app are
**material or print values, not interface tokens**, and sweeping them into
the palette would be a bug:

**`components/preview/ApparelPreview.tsx`** — the `garmentColors` map is the
colour of physical blanks. Design *onto* the blank; it is not a UI surface.
The drawn collar, sleeves and hem also keep their radius — that is a garment,
not a card.

**`components/preview/StickerShape.tsx`** — the white vinyl border, the
transparency checkerboard, the die-cut contour, and the `rounded-full` /
`rounded-[36%]` shapes are the *product*. The holographic
(pink→yellow→blue) and chrome (zinc) gradients stay gradients because that
stock is genuinely iridescent.

**The cut line** — `--cut-line` is `#ff00ff` and must stay RGB 255,0,255.
`isMagentaPixel()` in `lib/artwork.ts` requires `blue > 190` to auto-detect
it, and the on-screen copy tells customers to use exactly that value.

> This was a live bug: the legend swatch rendered `#e6007e` (blue = 126), so
> a customer who colour-picked the swatch we showed them produced a cut line
> the detector could not see, and landed in the "we couldn't spot a magenta
> line" branch with no explanation. If you change this value, change all
> three: the token, the copy, and the detector threshold.

**`lib/email.ts`** keeps literal hexes on purpose — email clients do not
support CSS custom properties. They derive from named constants at the top of
the file; keep them in sync with `globals.css` by hand.

---

## 4. Accessibility floor (customer-facing forms)

This app is a form filled in by walk-in customers, often on a phone. The
following override the taste rules and are not negotiable:

- **Sentence case** on labels and errors. No all-caps body text.
  (Section eyebrows may stay caps — they are section markers, not labels.)
- Every input has a real `<label>` with `htmlFor`. **A placeholder is not a
  label** — it disappears on typing and is not reliably announced.
- Correct `type` and `inputMode` so phones raise the right keyboard, plus
  `autocomplete` so autofill works.
- Required state is carried by the word "(required)", not by colour alone.
- 44px minimum touch targets. Checkboxes are small, so they are wrapped in a
  label that supplies the hit area.
- Focus indication is never removed.

---

## 5. Still open

- Type scale is still fairly flat — display is ~2.25x body where the system
  asks for 4–10x. Headings are uniformly `font-black`.
- No ticket grammar in the UI yet (`GP-[SCR|EMB|DTF|TBD]-[YY]-[RUN]`).
- Price and proof are still rows among rows rather than the focal points.
- No step bar, KPI strip, or status flow chips from the reference build.
- `ApparelPreview` still holds pre-system colours; apparel is hidden behind
  "Coming Soon", so it was left until that flow launches.
