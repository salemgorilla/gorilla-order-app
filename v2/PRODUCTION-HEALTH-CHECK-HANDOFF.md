# Handoff: running a production health check on the Gorilla Order App

**Self-contained.** You do not need to read the repo to run a check — this
file carries the invariants, the figures and the failure modes. If you are
also changing code, read `AGENTS.md` and `HANDOFF.md` first; this file only
covers *testing*.

Written 2026-09-26 against `main` @ `b0c8a26`.

---

## 1. What this app is, in one paragraph

A customer-facing quote builder at **https://labs.gorillasalem.com** (Vercel,
production branch `main`, root directory `v2`). It has four flows:

| Flow | Priced online? | Bills automatically? |
|---|---|---|
| **Stickers / decals** | yes, server-repriced | **YES — live payable link, no human** |
| **Signs** (yard, rigid, poster, window) | yes | **YES** |
| **Banners** (vinyl) | yes | **YES** |
| **Apparel** (garments) | estimate only | **NO — must never get a payment link** |

**Three of the four flows take money with nobody in the loop.** A submitted
sticker/signs/banner quote emails the shop and creates a Printavo payment
request the customer can pay immediately. Nothing between the browser and
someone's card is reviewed by a person. That is why a health check exists and
why its bar is "to the cent", not "looks about right".

Apparel is an estimate priced off a supplier catalogue that can go stale, so
the shop confirms it by hand. **If a run ever sees a payment link on an
apparel order, that is a P0 — stop and report it.**

Money rules that apply everywhere:
- **MA sales tax 6.25%**, charged on **goods only**. Setup fees, rush fees
  and add-ons are **not taxed**.
- **Orders over $4,999.99 pre-tax take a 50% deposit** rather than full
  payment. Under that, full payment.
- Discount codes exist and are re-validated server-side on submit:
  `FAMFRE` 40%, `DOUBLEDIME` 20%, `DIME` 10%, `SOCIALPATH` 5%, `FIPPY` free
  shipping. Stickers only.

---

## 2. READ THIS FIRST — the thing that will make a scheduled check pass while testing nothing

