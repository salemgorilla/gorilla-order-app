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

## Verify by running, not by reading

Every pricing defect this project has shipped was caught by a human running the
real thing and comparing two numbers. None were caught by reading code. This
repo has also been bitten by scripted patches that matched nothing and reported
success.

**Any change touching pricing or checkout ends with one real order reconciled
against the Printavo invoice, to the cent.** Never with a passing test.

`tests/price-sheet.test.ts` is the second line, not a substitute for that: 199
committed totals across sizes, quantities, materials, carts and shipping, as
literal numbers. Any edit that moves a price shows up as a readable diff, so a
repricing has to be intended and reviewed rather than noticed later. Four of
its rows are anchored to figures verified outside the repo, including the 15
Aug Printavo reconciliation. Regenerate it deliberately, and say why in the
commit.

Test quotes: never pay one, always void it in Printavo afterwards.

A worked example of why. The per-shape slider caps looked correct in the diff
and were correct in the tests. Dragging the slider in a browser showed the
ceiling was unreachable: `step` was 5, and 141 / 113 / 104 are none of them
40 + 5n, so the control stopped short of the cut on every shape. Nothing but
running it would have caught that.

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

## Working rules

- Branch off `main`, PR back to `main`.
- `npm test` and `npx tsc --noEmit` before opening the PR.
- `npm run build` fails in restricted sandboxes on the Google Fonts fetch —
  that's egress, not your code. Say which you actually ran.
- Don't leave finished work sitting on a branch. Merging is part of the task.
- Validation rules belong in `lib/validation.ts`, not in a closure inside
  `app/page.tsx`. All three flows once kept their rules in the component, and
  the rules nothing could test were the ones with gaps — signs was missing a
  quantity check both its siblings had.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
