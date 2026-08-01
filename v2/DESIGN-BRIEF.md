> ⚠️ **SUPERSEDED — see [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).**
>
> This brief describes the app *before* the Order Desk system was applied.
> Its palette table, type notes and "two real problems" section are all now
> out of date — the Arial override is gone, the dead dark-mode block is
> deleted, and the ~380 hardcoded hexes are tokenised. Kept for the record of
> what was wrong and why.

# Gorilla Labs — Design Brief

**For:** Art Director
**From:** the build team
**Live app:** https://salemgorilla-gorilla-order-app.vercel.app/
**Repo:** `salemgorilla/gorilla-order-app` → everything lives in `v2/`

---

## 1. What this is

A self-serve quote builder for **Gorilla Salem**, a screen printing and sign shop in Salem, MA.
A customer configures what they want, sees a live price, uploads artwork, and submits. The shop
gets an email and a Printavo quote appears on the customer's record.

**It is live and taking real customers** — linked from gorillasalem.com as "GORILLA LABS".

Three product flows:

| Flow | Status | Pricing |
|---|---|---|
| **Custom Stickers** | live (Beta) | live price as you configure |
| **Banners & Signs** | live (Beta) | live price from the shop's price boards |
| **T-Shirts & Apparel** | built, hidden | live price + "special order" hand-quote path |

**The audience is walk-in-level customers** — schools, bands, restaurants, contractors, event
organizers. Not designers. Many arrive on a phone.

---

## 2. Current design system (as actually built)

Nothing here is sacred. It grew organically and is ready to be replaced.

### Palette (by usage frequency in the code)

| Hex | Uses | Role today |
|---|---|---|
| `#6f695e` | 100 | muted body text |
| `#171717` | 90 | primary text |
| `#2E5037` | 79 | **brand green** — primary actions, selected states |
| `#dfd0b8` | 50 | card borders |
| `#b7352d` | 42 | **brand red** — section eyebrows, accents |
| `#F8F5EE` | 39 | page background (warm cream) |
| `#eef7ee` | 7 | success surface |
| `#fff7e8` | 6 | caution/notice surface |
| `#e6007e` | 6 | magenta — the artwork cut-line feature (functional, keep) |
| `#efe4d4`, `#f4f8f1`, `#d9cbb2`, `#8a8172` | few | incidental tints |

### Type & shape
- **Fonts loaded:** Geist Sans + Geist Mono (via `next/font`)
- Very heavy weights throughout (`font-black`), tight tracking (`tracking-[-0.05em]`)
- Uppercase micro-labels with wide tracking (`tracking-[0.18em]`) as section "eyebrows"
- Big radii: cards `rounded-[2rem]`, controls `rounded-2xl`, chips `rounded-full`
- Heavy shadows (`shadow-xl`) on nearly every card

### Layout
- Two-column on desktop (`lg:grid-cols-12` → form `col-span-7`, preview/summary `col-span-5`)
- Single column stacked on mobile
- Max width `max-w-7xl`

---

## 3. ⚠️ Two real problems to know about before you start

**1. Geist is loaded but never used.**
`app/layout.tsx` loads Geist and sets the CSS variables, but `app/globals.css` ends with:
```css
body { font-family: Arial, Helvetica, sans-serif; }
```
…which overrides it. **The app is actually rendering in Arial.** Whatever type direction you
choose, this line needs to go — and it means the current look has never been seen as intended.

**2. There's a dead dark-mode block.**
`globals.css` sets `--background: #0a0a0a` under `prefers-color-scheme: dark`, but every screen
hardcodes light colors (`bg-[#F8F5EE]`). So dark mode does nothing except potentially flash.
Either commit to dark mode properly or delete the block.

**3. Colors are hardcoded hex, everywhere.**
There are ~380 inline hex values across the UI. There is no token layer. If you want to restyle,
the highest-leverage first move is introducing CSS variables / Tailwind theme tokens so a palette
change is one file instead of 380 edits. The build team can do this refactor — just say the word.

