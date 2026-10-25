# Sticker cart — agreed plan

Decisions made with Gabe 2026-08-05. **BUILT — verified against the repo
2026-09-09.** Every section below shipped; the plan is kept as the record of
what was decided and why, not as work outstanding.

The header said "Not yet built" for a month after it was. That is the failure
AGENTS.md names — a doc stating stale facts confidently is worse than no doc,
because the next session acts on it — and here it invited rebuilding machinery
that already takes money. Where this file and the repo disagree, the repo wins.

Where each piece landed:

| Plan section | Where it lives now |
|---|---|
| Setup $25 + $12.50 per extra design | `getCartSetupFee()` / `quoteStickerCart()` in `lib/pricing.ts` |
| Setup visible in Printavo | its own line, `SKU.DECAL_SETUP` (`GORILLA-DECAL-SETUP`) |
| Per-item artwork, item-keyed parts | `artwork:${id}` → `collectKeyed()` in `app/api/quote/route.ts` |
| Two attachment ceilings | 15 MB per file + 20 MB per email, `lib/attachment-plan.ts` |
| ARTWORK block per design | `lib/email.ts`, one block per design, `design-N-*.png` |
| Rendered proof attached | `lib/sticker-proof.ts` → `proof:${id}` parts |

All four "bugs to fix while in here" are fixed — see the notes on each below.

**One claim in this file is now wrong rather than stale.** "Highest-risk
change" says the submit path "has no test coverage". It has since gained
`tests/quote-route.test.ts`, which drives the real `POST` end to end. The
paragraph is corrected in place rather than deleted, because its warning about
verifying a real multi-design submission still stands — and per AGENTS.md a
real reconciliation, not a test, is what closes that out.

## Scope

**Multiple sticker designs in one order.** Signs and apparel stay exactly as
they are — one configuration per order.

A mixed cart was considered and rejected. Its main justification is correct
sales tax on apparel (clothing is MA-exempt while stickers and signs are
taxed), but apparel was `status: "coming-soon"` in `lib/products.tsx` when
this was written. That is machinery for a product the shop cannot currently
sell, landing on the one flow that already takes money unattended. Revisit
when apparel launches.

> **That condition has now expired — apparel is `status: "active"` (#116,
> 2026-09-06), so the reason this was rejected no longer holds.** That does
> NOT make a mixed cart agreed: it makes it an open question for Gabe, and
> the per-line sales tax listed under "Out of scope for v1" becomes required
> rather than optional the moment one exists, because a mixed cart mixes a
> taxed line with an MA-exempt one. Nobody should build this off the strength
> of an expired objection. — 2026-09-09

## Setup fee: $25 first design, $12.50 each additional

**The baseline was misread once already — do not repeat it.** The $25 is added
on EVERY `getStickerPrice()` call (`lib/pricing.ts`, `materialPerSticker * qty
+ STICKER_SETUP_FEE`). Three designs today means three separate submissions and
therefore **three** setup fees. The customer already pays $75, not $25.

So the cart is a price CUT, chosen deliberately to reward bigger carts:

3 designs x 100 x 3", shipped:

| | Customer pays |
|---|---|
| Today, 3 separate orders | $197.40 |
| Cart, $25 per design | $173.40 |
| **Cart, agreed ($25 + $12.50 + $12.50)** | **$148.40** |

Two knock-on edits:

- `components/QuantitySelector.tsx` says "The $25 setup is split across your
  order" — reword to "across this design".
  → MOOT: that component no longer exists.
- `lib/pricing.ts` doc comment says "Flat setup, once per order" — no longer
  true.
  → FIXED: it now reads "Setup is per DESIGN, not per order".

## Make setup visible in Printavo

Today `lib/printavo.ts` folds the $25 into `itemsSubtotal` and divides it away
into `unitPrice`, so 100 stickers arrives as `100 @ $0.5380` with no setup line
at all. Signs already do it correctly — `lib/signs-pricing.ts` pushes an
explicit line that Printavo renders as `GORILLA-FEE-SETUP-FEE`.

Three setup fees buried inside three amortised unit prices would be
unreviewable. Emit sticker setup as its own line per design, matching signs.

## Per-item artwork

The largest part of the work. Artwork is single-file end to end today.

- **One `UploadBox` per cart item.** Do NOT add `multiple` to the input —
  `UploadBox` stays single-file and the file arrives already bound to an item
  by closure.
- **Item-keyed form parts:** `formData.append(\`artwork:\${item.id}\`, file)`.
  **NOT `form.getAll("artwork")`** — an item with no file shifts the array and
  silently misaligns every later file with the wrong design.
