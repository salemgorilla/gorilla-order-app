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
| `--rule` | `#8e8674` | 1px hairline frame — **container edges**. 3.61:1 on paper, 3.20:1 on blank. Was `#d8d2c4` (1.51:1), below the 3:1 WCAG floor for a UI boundary. Held by `tests/token-contrast.test.ts`. |
| `--rule-faint` | `#d8d2c4` | Hairline **inside** an already-bordered container. Exempt from 3:1 on purpose — the container edge carries the structure. Never a container edge. |
| `--gorilla-green` | `#2e7d32` | Brand. Never replace. |
| `--gorilla-green-dark` | `#1b5e20` | Hover/pressed step |
| `--green-bright` | `#5dbb63` | Ink-on-black surfaces only |
| `--rush-red` | `#b23a2e` | Rush, late, error. Never decorative. Section eyebrows and product availability lines used to carry it and no longer do — an alarm ink on every section is not an alarm. |
| `--rush-red-dark` | `#8c2c22` | Hover/pressed step |
| `--surface-ok` / `--surface-warn` / `--surface-rush` | pale tints | Status panels |

### Type

- **Space Grotesk** — display and UI (`--font-display`)
- **JetBrains Mono** — spec furniture *only* (`--font-spec`), via `.spec`

Use `.spec` for things that are **real values**: quantities, ticket numbers,
timestamps, sizes, counts. Mono is a signal that a number means something.
Never decorative.

### The scale is the only scale

Ten steps, all in `@theme` in `globals.css`: `spec · fine · body · value ·
lede · head · section · display · hero · price`.

**Do not reach for Tailwind's default ramp.** `text-sm`, `text-xs`, `text-base`
and `text-lg` were exact shadows of `fine`, `spec`, `body` and `value`, and
232 sites used them — so the scale governed about a quarter of the app and
editing a token moved almost nothing. Three sites stay on the raw ramp on
purpose and say why in place (two mono controls sized by their touch target,
and the GS mark inside the drawn sticker, which is product art).

`--text-display` and `--text-hero` are not the same job. `display` is also the
glyph size inside the fixed 4rem/5rem badge squares in `UploadBox`,
`QuoteConfirmation` and the handoff page; `hero` is the page headline and is
fluid. Scaling `display` overflows three boxes.

Letterfit is a token too: `tracking-display` for headings, `tracking-eyebrow`
for section markers. 39 eyebrows had once been hand-rolled across six
different tracking values.

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
It now feeds only a swatch in the spec row, and the catalog's real `colorHex`
wins over it when the catalog has loaded. (The drawn garment that used to
carry these colours is gone — see §6.)

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

## 4. Steps

The order form is five steps, not one scroll: **Product · Details · Artwork ·
Contact · Review**. `lib/steps.ts` is the only description of them.

The rule that keeps the step bar honest is `FIELD_STEP` — a **full**
`Record<FieldKey, StepId>`, not a `Partial`. `FieldKey` is the one union of
everything any flow can mark invalid, so adding a field in `lib/validation.ts`
without deciding which step owns it is a build error rather than a field that
submit can mark red but never navigate to.

Two things follow from that and must not be broken:

- **Submit navigates before it marks.** Submit lives on the last step, so the
  missing box is almost never on screen, and only the current step is mounted.
  `getFirstStepWithError()` picks the step in ORDER_STEPS order, `page.tsx`
  switches to it, *then* sets `showFieldErrors` — otherwise there is no
  `[data-invalid]` in the document for the scroll effect to find and pressing
  submit appears to do nothing.
- **Two scroll effects, two tokens.** `stepScrollToken` (top of a new step) and
  `scrollToInvalidToken` (onto the offending field) must never fire in the same
  commit. Customer-driven navigation bumps the first; a failed submit bumps
  only the second.

Steps do not gate. Every step is reachable at any time and "Continue" never
validates — same reasoning as the submit button being pressable rather than
disabled. Submit is the single gate, where it can name everything missing at
once instead of stopping the customer five times on the way down.

