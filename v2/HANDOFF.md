# Handoff — where things stand

**Every entry below is dated. Add a dated line when you touch this file** —
this doc drifted five merges out of date because nothing forced a timestamp,
and a doc stating stale facts confidently is worse than no doc, because the
next session will act on it.

Read this first, then `AGENTS.md` and `DESIGN-SYSTEM.md`.

## Live right now — 2026-08-19, `main` @ `0d81b42`

`main` is deployed to https://labs.gorillasalem.com (Vercel, production branch
is `main`, root directory `v2`). The custom domain is wired correctly — do NOT
touch the `@` or `www` DNS records for gorillasalem.com, those are Squarespace
and repointing them took the main site down once already.

531 tests passing, `tsc` clean, 0 lint errors.

Working and verified:

- **The form remembers a returning customer's contact details** — name,
  company, email, phone — on their own device, and says so with a way out.
  Contact fields only: `toRememberedContact` in `lib/remembered-contact.ts`
  builds a new object from four named fields, so handing it the whole customer
  record still cannot write notes, attribution or the newsletter tick. **Never
  at the kiosk**, gated on `kiosk.enabled` — the same signal every other kiosk
  behaviour reads, verified in a browser with a record present.
- **Reconciled again on 19 Aug**, after the pricing work of 17–18 Aug: a real
  sticker order placed on production, checked against the Printavo invoice,
  and voided. That is the `AGENTS.md` gate for a pricing change, and it is the
  thing 199 committed price rows cannot substitute for.
- **Stickers self-checkout, and the invoice matches the site.** Verified live
  on 15 Aug against a real three-design order: `$136.40` goods, `$50.00` setup,
  `$144.93` due — Printavo to the cent. Sticker orders can arrive already paid.
- Sticker pricing is `(width x height x $0.032) + setup`, where setup is `$25`
  for the first design and `$12.50` for each one after, charged once per cart
  rather than per design. Chrome and holographic are +60% on the material
  portion only.
- **Apparel invoices as three separate lines** — garments,
  `GORILLA-APPAREL-PRINT`, `GORILLA-APPAREL-SETUP` — rather than one blended
  unit price that the shop could not review.
- Signs: 13oz / 18oz / mesh, sewn double-sided on 13oz, no-hem credit on 18oz,
  MA 6.25% tax. Apparel is tax exempt (clothing).
- **The art slider caps per shape** at the scale where art actually reaches the
  cut — 141 circle / 113 rounded / 104 square — with an opt-in bleed mode that
  restores the old 150 ceiling and shows the overflow honestly instead of
  clipping it. Derived from the safe-area factors in `lib/sticker-geometry.ts`,
  which the canvas proof now reads too.
- Signs and apparel validation live in `lib/validation.ts` and have test
  coverage. They used to be closures inside `app/page.tsx` that nothing could
  test, which is how signs came to be missing a quantity check.
- Order Desk design system throughout, sticky estimate bar, aspect-correct
  sticker proof.
- **`/track` finally has a door.** Printavo's payment request — the only
  message a sticker customer receives from this system — now carries
  `labs.gorillasalem.com/track?order=GS-…`, and `/track` seeds the order
  number from that param. The email field is deliberately NOT prefillable
  from the URL: it is the only thing between a guessed order number and
  someone else's order status.

### Repeat customers — where the spec stands

**2026-08-19.** `GORILLA-SPEC-repeat-customer.md` has four phases.

- **Phase 0 (artwork URLs findable and parseable) — SHIPPED.** See the ARTWORK
  FILES block and `ARTWORK_LINKS_JSON` in the Printavo customer note.
- **Phase 1 (remember the customer on their device) — SHIPPED.** Above.
- **Phases 2 and 3 (`/my-orders`, reorder) — BLOCKED**, on the probe below.
  Not started, deliberately. Both assume a contact's orders can be listed in
  one Printavo query and nobody has checked.

### Open question — can we list one contact's orders in one query?

**2026-08-19. NOT ANSWERED. See `PRINTAVO-PROBE.md`, which is the probe ready
to paste.** Phases 2 and 3 of the repeat-customer spec both assume yes and
nobody has checked. It cannot be answered from a coding session: there are no
Printavo credentials in that environment and no endpoint that runs arbitrary
GraphQL, and shipping one to production to answer a research question is not a
trade worth making. Five minutes for anyone with a Printavo login.

**If the answer turns out to be no, that is a finding, not a failure** — it
means those phases need a database and the decision goes back to Gabe. Do not
route around it by adding storage.

Mind the rate limit while probing: 10 requests per 5 seconds, account-wide, and
one submitted quote costs 3. A probe loop can take live checkout down.

### Known broken — do not re-diagnose these

- **S&S catalogue returns 401.** `Style 39 failed with 401: "Authorization has
  been denied for this request."` Eliminated as causes: env scoping (both vars
  are present — a missing one throws before any HTTP call), stale build (three
  genuine rebuilds), and surrounding whitespace (`getRequiredEnv` now trims,
  and the 401 survived it). What remains is the credential pair itself for
  account `00424`, or API access not being enabled on that account. **Waiting
  on S&S, not on code.** Re-checked 19 Aug against production after two more
  redeploys — `/api/ss-catalog` returns the same 401. Nothing about this has
  moved, and nothing in the repo will move it. `/api/health?secret=` reports both credentials'
  character counts so a wrong value can be spotted without printing it.
