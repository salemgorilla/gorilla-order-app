# Handoff — where things stand

**Every entry below is dated. Add a dated line when you touch this file** —
this doc drifted five merges out of date because nothing forced a timestamp,
and a doc stating stale facts confidently is worse than no doc, because the
next session will act on it.

Read this first, then `AGENTS.md` and `DESIGN-SYSTEM.md`.

## Live right now — 2026-08-25 evening, `main` @ `954686e`

`main` is deployed to https://labs.gorillasalem.com (Vercel, production branch
is `main`, root directory `v2`). The custom domain is wired correctly — do NOT
touch the `@` or `www` DNS records for gorillasalem.com, those are Squarespace
and repointing them took the main site down once already.

1,171 tests passing, `tsc` clean, 0 lint errors (11 warnings, all the
deliberate `<img>` uses). **Which build production is serving is no longer a
guess**: `/api/artwork-upload` and `/api/printavo-test` report the commit
("0d8b4aa (production)"), derived from Vercel's env — see the 08-23 entry on
the build stamp for why it must never be a typed-in string again.

Working and verified:

- **The need-by date has turnaround floors now** — 2026-08-31, Gabe's
  numbers, set in this session: stickers and vinyl banners can promise the
  NEXT BUSINESS DAY; apparel, yard signs and rigid signs 14 business days.
  Before this there was no floor at all — every flow accepted TODAY, and
  stickers auto-bill, so an impossible date could be paid for unseen. THE
  SPEC IS DATA in lib/turnaround.ts (the reference-quote pattern — change
  the day counts there, nowhere else); the lanes key on the banners/signs
  hard split's families. Enforcement is block-with-an-out: the picker's
  min, the validator (all three flows, lane REQUIRED on the signs one so a
  default can't pick the wrong family's promise), and copy offering phone/
  email rush. Verified in Chromium on all four flows, floors landing on
  Tue Sep 1 / Fri Sep 18 from a Monday.
- **The dormant ApparelBuilder is audited and one defect down** —
  2026-08-31, task: make flipping apparel to "active" a ten-minute
  decision. The configurator was driven end to end against the real
  production catalog (3 styles, 191 colours, captured 2026-08-25, now a
  committed fixture) with the status flipped locally: summary, sticky bar,
  review and payload all equal calculateApparelPricing to the cent;
  repricing follows a second print location; the payload carries the true
  SKU/colour/breakdown; a configured order never classifies as
  auto-billing; 390px has no overflow. ONE wiring defect found and fixed:
  switching colour kept size counts for sizes the new colour doesn't come
  in — invisible, still totalling, still submittable (M-12/L-12 "24
  shirts" on a colour stocked only in XS/3XL/4XL). Colour changes now
  prune to the offered sizes (lib/size-quantities.ts). The whole drive is
  re-runnable: tests/e2e/apparel-configurator-audit.mjs (manual, needs the
  local flip — header has the three steps). Sign-off items that are
  GABE'S, not code: the sample-size price bills every size (a 2XL order
  is estimated at the M price; the size row shows the real upcharges),
  and the pricing config itself. Both in the readiness report.
- **Weight is a step now** — 2026-08-31, DESIGN-SYSTEM §6's oldest open item.
  The rule (now in DESIGN-SYSTEM "Weight is a step, not a default"): 700 for
  values/headings/CTAs/eyebrows, 600 for field labels, 500 for pair
  micro-labels and muted captions. ~24 files. Measured on the rendered
  sticker details step: 90×700/15×600/0×500 before, 69/19/17 after — labels
  and values are no longer typographically identical. Eyebrows deliberately
  keep 700 (see the doc for why). Verified by rendered-page measurement
  (computed font-weight census), not by grepping classes.
