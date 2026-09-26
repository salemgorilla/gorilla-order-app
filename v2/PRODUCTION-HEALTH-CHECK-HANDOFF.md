# Handoff: what a production health check has to prove

**For the agent running the scheduled `gorilla-release-check` against
labs.gorillasalem.com.** Written 2026-09-26, after `main` @ `d5a3d4c`.

Read `AGENTS.md` and `HANDOFF.md` first. This file says only what a *test
run* owes, and what would make one worthless.

---

## 0. READ THIS BEFORE THE FIRST RUN — it can silently disable the check

`/api/quote` gained an idempotency key on 2026-09-26 (#199). The browser
sends `order.submissionKey`, and **the quote number is derived from it**:

```
GS-<YYYYMMDD>-<8 chars of sha256(date + submissionKey)>
```

Before creating anything, the route searches Printavo for that number. If it
finds it, it **returns the existing order and creates nothing** — no quote, no
payment request, no email — and the response carries `duplicate: true`.

**So a scheduled test that sends a FIXED `submissionKey` tests nothing after
its first run of the day.** Every subsequent run that day derives the same
number, finds the first run's order, and returns `duplicate: true`. The run
would look like a pass while placing no order at all — a health check that
passes by doing nothing, which is worse than no health check.

**Requirement: mint a fresh `submissionKey` per run** (or omit it entirely,
which falls back to the old random number and no dedupe). Treat
`duplicate: true` on the *main* order of a run as a **hard failure of the
harness**, not a pass.

### The unknown the first run must settle

After the run voids its quote, **is that quote still returned by Printavo's
`orders(query:)` search?** Nobody knows — this has never been observed.

- If a voided quote is still searchable by its nickname, then a fixed key
  would dedupe against a *voided* order, and so would any future retry test.
- If voiding removes it from search, retry protection stops working for
  voided orders, which is fine for production and matters for the test.

**Please record the answer in `HANDOFF.md`.** It is one observation and it
decides how the retry check below has to be written.

---

## 1. What a run must prove, in priority order

### (a) One submit, one order, and the money agrees — REQUIRED

The existing arrangement already does this. Keep it exactly as strict:

- website total **==** independently hand-computed total **==** Printavo total
- **line by line**: per-design lines, the setup line, the order-minimum line
  when it applies, 6.25% MA tax on the goods **but not on the fees**

Anchors as of `d5a3d4c` (Local Pickup, no discount code):

| Order | Goods | Setup | Minimum | Pre-tax | **With tax** |
|---|---|---|---|---|---|
| 100 × 3" Gloss White Vinyl, die cut | $84.00 | $15.00 | — | $99.00 | **$104.25** |
| 100 × 3" Matte White Vinyl, circle | $73.50 | $15.00 | — | $88.50 | **$93.09** |
| 25 × 2" Gloss, die cut | $15.00 | $15.00 | **$15.00** | $45.00 | **$45.94** |
| 150 × 4" + 50 × 2" Gloss (2 designs) | $190.23 | $22.50 | — | $212.73 | **$224.62** |

Rates: `$0.34/piece + $0.04/sq in`, volume curve per `STICKER_VOLUME_TIERS`,
die cut ×1.2, matte ×1.05, setup `$15` first design + `$7.50` each after,
**order minimum $45**.

**Compute these yourself from the rules — do not copy the table.** If the
table and your computation disagree, the table is stale and the run should
say so. `npm run audit:oracle` does this for single-design square orders and
**does not cover the order minimum, multi-design setup, non-square sizes,
shipping or discounts** — so those four are on you.

**Include at least one order under $45 of goods every few runs.** The order
minimum is the largest single distortion on a small order, it is the figure
#186's money story turns on, and nothing automated audits it today.

### (b) A deliberate retry creates nothing — REQUIRED, and new

Not in the current arrangement. Add it.

After the main order succeeds, **post the same payload again with the same
`submissionKey`**. Expected:

- same `quoteNumber` as the first attempt
- `duplicate: true` in the response
- **Printavo holds exactly ONE order with that number** — this is the whole
  assertion; the response is not evidence on its own
- driving the real UI instead: an **ALREADY RECEIVED** panel on the
  confirmation screen, saying nothing was duplicated and the customer has not
  been charged twice

A second order in Printavo means the mechanism is broken in production even
though 2,498 tests pass — which is exactly why this step exists. The tests
cannot see whether Printavo's search index keeps up with its own writes.

### (c) Artwork actually uploads — REQUIRED, and also new

**Drop a real file of 5–20 MB.** The direct-to-blob path has never once
completed in production; it was broken three times between 21 and 24
September for three unrelated reasons, and each was found by a human dropping
a file.

Pass is **not** "the order went through". The order goes through either way —
`lib/artwork-upload.ts` never throws, by design. Pass is:

- the payload carries a **blob URL**, not an inline attachment or a
  `droppedArtwork` entry
- the customer email does **not** say "we couldn't accept &lt;file&gt;"
- no `Direct artwork upload unavailable (…)` in the runtime logs

If it falls back, **the reason is now named** in the payload and the log —
report that string verbatim. It is the thing three days of debugging lacked.

There is also `/api/blob-selftest?secret=…` (admin-guarded) which uploads a
1 KB probe and deletes it, reporting which of four legs failed. Cheaper than
a whole order if you only want the upload answer.

### (d) The void succeeded — REQUIRED every run, pass or fail

Already in the arrangement. Never pay a test quote. If a void fails, that is
the loudest thing in the run: a live payable link under the shop's own
account.

---

## 2. What counts as evidence

**Not "the page looked right."** Every pricing defect this project has
shipped passed a test suite and was caught by a human comparing two numbers.

| Claim | Acceptable evidence |
|---|---|
| totals agree | the figures, quoted, from Printavo AND the screen |
| one order exists | the Printavo search result, not the response body |
| artwork uploaded | the blob URL in the payload |
| integration healthy | the runtime log line, verbatim |
| void happened | Printavo's state after, re-read |

**A check you could not run is not a check that passed.** If Printavo was
unreachable, say so and mark the run incomplete. Do not report a pass.

---

## 3. What must never happen

- **Never pay a quote.** Always void, every run.
- **Never run against a customer's real order.**
- Keep the fixed test identity so the shop can tell at a glance:
  `SCHEDULED TEST — DO NOT FULFILL` / `scheduled-test@gorillasalem.com`
- Do not widen `isStickerOrder()` or any classifier to make a test pass.
- Do not "fix" a mismatch by editing the expected number.

---

## 4. Known blind spots — say these are unproven rather than passing

- **Printavo's search latency.** Section 0's unknown. Until settled, (b) is
  measuring an unknown alongside the thing it wants.
- **Apparel prices are an estimate** off a supplier catalogue that can be
  stale. Apparel must never acquire a payment link; if a run ever sees one,
  that is a P0.
- **The signs/banner flows auto-bill too** and are less exercised than
  stickers. A run that only ever does stickers leaves the two flows that
  drift most unchecked.
- **`chargeableTotal()` vs what Printavo bills.** The ceiling gate reads the
  first; the card is charged the second. They agreed for all four real flows
  as of `d5a3d4c`, and that is an assertion about code, not about Printavo.

---

## 5. Where to record the result

- Money verified against a real invoice → a row in `HANDOFF.md`'s
  `## Reconciled` table. **Nine rows are currently `owed`**; run
  `npm run reconcile:debt` for the live list. Writing a row records the debt;
  only a real invoice clears it.
- `npm run reconcile -- GS-XXXXXXXX-XXXXX` does the comparison read-only and
  exits non-zero on drift.
- Anything surprising about Printavo's behaviour → a dated note in
  `HANDOFF.md`, because the next session will act on what is written there.