- **`ZAPIER_NEWSLETTER_HOOK_URL` unset.** Opt-ins write a consent record and
  reach no list. Backfillable from past quote emails once a hook exists — the
  consent wording is in `buildCustomerLines` and is shared by both the text and
  HTML renderings, so the record cannot disagree with itself.
- **Artwork blobs never expire, as far as the code is concerned.** Checked
  2026-08-19: `handleUpload` passes no TTL and no expiry, and nothing in the
  repo calls `del()` — only `upload`, `handleUpload` and `list` are imported
  from `@vercel/blob` anywhere. So the artwork links now surfaced in the
  Printavo note are permanent, and reorder has retroactive coverage over every
  past order. The one thing a coding session cannot see is a lifecycle rule set
  on the store itself in the Vercel dashboard; worth one glance to close it off.
- **`PRINTAVO_CUSTOMER_ID` unset.** Optional fallback for a quote whose
  customer email cannot be resolved. Silent when it fires.
- Apparel is `status: "request"` deliberately, because of the S&S 401. The full
  `ApparelBuilder` is not rendered — choosing apparel pins `specialOrder` and
  routes to `ApparelRequestBuilder`, because the menu flow's pricing is not
  signed off.

### Decided — signs and apparel customers get no email, for now

**2026-08-19. Gabe chose option 1. This is settled; do not re-litigate it.**

Signs and apparel are hand-quoted, so no payment request fires, so those
customers receive NOTHING from the app: no confirmation, no order number, no
tracking link. Only sticker customers who self-checkout get an email, and that
email is Printavo's payment request — which carries the /track link. Nothing is
sent AFTER payment either; a sticker customer pays and hears nothing until a
proof arrives by hand.

Both gaps are known and accepted. A human is already in the loop on signs and
apparel and can paste the tracking link, and tracking only pays off where a
customer has a number to track — today only stickers issue one automatically.

**Revisit when apparel goes live**, which is the point at which a second flow
starts issuing order numbers on its own. The option then is a real confirmation
email on submit for every flow, carrying the quote number and the tracking
link.

THE TRAP FOR WHOEVER BUILDS THAT. Its real cost is not the template. A
customer-facing send must NOT inherit `sendShopEmail`'s fallback chain, which
drops through `QUOTE_TO_EMAIL` to a hardcoded address when the target is
missing or malformed. Silently delivering a customer's confirmation to the shop
inbox is worse than not sending it, so it needs its own delivery path with its
own failure behaviour.

### Branch state

`main` and `develop` share history and ordinary PRs work. **The
unrelated-histories problem is over — don't re-derive it.** `develop` is fully
contained in `main`; branch off `main`.

## Session addendum — 2026-08-09/10

Read this before the older sections below; where they disagree, this wins.

### Read `.claude/agents/app-support.md` first

It loads automatically in Claude Code on this repo and carries the invariants
that have actually cost something. The one to internalise: **`isStickerOrder()`
in `app/api/quote/route.ts` decides which submissions auto-bill through
Printavo with no human in the loop.** It used to classify by *absence*, so any
new flow that forgot a field became a sticker order and charged someone a
price nobody set. It now also requires the product type to say "sticker".

### In flight: nothing — 2026-08-17

**Both claims that used to sit here are false and have been removed.** PR #2
merged long ago, and the phone number is not live on production. They are noted
only so nobody finds them in the history and acts on them: a stale "highest-value
action available" is exactly the kind of line a fresh session will trust.

PRs #1 through #6 are all merged. Nothing is waiting on a branch.

Shipped since this section was last true: the sticker cart, the step-based form,
apparel as a hand-quote request, abandoned-quote lead capture, the kiosk mode
and its PIN rate limiting, the order tracker, per-shape slider caps with bleed
mode, and test coverage for signs, apparel, the attachment budget and the admin
guard.

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

### Order tracker — built, live, and now linked (was: nothing built)

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

**That deferral is spent — the tracker shipped.** The map above is live in
`lib/order-status.ts`, `/track` is verified against real Printavo orders, and
as of `b289d4a` it is reachable from the payment email. The only piece left is
Gabe's Squarespace footer button. The paragraph that used to sit here told you
to start the build after PR #2; it is kept only so nobody finds it in the
history and re-does finished work.

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
- **A comment asserting a fix is not evidence the fix works.**
  `priceStickerItem` carried a careful paragraph explaining that quantity is
  deliberately not clamped into state, so that a cleared "How many" could fail
  validation. That fix was real and it was one layer too low: `NumberField`'s
  blur still snapped the empty box up to 1 before state ever saw 0, so the
  behaviour the comment described had never held. Clearing the box and tabbing
  away submitted an order for ONE. Found by driving the form in a browser, not
  by reading the comment that said it was handled.
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