- **A dropped artwork file is loud now, everywhere** — 2026-08-31, from the
  Kurt Sletten handoff (25 Aug: a 10.6 MB apparel file silently dropped, the
  customer never told, the month's one lost job). THE DIAGNOSIS, so nobody
  re-litigates it: the apparel flow HAS used the direct-to-blob path since
  6 Aug; isAllowedUploadPath accepts quote-artwork/<file> and the real route
  minted a token for exactly that pathname when bench-driven; and
  vercel.com/api/blob answers CORS with allow-origin * including every
  multipart header (probed from CI). The failing leg was browser→blob-API in
  the customer's own environment, unattributable six days later because
  nothing recorded the reason anywhere — the silence was the defect. Now:
  the fallback names its failure and the reason rides with the quote
  (artworkUploadFailures → server log + shop email); the customer is told on
  the confirmation screen (role=alert, names the file, one action, "nothing
  else is missing"), in their copied record, and in a confirmation email
  that now SENDS even when Printavo's payment email went (which never
  mentions the file); and a progress-keyed stall guard bounds the SDK's
  retry storm at 30s — it must count only NEW bytes, because the SDK fires
  a 0% event at the start of every retry and a naive guard is re-armed by
  the storm it exists to end (found by running the black-hole case). All
  three paths driven in Chromium with a real 10.4 MB PNG: happy multipart
  (create/upload×2/complete, blob URL in payload), dead API (instant loud
  fallback), black hole (fallback at exactly 30s). Other affected quotes:
  the pre-#64 42 MB signs file; earlier ones unknowable — logs expired,
  which is precisely what the server-side failure log fixes. STILL OWED:
  one real >8 MB upload against production (task #19 covers it).
  asked** — 2026-08-25 evening (#86, #87). The key going live was itself a
  breaking change: selectedSs* pin the first catalog product/colour/size for
  the CONFIGURATOR, and the moment they stopped being null, every
  request-mode surface reading them said "Starter Tee · White" for a
  customer who picked Hats — review card, confirmation, the payload's
  supplier SKU, and the catalog-load effect even wrote the pinned name into
  quote state. chosenSs* (null in request mode) now feed every non-builder
  surface; the request branch of review/confirmation shows garment, count
  and the notes verbatim; the copy text finally carries "Your Request:"
  (the customer's notes had reached the shop email but never their own
  record); and the payload sends colour/locations/ink EMPTY in request mode
  so the shop email says "Not specified" and the Printavo note says TBD
  instead of presenting form defaults as answers. Found and verified by
  driving the flow in Chromium against the production catalog JSON;
  mutation-tested via tests/apparel-request-truth.test.ts. THE RULE THIS
  LEAVES BEHIND: a fallback chain that ends in customer words must never
  gain an earlier link that a config change can light up.

- **The S&S catalog is LIVE in production** — 2026-08-25. Gabe rotated the
  key; /api/ss-catalog serves 3 styles / 191 colors and the apparel card
  shows real garments. The 60-error/44-user 401 cluster is closed. The
  catalog's photo hosts (www./cdn.ssactivewear.com — those two only, or the
  optimizer becomes an open image proxy) are allowed through /_next/image
  (#81), which is both the incremental next/image path for the bare <img>s
  and the canvas-safe (same-origin, untainted) source the compositor needs.

- **/calibrate — the garment-zone tape measure** — 2026-08-25 (#83).
  Kiosk-PIN-locked staff page (nothing links to it): pick style/side/colour,
  drag a box over the print area on the REAL photo, watch the composite
  re-render through the production composeGarmentMockup, copy the
  paste-ready garmentZones block. The zones stay placeholders until Gabe
  runs it — the page is a tape measure, not a control panel; numbers still
  land in a reviewed commit. Arithmetic pinned in tests/zone-calibration.
  When the first zone flips verified, ApparelPreview must ALSO switch its
  garmentImage to the same-origin /_next/image URL or toDataURL taints.

- **The type system has a real hierarchy** — 2026-08-25 (#82, a four-patch
  series authored in a sandboxed design session, applied via git am).
  --text-hero/--text-section/--text-wordmark exist; 230 raw Tailwind text
  sizes moved onto the semantic tokens (deliberate exceptions documented in
  place: Chip, StaffGate, StickerShape); 39 hand-rolled eyebrows share
  tracking-eyebrow. Measured with real fonts: h1 84px/48px, wordmark
  30px/22px, and the price anchor still outweighs the hero. DESIGN-SYSTEM
  §6 records the weight problem as known and NOT fixed; §7 records the
  ticket-grammar idea as decided against.

- **The entry screen says what stickers cost** — 2026-08-24 (#80). A
  step-1-only price anchor: "100 die-cut 3" stickers from $53.80", computed
  by getReferenceStickerPrice() through the SAME engine that bills — never
  a typed-in figure (lib/reference-quote.ts). From step 2 the sticky bar's
  own estimate takes over; two prices on one screen is how the wrong one
  gets read.

- **Signs and banners reprice on the SERVER** — 2026-08-23 (#76), with
  Gabe's go-ahead. Each payload design carries `spec` (its raw pricing
  inputs); lib/signs-repricing.ts rebuilds the designs and re-synthesises
  product, per-design money and pricing through the SAME
  buildSignsPayloadParts + quoteSignsCart the browser used. Display
  re-derives from the same spec as the charge. Design ids and file names
  survive from the client; a pre-spec payload passes through; mismatches
  reach the shop via the same describeRepricing email note stickers use.
  No honest price moves (equivalence matrix + the untouched 120-row sheet
  + a live no-mismatch submit at $150.00 for 10 yard signs). The owed
  signs reconciliation below validates this change too — nothing new owed.

- **Apparel mockup compositing, scaffolded and DORMANT** — 2026-08-23
  (#77), regenerated from a sandboxed session's handoff.
  lib/garment-zones.ts (all six zones verified:false — the fallback
  trigger), lib/garment-composite.ts (sticker-proof's null-not-throw
  contract), ApparelPreview composites only from a verified zone. Dormant
  twice over: apparel is a request flow (ApparelPreview does not mount)
  AND no zone is verified. Both branches proven in a browser with
  temporary flips, reverted before commit. **2026-08-25 update:** the key
  works and /calibrate (#83, above) is the verification tool — the zones
  now wait on Gabe's calibration pass, not on infrastructure.

- **isStickerOrder/repriceStickers moved to lib/sticker-repricing.ts** —
  2026-08-23. Next's route typegen rejects non-handler exports from route
  files, so `tsc --noEmit` failed whenever `next dev` had generated
  `.next/dev/types` (which tsconfig deliberately includes) — every session
  hit it, cleared the folder, and it came back. The functions are
  unchanged; ten test files import them from the lib now; typegen and tsc
  verified coexisting. AGENTS.md's isStickerOrder invariants apply to the
  new file.

- **Banners and signs are separate products with separate pipelines** —
  2026-08-23, Gabe's call, the HARD split. Two cards in the LARGE FORMAT
  band: "Vinyl Banners" (one product, so its flow shows no type picker) and
  "Signs" (yard, rigid, poster, window graphics — never a banner). One cart
  per family (`largeFormatQuotes` in page.tsx); `signsQuote`/`setSignsQuote`
  present the ACTIVE family's cart so the old call sites still work, and
  switching cards keeps both carts. The machinery underneath is shared ON
  PURPOSE — every design prices by its own product, so the 120-row signs
  price sheet held to the cent across the split. `product.type` is the
  family label with `product.family` beside it; classification never keyed
  on the string (isSigns() wants `signType`, isStickerOrder() wants
  "sticker"), so old "Banners & Signs" payloads keep working and NEITHER
  pipeline can self-check-out — asserted against the real classifier.
  Printavo now reads "3 Banners / 2 designs" / heading BANNERS for banner
  orders. tests/large-format-split.test.ts pins the partition.

- **The confirmation screen stopped contradicting the customer** —
  2026-08-23, three PRs (#70–#72), all found by driving every flow end to
  end in a browser and reading what each surface claimed.
  1. The signs confirmation showed the PRE-TAX total ($177.00) one second
     after review said $188.06 with a tax line. Signs are invoiced later, so
     that screenshot would read as the shop marking the price up.
     getSignsTotals() everywhere now.
  2. "Copy Quote Details" / the Gmail draft named ONE file for a multi-design
     quote (the order-level slot holds the last upload) and omitted ticked
     add-ons entirely, in every flow. Per-design Artwork lines and an
     ADD-ONS REQUESTED section now.
  3. The compact review card — "Check everything before submitting" —
     rendered order.items[0] as the whole sticker cart ("Quantity 100" on a
     200 run) and read order.artwork for its Artwork row, WHICH STICKER
     UPLOADS NEVER WRITE, so every sticker quote ever reviewed as "Artwork:
     Not uploaded". Per-design blocks in all flows now; the order-level row
     is apparel's alone.
  4. A special-order apparel quote showed the engine's figure ($169.00, with
     garments at $0.00 inside it because S&S was dark) on FOUR surfaces
     while the payload said quoteRequired. All four say "Quoted by hand"
     now; a priced quote still shows its figure, pinned.

- **Signs artwork delivery + the kiosk phone hand-off reach every flow** —
  2026-08-23 (#64, #65). The shop email now carries a per-design Delivery
  line for signs carts (a dropped 42 MB file used to arrive as a bare
  filename with no "go collect it"), and ArtworkHandoff — kiosk QR upload —
  is wired into signs and apparel, per design, not just stickers. Blob
  storage IS connected in production; the 15 Aug "ships dark" note is stale.

- **Printavo describes a signs cart as the order it is** — 2026-08-23
  (#66, #67). The note used to print design 1's spec under the combined
  count ("11x Vinyl Banner" for a banner and ten yard signs). Per-design
  blocks now, each naming its own artwork file; cart line items file under
  the product SKU (GORILLA-SIGN-VINYL-BANNER), not the cart position, so
  the same sign always lands in the same place across one- and multi-design
  quotes.

- **The build stamp is derived, never typed** — 2026-08-23 (#68). The old
  hand-typed constant ("2026-08-07-yardsign-material") went two weeks stale
  and was BELIEVED — it produced a confident, wrong report that the phone
  hand-off was off in production. Now from VERCEL_GIT_COMMIT_SHA, honest
  ("unidentified build — …") when the platform doesn't say, and reads
  exactly three named env vars so the public endpoint can never leak a
  token. Do not reintroduce a written version string anywhere; a test greps
  the routes for one.

- **The add-on catalogue's stated rules are enforced now** — 2026-08-23
  (#69). lib/addons.ts names two load-bearing rules (engine-computed prices;
  ASCII labels with no ": ") and had zero tests. The sticker-pack offer also
  gained the guard bannerPrice already had — an unresolvable size made the
  engine price material at $0 and the offer would have read "100 stickers,
  $25.00": the setup fee alone. It degrades to a hand quote instead.

- **Four defects the signs cart brought with it** — 2026-08-22, all found by
  rendering or driving the thing rather than reading the diff.
  1. **A new quote showed the last customer's artwork.** `startNewQuote`
     reused the module constant, whose design id is fixed for the life of the
     page, and reset never cleared the signs preview map — so the fresh
     design's id still matched a stale entry. Worst at the kiosk. The sticker
     cart fixes this two lines above and says so.
  2. **The shop email broke every dollar amount** one character per line on a
     phone. `white-space: nowrap` was on the LABEL cell, so one long label
     starved the value column for the whole table. Third time this shipped;
     each earlier fix shortened a string. The rule is now which cell may
     break — a label may, a number may not.
  3. **Printavo filed the same charge under a different SKU per order.**
     Item numbers were derived from label text. Setup is now
     `GORILLA-SIGN-SETUP` at any design count, add-ons `GORILLA-SIGN-ADDON-*`.
  4. **Add-ons vanished from a multi-design invoice**, folded into the unit
     price while a one-design quote itemised them. Each is its own fee line
     now, named by design.
  None of these moved a cent; (3) and (4) were checked against a ten-case
  matrix proving Printavo still sums to the quote exactly.

- **A signs quote can hold several designs** — 2026-08-22, Gabe's goal. Same
  shape as the sticker cart, deliberately: a list of designs, each with its
  own id, its own artwork and its own price. The $15 setup is PER DESIGN and
  `calculateSignsPricing` already prices one design including its own setup,
  so `quoteSignsCart` is a sum — there is no cart-level arithmetic to drift.
  (The sticker cart is not like this: its setup tapers $25 then $12.50, so it
  cannot be summed one design at a time. Different because the shop prices
  them differently — do not "make them consistent".)
  One design is byte-identical to before: same total, same line wording, no
  numbering. Several get numbered lines and ONE collapsed setup row.
  **The money trap**: each design's total includes its own setup AND the cart
  emits a collapsed setup row, so the payload sends each design's SUBTOTAL and
  setup goes to Printavo as a single fee line. Line items plus fees reconcile
  to the website total, asserted in tests/signs-cart-payload.test.ts.
  `buildSignsPayloadParts` lives in `lib/signs-payload.ts` rather than inside
  the component, because the first version of that test rebuilt the payload
  and therefore proved nothing — mutation showed the double-charge passing
  every assertion.

- **Step 01 is split into decoration and large format** — 2026-08-22, per
  `gorillalabsbannerssplit.md`. Presentation only, no pricing touched. The
  Banners card used to say "Beta" and "Instant price · we invoice" at the same
  time — unfinished and trustworthy in one breath, on the one card that
  already returns a real price. Gabe confirmed the Banners pricing is real, so
  both badges are gone (`Beta`, `By request`), the card grid is two-up, and
  Banners is a full-width band under a LARGE FORMAT rule-label. The split is
  stored as `segment` on ProductCategory rather than an `id === "signs"` check
  in the view. Verified in a browser at 1180px and 390px: no horizontal
  scroll, tab reaches all three options in reading order, and the focus ring
  is visible on the band both unselected (2px ink on white) and selected (2px
  green on --surface-ok).

- **The shop is told the size the customer actually typed** — 2026-08-22.
  `getSignSizeLabel` returned `quote.size`, a preset LABEL left over from the
  days of a size dropdown. Since sizes became typed, that string was whatever
  `getSizeOptions(product)[0]` happened to be: a rigid sign entered at
  25" x 37" priced correctly off 6.42 sqft and reported itself as 12" x 18",
  a banner as 2' x 4', a poster as 18" x 24". It reaches the shop email and
  the Printavo payload as `product.size`, so the shop would have cut the wrong
  sign from the right price. It now derives from `getSignDimensions` — the
  function the PRICE derives from — so the two cannot disagree, and the tests
  assert that by comparing the label's square footage against what the engine
  billed.
  The same root cause had also silently switched off the width/height
  requirement, which was gated on the dead `CUSTOM_SIZE` sentinel: a banner
  could be submitted with no size at all, degrade quietly into a hand-quote,
  and the shop got a preset the customer never chose. That rule is now keyed
  on whether the product types its size, so deleting a UI control cannot
  disable it again.

- **One $15 setup fee per design on signs, and no size fee at all** —
  2026-08-22, Gabe's decision, and it MOVES MONEY. Replaces a $16.50
  order-level fee plus the $22 custom size fee. Every row on the signs price
  sheet fell by exactly $1.50 and by nothing else, which is the whole reason
  that sheet exists. The $22 fee could never be charged anyway — `isCustomSize`
  came from a size selector that no longer exists — so removing it settles the
  copy/price disagreement in the direction customers were already being
  charged, and `SignsBuilder` no longer promises a fee. "Per design" and "per
  order" are the same figure today: the signs builder takes ONE artwork or
  template per quote. Stickers are the multi-design flow and keep their own
  fee in `lib/pricing.ts`.

- **Yard-sign totals never go backwards now** — 2026-08-22, and this one
  MOVES MONEY. The board is a per-unit tier table, so at every tier boundary
  a smaller run cost more than a larger one: five 18" x 24" signs were
  $144.00 and six were $109.50; 29 signs cost $32.50 more than 30.
  `getYardSignPrice` now charges the better of the customer's own rate and
  what the next tier's minimum would cost — they keep the quantity they asked
  for and pay the lower figure. **Six sheet rows fell, none rose**, and the
  summary card says which rate was applied and that the extra signs are free.
  Gabe chose this on 22 Aug over the alternative (leave the rates, drop the
  claim). Still owed: one real yard-sign order reconciled against the Printavo
  invoice — see below.

- **Signs have a committed price sheet now** — 2026-08-22.
  `tests/signs-price-sheet.test.ts`, 120 literal totals across yard, banner,
  poster and rigid, generated once from `calculateSignsPricing` and pasted.
  Signs were formula-tested in three files and the actual dollars appeared
  nowhere, so a repricing was not a reviewable diff — which matters on a
  file that just moved 10%. Covers only what the builder can reach: the yard
  table is frozen at 18" x 24" by `getSignDimensions`, so the `24" x 36"`
  tiers in `signs-pricing-config.ts` are unreachable and are off the sheet.
  Mutation-checked: a 2% nudge to the 18 oz rate fails 26 tests, moving the
  setup fee inside the per-unit loop fails 74.

- **The background-removal gate is testable now** — 2026-08-20. `readBorder`
  decides whether we touch a customer's artwork at all — below
  `MIN_BORDER_UNIFORMITY` the file is a photo or a gradient and is refused
  rather than flood-filled. It was private and untested, and the two errors
  are not symmetric: too strict costs a convenience, too permissive destroys
  the file somebody was about to print. Exported and covered by 11 tests
  built from real pixel buffers — no canvas needed.
- **One sticker total, called by both sides** — 2026-08-20.
  `quoteStickerCart` in `lib/pricing.ts`. The primitives were always shared;
  the ARITHMETIC that adds them up was written twice — `recalculateOrder` in
  the browser and `repriceStickers` on the server — so the figure a customer
  is shown and the figure they are charged were two separate compositions.
  Pure refactor: all 203 price-sheet rows unchanged, and a browser run of
  100 x 3"x3" pickup shows $57.16 against the server's $53.80 + MA tax =
  $57.16. This is the prerequisite the step-01 brief calls non-negotiable for
  its price anchor; the anchor itself still needs a reference SKU and a
  Printavo reconciliation. **A reconciliation is still owed** — see the PR.
- **Product cards say what happens after submit (PR 2 of the brief)** —
  2026-08-20. Stickers and signs were both `active`, so both cards read
  "Available now" while only one of them takes payment. Each product now
  carries a `fulfilment` line — "Instant price · pay online", "Instant price ·
  we invoice", "Quoted by hand" — and `tests/product-fulfilment.test.ts`
  asserts the pay-online claim against `isStickerOrder()` itself, so a card
  can never promise a payment link for a flow that cannot raise one. Also:
  `aria-pressed` plus a visible SELECTED marker (selection was colour-only),
  `cursor-pointer` restored on the selected card, the hover lift replaced with
  a border step, and `.eyebrow` off `--rush-red`. **Items 2.3's badge deletion
  and the "hide Banners" suggestion were NOT applied** — `lib/products.tsx`
  says the Beta badge is live ("that one really is still settling").
- **Step 1 accessibility pass (PR 1 of the step-01 brief)** — 2026-08-20.
  `--rule` was 1.51:1 on paper — the token that draws every card, tile and
  section sat below the 3:1 WCAG floor for a boundary. Split into `--rule`
  (`#8e8674`, container edges) and `--rule-faint` (the old value, separators
  inside a container). Also: one `<h1>` instead of two, the current step tile
  no longer announces itself as "done", the disabled CTA reads as dormant
  rather than absent, and the hero claim pills are bordered and muted instead
  of borderless green. `tests/token-contrast.test.ts` now measures the tokens
  from `globals.css` so a colour cannot be nudged back under the floor.
  **Item 1.4 of that brief was NOT applied** — see the note in the PR: the
  step bar is deliberately not a gate.
- **The die-cut border is one function, not three** — 2026-08-20.
  `getBorderPx` in `lib/die-cut.ts`. StickerShape computed it twice (to draw
  the border, and to quote it in inches beside the slider) and rounded to
  whole pixels; `sticker-proof` computed it a third time and did NOT round, so
  the emailed proof drew a border that was not the width the customer had been
  quoted. Sub-visual — a few thousandths of an inch on a 3" sticker — but
  `lib/die-cut.ts` opens by insisting the two renderers cannot differ, and a
  third copy of a rule is how they come to. Verified in a browser: uploaded
  artwork, drove the slider 0→100, preview renders and quotes 0.19" at full
  margin, which is 16px on a 256px card at 3".
- **The sticker estimate in the shop email now adds up** — 2026-08-20. The
  breakdown listed material and shipping and stopped: on the reference cart
  the shop read `$110.30` with `$60.80` and `$12.00` beneath it and no account
  of the missing `$37.50` setup. Apparel had a "Setup / Screens" line and
  signs itemise from the engine; stickers — the flow that bills unattended —
  did not. Found by rendering the whole email and reading it, which nothing
  had done. Four tests now assert the lines sum to the total, one of them
  against figures `repriceStickers` actually produced.
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

### Owed on the signs repricing — 2026-08-22

THREE changes landed on the signs money path today and NONE has been
reconciled against a real Printavo invoice, which `AGENTS.md` requires and
which cannot be done from a coding session:

1. yard-sign totals made monotonic (only quantities 5, 9, 19, 29 moved);
2. setup fee $16.50 per order + $22 size fee -> $15 per design (every signs
   total fell $1.50);
3. a quote can now hold SEVERAL designs, so Printavo receives one line item
   per design plus a single combined setup row.

TWO orders are needed, not one. A yard-sign order at a bumped quantity covers
(1) and (2); only a two-design quote exercises (3), and that is the one where
a mistake would be structural rather than a rounding error — sending each
design's full total instead of its subtotal would charge setup twice, once in
the line item and once in the fee row. `lib/signs-payload.ts` sends the
subtotal and says so, and a test pins it, but nothing has yet compared it to
an actual invoice.

`AGENTS.md` is explicit that a pricing change ends with one real order
reconciled against the Printavo invoice, to the cent, and never with a passing
test. That has NOT happened for this change; it cannot be run from a coding
session. **One yard-sign order at a bumped quantity — 5, 9, 19 or 29 — is the
one that matters**, because it exercises both changes at once. 5 signs,
18" x 24", single-sided, local pickup should invoice at $93.00 + $15.00 setup
= $108.00 before tax, $114.75 with MA 6.25%.

For the two-design order, the figures to check on the invoice are: one line
item per design at each design's own PRODUCT cost, ONE setup row at $15 x the
number of designs, and — if either design took a finishing add-on — that
add-on as its own row named for its design. Nothing should be buried inside a
line item: a unit price that looks high for the size is the symptom.

Signs do not auto-bill, so a human sees the figure before money moves — which
is why this was safe to ship ahead of the reconciliation, not a reason to skip
it.

### Still Gabe's call, not code

- **The server does not reprice signs.** `repriceStickers` returns early for
  anything that is not a sticker order, so the signs total that reaches the
  shop email and Printavo is whatever the browser computed. Stickers are
  repriced server-side because they self-check-out; signs are invoiced by a
  human who sees the figure first, so this is a defensible line rather than an
  oversight — written down so the next session does not re-derive it and
  "fix" it speculatively. Making the server authoritative there touches the
  money path and would need a real order reconciled against the invoice.

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
  undercuts the app. 2026-08-23: no price moved since, but if a board says
  "Banners & Signs" as one menu it now disagrees with the site's structure —
  banners and signs are separate products.
- **Reconcile one real signs order and one real sticker order against
  Printavo, to the cent** (tasks #20/#21). The signs one now arrives with a
  BANNERS or SIGNS heading and "N Banners / M designs" nicknames — that is
  the 08-23 split working, not a bug.

## Things worth not re-learning

- **`HARD_TOLERANCE` in background removal is a EUCLIDEAN RGB distance, not a
  per-channel delta.** 42 means one channel may be off by 42, or all three by
  about 24 (42 / sqrt(3)). Reasoning about it per-channel is wrong by a factor
  of sqrt(3), and it caught me writing a test. `tests/background-border.test.ts`
  pins both readings.


- **Render the shop email and LOOK at it.** `buildQuoteEmail` returns `text`
  and `html`; only the text had ever been read. The first version of the
  price-check row read perfectly as text and was unusable as HTML on a phone —
  the label cell is `white-space: nowrap`, so the longest label sets the
  column width for its whole section and a 27-character label left the value
  about sixty pixels to wrap in. Write the html to a file, open it in
  Chromium at 390px, and look. That is how the shop reads it.


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
