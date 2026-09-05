# Pricing — every product, where its price comes from, what must stay true

**Re-dated 2026-09-04.** This replaces the 22 Aug handoff of the same name.
That document said, in its own §0: "if you have repo access and this file does
not, fix that first — replace §2 and §3 with what they actually say, and
re-date this file." Done, and more moved than those two sections: apparel
pricing now exists in the codebase (dormant), every fee stopped being taxed,
and the invariant checks the old document asked for are tests that run on
every change. Where a figure below is second-hand it says so; everything else
was read from the file named beside it.

The one sentence to carry: **the sticker path bills customers with no human in
the loop.** Everything here is downstream of that.

---

## 0 · Provenance

| Section | Source | Status |
|---|---|---|
| Stickers (§2) | `lib/pricing.ts`, `lib/tax.ts` | First-hand, 2026-09-04 |
| Signs (§3) | `lib/signs-pricing-config.ts`, `lib/signs-pricing.ts` | First-hand, 2026-09-04 |
| Signs adders on the website (§3) | `gorillasalem.com`, fetched 2026-08-22 | Second-hand (carried from the 22 Aug doc), **stale — see D7** |
| Apparel, in the app (§4) | `lib/apparel-pricing-config.ts`, `lib/apparel-pricing.ts`, `lib/apparel-blend.ts`, `lib/ss-activewear.ts` | First-hand, 2026-09-04 |
| Apparel, in Printavo (§4, §5, §6) | Printavo matrix exports, 2026-08-22 | Carried verbatim from the 22 Aug doc; not re-read |
| Tax (§7) | `lib/tax.ts`, Gabe's rulings of 4 Sep | First-hand |
| Product markup (§8) | The matrix exports + `lib/ss-activewear.ts` | Mixed — marked inline |

---

## 1 · The map — which product is priced where

| Product | In the app | Price source | Bills how |
|---|---|---|---|
| Custom Stickers | Instant price | `lib/pricing.ts` (server reprices: `lib/sticker-repricing.ts`) | **Auto-bills. No human.** |
| Vinyl Banners / Signs | Instant price | `lib/signs-pricing-config.ts` via `lib/signs-pricing.ts` | Instant quote, shop invoices |
| T-Shirts & Apparel | **Hand quote today** (`status: "request"`); a priced configurator exists behind the flag | `lib/apparel-pricing-config.ts` + live S&S garment prices | Manual — **never a payment link** (pinned by name in `tests/apparel-blend.test.ts`) |

What changed since 22 Aug:

1. **Apparel pricing now exists in this codebase.** The 22 Aug doc's first
   consequence — "there is no code path" — is no longer true. `lib/apparel-
   pricing.ts` prices printing and screens from an in-repo table, and the
   garment from the live S&S catalog. It is behind `status: "request"` and
   nothing customer-facing shows it until Gabe flips it (readiness report).
   **But the in-repo print table is not the Printavo matrix** — see §4 and D9.
   That is the load-bearing finding of this rewrite.
2. Stickers and signs: code is authoritative, unchanged.
3. Only stickers auto-bill, unchanged.

### The money path

```
quote  →  Printavo invoice  →  payment link  →  customer's card
```

Unattended, for stickers. Nothing new may sit on this path; anything added
decorates or informs, never gates or alters a price, and completes the order
if it throws. House rule, unchanged.

