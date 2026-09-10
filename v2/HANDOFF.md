# Handoff — where things stand

**Every entry below is dated. Add a dated line when you touch this file** —
this doc drifted five merges out of date because nothing forced a timestamp,
and a doc stating stale facts confidently is worse than no doc, because the
next session will act on it.

Read this first, then `AGENTS.md` and `DESIGN-SYSTEM.md`.

## Reconciled — every billed-figure change, against a real Printavo invoice

**The empty rows are the point.** AGENTS.md: a pricing change ends with one
real order reconciled against the Printavo invoice, to the cent — never with
a passing test. This table is where that gets recorded, so the gap is
visible rather than remembered.

**THE MERGE RULE: no PR that changes a billed figure merges until the
previous billed-figure change has a row here.** If that blocks the queue,
the queue is correctly blocked. (Judgement, not a hook — CI cannot tell a
billed figure from a comment. The rule is only worth as much as the next
session's willingness to honour it, which is why it is written where the
next session reads first.)

Run it: `npm run reconcile -- GS-XXXXXXXX-XXXXX` with PRINTAVO_EMAIL and
PRINTAVO_TOKEN set. It reads only. Never pay a test quote; void it after.

| Quote | Date | Flow | Covers | Result |
|---|---|---|---|---|
| _(none yet)_ | | signs | #112 #113 #114 #122 #129 #133 | **owed** — GS-20260908-TT40U is a real auto-billed sign sitting in Printavo now |
| _(none yet)_ | | stickers | #108 #129 #133 | **owed** — reference order 100 × 3" pickup, expect $55.60 |
| _(none yet)_ | | apparel | #98 #132 #134 | **owed** — one catalogue garment, and one CART so the per-line size rows can be seen |

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

