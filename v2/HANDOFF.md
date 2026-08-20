# Handoff — where things stand

**Every entry below is dated. Add a dated line when you touch this file** —
this doc drifted five merges out of date because nothing forced a timestamp,
and a doc stating stale facts confidently is worse than no doc, because the
next session will act on it.

Read this first, then `AGENTS.md` and `DESIGN-SYSTEM.md`.

## Live right now — 2026-08-19, `main` @ `97b5bc8`

`main` is deployed to https://labs.gorillasalem.com (Vercel, production branch
is `main`, root directory `v2`). The custom domain is wired correctly — do NOT
touch the `@` or `www` DNS records for gorillasalem.com, those are Squarespace
and repointing them took the main site down once already.

623 tests passing, `tsc` clean, 0 lint errors.

Working and verified:

- **A price disagreement now reaches the shop email** — 2026-08-20.
  `repriceStickers` has always refused the browser's total and charged its
  own. The disagreement went to one `console.error` and nowhere else. It is
  now a line beside Estimated Total in the quote email, with the DIRECTION
  called out: server higher than browser means the submission asked to pay
  less than the job is worth, which is the direction that costs money. Silent
  when the two agreed — a line on every order is a line nobody reads.
- **One rule decides whether the tracker is offered** — 2026-08-19.
  `canOfferTracker` in `lib/order-status.ts`. /track queries Printavo and
  nothing else, and `createPrintavoQuote` is best-effort, so a real GS- number
  can exist with nothing for the tracker to match. Three surfaces ask now and
  they had disagreed: the kiosk card drew its QR unconditionally, so a counter
  customer whose quote missed Printavo would scan it seconds after paying and
  be told no such order exists. The website confirmation screen also gained
  the tracker link it never had — the number was on that screen from the
  start and the way to use it was only ever in an email.
- **`/api/email-test` is admin-guarded** — 2026-08-19. It was a public GET
  that SENDS MAIL to the shop, built by `sendQuoteEmail`, so every hit looked
  like a real submission in the inbox. A GET needs no attacker: a crawler, a
  link preview or a prefetch would fire it. Now 503 with no ADMIN_SECRET and
  401 without it, same shape as `/api/health`. Proven by running all four
  paths locally. `/api/printavo-test` stays public — it reports config and
  sends nothing.
- **The artwork upload endpoint now scopes its token to a path** —
  2026-08-19. `/api/artwork-upload` mints a blob write token and has to be
  public: a customer uploading artwork has no account and no session. It was
  scoped to a size and nothing else — `onBeforeGenerateToken` receives the
  requested pathname and the route ignored it, so it would authorise writing
  anywhere in the store, 100 MB at a time, into a publicly served bucket. Two
  shapes are legitimate now and nothing else is: `quote-artwork/<file>` and
  `handoff/<token>/<file>`. The quote form was uploading to a bare filename,
  which is why there was nothing to check against; it is prefixed now.
- **It's a quote until money changes hands** — 2026-08-19. Apparel and signs
  are hand-quoted, and the app was still heading their screens "Order Summary"
  and "Quote & Order Builder" and asking when they needed "this order" in hand.
  Copy only, no logic. `lib/order-status.ts`, `/track` and the Printavo
  nickname are deliberately untouched: their "order" is post-payment, load
  bearing, or both. Walked all three flows in a browser afterwards — the only
  lines still saying "order" are "Pick what you're ordering" and "Special
  order", both correct.
- **Every customer now gets an email with their order number** — 2026-08-19.
  Until today exactly one customer-facing email existed and it was not ours:
  Printavo's payment request, created only for a sticker order that billed.
  A signs or apparel customer got NOTHING — they saw their `GS-` number on the
  confirmation screen, closed the tab, and had no way back to it and no way to
  use `/track`, which needs that number. Same silence when a sticker order's
  payment link failed to generate. `lib/order-confirmation.ts` decides who is
  owed one; the send sits after the `reachedShop` gate in the quote route, so
  it can never claim an order landed when nothing did. Kiosk is excluded on
  purpose — same rule as the payment request.

  **Not yet seen in an inbox.** The decision logic is covered by 13 tests and
  three mutations, but no confirmation has been sent through a real provider —
  this environment has no mail transport, so a local submit dies at
  `UNDELIVERED` before it gets that far. Place one signs order on production
  and check the address it goes to.
