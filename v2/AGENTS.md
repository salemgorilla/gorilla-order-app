# Working on this repo

The app is in `v2/`. The repo root holds a dead v1 static site — ignore it.

## Read these, in this order

1. `../.claude/agents/app-support.md` — the invariants that have actually cost
   money. Non-negotiable. (Repo root, not `v2/` — this file lives in `v2/`.)
2. `HANDOFF.md` — current session state. If it disagrees with the repo, the
   repo wins; fix the doc.
3. `DESIGN-SYSTEM.md` — the Order Desk register. Read before touching any UI.
4. `GAMEPLAN.md` — version history and longer-range context.

## The one that matters most

**Stickers auto-bill with no human in the loop.** A submitted sticker quote
emails the shop and creates a live payable link the customer can pay
immediately. Nothing between the browser and someone's card is reviewed.

`isStickerOrder()` in `lib/sticker-repricing.ts` (called from
`app/api/quote/route.ts`) decides which submissions get
that treatment. It used to classify by *absence* — no supplier, no garmentType,
no signType — so any new flow that forgot a field silently became a sticker
order and charged someone a price nobody set. It now also requires the product
type to say "sticker". Do not weaken that.

`buildQuotePayload` must keep synthesising a `product` object. A payload
without it returns false from `isStickerOrder()` and stickers silently stop
checking out — no error, no log, no money.

Everything else is quoted, not charged. Banners and signs return a real price
online and are invoiced by hand; apparel ships as a hand-quote request. If you
add a flow, assert its payload against `isStickerOrder()` in a test —
`tests/signs-cart-not-a-sticker.test.ts` is the pattern.

## The four flows, and what each one is

`lib/products.tsx` is the register. Its `status` field is the switch:

- **Stickers** — active, instant price, **self-checkout**.
- **Banners** and **Signs** — active, instant price, invoiced by hand. Two
  products and two carts since the 08-23 hard split; they share the pricing
  machinery in `lib/signs.ts`, which is a fact about the code, not the offer.
- **Apparel** — `status: "request"`. The full configurator exists
  (`ApparelBuilder`, `lib/apparel-pricing.ts`, `lib/apparel-blend.ts`, the
  S&S catalog) and is **not rendered** in production; customers get
  `ApparelRequestBuilder` instead. Flipping `"request"` → `"active"` is Gabe's
  decision, not yours. `tests/e2e/apparel-configurator-audit.mjs` re-verifies
  that flip in about ten minutes against a local server with the flip applied
  locally — CI cannot run it, for the same reason.

## Verify by running, not by reading

Every pricing defect this project has shipped was caught by a human running the
real thing and comparing two numbers. None were caught by reading code. This
repo has also been bitten by scripted patches that matched nothing and reported
success.

**Any change touching pricing or checkout ends with one real order reconciled
against the Printavo invoice, to the cent.** Never with a passing test.

The three price sheets are the second line, not a substitute for that. Each is
a table of committed dollars as **literal numbers**, generated once and pasted
— never recomputed at test time, because a table the code fills in agrees with
the code no matter what the code does. Any edit that moves a price shows up as
a readable diff, so a repricing has to be intended and reviewed rather than
noticed later:

- `tests/price-sheet.test.ts` — stickers, 199 totals across sizes, quantities,
  materials, carts and shipping. Four rows are anchored to figures verified
  outside the repo, including the 15 Aug Printavo reconciliation. This is the
  sheet that guards the flow that takes money unattended.
- `tests/signs-price-sheet.test.ts` — 120 rows over yard (28), banner (58),
  poster (6) and rigid (28), covering both sides of every tier boundary the
  builder can actually reach. Configurations the builder cannot reach are
  deliberately absent, and the reason is recorded as an assertion rather than
  left as a gap.
- `tests/apparel-price-sheet.test.ts` — three sections: six browser-verified
  anchors from real scenario runs, one committed blended per-shirt price for
  each of the 191 colours in the committed catalog capture, and 120 engine
  totals across quantity tiers, ink counts, locations and underbase —
  including both sides of every tier boundary (23/24, 49/50, 99/100,
  249/250).

Regenerate a sheet deliberately, and say why in the commit. Never "fix" a row
to make a failing test pass — a failing row **is** the finding.

Test quotes: never pay one, always void it in Printavo afterwards.

A worked example of why. The per-shape slider caps looked correct in the diff
and were correct in the tests. Dragging the slider in a browser showed the
ceiling was unreachable: `step` was 5, and 141 / 113 / 104 are none of them
40 + 5n, so the control stopped short of the cut on every shape. Nothing but
running it would have caught that.

## The spec is data

Several rules the shop owns are single exported objects, so changing the
shop's mind is one edit and the code follows. Change the object, not the call
sites:

- `lib/reference-quote.ts` — the entry-screen anchor order. The figure is
  always *computed* from the same engine that produces the invoice, never a
  constant, so the hero and the payment link cannot drift apart.
