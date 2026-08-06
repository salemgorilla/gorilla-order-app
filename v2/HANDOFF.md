# Handoff — where things stand

Written 2026-08-06 at the end of a long working session. Read this first, then
`CART-PLAN.md` and `DESIGN-SYSTEM.md`.

## Live right now

`main` is deployed to https://labs.gorillasalem.com (Vercel, production
branch is `main`). The custom domain is wired correctly — do NOT touch the
`@` or `www` DNS records for gorillasalem.com, those are Squarespace and
repointing them took the main site down once already.

Working and verified in production:

- **Stickers self-checkout.** Customer configures, pays, done — no shop step.
  The Printavo pay link was confirmed working by Gabe. Sticker orders can
  arrive already paid.
- Sticker pricing is `(width x height x $0.032) + ($25 / quantity)`. Chrome
  and holographic are +60% on the material portion only.
- Signs: 13oz / 18oz / mesh, sewn double-sided on 13oz, no-hem credit on
  18oz, MA 6.25% tax. Apparel is tax exempt (clothing).
- Order Desk design system throughout, sticky estimate bar, aspect-correct
  sticker proof.

## On `develop`, NOT deployed — awaiting Gabe's test

- **Sticker size and quantity are now three typed number fields** (width,
  height, how many). All preset chips removed. Shape and material keep chips
  because they are choices, not numbers.
- **Apparel Pass A fixes** (all still behind "Coming Soon"):
  - default garment colour Black -> White. Black triggered an underbase
    charge, so every customer opened apparel with a surcharge they had not
    chosen.
  - catalogue pre-select pinned to the Starter Tee instead of `products[0]`,
    which was an alphabetical accident.
  - removed the status pill whose idle branch read "Ready" — a customer takes
    that as a promise about their order.
  - apparel quantity is now DERIVED from the size grid. The separate quantity
    picker is gone and the "size breakdown must total 24" error with it.
- Die-cut proof edge is `#e6e4de` rather than white, so it is visible against
  the white proof stage.

## Next work, in order

1. **`ApparelPreview` Order Desk pass.** Still has `rounded-[2rem]`,
   `shadow-xl` and seven raw hexes — it was deliberately excluded while
   apparel was hidden. Launch apparel without this and it looks like a
   different app. This is the last thing blocking apparel going live.
2. **Sticker cart + proof attachment** — fully specced in `CART-PLAN.md`.
   Build them together; they land on the same submit path.

## Gabe's to-do, not code

- **Rotate the S&S Activewear API key.** Exposed in screenshots earlier, never
  rotated. The one real security item.
- **Reprint the in-shop price boards.** Signs prices rose ~11-13% and the
  printed boards still show the old rates, so anyone quoting from the board
  undercuts the app.

## Things worth not re-learning

- **Verify by running, not by reading.** Nearly every real bug this session
  was found by executing something — building an email, measuring the DOM,
  running the pricing engine — not by reviewing code. Several scripted
  patches silently matched nothing and reported success.
- **The live Printavo schema beats the published docs.** `lineItems` is a FLAT
  list; the docs render it nested.
- `asciiSafe()` in `lib/printavo.ts` DELETES characters outside
  `\x20-\x7E`. Keep anything bound for Printavo plain ASCII.
- `lib/email.ts` splits every row on the first `": "` — never put that
  sequence in a label.
- `printavo.ts` filters line items to `amount > 0`, so $0 and negative lines
  vanish. Credits are netted into the product line for this reason.
- Colours that are NOT UI tokens and must never be swept into the palette:
  garment blanks in `ApparelPreview`, the vinyl border and checkerboard in
  `StickerShape`, and `--cut-line` which must stay RGB 255,0,255 because
  `isMagentaPixel()` requires blue > 190.