---

## 4. Where things live (what to change to affect what)

```
v2/
  app/
    layout.tsx        ← fonts + page metadata
    globals.css       ← the two problems above
    page.tsx          ← page shell, hero, product picker, two-column layout
  components/
    Header.tsx        ← "GORILLA LABS" masthead
    QuantitySelector.tsx  OptionSelector.tsx   ← the repeated button-grid pattern
    CustomerForm.tsx  NeedByDate.tsx  SubmitButton.tsx
    upload/UploadBox.tsx  ← drag & drop artwork
    preview/          ← StickerPreview, StickerShape (the live proof), ApparelPreview
    summary/          ← OrderSummary, OrderValidation, ArtworkAnalysisCard
  features/
    QuoteConfirmation.tsx  ← the post-submit screen
    QuoteReviewCard.tsx    ← "Review Your Quote"
    stickers→decals/, apparel/, signs/  ← each flow's builder + summary + preview
```

**`OptionSelector` and `QuantitySelector` are the workhorses** — most of the form is those two
components repeated. Restyling them changes most of the app at once.

---

## 5. Where design would help most

Ranked by impact, in our opinion — push back freely.

1. **The product picker (first screen).** Three cards: Stickers, Apparel, Signs. It's the first
   decision and currently reads as three flat boxes. Two are "Beta", one "Soon" — that state
   needs to look intentional rather than unfinished.
2. **Visual hierarchy in the builder.** Every section currently shouts equally: same red eyebrow,
   same black heading, same card. Nothing guides the eye down the flow. A customer doesn't know
   what's required vs optional.
3. **The live proof preview.** This is the delight moment — the artwork appears on a sticker/sign
   as you configure. It deserves to feel like the centerpiece; right now it's one card among many.
4. **Mobile.** A lot of customers will be on a phone. The two-column layout stacks, which means
   the price/preview falls far below the controls. Worth rethinking rather than just stacking.
5. **Price presentation.** The estimate is the thing people came for. It's currently a row in a
   list of rows.
6. **Trust and tone.** It's a local shop, not a faceless printer — "Printed Locally in Salem, MA",
   "real proof review before production". That personality could come through much harder.

---

## 6. Constraints

- **Next.js 16 + React 19 + Tailwind v4.** Styling is Tailwind utility classes inline.
- **No component library** — everything is hand-rolled. Free to introduce one, but it's a
  meaningful refactor.
- **No design tokens yet** (see §3.3).
- **Functional colors that must stay legible:** magenta `#e6007e` means "cut line" in the artwork
  feature and appears in customer instructions; green/red are used for valid/invalid states.
- The proof previews are **CSS-rendered, not images** — the die-cut contour is built from stacked
  `drop-shadow` filters reading the artwork's alpha. Fun to style, but changes there are code, not
  assets.

---

## 7. How to hand work back

Whatever's easiest for you:
- **Figma / mockups / screenshots** — we'll implement
- **A palette + type scale** — we'll apply it and introduce the token layer at the same time
- **Direct edits** — it's a normal Next.js repo; `npm run dev` in `v2/`
- **Just notes** — a prioritized list of what's wrong is genuinely useful on its own

Please look at the **live site** rather than local — it's current, and the flows only make sense
when you configure something and watch the price and proof update.

**Try this path to see it properly:**
1. Custom Stickers → change size/shape/type → watch the price and proof update
2. Upload any PNG with transparency → the die-cut contour follows the artwork
3. Banners & Signs → Yard Sign → set quantity to 10 → watch the tier pricing

---

## 8. Brand assets

The shop's existing identity (the purple/green "GORILLA" wordmark, the in-store price boards)
lives with Gorilla Salem — worth asking them for the source files. The app's current look was
built without them, so aligning the two is a real opportunity.