- **The list is visible, exportable and importable** — 2026-09-10 (#148).
  #147 made the list private and permanent and also made it INVISIBLE:
  nothing could say how many people were on it, who they were, or whether
  the store was working at all. A list nobody can see is a list nobody
  trusts, and that is how it ends up back at a company that charges
  monthly for the privilege of showing it to you.

  `GET /api/subscribers?secret=…` — the counts, whether a send is legal
  right now (`canSend`), and the ten most recent sign-ups. **This is the
  check after the blob store is connected**: it answers with a number.
  `&format=csv` downloads the whole list, leavers included, never cached.

  `POST /api/subscribers` with a CSV body imports a list that already
  exists. Columns are found by NAME, so a file that has been opened and
  sorted still imports. Two rules it holds: it **invents no consent date**
  (a row with no date is stored with an empty one and a source saying it
  was imported — stamping today would be the app writing a consent record
  for an agreement it did not witness), and it **cannot resurrect
  anybody**, because it goes through `recordSubscription` and the sticky
  unsubscribe applies. Export → edit → re-import is exactly how a shop
  re-mails everyone who ever left.

  CSV both directions is one file (`lib/subscriber-csv.ts`) so the round
  trip is a test rather than a hope. `name` and `company` are typed by
  CUSTOMERS on a public form, and a field starting with `=`, `+`, `-` or
  `@` is a FORMULA to Excel — those go out apostrophe-prefixed and come
  back unprefixed. A BOM so Excel does not turn "Beyoncé" into "BeyoncÃ©".

  The handlers live in `lib/subscriber-admin.ts`, not in the route: Next
  forbids extra exports from a route file, so a handler written there is a
  handler no test can reach — and the arithmetic the shop reads off a
  phone would be the untested half.

- **The shop keeps its own newsletter list** — 2026-09-10 (#147). Gabe:
  "I quit constant contact. Is there an app you can build that works on my
  website but behind the scenes?"

  Every sign-up this app ever took went to a Zapier hook and then to
  Constant Contact. **The app itself kept nothing** — a customer could tick
  the box, the shop email could say "Opted in", and the record existed
  nowhere either party controlled. That path is gone.

  `lib/subscribers.ts` keeps the list as **one PRIVATE blob per
  subscriber**, keyed by a SHA-256 of the lowercased address. One-per-
  subscriber, not one list file: a single `subscribers.json` needs
  read-modify-write and two quotes in the same second silently drop one —
  a loss nobody notices for months, because it looks exactly like "not
  many people signed up". Private, not public-but-unguessable: what is
  stored is a list of customers' email addresses, and the difference is
  one leaked pathname. The pathname is a hash so listings and logs never
  carry an address.

  **The rule that matters most: an unsubscribe is STICKY.** The box
  arrives pre-ticked, so without it somebody who unsubscribes and orders
  again is silently re-added by a control they never touched — and the
  second time they do not unsubscribe, they press "spam". Gmail throttles
  a sending domain at a complaint rate of 0.3%: three people in a
  thousand, and it takes the QUOTE emails down with the newsletter. The
  attempt is recorded (`resubscribeAttemptedAt`) so the shop can ask them
  properly, which is the only way back on.

  Also kept: the FIRST `optedInAt` (never restated as today by a later
  order — when they agreed is what answers a complaint) and the strongest
  consent (`preChecked` can go false and never back to true). Deliberately
  NOT kept: the phone number. PII with no use is PII kept for a breach.

  `/unsubscribe` + `POST /api/unsubscribe` are the opt-out. **The endpoint
  has no GET, on purpose** — mail clients, link scanners and preview
  generators fetch URLs found in a message with no human involved, so an
  unsubscribe that acts on GET is one that happens to people who never
  clicked. The emailed link opens a page with one button; RFC 8058
  one-click (the header Gmail and Yahoo require from bulk senders) is a
  POST for the same reason and lands on the same route. Tokens are an HMAC
  of the address under `NEWSLETTER_SECRET` — no state, no expiry, and not
  forgeable, so nobody can walk the list removing people.

  The confirmation email now carries the link, because "you can
  unsubscribe from any email" has to be true of the email it appears in.

  **GABE'S TO-DO, and the list does not exist until both are done:**

  1. **Vercel → Storage → connect a Blob store, then redeploy.** Sets
     `BLOB_READ_WRITE_TOKEN`. Until then every sign-up is skipped and the
     shop email says so on each order. (This is the same store the artwork
     uploads have been waiting on.)
  2. **Set `NEWSLETTER_SECRET`** (a long random string) in all three
     environments, then redeploy. Without it there is no working
     unsubscribe, so nothing may be sent. Never change it once mail has
     gone out — every link already in an inbox is signed with it.

  `/api/health?secret=` reports all three states: `off` (nowhere to keep a
  list), `degraded` (**keeping a list it must not mail** — no secret), and
  `live`.

  **Not built yet, and deliberately:** sending. No campaign composer, no
  admin list view, no export. The list has to be real, and the opt-out has
  to work, before anything can be sent to it.

  **Not verified against a real store.** Everything here is driven against
  a Map, and the browser drive covers the page, the token, the refusal of
  a forged one, the 405 on GET and the one-click POST — but `BLOB_READ_WRITE_TOKEN`
  is unset in this sandbox, so `lib/subscriber-store.ts` (the only file
  that touches the Vercel SDK) has never run. **First real sign-up after
  the store is connected is the check**: submit one quote with the box
  ticked, then unsubscribe from the link in the confirmation email.

  Local dev: `.env.local` holds `NEWSLETTER_SECRET=local-test-secret` so
  the page can be driven. It is gitignored.

- **The customer gets their own copy of the consent** — 2026-09-09 (#146).
  Gabe: "Have the email say they have joined our newsletter and also add
  that we assure you we will not sell your info or spam you with marketing
  messages."

  The confirmation email now ends, when they left the box ticked:

  > You've also joined our newsletter — shop news, seasonal offers and new
  > products.
  > We will not sell your information, and we won't spam you with
  > marketing messages. You can unsubscribe from any email.

  Until this the only party told about a sign-up was the SHOP. The
  customer ticked a box that arrived already ticked and got nothing in
  writing — the wrong way round, since the consent record exists to
  protect them and they were the one person who could not see it.

  Nothing about who gets an email changed. It rides along with a
  confirmation and is never a reason to send one, so the customers this
  email already skips still do not get it: **a kiosk order** (they are at
  the counter) and **any auto-billed sticker or sign order**, where
  Printavo emails the payment request and ours would be the second message
  about one order in one minute. Those customers see the confirmation
  SCREEN and no newsletter wording at all — worth putting the same two
  sentences on `QuoteConfirmation.tsx` if Gabe wants everyone covered.

- **The shop email says when a sign-up went nowhere** — 2026-09-09 (#144).
  With no `ZAPIER_NEWSLETTER_HOOK_URL` set, a customer ticks the box, the
  shop email says "Opted in", the consent record is written, and nobody is
  ever added to Constant Contact. `lib/config-health.ts` has said so since
  it was written — on the admin health page, behind a secret, which nobody
  reads on an ordinary Tuesday. The row now says it where the claim is
  made: *"Opted in (box shipped pre-ticked) — NOT added to any list: no
  newsletter hook is configured on this deployment. The consent is
  recorded, so the list can be backfilled."*

  **ANSWERED — Gabe, 2026-09-09: "Don't hide the box."** The audit's B8
  asked for the checkbox to be HIDDEN when the hook is unset. It is not,
  and it will not be. Do not re-open this: a future session reading
  "nobody is added to any list" and reaching for the obvious fix would be
  undoing a decision the shop has already made.

  The box keeps asking, the consent record keeps being written, and the
  shop email keeps saying plainly that the sign-up went nowhere — which is
  exactly the state the backfill needs. config-health.ts, on the same
  failure: "Consent is recorded, so the list can be backfilled from past
  quote emails."

  Still Gabe's to do, and now the only thing left on this: set
  `ZAPIER_NEWSLETTER_HOOK_URL` and redeploy. Sign-ups start flowing, the
  warning disappears by itself, and everyone who ticked the box in the
  meantime can be backfilled from the consent records.

- **The funnel, for the people who never submit** — 2026-09-09,
  `lib/analytics.ts` + `<Analytics />` in the root layout (#143).

  The submission log answers everything about the people who pressed the
  button and nothing about the people who did not: this app is entirely
  client-side until submit, so somebody can configure a run, read an
  estimate and close the tab without the server hearing a word. Five
  events close that: `product_selected`, `step_reached`, `estimate_shown`,
  `submit_ok`, `upload_failed`.

  **IT SHIPS DARK.** Vercel Web Analytics is a per-project toggle in the
  dashboard. Until Gabe turns it on the script is not served, `window.va`
  is undefined and every call is a no-op — no data, no cookie, nothing to
  consent to. It is on his list, not a code change.

  No PII, and no exact money: totals go as a BAND
  (`under_100` … `over_5000`, with the top boundary at the $4,999.99
  deposit ceiling the app already thinks in), the quote number is
  deliberately absent even though the server log carries it, and the
  upload reason is CLASSIFIED onto five words rather than forwarded —
  the SDK's own sentence has carried store ids and signed URLs.

  **`estimate_shown` does not fire on the product step, and that is the
  whole difficulty of the event.** Every flow arrives with a working
  default configuration, so the first drive of this code fired
  `estimate_shown flow=stickers band=under_100` on a page nobody had
  touched — which would have made the metric a synonym for "opened the
  page". It now counts a priced estimate the customer *reached*.

- **One grep-able line per submission** — 2026-09-09, `lib/submission-log.ts`
  (#141). Every usage report this project has produced was reconstructed by
  reading the shop's inbox. Nobody could say how many people take the "not
  listed here" door instead of the priced one, how often artwork falls back
  to the email path, or how often a need-by date lands exactly on the floor
  the picker would not let them go under.

  `/api/quote` now logs ONE line per submission, same fields, same order,
  no PII:

  ```
  QUOTE_SUBMITTED quote=GS-20260909-Q19VW flow=apparel door=priced qty=24
  total=461.12 needBy=2026-12-08 earliest=2026-09-29 atFloor=false
  artwork=form delivered=false billed=false deposit=false kiosk=false
  ```

  (one line in reality — wrapped here). Filter the Vercel log viewer on
  `QUOTE_SUBMITTED` and `grep door=special | wc -l` is an answer rather
  than a research project.

  **Two things the first draft got wrong, both caught by driving real
  quotes through the real route rather than by a test.** It was emitted
  beside the success response — and produced NO lines at all, because with
  neither email nor Printavo configured the route returns 502 UNDELIVERED
  first. That is the submission most worth counting, so the line now sits
  before that gate and carries `delivered=`. And every apparel line read
  `why="not a signs order"`: the signs gate's answer borrowed by a flow
  that has no gate. The reason now comes from the gate that applies, and
  apparel carries none.

  `atFloor` is documented as a PROXY, in the file, at length: it counts how
  often the answer and the floor coincide, which is not proof anyone wanted
  sooner. It is the number that says how often Stuart Hinton's question is
  worth asking.

- **One figure per garment, not one average for the cart** — 2026-09-09,
  Gabe: "I want the price per item to show for each item. If there are two
  different items in the print run, they each need the cost per item shown
  separately."

  The quote's `unitPrice` is total ÷ pieces. On 24 tees and 12 hoodies that
  is **$16.12 — and every tee costs $10.43 while every hoodie costs $27.50.**
  A figure describing neither garment, on a screen a customer quotes back at
  the shop. The sticker cart and the signs cart were both fixed for exactly
  this shape already ("an average of things that do not average").

  `lib/apparel-per-line.ts` gives each garment its own. When the figures
  differ, the blended one is not printed anywhere — the block lists a figure
  per garment instead; when they do not differ (one garment, or two whose
  blanks cost the same) the single figure is honest and the list would be
  noise. Same block on the summary, the review card and the confirmation,
  derived ONCE in page.tsx so the three cannot disagree.

  **THE BUG THIS SHIPPED WITH FOR AN HOUR, and how it was caught.** The
  obvious formula for the shared part is `printUnitPrice + (setup + rush) ÷
  pieces`. It is wrong: `printTotal` is `printUnitPrice × printTierQuantity`,
  NOT × quantity. Never-pay-more charges a 36-piece run at the 48-piece rate
  when that costs less — so the per-garment figures summed **$72.12 under
  the total on screen** ($842.40 against $914.52). Every unit test passed;
  the first real cart driven through a browser failed on the first try.

  The shared part is now `(total − garments) ÷ pieces`, which is exhaustive
  by construction: whatever the engine charged and did not put on a garment
  is shared across the run, whatever it was and whatever gets added later.
  Σ(each × count) = the total exactly, before display rounding. The fixture
  that missed it now exercises the tier bump explicitly (two inks on a
  coloured garment, so the underbase makes three, over 36 pieces), and the
  apparel audit sums the on-screen figures against the payload total — the
  check that would have caught it in the first place.

  No per-line TOTAL is shown anywhere: the order has one total, from the
  engine. A per-line total would be a column that does not quite add up,
  which is worse than the problem being fixed.

  Verified in Chromium at 1300px and 390px on a real tee + hoodie cart,
  across the summary, review card and confirmation. 2,051 tests pass (14
  new), tsc clean, eslint clean, smoke and apparel audit green.

- **The per-piece figure, where a garment order is actually decided** —
  2026-09-09, Gabe: "For the apparel section, when the final cost and
  breakdown of the quote, the price per item does not appear. I think that
  should be very noticeable and highlighted."

  He was right twice. On the REVIEW card — the screen headed "Check
  everything before submitting" — the per-piece figure **was not there at
  all**; it showed one row, `Estimate $523.32`. And where it did appear (the
  summary panel, the confirmation) it was `text-fine` muted furniture under
  a total four times its size, in the same weight as "Needed By".

  Backwards for this product. A team order is negotiated per shirt: "what's
  it each?" is the question every customer asks, and it is the number they
  carry to the next quote. The total is what they pay; the each is what they
  DECIDE on.

  `features/apparel/ApparelMoney.tsx` is one block, mounted by all three
  surfaces, showing both figures as PEERS at `text-head` — 28px against the
  12px caption it replaced. Deliberately not larger than the total: a
  customer who reads $16.02 and remembers $16.02 on a $384.52 order has been
  misled by a type scale just as surely.

  Details worth keeping:

  - **"Estimated each", not "price".** Apparel is an estimate — the smoke
    test asserts the review card contains no "Price" — and "each" is already
    the shop's word on the sticker bar and the signs summary. It also stays
    true when the cart holds hoodies as well as tees.
  - **The count is printed beside the total** ("24 PIECES · TOTAL"). An each
    with no divisor beside it is a figure the reader has to take on trust.
  - **A container query, not a viewport one.** The block sits in a
    full-width review card and a third-width confirmation column at the same
    viewport, so `sm:` was true in both and the total right-aligned itself
    into the middle of a 280px card. `@container` / `@sm:` fixes it.
  - Thousands separators, matching the estimate bar: `$7,027.00`.
  - The summary card's "First garment priced from your sizes; added garments
    use an assumed size mix" is gone — true only before #134 gave added
    garments a size grid.

  The smoke and the audit both asked only for "an estimated dollar figure",
  which a lone total satisfied — which is how this shipped with no per-piece
  figure at all. They now check for both, and the audit asserts
  `each × pieces` comes back to the total so the screen cannot disagree with
  itself.

  Verified in Chromium at 1300px and 390px, on the summary, review and
  confirmation, and on a 600-piece order ($11.71 each / $7,027.00) for
  overflow. 2,037 tests pass, tsc clean, eslint clean, smoke and audit green.

- **Signs got an escape hatch, eleven hours too late for Jake Pardee** —
  2026-09-08.

  #122 made signs and banners auto-bill on the morning of 7 Sep. That night
  the first real one arrived: a Rigid Sign, 6" x 7", PVC, rounded corners,
  $60.00 — with the notes *"Looking to do a clear acrylic version of this
  design for my recording console… Would like to discuss how to make this
  happen!"* The list has no acrylic. He picked PVC to get through the form,
  and the app raised a live payment link for a sign he does not want.

  The engine priced it perfectly. **A correct price for the wrong product**
  — the failure `isStickerOrder()` was hardened against, which is why this
  is a refusal and not a cap.

  `components/SpecialOrderEscape.tsx` is now the one control, mounted by
  apparel (which has had one since it was a hand-quote flow) and by signs.
  An EXPLICIT control, never a heuristic on the notes field: scanning for
  "acrylic" withholds a link from someone who mentions a material in
  passing and charges the one who describes something impossible in words
  nobody listed. Default off — a flow where it starts ticked stops taking
  payments and nobody notices.

  Ticked: `decideSignsAutoBill` refuses with a reason naming it, the shop
  email says "NOT charged — special order" from that same decision (#123's
  rule), the payload carries `total: 0, quoteRequired: true` exactly as
  apparel's does, and every screen says "Quoted by hand" via one derived
  `signsPriceable`. Stickers share the gate clause too — no sticker surface
  offers the control, so it changes nothing today, but the rule now belongs
  to lib/auto-bill.ts rather than to one flow.

  Also here: **the order minimum, on the screen with the pay button.**
  $37.37 of Jake's $60.00 was the minimum pad on a $22.63 sign, and the only
  place that was said was the shop's own email. The summary card explains it
  while you build; the confirmation now does too.

  **TWO REAL BUGS, both found by driving it and neither visible in a diff:**

  - `repriceSigns()` REBUILDS `product` from the design specs, so it erased
    the escape before lib/auto-bill.ts ever saw it. The whole feature would
    have shipped doing nothing. It now carries the flag through, with a note
    on why that one client-supplied field is safe to trust: it can only
    WITHHOLD a link, never cause a charge.
  - Four setters wrote `setSignsQuote({ designs: … })`, replacing the whole
    quote with an object that has only designs — fine while `designs` was
    all a quote had, fatal for the first order-level answer. The symptom was
    maddening: the flag survived stepping between 02 and 04 and died on an
    artwork upload, because THAT setter rebuilt the quote. All four spread
    the quote now, and a test greps for the shape.

  Verified in Chromium, Jake's exact configuration, both ways: without the
  escape it prices at $60 and the confirmation names the minimum; with it,
  the payload carries the flag and his words, `total: 0`, and no dollar
  figure appears anywhere on the confirmation. 2,037 tests pass (17 new),
  tsc clean, eslint clean, smoke and apparel audit green.

- **`npm run reconcile` — the Printavo comparison as one command** —
  2026-09-08.

  AGENTS.md has always said a pricing change ends with one real order
  reconciled against the Printavo invoice, never with a passing test. That
  was honoured by hand — open the shop email, open Printavo, read across —
  and it is slow enough that between 4 and 8 Sep SEVEN billed-figure changes
  shipped without one (#108 fee tax basis, #112 minimums, #113 services,
  #114 second side, #122 signs billing at all, #129 ceiling, #133 deposit).
  It did not stop being important; it stopped being cheap.

  `npm run reconcile -- GS-XXXXXXXX-XXXXX` reads the order back out of
  Printavo and prints its total beside the app's own figure, exiting
  non-zero on any drift. **There is no database** — so the app's figure
  comes from the "WEBSITE ESTIMATE / Total:" line createPrintavoQuote writes
  into the Printavo customer note. One record carries both sides, and one
  API call fetches them. READ ONLY: no quote created, no payment requested,
  nothing voided.

  Checks, in the order they cost money: total, outstanding (the field
  createPaymentRequest actually bills), shipping, whether the line items sum
  above the total, and whether garment rows carry real size counts (the
  thing #134 fixed, which only a read-back can prove).

  **A blind spot reports `????` and exits 0.** `total` and
  `amountOutstanding` are proven fields — createPaymentRequest bills them
  live — but `customerNote` and the line-item shape on a READ are not. A
  harness that failed on its own unproven query would be muted inside a
  week, which is exactly how the manual reconciliation stopped happening.
  `--raw` dumps Printavo's reply so the first real run settles the shape.

  HANDOFF gained a `## Reconciled` table with the merge rule: no PR that
  changes a billed figure merges until the previous one has a row. The rows
  are empty on purpose.

  Verified by running the real command against a stubbed Printavo: a
  matching invoice passes and exits 0; two cents of drift fails both the
  total and the outstanding check, names which way, and exits 1. 2,020 tests
  pass (28 new), tsc clean, eslint clean.

  **It has never been run against the live account.** The first real run is
  also the test of its query shape.

- **"Configured" now means an upload will actually work** — 2026-09-08.

  `/api/artwork-upload` reported `configured: Boolean(BLOB_READ_WRITE_TOKEN)`.
  On 1 Sep that answered TRUE while production logged, on Stuart Hinton's
  real submission: `ARTWORK DIRECT UPLOAD FAILED in the customer's browser:
  "IMG_0528.jpeg" — Vercel Blob: This store does not exist.` The token was
  set. The store it named was gone.

  **That boolean is customer-facing.** The browser reads it to choose which
  ceiling the upload box advertises — 100 MB when configured, 3.5 MB when
  not — and the box's oversized warning is keyed to the same number. So a
  dead store made the app promise 100 MB while the real ceiling was 3.5 MB
  AND switched off the warning that would have said so. Anything over
  3.5 MB is dropped from the quote (reported to the shop, never blocking the
  order). Stuart's file was 204 KB and fit. That is luck, not design.

  `lib/blob-health.ts` probes the store (`list({ limit: 1 })`) and
  `configured` is now `hasToken && reachable`. The endpoint also reports
  `reachable` and the SDK's own error sentence separately, because "no
  token" and "token, dead store" have different fixes and look identical
  from the dashboard. The canary gained the same probe — blob is a
  credential like the S&S key and rots on its own schedule.

  Two things found by running it rather than reading it:

  - **The SDK talks through `undici.fetch`, not `globalThis.fetch`.**
    Stubbing the global does nothing; the "stubbed" test hits the real API
    and hangs. The probe is injected into `checkBlobStore` instead.
  - **`abortSignal` alone does not bound it.** Measured: `list` with
    `AbortSignal.timeout(3000)` had not returned 45 seconds later against a
    black-holed network (the SDK retries ten times with backoff). The
    deadline is now a race in our own code — 5s — because this call is on
    the page-load path for every visitor. Verified against a genuinely
    unreachable store: the endpoint answers in 5,003 ms with
    `configured:false`.

  Verified in Chromium both ways: with the store dead the box says "Files up
  to 3.5 MB" and a 6 MB file is flagged BEFORE submit naming the 3.5 MB
  limit; with it live the box says 100 MB and the same file passes without a
  warning. 1,992 tests pass (11 new), tsc clean, eslint clean.

  **This does not fix the store** — that is Gabe in Vercel → Storage. It
  stops the app lying about it in the meantime, and makes the canary say so
  every morning until it is fixed.

- **Every garment gets a size breakdown, not just the first one** —
  2026-09-08, Gabe: "When I added another garment in the apparel button,
  there was no way to enter the size breakdown. Can you make sure that each
  step is consistent."

  The configurator asked for sizes with a grid; an added garment asked for a
  rough count and nothing else. One question, two answers, on one screen —
  and it cost more than tidiness:

  - The hoodies were priced on the ASSUMED size mix while the tees were
    priced from real SKUs, so one order stood on two footings.
  - **Every garment row on a cart's Printavo invoice was filed under
    `size_other`** — including the tees, whose breakdown the customer HAD
    typed. The multi-line branch reads sizes off the line, and no line had
    any. Enter S/M/L/XL, add a second garment, watch those rows vanish.

  The grid is now ONE component (`features/apparel/SizeBreakdownGrid.tsx`)
  mounted by the configurator and by every added garment, so the two cannot
  drift apart again. A line holds its own `sizeQuantities`, and
  `extraLineQuantity()` is the single spelling of "the grid wins once it
  holds anything" — the same rule the first garment has followed since its
  grid became its quantity. A colour or garment change prunes counts the new
  colour is not stocked in (`applyExtraLineUpdate`); that mattered more here
  than for the first garment, because the LINE'S COUNT IS THE GRID TOTAL, so
  a stranded row would silently order shirts nobody can buy.

  Everything downstream now carries sizes per garment: the Printavo row, the
  shop email's All Garments line, the customer's copyable record, the review
  card, the summary card and the confirmation. The single "Size Breakdown"
  row is hidden on a cart rather than showing the first garment's counts
  under a label that reads as the whole order's — the shop orders blanks off
  that email.

  Three related things found by driving it, all fixed here:

  - The pricing note asserted "added garments use an assumed size mix" on
    every cart. It is derived from the lines now (`describeQuoteSizeBasis`),
    and can say exact, assumed, or which garments are which.
  - Set the configured garment to 0 and put 12 hoodies on a line: the review
    card described the TEE, at quantity 0, beside a $397 estimate for
    hoodies. `shouldListGarments()` replaces the `lines.length > 1` test on
    all three surfaces. The count rule also names the garment it wants
    ("Enter how many Premium Soft Tee you need") instead of "Enter roughly
    how many you need" at someone who had just typed 12.
  - The size grid sat three sections below the rough count it overrides,
    after the print questions. It now sits directly under it, which is the
    layout an added garment always had.

  Verified in Chromium: a real two-garment order built through the UI, sizes
  entered on both, driven to the payload and the confirmation; the
  zero-primary case; 390px with no overflow and no undersized targets.
  1,981 tests pass (35 new in tests/per-line-sizes.test.ts), tsc clean,
  eslint clean, smoke and apparel audit green.

  **NOT yet done: one real cart order reconciled against the Printavo
  invoice** — specifically that each garment row carries its own S/M/L
  counts. The size rows are the part no test can prove, because the shape
  Printavo stores is only visible in Printavo.

- **Over $4,999.99 asks for a 50% deposit, not a refusal** — 2026-09-07,
  Gabe: "All orders over $4999.99 should ask for 50% deposit, and the
  remaining balance is due before or upon shipping or pickup."

  This replaced, the same day, a ceiling that WITHHELD the payment link and
  left the shop to invoice by hand (itself a replacement for a $1,500
  signs-only one set that morning). That had the incentives backwards: the
  biggest jobs got the least automation and the slowest cash. Now they still
  pay online — they pay half, and the rest is settled before the job leaves
  the building, which is already the shop's rule for pickup and shipping.

  `FULL_PAYMENT_CEILING` (4999.99) and `DEPOSIT_FRACTION` (0.5) in
  lib/auto-bill.ts, read by BOTH gates — `decideSignsAutoBill()` and
  `decideStickersAutoBill()` — so neither number can drift between the flows.
  The ceiling is written as Gabe's figure rather than $5,000 on purpose: the
  rule it replaced was `> 5000`, which let an order of exactly $5,000.00
  through at FULL price, a one-cent band on the wrong side of what he said.

  **The half is a FRACTION of Printavo's own `amountOutstanding`**, never of
  a total this app computed — `createPaymentRequest({ fraction })`. Half of
  the shop's number is still the shop's number; half of ours would be the app
  billing a figure it derived itself, which is the one thing that function
  has never done. Printavo computes the balance as what is left outstanding,
  so the two halves cannot add up to more than the invoice.

  Everything above the ceiling clause is still a flat refusal: a total the
  server did not reprice, a total nothing could price, a kiosk session, a
  quote Printavo never got. A deposit is a smaller ask, not a weaker check.

  Said in three places, because a customer who pays what looks like the
  invoice and then gets a second bill has been misled even when the second
  bill was always the deal: the payment email's subject and body, the
  confirmation screen ("Deposit to get started" / "Pay 50% deposit — $X" /
  the balance paragraph), and the shop's own email, which now says a deposit
  was taken and there is a balance to collect rather than "NOT charged".

  Verified in Chromium, both branches: a real 40 × 96"x48" banner order
  ($12,255.00) built in the UI, its posted payload run through the real
  `repriceSigns()` + `decideSignsAutoBill()` → `{bill: true, deposit: true}`;
  the confirmation rendered from a deposit response shows the deposit copy
  and no "Pay now", and from an ordinary response shows "Pay now — $X" with
  the word "deposit" nowhere on the page. tests/deposit.test.ts drives the
  real `createPaymentRequest` against a stubbed Printavo and reads the amount
  off the MUTATION — including that a fraction of `amountOutstanding` is not
  a fraction of `total`. 1,946 tests pass (9 new), tsc clean, eslint clean, smoke and
  apparel audit green.

  **NOT yet done: one real order over the ceiling reconciled against the
  Printavo invoice to the cent** — the deposit raised, then the balance —
  plus the sticker and signs reconciliations already owed below (never pay
  one; void it after). Per AGENTS.md the money path is not trusted until a
  human has compared two numbers. Also still open: the proofing gate in
  CART-PLAN.md, and an apparel payment link, which needs Gabe's explicit
  decision because tests/product-fulfilment.test.ts enforces that apparel
  never says "pay online".

- **Ink is a question per placement now** — 2026-09-07, Gabe: "Each
  location should offer options for print color amount. An order could be:
  Front is 2 color, back is 1." One count covered the whole order, so a
  two-colour front FORCED the back to two colours: the customer paid for a
  screen nobody burned ($25) and a print rate one column too far along the
  matrix, on every job with an uneven design.

  `inkColorsByLocation` is a SPARSE map on the quote — a location with no
  entry uses the order-level `inkColors`, so an order that never touches
  this prices exactly as before and a payload written before the field
  existed still prices correctly. `locationColorCounts()` resolves it;
  `priceApparelRun` now takes `colorsByLocation: number[]` in place of
  `locationCount` + `colors`.

  **The generalisation is exact, not approximate.** The old engine computed
  `perPiece(colors) × locations` and `colors × locations × $25`; the new one
  sums per location, which is the same arithmetic when the counts match.
  471 money tests — the 66-row price sheet, the invariants, money-path and
  the invoice sweep — passed UNCHANGED, and tests/per-location-ink asserts
  the equivalence directly rather than trusting it.

  The underbase is per placement, because a dark shirt printed front and
  back burns two of them. Capped per location, which is what
  maxColorsPerLocation always meant. Note "5+ colors" parses to 5, so with
  an underbase that is 6, NOT the cap — the cap is only reachable from a
  payload.

  Driven in Chromium: front only $328.60, both at 1 colour $461.60, front 2
  / back 1 $538.20, both at 2 colours $614.80. The mixed order sits between
  and saves $76.60 against the old forced-uniform price. The payload,
  review card, summary and Printavo description read "Front 2 colors · Back
  1 color" when placements differ and the exact old string when they do
  not. 1,920 tests, smoke 28/28, audit 49/49.

- **Every product card says how it ships** — 2026-09-07, Gabe: "We offer
  shipping on all products, so you can include that detail for all 4
  buttons." `shipping` is now a REQUIRED field on ProductCategory, in a
  fixed slot above the fulfilment line, so a new product cannot ship
  without saying how.

  The offer is universal; the TERMS are not, and the card is where somebody
  decides what they are committing to. Stickers price delivery in the total
  ($12 flat, interpolated from DECAL_SHIPPING_PRICE — never typed, so a
  rate change cannot leave a stale figure on the card). Signs and banners
  offer it in the flow and quote it separately; neither engine ever puts a
  shipping figure on the total, and the test asserts their lines carry no
  "$". Those two are word-for-word identical on purpose: a spec line
  repeated is not the same defect as an explanation repeated, and the
  fulfilment line is already identical on three cards.

  **APPAREL HAS NO DELIVERY STEP AT ALL** — this is what the request
  surfaced. Stickers get one in DecalBuilder, signs in SignsDelivery,
  apparel gets none, so an apparel order silently defaults to Pickup and a
  customer wanting 48 shirts shipped has no box to say so in. The card
  therefore says delivery is "confirmed with your estimate", which is true
  and is how that flow already works, rather than promising a choice the
  form never offers. Flagged to Gabe; if he wants the choice in the form it
  is the SignsDelivery pattern and the card's line changes with it.

  `note` is gone — its only use was the banner's delivery caveat, which
  became `shipping`. The old "band explains its caveat once per segment"
  rule went with it: right while shipping was one department's caveat,
  wrong once the shop ships everything. Measured in Chromium at 1300 and
  390: four identical widths, status line 21px above the bottom on all
  four. 1,901 tests, smoke 28/28, audit 49/49.

- **The four product cards are one component** — 2026-09-07, Gabe: "Make
  the 'INSTANT PRICE · PAY ONLINE' consistent colour and placement across
  all options. Also, make the format similar to keep them looking uniform."
  They were two hand-built shapes: stickers/apparel a two-up grid with the
  status line LAST and green when the flow takes payment; banners/signs
  full-width bands with the line TOP-RIGHT beside the SELECTED badge and
  always muted — so after #122 the same words were green on one card and
  grey on two. components/ProductCard.tsx now draws all four; the
  large-format pair keeps its "Large format" rule-label (a real department
  split) but sits in the same two-up grid with the same frame, the status
  line last and `mt-auto` so the four lines share a baseline. Green means
  "takes a card", muted means "the shop confirms first", on every card.
  Measured in Chromium at 1300 and 390: identical widths, status line 21px
  above the bottom on all four, three lines at #2e7d32 and apparel muted.
  tests/product-segments now asserts page.tsx carries no hand-built card.

- **Choosing a garment colour now looks like something happened** —
  2026-09-07, Gabe: "when I press a color there is no indication, or not
  one very visible, for me to know that the color has been chosen." The
  whole selected state was a 1px border changing colour and the fill going
  `bg-white/70` → `bg-white`: two signals, both colour, one of them a 30%
  opacity step on an off-white page, across a grid of up to 84 cells. No
  `aria-pressed` either, so assistive tech was told nothing — and
  DESIGN-SYSTEM §2 says colour is never the only signal.

  A colour swatch is the hard case for the house move: the cell IS a
  colour, so a green border competes with the thing being chosen and a
  green swatch would wear a green ring invisibly. So the state is now
  carried by the product cards' own treatment — green border, SURFACE OK
  tint fill, an explicit SELECTED badge — plus an ink-black ring on the
  swatch itself, drawn as an `outline` so a 28px chip cannot nudge its row.
  The badge takes the slot "Available" was in, so selecting cannot reflow
  the grid. `cursor-pointer` was missing entirely, so every swatch read as
  a control that does nothing.

  tests/garment-color-selected.test.ts pins all of it, including that the
  ring is ink rather than the brand green and that it is an outline rather
  than a border. Verified in Chromium at 1300 and 390.

  **Then the same for the garment cards and the size buttons** — Gabe, same
  day: "do the same highlight method for the garment choices too." All three
  controls lived in ApparelBuilder.tsx with the IDENTICAL weak state, so a
  sweep for `border-[var(--gorilla-green)] bg-white` found them together and
  the test now fails if that pattern returns anywhere in the file. The
  category filter chips gained `aria-pressed` as well.

  Two deliberate differences from the swatch. The garment card gets no ring
  on its thumbnail: the swatch IS the thing being chosen, while the
  photograph only illustrates a card, and ringing it would point at the
  wrong object. And the size buttons carry their badge in a RESERVED,
  always-rendered slot — they sit in a grid, so a word appearing in one cell
  would grow every cell in its row and shuffle the sizes under the pointer.
  Same trick StepNav uses for its status glyph. Measured in the browser: the
  grid's height moved 0px on selection.

- **The hero carries one live number** — 2026-09-07, Gabe, choosing between
  a randomised headline and a real one: "Make it real rather than random."
  The hero now ends with "ON THE PRESS THIS WEEK · 1,240 stickers · 96
  garments · 45 signs", counted from the shop's own invoiced work.

  **lib/press-activity.ts holds the honesty rules and its tests.** Invoices
  only, never quotes — a quote is a conversation. Fees, rush, shipping and
  order minimums are not pieces; the first cut matched fees by substring,
  missed GORILLA-APPAREL-PRINT and counted the print charge as 48 more
  garments, which is why the fee list is now explicit AND why
  tests/press-activity drives the REAL Printavo plans: a new fee kind fails
  the test rather than quietly inflating the hero. Under 50 pieces the line
  is withheld entirely — there is no quiet-week copy, because a shop
  announcing three stickers reads worse than one saying nothing. Nothing
  identifies a customer: counts and nouns, and the summary object is
  asserted to carry no other field.

  **It can never break the page.** Fetched after mount, because page.tsx is
  a client component Next prerenders at build and a value differing between
  the two renders is a hydration error. /api/press answers 200 with
  `{ line: null }` on every failure and logs the reason; the hero treats a
  quiet week, an unconfigured Printavo and an outage identically. Cached 15
  minutes in module scope so the hero does not call Printavo per visit.

  **ONE THING IS NOT PROVEN AND NEEDS GABE.** `lineItemGroups { lineItems }`
  is the shape createPrintavoQuote WRITES, and the orders connection is
  proven live — but `createdAt` and the line-item field names on a READ are
  not, and the house rule (see the note above lookupOrderStatus) is that
  Printavo shapes get confirmed, not guessed. So the line will show nothing
  until confirmed. **`/api/press?secret=<ADMIN_SECRET>`** returns what
  Printavo actually answered plus what the aggregation made of it — one look
  settles it. 1,881 tests, smoke 28/28, audit 49/49.

- **"The items are not added to the quote"** — 2026-09-07, Gabe, on the
  apparel cart. They WERE added: every extra garment was in the total. What
  was wrong was every word around it. The sticky estimate bar took its
  label and its per-piece divisor from `apparelQuote.quantity` — the
  configurator's own count, the FIRST garment alone — while taking the
  total from the whole cart. A 42-piece order across three garments read
  "24 × Basic Tee · $32.90 each" against $789.70. The correct per-piece is
  $18.80; $32.90 is the whole cart divided by the first line. Adding twelve
  hoodies and still reading "24 × Basic Tee" leaves one honest conclusion,
  which is the one Gabe drew.

  The bar now names the cart the way the sticker and signs branches either
  side of it already did ("3 garments · 42 pieces") and takes the per-piece
  from `apparelPricing.unitPrice` — total ÷ the run, the same figure the
  confirmation and the copied quote print, so the three cannot disagree.
  The copied quote had the same shape of bug in its header: quantity and
  garment named the first line only. It now carries the run and an
  "All Garments" line, matching the shop email.

  tests/estimate-bar-cart.test.ts pins the arithmetic (and asserts the two
  divisors differ by enough that the bug could not hide). Verified by
  re-driving the exact reproduction: 24 tees + 12 hoodies + 6 tees now
  reads "3 garments · 42 pieces · $18.80 each".

- **"Starter Tee" is now "Basic Tee"** — 2026-09-07, Gabe. One string:
  `label` in lib/apparel-catalog.ts, which the /api/ss-catalog route maps to
  `customerLabel`, so every surface follows from there. No SKU moved — the
  invoice codes key on the S&S style ("39"), not the label, so a Gildan 2000
  still files under GORILLA-APPAREL-39 and Printavo history stays continuous.
  Swept through the tests, the committed catalog fixture and the smoke's
  inline one so they stay faithful snapshots. Verified in Chromium: the
  garment catalogue reads Basic Tee and no surface still says Starter.

  **Entries above this one still say "Starter Tee" and are left alone** —
  they are a dated record of what happened, and rewriting them would make
  the reconciliations they quote unverifiable. Same garment throughout:
  Gildan 2000 Ultra Cotton, S&S style 39.

- **The shop email says whether the customer was charged** — 2026-09-07,
  found by pressure-testing the change above rather than by a report. The
  shop email is built and sent BEFORE Printavo is called and before any
  payment link is raised, so it cannot report what happened. That was
  survivable while stickers were the only self-billing flow — they bill on
  every ordinary order, so "sticker order" meant "will be paid". Signs
  ended it: a banner over the $1,500 ceiling raises no link, and its email
  looked exactly like the one that did, so the shop would be waiting on a
  payment nobody had been asked for on a job it had already started.

  `shopPaymentNote()` in lib/auto-bill.ts writes the line, from the SAME
  decision the route bills from — one decision, two surfaces, so the email
  and the link cannot disagree. Signs always get a line ("Charged
  automatically", or "NOT charged — <reason>. Invoice this one by hand.");
  stickers get one only when they are the exception (a design with no usable
  size); apparel gets none, because nothing changed for it and a line on
  every estimate is noise. A kiosk order keeps its own more precise line and
  never renders two.

  The decision moved above the shop email to make this possible. It is
  called once with `printavoCreated: true` — not a claim that Printavo
  answered, but "nothing about the ORDER stops this" — and the real Printavo
  result is ANDed in at the checkout call. Verified against the REAL route
  in Chromium, no stub: a 10-sign order logged "no payment link: the quote
  never reached Printavo" (dev has no credentials, so the AND worked), and a
  400-sign order logged "$4415.00 is over the $1500 auto-bill ceiling —
  invoice this one by hand". 1,851 tests, smoke 28/28, audit 49/49.

- **SIGNS AND BANNERS PAY ONLINE** — 2026-09-07, Gabe: "I want signs and
  banners to have the same action as the stickers button. All 3 should be
  'instant price - pay online'." They now raise a live payment link on
  submit, with no human in the loop, exactly as stickers have. Apparel
  does NOT and must not — it is an estimate off a supplier catalogue.

  **`lib/auto-bill.ts` is the whole decision** and is a SECOND gate, not a
  widening of `isStickerOrder()` — widening that one would reprice a banner
  against the sticker table. Two clauses matter most: it bills only what the
  SERVER repriced (`repriceSigns()` passes an old spec-less payload through
  untouched, which would mean billing the browser's own number), and it
  stops at a **$1,500 ceiling** (Gabe, same day, asked directly). Over the
  ceiling the quote, the shop email and the Printavo record all still go
  out; only the link is withheld and the shop invoices by hand. Every
  refusal logs its reason against the GS- number.

  **Shipping is the one thing the price does not cover.** Signs never carry
  a shipping figure — the delivery step says "quoted separately". Asked
  whether that was safe to bill against, Gabe: "Pickup and shipped items
  will be paid in full before pickup or shipping out." So a shipped order
  pays for its goods online and settles delivery before it leaves the shop.
  Said in three places so nobody is surprised by a second bill: the banner
  card, the confirmation screen, and Printavo's payment email.

  Verified in Chromium: a yard-sign order reaches READY TO PAY on both
  pickup and shipping, the shipped one carrying the delivery note, and all
  three cards read "Instant price · pay online". 1,842 unit tests, smoke
  28/28, apparel audit 49/49. NOT yet done: a real signs order reconciled
  against the Printavo invoice — the money path changed, so per AGENTS.md
  that reconciliation is owed before this is trusted (task #21).

- **The apparel confirmation lists every garment** — 2026-09-07. Found
  by checking the class of the sticker bug fixed in #120: the apparel
  confirmation read `selectedGarmentLabel` + `apparelQuote.quantity`, so
  a cart of 24 tees and 20 hoodies was confirmed back as "44 Starter
  Tee" — on the only copy an apparel customer gets. It now takes
  `garmentLines` (the same list the review card shows) and prints each
  garment with its count, colour and invoice code; the shared print spec
  once, under a hairline. Driven in Chromium with a two-line cart:
  review, confirmation and payload all carry both lines.
  tests/confirmation-garment-lines.test.ts holds the prop rendered AND
  passed. Note for the next person: tests/apparel-request-truth slices
  QuoteConfirmation.tsx on the literal "isApparelSubmitted ? (", so the
  cart branch's condition is written `garmentLines.length > 1 &&
  isApparelSubmitted` to keep that string last.

- **The Republic register, applied — MERGED as #120, live** —
  2026-09-07, Gabe: "Use this design guide to influence the look ui and
  UX for our app" (the tDR aesthetic agent definition). Built as PR #120
  on `claude/order-form-progress-steps-qq0itz`, held unmerged while Gabe
  was mid-test on production, then merged on his "Ok" the same day and
  confirmed READY on Vercel. What it is: the guide's move for a real print shop is the
  WipEout one — the institution's own data as the design — and the app's
  real data is its SKU grammar, its address and its pricing config, so
  the change puts those on screen and invents nothing. `lib/sku.ts` now
  owns every `GORILLA-*` code (lib/printavo.ts builds its item numbers
  from it, byte-identical — the 87 money tests did not move) and the
  review card and confirmation ticket print the exact code each line will
  carry on the invoice; `tests/sku-agreement.test.ts` holds the two equal
  through the real payload composition, and fails on any hand-typed
  `"GORILLA-` in a component. `lib/shop.ts` is the address, read by the
  header ("Quote desk / 47 Canal Street · Salem, MA"), the hero eyebrow,
  the footer and the pickup notice. Hero copy is two facts in place of
  "Custom print quotes made simple": "Priced as you build it. Printed on
  Canal Street." with a lede that says the estimate comes from the engine
  that writes the invoice. The three marketing chips are three terms read
  live from config (setup included; signs from $60 / banners from $45;
  MA tax 6.25% on stickers and signs, never on setup or rush). The footer
  is left-aligned, carries the address and a "Track an order" link to
  /track. Four alarm-ink holdouts the system's own "never decorative"
  rule forbade are fixed: LABS in the wordmark, the submit button, the
  confirmation eyebrows and its Gmail button are GORILLA GREEN or ink
  now. Also fixed on the way: the confirmation confirmed only the FIRST
  sticker design of a cart. Verified in Chromium at 1300 and 390 (no
  horizontal scroll), smoke 28/28. NAICS is on the footer as 323111 —
  Gabe, 2026-09-07, from the filings, NOT the guide's 323113 guess. The
  footer eyebrow reads "est. 2003" (Gabe, same day). Both in lib/shop.ts.
  The hero and lede wording is his to edit.

- **THE PRINTAVO MATRIX IS THE APP'S PRICE** — 2026-09-06, Gabe: "I need
  to use the latest matrix we created for Printavo as the source of our
  app pricing" — the 22 Aug corrected matrix, markup included. This
  REVERSES the morning's D9 ("app pricing is the default for now") and
  REPRICES EVERY APPAREL FIGURE on a flow that went live the same day:
  runbook Order 0 is $282.52 now (was $252.76); Stacey's 20 black 3c
  $434.80 (was $341.20); Kurt's single shirt $99.30 (was $64.60); the
  Gildan 2000 White blank $6.23 at 150% (was $3.49 at 40%).
  lib/apparel-pricing-config.ts IS the matrix, cell for cell, with a
  blank markup per row; lib/apparel-pricing.ts holds the rules beside
  it — step-down, never-pay-more (kept), each placement its own matrix
  pass, the underbase as one more colour, $25 a screen. The catalogue
  serves every size at 150/140/130% (`priceByMarkup`, computed
  server-side from the unrounded S&S price; SS_MARKUP_RATE is no longer
  read); page.tsx stopped adding the underbase to the ink count because
  the engine adds it now. The committed catalog fixture was re-expressed
  at the matrix's markups from its recovered cost (a cent's slack on
  some sizes — fixtures only). 318 price-sheet literals regenerated
  (115/120 grid rows, 191/191 blends), every hand pin rewritten with the
  reason. Audit driver 49/49 and smoke 28/28 against the flipped build.
  The "Printavo Screen-Print Matrix" artifact from the morning is
  superseded — nothing to enter in Printavo; PRICING.md §4.

- **Printavo's matrix now follows the app** — 2026-09-06, Gabe: "switch
  to website pricing." The screen-print matrix in Printavo is to be
  re-entered from the app's table so hand quotes equal the website:
  rows at the app's breaks (1/24/50/100/250), each colour +$0.65,
  product markup 40%, and five entry rules — never-pay-more done by hand
  at the tier minimums, screens $25 per colour per location as a
  separate line, a second location as $2.50/pc + screens (NOT a second
  matrix hit), dark garments as +1 colour AND +$0.75/pc. Generated from
  calculateApparelPricing, not typed; PRICING.md §4b, with the old matrix
  retired to §4c for the record. Gabe enters it in Printavo; the "Printavo
  Matrix" artifact is the page to type from.

- **APPAREL IS LIVE** — 2026-09-06, Gabe: "Yes flip." lib/products.tsx
  status "request" → "active": the priced configurator replaces the
  three-question hand-quote form on production. The fulfilment line reads
  "Instant estimate · we confirm, then invoice" — ESTIMATE, never price
  (the handoff's language rule), and never "pay online" (no payment link;
  tests/product-fulfilment.test.ts checks the claim against isStickerOrder
  itself). CI's smoke now drives the configurator (Starter Tee → artwork →
  contact → review → submit; real SKU and a priced total in the payload;
  still never auto-bills); the sign-off audit driver runs without a local
  flip. Rollback is the one word back — the request form is still in the
  tree and page.tsx routes on the status.
  WHAT GABE OWES THE FLIP: one apparel test order reconciled against
  Printavo — 24 Starter Tees, White, front, 1 colour, M-24: $252.76 on
  screen, three Printavo lines (garments 24 × $3.49 = $83.76, printing
  $144.00, screens $25.00), no tax line, Total Due $252.76. Void it after.

- **D9 decided: app pricing is the default for now** — 2026-09-06, Gabe.
  The in-repo apparel print table ($8/$6/$4.75/$4/$3.25 by run, +$0.65 a
  colour, +$2.50 a location, $25 a screen, garment at S&S × 1.4, with
  never-pay-more at the breaks) is what the app quotes; the Printavo
  screen-print matrix is the shop's own record and is now the stale side.
  This was the last thing gating the apparel flip in the readiness report.
  STILL DORMANT until Gabe says flip: `status: "request"` in
  lib/products.tsx → "active" is the whole change, and the rollback is one
  revert. After the flip: one apparel test order reconciled ($252.76 —
  24 Starter Tees, White, front, 1 colour, M-24; three Printavo lines, no
  tax line).

- **Rigid signs: the second side at a third less** — 2026-09-05, Gabe.
  Double-sided rigid was a flat +$8/sqft whatever the material; it is now
  the material's rate × (1 + 2/3) — PVC 1/8" $9 → $15.00 both sides,
  Dibond 1/4" $13.50 → $22.50. Rigid only: 18 oz banners keep the flat
  surcharge, 13 oz stays sewn, yard signs keep their column.
  `signsPricingConfig.rigid.secondSideFactor`; tests/rigid-second-side.
  test.ts pins every material's ratio and the banner non-change; the
  quote-invoice sweep gained a double-sided rigid shape. Four price-sheet
  rows moved (PVC 1/8" double: $17 → $15/sqft), listed in the commit.
  Also confirmed by Gabe the same day: on custom size, double-sided and
  step stakes, "app is the right prices" — the website's three figures
  are the ones to update (task #42).

- **The website's adders are services now** — 2026-09-05, Gabe: "if the
  user selects that service, that cost should be added, and non-taxable";
  per sign; velcro by placement; and for the three that collide with
  earlier rulings, "the app's, right now". Built: ROUNDED CORNERS and
  HOLES at $5 per sign on yard and rigid signs (checkboxes, unticked by
  default — rigid used to default to a free "Drilled Holes" finishing,
  which is gone so the service is never charged for a default nobody
  chose); VELCRO on banners at $1.50 per linear foot of the edges chosen
  (chips: top / middle / bottom / sides / all — width, width, width,
  2 × height, 3 × width + 2 × height). Every line is kind "addOn", so
  untaxed on the estimate and taxed:false on the invoice, on both Printavo
  paths. The spec carries `signAddOns` and `velcro`, so the server
  reprices the same sign (tests/signs-services.test.ts round-trips it).
  NOT built, deliberately: custom size $20, double-sided $7 flat, step
  stake $2 — the app's $0 / per-sqft / $2.50 stand. Verified in Chromium:
  ten yard signs with corners +$50; a 3' x 6' banner with velcro all
  round +$36 (24 ft), the line untaxed.

- **Order minimums on signs and banners** — 2026-09-05, Gabe's numbers:
  sign orders start at $60, banner orders at $45. Applied ONCE to the whole
  quote (lib/signs-cart.ts) after designs and setup, before rush and tax,
  as a "Minimum order" line that makes up the difference — kind
  "minimum", which is deliberately NOT in SIGNS_FEE_KINDS: the top-up is
  the price of the goods and is taxed like them. Cart-level, so two $46
  yard-sign designs clear it and one is lifted. THIS CHANGES LIVE PRICES:
  one 18" x 24" yard sign was $46 and is $60; a 1' x 2' banner was $33
  and is $45. Carried to Printavo on BOTH paths — the cart path had to be
  told, because the per-design sweep never sees a cart-level line (the
  gap that dropped rush, #107). tests/signs-minimum.test.ts pins the
  figures, the cart rule, both invoice paths and the tax base. The
  per-design price sheet does not move (the rule is per order).
  Gabe's answer to D10; the 2' x 3' 18 oz inversion sits above the floor
  and remains an observation in PRICING.md.

- **The pricing invariants are tests, and they found a cliff** —
  2026-09-04. Gabe uploaded the 22 Aug pricing handoff; its §10 asked for
  four checks in CI ("fail the build on a monotonicity violation, do not
  warn"). tests/pricing-invariants.test.ts runs them against the real
  engines — totals never fall as quantity rises (ALL pairs), ladder
  direction, tier coverage, setup derived from position — and on its
  first run the apparel print tiers failed: 23 shirts printed for $184,
  24 for $144, the same step-down cliff at 50, 100 and 250. Corrected
  with the rule the shop already applies to yard signs: NEVER PAY MORE
  THAN FOR MORE SHIRTS (lib/apparel-pricing.ts, `printTierQuantity`).
  The customer buys only their blanks; the PRINT is charged at the better
  tier, the summary card and the Printavo line both say so. 40 of the
  120 committed grid totals moved, all just under a break, all down;
  Stacey's 20-shirt anchors went $352.00 → $341.20 and $276.00 → $260.00
  (the 24-shirt ones did not move). Audit driver 49/49 against the live
  page with the rule in. Dormant flow — nothing customer-facing changed.
  PRICING.md is the 22 Aug document rewritten first-hand from the repo
  and re-dated. THE FINDING THAT MATTERS (D9): the app's print table is
  NOT the Printavo matrix — $6.00 vs $4.50 a print at 24 pieces, the
  colour adder $0.65 vs $2.15, garment markup 40% vs 130–150% — two
  systems, one product, different answers. Blocks the apparel flip until
  Gabe says which is Gorilla's price. Also reconciled: the website's sign
  adders are stale on five of seven (D7); an unhemmed 18 oz banner prices
  below a hemmed 13 oz at small sizes (D10).

- **The apparel cart has its UI** — 2026-09-04. Under the configurator (which
  still configures ONE garment in full — catalogue, colour, the size grid)
  there is now "More garments, same print": add a line, pick a garment and a
  colour from the live catalogue, type a count. lib/apparel-cart.ts prices
  the lot as one run — combined count for the print tier, setup once — and
  lib/printavo.ts bills each garment as its own row at its own price (#109).
  Browser-driven end to end with the cart section added to
  tests/e2e/apparel-configurator-audit.mjs (15 checks): 24 Starter Tees +
  12 Classic Hoodies reads $535.60 on the summary, lists both garments and
  "36 pieces", reaches review as two lines, and the payload's total equals
  the engine recomputed from the payload's own lines. A blank added line
  prices NOTHING (no phantom garment) and blocks submit with "Finish or
  remove the added garment" — verified: 0 POSTs.
  THREE STATED DECISIONS, each in the file header where it can be argued
  with: (1) a line is a GARMENT sharing the one print, not a second design
  (lib/apparel-cart.ts); (2) added garments stand on the ASSUMED size mix
  even when line one has exact sizes — the basis note on screen and in the
  payload says so (lib/apparel-cart-lines.ts); (3) a mixed run with any dark
  garment is priced WITH the underbase on every piece — errs high on the
  white tees, never low on the black hoodies, on a hand-confirmed flow
  (anyGarmentNeedsUnderbase). The audit's first run recomputed with the
  flag off and read a $27.00 gap — 36 × $0.75 — which is that rule working.
  STILL DORMANT: apparel is `status: "request"` in production, so none of
  this is customer-visible until Gabe flips it (see the readiness report).
  Verified by flipping locally and reverting; the flip is not in the diff.

- **All fees are non-taxable, on screen and on the invoice** — 2026-09-04.
  Gabe's ruling, generalised from rush the same day: setup, screens,
  finishing add-ons and rush are labour and services stated separately from
  the goods, and Massachusetts does not tax separately stated labour. THIS
  CHANGES WHAT CUSTOMERS ARE CHARGED on the auto-billing flow — a 100 x
  3"x3" pickup sticker order goes $57.16 -> $55.60 (tax $3.36 -> $1.80),
  and the canonical two-design order $77.24 -> $74.90 (tax $4.54 -> $2.20).
  Task #20's reconciliation now validates those figures.
  Both sides moved together, which is the whole point: `getStickerTotals`
  drops setup from the base, `getSignsTotals` takes a REQUIRED `feeTotal`
  (optional would let one of four surfaces forget and show a different tax
  than the review card), and every Printavo fee line now carries a REQUIRED
  `taxed` flag rather than defaulting to the quote's rate. What a fee IS has
  one definition — `SIGNS_FEE_KINDS` in lib/signs-pricing.ts — read by the
  estimate and by the invoice, and `tests/fee-tax.test.ts` asserts the two
  bases are equal to the cent rather than asserting the rule twice.
  NOT everything Printavo files as a fee line is a fee: on a one-design
  signs quote the fee list is "every row after the product", which sweeps
  up step stakes and sewn construction. Those are goods and stay taxed.
  ONE THING FOR THE ACCOUNTANT, written down rather than decided: MA
  distinguishes services from FABRICATION. Screens and rush are plainly
  service; a pole pocket sewn into a banner is arguably fabrication and
  arguably taxable. Every fee line is untaxed today per the instruction —
  lib/tax.ts names the one place to change it if the accountant disagrees.
- **Signs rush reached Printavo wrong, both ways** — 2026-09-04. The rush
  fee travelled on the apparel payload (it spreads the whole pricing
  object) and NOT on the signs payload, which builds its pricing block
  field by field. One design: the untagged rush row was swept into
  `lines.slice(1)` and invoiced as GORILLA-SIGN-RUSH-SCHEDULING **with tax**
  ($25.59 against the $20.47 quoted). A cart: rush was in no list at all —
  $655.00 invoiced against $818.75 quoted, $163.75 short. Neither was
  visible on screen; the website total was right in both cases. Found by
  driving the real payload builder and the real Printavo plan. The row is
  tagged `kind: "rush"` now and `SignsCartQuote` declares `rushFee`, so it
  bills once, under GORILLA-RUSH, untaxed.

- **The apparel cart, engine first** — 2026-09-03. lib/apparel-cart.ts
  prices SEVERAL GARMENT LINES in one quote (24 tees + 12 hoodies), the
  thing Stacey needed and signs got in #51. TWO MODEL DECISIONS, both
  stated as reversible data rather than buried: the print tier is read
  from the COMBINED count (20+20 is a 40-piece run at the 24+ rate, which
  is what the press does), and SETUP IS CHARGED ONCE per quote, not per
  line — the same screens print both garments, and billing twice would
  charge for screens nobody burned (apparelCartRules.shareSetupAcrossLines
  flips it). THE INVARIANT, pinned across the whole tier grid: a ONE-LINE
  cart prices exactly as the single-garment configurator did, to the cent
  — so the committed price sheet and the audit driver still describe the
  product. The live flow is already routed through it as a cart of one,
  so the engine is load-bearing, not inventory; audit still 37/37 green
  with the flip. A defect the tests caught: an empty cart quoted $33 (a
  phantom shirt plus a full set of screens) because the engine floors
  quantity at 1 — nothing ordered is now nothing owed.
  STILL TO COME: the UI for adding lines. The shape assumption is in the
  file header — a line is a GARMENT (one design across several garments),
  not a design; say the word if a team order at Gorilla means the other
  thing.
- **Reorder links** — 2026-09-03. The customer confirmation email for a
  sticker order now carries "Need these again?" — a link that rebuilds
  the builder from that order's spec (lib/reorder.ts, readable format:
  `?reorder=1&d=100@3x3:gloss-white-vinyl:die-cut`). TWO SAFETY
  PROPERTIES, both pinned by name: a link carries the SPEC and NEVER a
  price (today's engine prices it, so a March link quotes September's
  prices in September), and a link PREFILLS BUT NEVER SUBMITS (stickers
  auto-bill, so a URL that could order would be a URL that could take
  money). Decoding is tolerant — junk, an unknown version, a
  discontinued material or an absurd count all prefill nothing rather
  than half a cart. A prefilled cart says so on screen. Verified in the
  browser: the two-design link rebuilds 3x3x100 + 2x2x50, reprices to
  $81.32, lands on step 1, zero submit attempts.
- **Rush is a product now, and the counter may say today** — 2026-09-03.
  RUSH (lib/rush.ts, spec as data — 5 business days, 25% of goods, Gabe's
  figures): apparel, yard and rigid signs can buy their way from the
  14-business-day floor down to 5. Rush is DERIVED FROM THE DATE, never a
  checkbox — one fact, one copy, and the server can recompute it. The
  offer replaces "call or email us" under the picker (the sentence Kurt's
  job left through), and a chosen rush date names its fee on the same
  screen. Its own GORILLA-RUSH line in Printavo, its own line in the shop
  email. DELIBERATELY NOT ON STICKERS/BANNERS: the fast lane already
  promises next business day, and same-day there would issue a live
  payment link for a date nobody at the shop agreed to — that needs the
  payment-link change AND the reconciliation task #20 still owes. Pinned
  by a named invariant test. Verified in the browser: yard signs $46
  goods → +$11.50 rush → $61.09 with tax.
  WALK-IN (turnaround "walkin" lane): the kiosk may promise TODAY on
  fast-lane work — staff is standing there to agree to it. Kiosk apparel
  and kiosk yard/rigid signs keep the 14-day floor; blanks and screens do
  not care who is at the counter.
  TAX, ANSWERED (Gabe, 2026-09-04): the rush fee is LABOUR and is NOT
  taxed. It stays in the total the customer pays and comes out of the
  taxable base — the same treatment separately stated shipping already
  gets — and the Printavo line carries taxed:false so the invoice agrees
  with the estimate rather than merely resembling it. Verified on
  screen: $46 of yard signs taxes $2.88 rushed or not; rushed total
  $60.38.
- **Apparel has a price sheet** — 2026-09-01, the second line for the new
  engine, exactly as tests/price-sheet.test.ts is for stickers: 318 rows
  of LITERAL figures (all 191 catalog colours' blended units, a 120-cell
  engine grid pinning every quantity-tier boundary from both sides, and
  the session's browser-verified anchors — Stacey $352/$276/$359.40,
  Kurt $64.60, the audit's $252.76/$337.76). Any edit that moves an
  apparel price is now a readable diff. Regenerate deliberately and say
  why in the commit; never fix a row to make it pass.
- **Apparel has a number** — 2026-08-31, the "give apparel a number"
  handoff, built after its Task 1 probe reported in writing (verdict:
  wiring plus one model change; the priced configurator behind
  status:"request" already worked to the cent). The garment component is
  now a BLENDED per-shirt price until sizes exist — base + Σ share ×
  size difference from the LIVE catalog SKUs, mix = ASSUMED_EXTENDED_MIX
  in lib/apparel-blend.ts (Gabe 29 Aug: 9% 2XL + 6% 3XL), ceil to 5¢
  (stated low-bias lean) — with the assumption ON SCREEN next to the
  figure and the promise "Enter your sizes and this becomes exact."
  Entering sizes prices every size from its own SKU, quantized to a 2dp
  per-shirt unit (ceil — Printavo multiplies a stored unit, and raw
  division re-opens the documented 4dp drift), and the screen says
  "Priced from your sizes." The rough count came back for this: THE GRID
  WINS, the count only fills the gap, nothing reconciles, sizes are now
  OPTIONAL at estimate time (quantity is the required thing). LANGUAGE
  (Task 3): no markup/vendor words on any customer surface — builder
  copy swept, and the shop email's supplier block (style/SKU/sample/
  blank price) moved ENTIRELY to the Printavo internal note (Gabe's
  call, 31 Aug); the customer copy-text's vendor section is gone.
  Verified by running: Stacey's quote ($352 → $276 ink lever → tier at
  24 → $374.04 exact from her real mix) and Kurt's ($64.60, visible
  before the form), every figure to the cent; audit driver now 36
  checks. isStickerOrder(priced apparel) = false, pinned BY NAME in
  tests/apparel-blend.test.ts. **status stays "request"** — flipping
  waits on Gabe's one real reconciled order (three Printavo lines),
  per Task 5.
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
