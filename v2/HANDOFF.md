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

## Session addendum — 2026-08-09/10

Read this before the older sections below; where they disagree, this wins.

### Read `.claude/agents/app-support.md` first

It loads automatically in Claude Code on this repo and carries the invariants
that have actually cost something. The one to internalise: **`isStickerOrder()`
in `app/api/quote/route.ts` decides which submissions auto-bill through
Printavo with no human in the loop.** It used to classify by *absence*, so any
new flow that forgot a field became a sticker order and charged someone a
price nobody set. It now also requires the product type to say "sticker".

### In flight: PR #2, `develop` -> `main`, GREEN AND UNMERGED

Eight commits. **The phone number is still live on production** — the previous
merge took `develop` at `06139fa` and the removal landed in `7bb983f` just
after. Merging #2 is the single highest-value action available.

Contents: phone removal · step-based form (5 steps) · apparel as a hand-quote
request · abandoned-quote lead capture · four real Google reviews ·
"how did you hear about us" · pre-checked newsletter opt-in · cart pricing
split · "back to the beginning" control.

### Env vars added, NOT yet set in Vercel

```
LEAD_TO_EMAIL              # where INCOMPLETE-quote notices go; falls back to QUOTE_TO_EMAIL
ZAPIER_NEWSLETTER_HOOK_URL # Zapier catch hook -> Constant Contact. Unset = sign-ups skipped, quote unaffected
```

### Cart (CART-PLAN.md) — one piece done, the big one not started

`5a12f10` split setup from material: `getStickerMaterialPrice()` + one fee,
which IS a one-design cart, so today's prices are arithmetic-identical.
`getCartSetupFee(n)` = $25 + $12.50 per extra design, verified against the
plan's table ($197.40 / $173.40 / $148.40). **It is not wired to anything yet.**

Not started: `order.product` -> `order.items[]`. That is **88 references
across 8 files**, 61 in `app/page.tsx`, ending in the money path. Draft types
were written and reverted rather than leave the tree unbuildable.

**The trap:** `buildQuotePayload` must still SYNTHESISE a `product` saying
"Custom Stickers". Drop it and `isStickerOrder()` returns false and stickers
silently stop generating payment links — no error, just no money.

### Order tracker — statuses decided, nothing built

Gabe added eight custom Printavo statuses on 2026-08-10.
`ORDER-TRACKING-SPEC.md` says show them verbatim, with an override map in
`lib/order-status.ts` for any that are internal shorthand. Two leak, so the
agreed map is:

```ts
const CUSTOMER_FACING: Record<string, string> = {
  "Order on Hold (Issue)": "On hold — we need to check something with you",
  "Lab Order Placed": "Order received",
  "Lab Order Pre-Press": "Preparing your artwork",
  "Lab Order Printing": "Printing",
  "Lab Order Completed - Ready For Local Pickup": "Ready for pickup in Salem",
  "Lab Order Completed - Picked Up": "Picked up — thank you",
  "Lab Order Completed - Ready To Ship": "Ready to ship",
  "Lab Order Completed - Shipped": "Shipped",
};
```

Why: "(Issue)" reads to a customer as *something is wrong and it may be your
fault*, with no idea what to do. The "Lab Order " prefix is shop taxonomy for
separating app orders from walk-ins — keep it in Printavo, strip it on the
customer's screen. "Pre-Press" is trade jargon.

The spec defers the build until after the design contrast fixes and the
apparel launch, and says not to share a branch with them. Start it off `main`
**after** #2 merges.

### Still Gabe's call, not code

- Apparel's full configurator is blocked on **pricing sign-off**, not the
  preview — that port is done (`e41e49a`).
- "Gorilla Salem" appears ~50 times across 19 files including the customer
  quote email and the Printavo push; the brand guide calls the business
  Gorilla Printing. That is a rename decision.
- Nobody has run a real sticker order end to end since `isStickerOrder()`
  changed. Worth doing once on the preview before trusting the payment path.

---

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

1. ~~**`ApparelPreview` Order Desk pass.**~~ **Done.** Rebuilt on the
   `SignsPreviewCard` pattern. The CSS garment was deleted rather than
   restyled: the real S&S photograph already covered it, and the artwork
   overlays were pinned to the drawn body's coordinates, so a customer was
   shown their art at an arbitrary spot on a real garment and told it was a
   proof. Garment and artwork are now two framed items side by side with the
   locations as text — a composite needs placement derived from the
   photograph, which is its own job.

   Apparel is no longer blocked on this. It ships today as a hand-quote
   request (`status: "request"` in `lib/products.tsx`); the remaining blocker
   for the full configurator is sign-off on S&S and screen-print pricing, not
   the preview.
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