On 2026-09-26 (#199) `/api/quote` gained an idempotency key. The browser sends
`order.submissionKey`, and **the quote number is derived from it**:

```
GS-<YYYYMMDD>-<8 chars of sha256("gorilla-quote-number:" + date + ":" + key)>
```

Before creating anything the route searches Printavo for that number. If it
finds it, it **returns the existing order and creates nothing** — no quote, no
contact, no payment request, no email — and the response carries
`duplicate: true`.

### The trap

**A scheduled test that sends a FIXED `submissionKey` tests nothing after its
first run of the day.** Every later run that day derives the same number,
finds the first run's order, and returns `duplicate: true`. The run looks
like a pass while placing no order at all.

A health check that passes by doing nothing is worse than no health check —
it reports production healthy while looking at nothing.

**Requirements:**
1. **Mint a fresh `submissionKey` every run** (a UUID; `[A-Za-z0-9_-]{16,128}`),
   or omit the field entirely, which falls back to a random quote number and
   no dedupe.
2. **Treat `duplicate: true` on a run's MAIN order as a hard harness
   failure**, never a pass.
3. Only the deliberate retry step (§4b) should ever expect `duplicate: true`.

### The unknown only a real run can settle

After a run voids its quote, **is that quote still returned by Printavo's
`orders(query:)` search?** Nobody has observed this.

- If voided quotes stay searchable, a fixed key would dedupe against a
  *voided* order — the same silent failure, harder to spot.
- If voiding removes it from the index, retry protection stops applying to
  voided orders, which is fine in production and matters for the test.

**Record the answer in `HANDOFF.md`.** It is one observation and it decides
how §4b has to be written.

---

## 3. Fixed test identity, and the rules that are never negotiable

```
Name / Company : SCHEDULED TEST — DO NOT FULFILL
Email          : scheduled-test@gorillasalem.com
Delivery       : Local Pickup (keeps shipping out of the comparison)
```

- **NEVER pay a test quote.**
- **ALWAYS void it in Printavo afterwards — every run, pass or fail.** A
  failed void is the loudest thing in a run: it leaves a live payable link
  under the shop's own account.
- **Never run against a customer's real order.**
- Never "fix" a mismatch by editing the expected number.
- Never widen a classifier (`isStickerOrder`, `isSignsOrder`, `isSigns`) to
  make a test pass. Those gates decide who gets charged.

---

## 4. What a run must prove, in priority order

### (a) One submit → one order, and the money agrees — REQUIRED

Compare **three** figures, not two:

```
website total  ==  independently hand-computed total  ==  Printavo total
```

Line by line: per-design goods lines, the setup line, the order-minimum line
when it applies, and 6.25% tax **on goods but not on fees**.

**Anchors (Local Pickup, no discount code), as of `b0c8a26`:**

| Order | Goods | Setup | Minimum | Pre-tax | **With tax** |
|---|---|---|---|---|---|
| 100 × 3" Gloss White Vinyl, die cut | $84.00 | $15.00 | — | $99.00 | **$104.25** |
| 100 × 3" Matte White Vinyl, circle | $73.50 | $15.00 | — | $88.50 | **$93.09** |
| 25 × 2" Gloss, die cut | $15.00 | $15.00 | **$15.00** | $45.00 | **$45.94** |
| 150 × 4" + 50 × 2" Gloss (2 designs) | $190.23 | $22.50 | — | $212.73 | **$224.62** |

**The rules behind them:**

```
unit    = ($0.34/piece × pieceKeep + areaSqIn × $0.04 × areaKeep)
          × shapeMultiplier × materialMultiplier
line    = round(round(unit, 4dp) × quantity, 4dp)      # Printavo stores 4dp
setup   = $15 first design + $7.50 each additional design
minimum = tops the ORDER up to $45 of goods+setup, as its own line
tax     = 6.25% on goods only — never on setup, minimum, rush or add-ons
```

Volume keep factors, interpolated between tiers and flat past the last:

| qty | piece | area |
|---|---|---|
| 100 | 1.00 | 1.00 |
| 250 | 0.96 | 0.60 |
| 500 | 0.85 | 0.47 |
| 1000 | 0.80 | 0.39 |
| 2500 | 0.69 | 0.39 |
| 5000 | 0.62 | 0.36 |

Multipliers: die cut ×1.2, oval ×1.05, matte ×1.05, chrome ×1.3,
holographic ×1.35, clear vinyl ×1.15. Anything else ×1.0.

**Compute these yourself from the rules — do not copy the table.** If your
computation and the table disagree, the table is stale and the run should say
so loudly. A table of expected numbers nobody recomputes is the next thing to
go quietly out of date.

**Include an order under $45 of goods every few runs.** The $45 order minimum
is the largest single distortion on a small order, it is the figure the #186
money story turns on, and the repo's own independent oracle
(`npm run audit:oracle`) does **not** cover it — nor multi-design setup,
non-square sizes, shipping, or discounts. Those five are on you.

### (b) A deliberate retry creates nothing — REQUIRED

After the main order succeeds, **post the same payload again with the same
`submissionKey`**. Expected:

- the **same** `quoteNumber` as the first attempt
- `duplicate: true` in the response
- **Printavo holds exactly ONE order with that number** — this is the whole
  assertion. The response body is not evidence on its own; the search result
  is.
- driving the real UI instead: a black-bordered **ALREADY RECEIVED** panel on
  the confirmation screen saying nothing was duplicated and the customer has
  not been charged twice

A **second** order in Printavo means the mechanism is broken in production
even though the full suite passes — which is exactly why this step exists.
No test can see whether Printavo's search index keeps up with its own writes.

If the retry returns a **different** quote number, the key is not surviving
the round trip and the whole mechanism is inert. Report that as a P0.

### (c) Artwork actually uploads — REQUIRED

**Attach a real file of 5–20 MB.** The direct-to-blob upload path **has never
once completed in production**. It broke three times between 21 and 24
September for three unrelated reasons, and every one was found by a human
dropping a file.

**Pass is NOT "the order went through."** The order goes through either way —
`lib/artwork-upload.ts` never throws, by design, because a lost attachment is
a nuisance and a lost order is not. Pass is:

- the payload carries a **blob URL**, not an inline attachment and not a
  `droppedArtwork` entry
- the customer email does **not** say "We couldn't accept &lt;file&gt;"
- no `Direct artwork upload unavailable (…)` line in the runtime logs

If it falls back, **the reason is now named** in the payload and the log —
report that string verbatim. It is precisely what three days of debugging
lacked.

Cheaper alternative if you only want the upload answer:
`GET /api/blob-selftest?secret=<ADMIN_SECRET>` uploads a 1 KB probe through
the real presigned path, confirms it, deletes it, and reports which of four
legs failed. **Note: `ADMIN_SECRET` may not be set in the repo's Actions
secrets yet — if it is unset the endpoint returns 503 and that is a
configuration gap, not a failure.**

### (d) The void succeeded — REQUIRED every run, pass or fail

Re-read the order from Printavo after voiding. Do not trust the void call's
own response.

---

## 5. Useful endpoints

| Endpoint | Auth | What it tells you |
|---|---|---|
| `/api/printavo-test` | public | what is configured, plus the **deployed commit SHA** |
| `/api/artwork-upload` (GET) | public | blob store reachable + client uploads ready |
| `/api/health?secret=…` | admin | per-capability health, credential char counts (never the values) |
| `/api/blob-selftest?secret=…` | admin | a real 1 KB round trip through the upload path |
| `/api/printavo-schema?secret=…` | admin | whether a Printavo field/type actually exists |

**Always confirm which build you are testing** via `/api/printavo-test` before
believing a result. A pass against yesterday's deployment is not a pass.

---

## 6. What counts as evidence

**Not "the page looked right."** Every pricing defect this project has shipped
passed a test suite and was caught by a human comparing two numbers.

| Claim | Acceptable evidence |
|---|---|
| totals agree | the figures, quoted, from **both** Printavo and the screen |
| exactly one order exists | the Printavo **search result**, not the response body |
| artwork uploaded | the **blob URL** in the payload |
| integration healthy | the **runtime log line**, verbatim |
| void happened | Printavo's state **re-read afterwards** |
| right build | the SHA from `/api/printavo-test` |

**A check you could not run is not a check that passed.** If Printavo was
unreachable, say so and mark the run **incomplete**. Never report a pass for
something you could not observe. Skipped ≠ passed.

---

## 7. Known blind spots — report as unproven, never as passing

- **Printavo search latency** (§2's unknown). Until settled, §4b measures an
  unknown alongside the thing it wants.
- **Signs and banners auto-bill too** and are far less exercised than
  stickers. A run that only ever does stickers leaves the two flows that
  drift most unchecked. Rotate them in.
- **`chargeableTotal()` vs what Printavo actually bills.** The deposit
  ceiling reads the first; the card is charged the second. They agreed for
  all four real flows as of `b0c8a26` — that is an assertion about code, not
  about Printavo.
- **Nine `owed` reconciliation rows** currently sit in `HANDOFF.md`, covering
  every billed-figure change back to #98. Run `npm run reconcile:debt` for
  the live list. **Writing a row records the debt; only a real invoice clears
  it.** A report saying "every commit has reached a row" is *not* a report
  saying nothing is owed — read both halves of that output.
- **The $45 order minimum, multi-design setup, non-square sizes, shipping and
  discount codes** are not covered by the repo's independent oracle.

---

## 8. Where to record the result

- **Money verified against a real invoice** → add a row to `HANDOFF.md`'s
  `## Reconciled` table. This is the merge gate for pricing changes, and it
  is the single most valuable output a run can produce.
- `npm run reconcile -- GS-XXXXXXXX-XXXXX` does the comparison **read-only**
  (no quote, no payment request, nothing voided) and exits non-zero on drift.
  It needs `PRINTAVO_EMAIL` and `PRINTAVO_TOKEN`.
- **Anything surprising about Printavo's behaviour** → a dated note in
  `HANDOFF.md`. The next session will act on what is written there, so a doc
  stating stale facts confidently is worse than no doc.

---

## 9. Escalate immediately, do not wait for the next tick

- a **failed void** — a live payable link is sitting under the shop's account
- **two Printavo orders** from one retry (§4b)
- a **payment link on an apparel order**
- website total **≠** Printavo total by any amount
- a run that placed **no order** but reported a pass (§2's trap)
- `PRINTAVO SKIPPED` / `PRINTAVO FAILED`, no Pay button on a sticker order,
  or an S&S catalog 401 in the logs
