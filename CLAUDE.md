# Gorilla Labs — repo root

**The app is in `v2/`. Everything at this level except `.claude/` and
`.github/` is a dead v1 static site — `index.html`, `src/`, `data/`. It is not
deployed and not maintained. Do not edit it, and do not read it to learn how
the app works; it will teach you things that stopped being true.**

Start here instead:

1. `v2/AGENTS.md` — how to work in this repo. `v2/CLAUDE.md` is a one-line
   include of it.
2. `.claude/agents/app-support.md` — the invariants that have actually cost
   money.

The one fact worth carrying before you read either: **stickers auto-bill.** A
submitted sticker quote creates a live payment link with no human in the loop.
Nothing else does. Any change touching pricing or checkout ends with one real
order reconciled against the Printavo invoice, to the cent — never with a
passing test.

The root directory Vercel builds is set in the project's dashboard, not in
the repo — root `vercel.json` only carries `cleanUrls`/`trailingSlash`. So
nothing in the tree tells you the app lives in `v2/`. This file does.