- **Staff see whether the customer was matched or created** — 2026-08-19.
  Printavo matches on email alone, so a returning customer using a different
  address silently becomes a second record. `lib/customer-record.ts` turns the
  submit result into one line on the kiosk confirmation, in rush red when it
  needs a question asked. Kiosk only.
- **A counter customer leaves with their order number.** A kiosk order gets no
  email — the server suppresses the payment request deliberately — and that
  email was also the only place anyone was ever told their `GS-` number, so
  walk-ins could not use `/track` at all. The kiosk confirmation screen now
  shows the number, the tracker URL, a QR to it with the number prefilled, and
  which address they will need. Website orders are untouched.
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

### Printavo may already do some of what we are about to build

**2026-08-19. UNVERIFIED — check before building anything in Phase 2.** Gabe
pointed out that Printavo puts a QR on each invoice; chasing that turned up
three more native features that overlap the repeat-customer spec. Written up in
`PRINTAVO-PROBE.md`, which is now the one place to look before starting that
work. Printavo's own docs are blocked by the coding sandbox's egress proxy, so
these came from search summaries, not pages anybody read.

The headline: **Printavo has a Customer Public Profile** — a shareable URL where
a customer sees all their quotes and invoices and where each is in the workflow.
If that is what it sounds like, it IS Phase 2, it removes the need for the
magic-link and `ORDER_ACCESS_SECRET` work, and it stops the contact-orders probe
gating anything except Phase 3's reorder.

Also worth two minutes each: whether Printavo's invoice privacy setting (a
3-day link, then an email challenge) is on for 23070, and whether
`PaymentRequestCreateInput` accepts SMS delivery — the second would remove the
only reason the kiosk cannot take payment the way the website does.

### Half-built on purpose — status emails have no trigger

**2026-08-19.** `/api/status-email` sends a customer "your order is ready"
message: admin-guarded, verifies the order with `lookupOrderStatus` (so it can
only ever mail an address that already belongs to the order), translates the
Printavo status through `toCustomerStatus`, and sends through
`sendCustomerEmail`, which FAILS CLOSED and never falls back to
`QUOTE_TO_EMAIL`.

**Nothing calls it.** There is no watcher on Printavo, and that half cannot be
built here:

- **Webhooks** — unknown whether Printavo offers them for status changes.
  Nobody has checked, and it needs a login.
- **Polling** — needs somewhere to remember the last status seen per order, or
  it re-sends on every tick. Printavo itself could hold that (a tag, or a line
  in the note), which keeps the "no database" rule — but the query to list
  orders to poll is the same one `PRINTAVO-PROBE.md` is waiting on.

So: **answer the probe first**, then choose. Wiring a schedule to the endpoint
is one HTTP call once that decision is made. Until then the shop can trigger it
by hand and it works.

Only `ready`, `done` and `hold` stages email at all — see the reasoning in
`lib/status-email.ts`. That is a promise about how often the shop writes to
people, and it should change deliberately.

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

- **A warning nobody reads is not a warning.** `getDesignNumbers` was
  imported into the quote route and never called — the route rebuilt the same
  Map by hand, so the six tests protecting the design-number rule were
  guarding a copy while the running code went unwatched. eslint had been
  saying so the whole time, buried in 25 warnings, 11 of which were
  deliberate `_`-prefixed discards. The config now ignores `^_`, the dead
  symbols are gone, and the count is 8 — all of them the deliberate `<img>`
  ones. Keep it that way; the next real signal has to be visible.


- **The quote route can be imported and driven under `tsx --test`.** `POST`
  from `app/api/quote/route.ts` takes a plain `Request` with a `FormData`
  body and runs the entire pipeline in-process — no dev server, no Next
  runtime. `tests/quote-route.test.ts` does this. With nothing configured it
  ends at the 502 undelivered path, so everything up to delivery is
  exercised and delivery is not. The checkout branch that creates a payment
  link is NOT reachable this way and that file does not pretend otherwise.

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