- `app/api/quote/route.ts` iterates `form.entries()` matching the `artwork:`
  prefix into a `Map<itemId, File>`.
- `MAX_ATTACHMENT_BYTES` is 15 MB tested per file. With one file, per-file and
  per-email were the same number and that equivalence was load-bearing. Needs
  15 MB per file AND a running total (~20 MB), filled in cart order, with a
  stated drop policy.
- `buildArtworkAttachment` returns one `{ attachment, info }`, and that single
  `info` string is the ONLY artwork-delivery status anywhere — it reaches the
  email, Printavo and the API response. It becomes a map.
- `SendArgs.attachment` becomes an array. Both providers already send arrays,
  so that part is a type change plus a spread.
- Printavo receives no bytes, so the shop email is the ONLY place the
  file-to-design mapping can exist. The ARTWORK block must become one block
  per design.

## Bugs to fix while in here — ALL FIXED

Found during the design pass, all pre-existing. Each is fixed; the wording is
kept so the fix can be checked against what it was meant to do.

1. **`handleArtworkUpload` stale-closure spread** (`app/page.tsx`) — used
   `setOrder({ ...order })` rather than the functional form used elsewhere. An
   analysis resolving after the customer edits something else clobbers that
   edit. Scoped away naturally once uploads carry an item id.
   → FIXED: `handleArtworkUpload(file, itemId?)` takes the design id, and the
   comment above it records the version that did not.
2. **Blob URLs never revoked on replace** — `URL.createObjectURL` is called per
   upload and only revoked in one place. Revoke on replace, on item removal,
   and across all items in `startNewQuote`.
   → FIXED: `revokeObjectURL` is now called at every one of those points.
3. **Three identical designs produce byte-identical Printavo rows** — the
   sticker description carries no filename and `itemNumber` is hardcoded
   `GORILLA-DECAL`. Put the filename in the description and vary the item
   number per design.
   → FIXED: `decalSku(index, count)`, and the description leads with
   `Design N`. The code cites this entry as "CART-PLAN bug 3".
4. **Magenta auto-detect forces `magentaCutLine` onto the single product** —
   must apply to the item the file belongs to.
   → FIXED: it is set on `item.magentaCutLine`, per design.

## Also agreed: attach the rendered proof to the shop email

Gabe wants the email to carry BOTH the customer's original artwork AND the
app's proof, so there is a record of what the customer actually saw and
approved.

The proof is not an image today. It is rendered live in the browser from
stacked CSS `drop-shadow()` filters reading the artwork's alpha channel — that
is how the die-cut contour hugs the shape. There is nothing to attach.

**Approach: redraw it on a canvas, export a PNG.**

- Do NOT use a DOM-screenshot library. `filter: drop-shadow()` chains are
  exactly what those handle worst, and the contour is the whole point.
- The contour reproduces directly: draw the artwork 8 times at the offsets in
  `OUTLINE_DIRS`, scaled by `borderPx`, filled with `STICKER_EDGE`, then draw
  the artwork on top. That is literally what the CSS does.
- Shaped stickers are simpler: fill the card at `cardW x cardH`, clip to the
  shape, draw the art at `artSizePx`.
- Export via `canvas.toBlob()` and append as a second form part, e.g.
  `proof:${item.id}`, so it rides the same item-keyed convention as the
  artwork files.
- Attach as `proof-<quoteNumber>.png`. Counts against the same attachment
  budget as the artwork — see the 15 MB / running-total note above.

Build this WITH the cart, not before it. Both land on the same submit path,
and doing them separately means migrating that path twice.

## Out of scope for v1

- Mixed carts (stickers + signs + apparel)
- Per-line sales tax — not needed while the cart is stickers-only, since all
  stickers are taxed at the same 6.25%
- Saving or resuming a cart between sessions
- Editing a submitted order

## Highest-risk change

The submit path in `app/page.tsx` and `app/api/quote/route.ts`. It is the money
path and sticker self-checkout fires a real Printavo payment request off the
back of it.

It no longer has *no* test coverage — `tests/quote-route.test.ts` drives the
real `POST` end to end — but that file says plainly what it cannot reach: with
no credentials configured the route runs the whole pipeline and then reports
that the quote reached nobody, so **the checkout branch itself is not covered
by it**. The instruction below is therefore unchanged, and is the thing that
actually closes this out:

Verify with a real multi-design submission to a test customer, and confirm:
one quote, one email with every file attached and correctly labelled, setup
charged $25 + $12.50 per extra design, and a payment request for the correct
combined total. `npm run reconcile -- GS-XXXXXXXX-XXXXX` does the figure
comparison; record it in the `## Reconciled` table in HANDOFF.md. Never pay a
test quote; void it in Printavo afterwards.