**New since 22 Aug: the two ends of that path are now tested against each
other.** `tests/quote-invoice-sweep.test.ts` drives every flow's REAL payload
composition into the real Printavo plan builder and asserts the invoice equals
the quote to the cent, across rush / carts / shipping / add-ons.
`tests/fee-tax.test.ts` asserts both ends tax the same base. Both exist
because the previous tests hand-built the payload and agreed with themselves
while a rushed signs cart invoiced $163.75 short (#107).

---

## 2 · Stickers and decals — first-hand

`lib/pricing.ts`, read 2026-09-04:

```ts
MATERIAL_RATE_PER_SQ_IN      = 0.032
STICKER_SETUP_FEE            = 25
STICKER_SETUP_FEE_ADDITIONAL = 12.5
DECAL_SHIPPING_PRICE         = 12
PREMIUM_MATERIAL_MARKUP      = 1.6
PREMIUM_MATERIALS            = ["Chrome", "Holographic"]

getCartSetupFee(n) = 25 + 12.50 × (n − 1)
```

The 22 Aug transcription was correct on every value.

| Rule | Value |
|---|---|
| Material | `width × height (sq in) × $0.032 × quantity`, per design |
| Premium material (Chrome, Holographic) | ×1.6 **on material only** |
| Setup | $25 first design, $12.50 each additional — **derived from cart position** |
| Shipping | $12, or $0 local pickup — once per order, **untaxed** |
| Sales tax | MA 6.25% **on the decals only** — setup is a fee, fees are untaxed (4 Sep) |

Both invariants from the 22 Aug doc are tests now (`tests/pricing-invariants.
test.ts`): setup derived from position — remove the first of three designs and
the survivors pay $37.50, not $25 — and the premium markup staying off the setup
line.

### The canonical reference order — REPRICED 4 Sep

```
D1   3"×3"  gloss white vinyl  ×100
D2   2"×2"  gloss white vinyl  × 50
Delivery: Local Pickup

D1   3 × 3 × 0.032 × 100 = $28.80  material
                         + $25.00  setup (first)
                         = $53.80
D2   2 × 2 × 0.032 ×  50 = $ 6.40  material
                         + $12.50  setup (additional)
                         = $18.90
                    subtotal          $72.70   ← Review screen
                    MA tax 6.25%      $ 2.20   ← on the $35.20 of decals ONLY
                    Pay now           $74.90   ← Printavo Total Due
```

**Was $4.54 tax / $77.24 due** while setup was taxed. Gabe ruled all fees
non-taxable on 4 Sep (#108); the estimate and the `GORILLA-DECAL-SETUP` line's
`taxed:false` moved together. Per-line unit prices in Printavo: `$0.288` and
`$0.128`, dividing exactly.

### Failure signatures for that order — recomputed

| Checkout shows | Diagnosis |
|---|---|
| `$37.40` | setup missing entirely — material plus tax on material (unchanged: $35.20 × 1.0625) |
| `$72.70` | tax never applied at checkout |
| `$87.40` | both designs charged $25 — the ladder isn't laddering (was $90.53) |
| `$55.60` | one design dropped from the cart (was $57.16) |
| **`$77.24`** | **the invoice is still taxing setup** — the flag on the fee line did not take |

Subtract the material lines from the Printavo item total and read what the
remainder says about setup. Unchanged advice; it has found every sticker
defect on this project.

### Review screen vs Pay now

- **Review** = goods + setup + shipping, pre-tax.
- **Pay now / Total Due** = that, plus 6.25% on **decals only**.

A shipped order is still the better test — it checks shipping is untaxed AND,
now, that setup is.

---

## 3 · Banners and signs — first-hand

`lib/signs-pricing-config.ts`, read 2026-09-04. Basis is per unit for yard
signs and per square foot for everything else. Values were raised 10% and
rounded to the nearest $0.50 on 2026-08-02 (config header).

### Yard signs — per unit, by tier

```
18" × 24"   single at qty 1: $31.00
   2+   $25.50 single / $44.00 double
   6+   $15.50 / $22.00
  10+   $13.50 / $20.00
  20+   $12.50 / $19.00
  30+   $11.00 / $18.00

24" × 36"   single at qty 1: $35.50
   2+   $34.50 / $55.00
   6+   $32.00 / $43.00
  10+   $24.50 / $30.00
  20+   $16.50 / $21.00
  30+   $15.00 / $18.50
  40+   $14.00 / $16.50

Step stakes   $2.50 per sign
```

The 22 Aug figures "6 signs $109.50, 10 $151.50, 20 $266.50, 30 $346.50"
were a PR message's transcription; the sheet above is what the code reads.
(6 × $15.50 + $15 setup = $108.00 today, for example.)

### The capping rule — `getYardSignPrice`

Unchanged and now under test. The raw table goes backwards at every boundary
by design; **you are never charged more than you would be for more signs** —
if a bigger tier's minimum is cheaper, the order prices there and the
customer keeps their quantity. `tests/pricing-invariants.test.ts` sweeps 1–60
signs, both sizes, both sides, all pairs, through the engine (not the table).
Keep the rule; adjust rates, never the rule, if a trough under a break ever
prices below target.

**The same rule now applies to apparel printing** — §4.

### Everything else

| | |
|---|---|
| Setup | **$15 per design** (replaced a $16.50 order fee + $22 custom-size fee, Gabe 2026-08-22). Charged once per design in a cart. |
| Custom size | **no charge** — a custom size costs the same as a standard one on every sign type |
| Banner, per sqft | 13 oz $9.00 · 18 oz $12.50 · mesh $9.00 — hems and standard grommets included |
| No-hem credit | 18 oz only: −$2.50 per linear ft of perimeter |
| Double-sided | 18 oz: +$8.00/sqft · 13 oz: **sewn** — two panels + $11.00/linear ft · rigid: +$8.00/sqft · yard signs: own column |
| Banner add-ons | pole pockets $15 flat · wind slits $6 flat · webbing/D-rings/rope $6/linear ft (Gorilla's own rates, excluded from the 2 Aug raise on purpose) |
| Poster | $5.50/sqft |
| Rigid, per sqft | PVC ⅛" / Corrugated ¼" $9.00 · Dibond ⅛", PVC ¼", AlumaCorr 0.2", Aluminum 040, Corrugated ½" $11.00 · PVC ½", AlumaCorr 0.4", Aluminum 080, Dibond ¼" $13.50 |
| Rigid finishing | "Drilled Holes" / "No Holes" — **no charge either way** |

### D7 — the website's adders, reconciled

The 22 Aug doc listed what `gorillasalem.com` publishes and said "worth
reconciling; if they already disagree, that is a live bug." They disagree on
five of seven. The app is authoritative (§1); **the website is stale**:

| Website says | App charges | |
|---|---|---|
| Setup fee $15.00 | $15 per design | ✓ |
| Custom size $20.00 | **$0** | website stale (Gabe removed it 22 Aug) |
| Double sided $7.00 | +$8.00/sqft, or the yard-sign column | different basis, different number |
| Rounded corners $5.00 | not offered | website lists something the app cannot sell |
| Holes $5.00 | **$0** | website stale |
| Step stake $2.00 | **$2.50** | website stale (the 2 Aug raise) |
| Velcro $1.50/ft | not offered | website lists something the app cannot sell |

This is Gabe's Squarespace to fix, alongside the in-shop price boards (task
#16). Until then a customer can read one price on the website and be quoted
another by the app for the same sign.

### D10 — one thing the invariant sweep noticed

An unhemmed 18 oz banner prices **below** a hemmed 13 oz at small sizes:
24"×36" is $65 vs $69. The $2.50/ft credit outruns the $3.50/sqft premium
when perimeter is large relative to area; by 36"×72" it has crossed back
($195 vs $177). Not a monotonicity defect — different products — but the
heavier, dearer stock should probably not be the cheap option at any size.
Gabe's call whether the credit needs a floor.

---

## 4 · Apparel — two systems, and they disagree

### 4a · In the app (dormant) — first-hand

`lib/apparel-pricing-config.ts`:

```
Print, per piece, by run size (step-down):
   1+   $8.00     24+  $6.00     50+  $4.75    100+  $4.00    250+  $3.25

Per piece:   +$2.50 each extra location · +$0.65 each extra ink colour
             +$0.75 white underbase on a non-white garment
Setup:       $25 per colour per location (screens)
Garment:     S&S customer price × (1 + SS_MARKUP_RATE), default 0.4 —
             blended across an assumed size mix (9% 2XL, 6% 3XL) until
             sizes are entered, then exact per SKU. lib/apparel-blend.ts.
Tier lookup: step-down (200 pieces price at the 100 tier).
```

**Never-pay-more, applied 2026-09-04.** The step-down table had the cliff the
22 Aug doc warns about, on the near side of every break: 23 shirts printed for
$184 while 24 printed for $144. The invariant tests found it the first time
they ran. The print charge now takes the better of "your count at your tier"
and "the next tier's minimum at its rate" — exactly `getYardSignPrice`'s rule.
The customer buys only the blanks they asked for; printing is charged at the
better figure, and the screen says so. 40 of the 120 committed grid totals
moved, all just under a break, all downward; the diff is in
`tests/apparel-price-sheet.test.ts` with the reason.

These numbers are **Gabe's, still awaiting his confirmation** (readiness
report, item 1).

### 4b · In Printavo — carried from 22 Aug, not re-read

The shop's screen-print matrix, corrected 2026-08-22:

| Qty | 1c | 2c | 3c | 4c | 5c | 6c | 7c | Markup |
|---|---|---|---|---|---|---|---|---|
| 1 | 21.00 | 41.00 | 61.00 | 71.00 | 80.00 | 91.00 | 101.00 | 150% |
| 12 | 6.00 | 13.00 | 16.00 | 19.00 | 22.00 | 25.00 | 28.00 | 150% |
| 24 | 4.50 | 6.65 | 8.20 | 9.70 | 11.25 | 12.75 | 14.30 | 150% |
| 48 | 4.00 | 5.00 | 6.00 | 7.00 | 8.00 | 9.00 | 10.00 | 150% |
| 72 | 3.25 | 4.25 | 5.25 | 6.25 | 7.25 | 8.25 | 9.25 | 150% |
| 144 | 3.00 | 4.00 | 5.00 | 6.00 | 7.00 | 8.00 | 9.00 | 140% |
| 288 | 2.50 | 3.50 | 4.50 | 5.50 | 6.50 | 7.50 | 8.50 | 130% |
| 360 | 2.25 | 2.90 | 3.70 | 4.50 | 5.35 | 6.15 | 6.95 | 140% |
| 840 | 1.15 | 1.25 | 1.65 | 2.00 | 2.35 | 2.70 | 3.05 | 140% |
| 2496 | 1.05 | 1.15 | 1.25 | 1.35 | 1.45 | 1.55 | 1.65 | 130% |
| 5001 | 1.00 | 1.10 | 1.12 | 1.15 | 1.17 | 1.20 | 1.22 | 130% |

Published adders: additional screen $25, oversize screen $50, custom ink
change $30. Not captured: additional location, repeat-screen charge,
specialty inks, sleeve pricing, poly upcharge, fold-and-bag, minimums.

### D9 — the two tables are not the same price

Per piece, one colour, front only:

| Run | App | Printavo | App is |
|---|---|---|---|
| 24 | $6.00 | $4.50 | +33% |
| 48–50 | $4.75 (at 50) | $4.00 | +19% |
| 100–144 | $4.00 | $3.00 (at 144) | +33% |
| 250–288 | $3.25 | $2.50 (at 288) | +30% |

And the colour adder runs the other way: Printavo charges **+$2.15** for a
second colour at 24 pieces; the app charges **+$0.65** (plus $25 for the
screen). At 24 pieces × 3 colours the app prints for $7.30/pc + $75 screens;
Printavo's matrix says $8.20/pc with screens published separately.

Two systems, one product, different answers. **This is the decision the
readiness report's "confirm the print-pricing numbers" was really asking,
and it is a bigger question than yes/no:** which of these is what Gorilla
charges? If the app's table is right, the Printavo matrix is stale and the
shop is under-quoting by hand. If Printavo's is right, the app's table needs
replacing before the flip — and the matrix's shape (the flat 288→840 ladder,
the tenfold collapse of the colour adder) comes with it. Nothing ships either
way until Gabe says which.

**S4, answered for the app:** the garment is priced separately (S&S price
× markup) and the print table is decoration-only. Whether the *Printavo*
matrix includes the blank is still unconfirmed.

---

## 5 · DTF — Printavo only, carried from 22 Aug

Not in the codebase. Quantity-only pricing against area-driven vendor cost;
a 9–17× cost spread carried by one price. Needs a size dimension before any
implementation (D4). Table and analysis unchanged from the 22 Aug doc.

## 6 · Embroidery — Printavo only, carried from 22 Aug

Not in the codebase. Three stitch-count gaps (D5) and one backwards cell at
qty 6 (D6) remain open. Table unchanged from the 22 Aug doc.

---

## 7 · Tax — settled, first-hand

`lib/tax.ts`:

| | | |
|---|---|---|
| Stickers / decals | 6.25% | ordinary tangible goods |
| Signs and banners | 6.25% | ordinary tangible goods — the 22 Aug "confirm" is confirmed |
| Apparel | **exempt** | MA clothing exemption (all garments far under the $175 threshold) |
| **Every fee line** | **exempt** | labour and services stated separately — setup, screens, finishing add-ons, rush, shipping. **Gabe, 2026-09-04.** |

Printavo computes the tax from the rate and a per-line `taxed` flag; the app
never computes a figure that could drift from the invoice. The flag is
**required** on every fee line (`lib/printavo.ts`) so a new charge cannot be
added without someone deciding. Not everything Printavo files as a fee line
is a fee: on a one-design signs quote the list is "every row after the
product", which sweeps up step stakes and sewn construction — those are goods
and stay taxed. `SIGNS_FEE_KINDS` in `lib/signs-pricing.ts` is the one
definition, read by the estimate and the invoice alike.

**For the accountant, written down not decided:** MA distinguishes services
from *fabrication* — labour that becomes part of the article. Screens and
rush are plainly service; a pole pocket sewn into a banner is arguable.
Everything is untaxed today per instruction; `lib/tax.ts` names the one place
to change it.

---

## 8 · Product markup

The Printavo matrices carry `Product Markup %` on the blank (150 / 140 / 130).
**Markup is not margin:** `margin = m / (1 + m)` — 150% is 60.0%, 140% is
58.3%, 130% is 56.5%, against a stated 60% floor. Unchanged from 22 Aug.

**The app's garment markup is different and lower:** `SS_MARKUP_RATE`,
default 0.4 (`lib/ss-activewear.ts`), applied server-side to the S&S customer
price — 40% markup, 28.6% margin on the blank. The two are not comparable
without knowing whether the Printavo matrix prices include the blank (S4).
If they do not, the app is selling blanks at half the markup the shop's own
matrices assume. **Part of D9.**

---

## 9 · Defect register

| # | Where | Severity | Status |
|---|---|---|---|
| D1 | Printavo screen print, qty 360 | Critical — was live | Corrected 2026-08-22 |
| D2 | Printavo screen print, qty 840 (3c+) | Critical — was live | Corrected 2026-08-22 |
| D3 | Printavo screen print, 12→24 | Minor | Corrected 2026-08-22 |
| D4 | DTF size blindness | Structural | **Open** — pricing decision |
| D5 | Embroidery stitch-tier gaps | Coverage | **Open** |
| D6 | Embroidery qty 6 backwards cell | Minor | **Open** |
| D7 | Signs priced from two sources | Drift | **Reconciled here — website stale on 5 of 7 adders; Gabe to update Squarespace** |
| D8 | App apparel print tiers: step-down cliff at 24/50/100/250 | Critical — dormant flow | **Corrected 2026-09-04** (never-pay-more) |
| D9 | App print table ≠ Printavo matrix; app garment markup 40% vs matrix 130–150% | **Blocks the apparel flip** | **Open — Gabe's decision** |
| D10 | 18 oz no-hem banner below hemmed 13 oz at small sizes | Observation | Open — Gabe's call |
| D11 | Signs rush dropped from the Printavo payload (cart) / mis-SKU'd and taxed (one design) | Critical — was live 1 day | Corrected 2026-09-04 (#107) |
| D12 | Apparel cart: one blended garment row, $0.41 short on a mixed cart | Latent — unreachable until the cart UI | Corrected 2026-09-04 (#109) |
| D13 | Fees taxed on estimate and invoice | Ruling | Repriced 2026-09-04 (#108) — reference order $77.24 → $74.90 |

---

## 10 · Invariants — now tests, not habits

`tests/pricing-invariants.test.ts` runs on every change, against the real
engines:

1. **Totals, not rates** — the total never falls as quantity rises, checked
   across **all pairs** of quantities: apparel print (every colour count ×
   locations × underbase, every tier boundary from both sides), yard signs
   1–60 through the never-pay-more rule, stickers at four sizes × four
   materials. Equal is allowed just under a break; lower is the defect.
2. **Ladder direction** — more colours, a second location, double-sided, a
   bigger size, premium material: never cheaper.
3. **Tier coverage** — quantity 1 prices on every ladder; yard-sign tiers
   start at 2 with a single-unit price beneath.
4. **Setup derived, never stored** — remove the first of three sticker
   designs; the survivors pay $37.50.

Plus the sheets and sweeps: `tests/price-sheet.test.ts` (stickers, 199
literal totals), `tests/signs-price-sheet.test.ts` (120), `tests/apparel-
price-sheet.test.ts` (318), `tests/quote-invoice-sweep.test.ts` (invoice ==
quote, 29 real compositions), `tests/fee-tax.test.ts` (both ends tax the
same base). **Convert markup before judging margin** (§8) remains a habit —
nothing in the repo displays margin.

Fail the build on a monotonicity violation; do not warn. (It does.)

---

## 11 · Verification — what "tested" means here

Unchanged in substance: **the check is running an order, not reading a
diff.** The full procedure is the `gorilla-release-check` skill and the
Morning Runbook. The canonical figures it reconciles against are §2's —
**$74.90, not $77.24** — and the runbook was updated the day the ruling
landed.

Test quotes: never pay one, always void it. Environment variables bake at
build time; redeploy, never "promote".

---

# What would move apparel from estimate to app-quoted

Proposal, not current state. Nothing here is committed to.

- **S1 — the matrices as data.** The app already has its own model (step-down
  tiers + never-pay-more + per-piece adders). Importing Printavo's matrix
  shape is a *replacement*, not an addition — gated on D9.
- **S2 — DTF size tiers.** Unchanged; four tiers matching the vendor's nesting
  (to 4×4, 5×5, 8×10, 11×14). Decision D4 first.
- **S3 — invariant checks in CI.** Done (§10).
- **S4 — does the matrix include the blank?** Answered for the app (no);
  open for Printavo. One sentence from the shop.
- **S5 — what must not happen.** Holds and is pinned: no apparel payment link
  (`isStickerOrder(priced apparel) === false`, by name); cost data server-side
  (the S&S markup is applied in the catalog route; the browser sees marked-up
  prices only); no margin gate.

## Open questions, in order of what they block

1. **D9 — which apparel price is Gorilla's: the app's table or the Printavo
   matrix?** Blocks the flip.
2. S4 for Printavo — does the matrix price include the blank?
3. D7 — update the website's sign adders (and the price boards, #16).
4. D10 — should the no-hem credit have a floor?
5. D4 / D5 / D6 — DTF size tiers; embroidery gaps and the qty-6 cell.
6. The flat 288→840 ladder — keep, or redesign the colour adder?

*Sticker, sign and app-apparel figures read from the repo 2026-09-04. Printavo
matrices and the website's adder list carried from the 22 Aug document and not
re-read; treat those as of that date.*