- `lib/turnaround.ts` — the earliest date each flow may promise. Two lanes:
  stickers and banners next business day, apparel and signs 14 business days.
  It blocks at the picker *and* at the validator, and the copy offers rush by
  phone. Before it existed the form accepted "24 screen-printed shirts, in
  hand this afternoon" — and on stickers that promise could be paid for
  before anyone at the shop saw it.
- `lib/pricing.ts`, `lib/signs-pricing-config.ts`,
  `lib/apparel-pricing-config.ts`, `lib/paper-pricing-config.ts` — the rates.
  Moving a number here moves a price sheet; that diff is the review.

## Do not touch

- **`--cut-line` is `#FF00FF`.** `isMagentaPixel()` needs blue > 190 and
  `ArtworkGuidance` shows customers that exact hex.
- **`overflow: clip` in `globals.css`** — changing it to `hidden` kills the
  sticky estimate bar. Not the same element as the `overflow-hidden` on the
  sticker stage in `StickerShape.tsx`, which bleed mode deliberately switches
  off.
- **Safe-area factors** (0.707 circle / 0.88 rounded / 0.96 square), now in
  `lib/sticker-geometry.ts` — they keep square art off the corners. Read them:
  the slider caps and the canvas proof both derive from them, so changing one
  number moves three things.
- **`rounded-full` / `rounded-[2rem]` on sticker shapes** — product geometry,
  not UI radius. `--radius: 0` does not apply.
- **Garment blank hex values** in the apparel preview — garment colours, not UI
  tokens. Never sweep them into the palette.
- **Material gradients and the transparency checkerboard** — they depict real
  vinyl. Content, not decoration.
- **DNS:** only ever the `labs` record. The `@` and `www` records are
  Squarespace and repointing them took the main site down once already.

## Environment

Variables bake in at **build time** and are scoped per environment. Setting one
without redeploying changes nothing — this has cost several sessions.
Credentials come in pairs (`PRINTAVO_EMAIL`/`PRINTAVO_TOKEN`,
`SS_ACCOUNT_NUMBER`/`SS_API_KEY`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`); scoping
half a pair fails confusingly.

Read secrets with `.trim()`. A trailing newline on a pasted value is invisible
in the Vercel UI and invisible in the error it causes — it can lock the shop out
of `ADMIN_SECRET` entirely, and it was one of the things that had to be
eliminated before the S&S 401 could be attributed to the key itself.

`/api/printavo-test` is public and reports what's configured.
`/api/health?secret=` is admin-guarded and reports by capability, including
credential character counts, so a rejected key can be diagnosed without
printing it anywhere.

Credentials rot on their own schedule, and CI only runs when code changes. The
S&S key expired and served a 401 to every apparel visitor for a **week** before
anyone noticed. `.github/workflows/canary.yml` now does three read-only GETs
against production every morning at 10:00 UTC — homepage price anchor, Printavo
connectivity, S&S catalog non-empty — and a red run reaches the inbox that day.
It never submits a quote and never touches Printavo. Keep it that way.

## Working rules

- Branch off `main`, PR back to `main`.
- `npm test` and `npx tsc --noEmit` before opening the PR. Since 23 Aug,
  CI enforces both plus lint, the production build and the browser smoke on
  every PR and push to `main` (`.github/workflows/ci.yml`) — a backstop for
  the session that forgets, not a substitute for running them yourself, and
  never a substitute for the Printavo reconciliation above.
- `npm test` is `tsx --test tests/*.test.ts`. `npm run test:e2e` drives
  `tests/e2e/smoke.mjs` in Chromium against a running server, with every
  backend stubbed at the network layer, so it never depends on S&S and never
  creates a real quote. The suite proves functions; the smoke proves the
  *wiring*, and every sweep in this repo's history found its defects by
  driving the real page — review cards reading the wrong state, flows renamed
  by a catalog default — none of which broke a unit test.
- CI's build step runs with **no secrets on purpose**. Every credential is
  optional at build time; features report themselves unconfigured at runtime
  instead. A change that makes a credential *required* to build breaks Vercel
  previews the same way, so that step failing is a real finding.
- `npm run build` fails in restricted sandboxes on the Google Fonts fetch —
  that's egress, not your code. Say which you actually ran.
- Don't leave finished work sitting on a branch. Merging is part of the task.
- Validation rules belong in `lib/validation.ts`, not in a closure inside
  `app/page.tsx`. All three flows once kept their rules in the component, and
  the rules nothing could test were the ones with gaps — signs was missing a
  quantity check both its siblings had.
- Every `FieldKey` must declare its step in `FIELD_STEP` (`lib/steps.ts`) —
  that half is a compile error. The runtime half is
  `tests/rule-reachability.test.ts`: some real input state must actually
  produce each key. A rule that cannot fire is worse than a missing one, and
  three of them could not — `NumberField`'s blur snapped a cleared box up to 1
  before the `quantity > 0` rules ever saw a 0, so clearing "How many" and
  tabbing away ordered ONE.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