Completion is read from **live** errors, not marked ones: marks wait for a
submit attempt, but a step must stop claiming "done" the moment a box is
emptied. Steps owning no fields are handled explicitly — Product completes on
visit, Review is `terminal` and never completes, because "done" there would
claim the order was placed.

---

## 5. Accessibility floor (customer-facing forms)

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

## 6. Still open

- **Weight carries no hierarchy.** On the sticker builder step the rendered
  page is 85 elements at 700, 64 at 400 and 15 at 600 — more than half the
  visible text is bold, which means bold has stopped meaning anything. Labels,
  values and headings are all at 700, so in an accessibility-critical form the
  question and the answer are typographically identical. The fix is a step
  (labels 500/600, values and headings 700), not removing bold; it touches
  ~340 sites and has not been done. Space Grotesk carries 300–700, so the
  range is there.
- 39 eyebrows now share `tracking-eyebrow`, but most still hand-roll
  `text-spec font-bold uppercase` instead of the `.eyebrow` class, because
  `.eyebrow` hard-sets `color: var(--ink-muted)` and several of them are
  deliberately `--rush-red` or `--gorilla-green`. Consolidating needs a colour
  variant decided first.
- No KPI strip or status flow chips from the reference build. The step bar
  landed — see §4.
- A composite apparel proof — artwork placed on the garment photograph — is
  deliberately not built. The old one pinned artwork at constants tuned to a
  CSS drawing, so on an `object-contain` photo it landed nowhere in
  particular while calling itself a proof. Placement has to be derived from
  the photograph; until it is, garment and artwork are shown side by side and
  the caption promises nothing about position.

---

## 7. Decided against

### A `GP-[SCR|EMB|DTF|TBD]-[YY]-[RUN]` ticket grammar

§6 carried this as an open item. It should not be built, and the reason is
worth keeping so it does not get built later.

**The app already has a ticket grammar, and it is a real one.** Three layers,
each pointing at something that exists:

| Layer | Where it is made | Where the customer meets it |
|---|---|---|
| `GS-YYYYMMDD-XXXXX` | `generateQuoteNumber()`, quote route | Confirmation screen, both emails, and `/track` — the tracker keys on it |
| `DESIGN 01 / 02` | `DesignCard`, from cart position | The builder, whenever there is more than one design |
| `GORILLA-DECAL-1` · `-SETUP` · `GORILLA-APPAREL-{style}` · `GORILLA-SIGN-…` · `GORILLA-SHIPPING` | `lib/printavo.ts` | Every line of the Printavo invoice |

The middle and bottom rows are the same number: `GORILLA-DECAL-2` is
`DESIGN 02`, and both are the cart position that also names the
`design-2-*.png` attachment.

A fourth scheme would be a second name for a job that already has one, and
`[RUN]` is a run number nothing in this codebase generates or stores, on a
flow (stickers) that has no print method to put in `[SCR|EMB|DTF]`. The house
rule on spec furniture is that it has to point at a real value — a real SKU,
timestamp or count — and that invented furniture is costume. This would be
costume.

The SKU vocabulary above is also not decorative: it was rebuilt once because
sign setup fees derived their item number from the label text, so the same
charge filed under `GORILLA-FEE-SETUP-2-DESIGNS-15`,
`GORILLA-FEE-SETUP-FEE-PER-DESIGN` and others, and "how much setup did we bill
this quarter" had no answer. Adding a parallel numbering system is the same
mistake with better typography.

**What is genuinely missing** is nothing in the naming — it is that a job has
no identity at all until it is submitted, because `GS-` is minted server-side
in the quote route. Moving that earlier would put a number on screen from step
one, but it would also make the browser the source of a value Printavo keys
on, burn numbers on abandoned quotes, and touch the checkout path — which
means a Printavo reconciliation. Not worth it for furniture.
