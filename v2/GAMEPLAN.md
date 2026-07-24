# Gorilla Order App — Build Gameplan

_Living roadmap for the Gorilla Salem quote/order builder. Update this file as you go._

**Last reviewed:** 2026-07-14 · **App:** `gorilla-order-app/v2` · **Stack:** Next.js 16.2.9 · React 19.2.4 · Tailwind v4 · TypeScript 5

---

## 0. How to use this doc

- Work **top to bottom** through Section 5 (Roadmap). Each sprint is small and commit-ready.
- Each sprint has a **Done when** checklist — don't move on until it's all checked.
- After every sprint: run the **Verify checklist** (Section 3), then commit (Section 9).
- Section 4 is the current bug/gap list. Section 6 is the list of decisions only *you* can make (pricing, shipping, etc.).
- This doc replaces the old `gorilla_order_claude_handoff.md` as the source of truth. Keep it in the repo.

---

## 1. Current status (verified working)

✅ **Decal quote flow** — quantity / size / shape / decal type → live price → review → confirmation.
✅ **Apparel quote flow** — live S&S catalog (products, colors, sizes, prices, images, stock), size-breakdown buttons, print locations, ink colors, artwork color estimate.
✅ **S&S Activewear API** — `/api/ss-catalog` returns `200` with real data. Credentials in `.env.local` are valid.
✅ **Quote submission** — `POST /api/quote` returns a quote number (`GS-YYYYMMDD-XXXXX`), shows a confirmation screen with **Copy Quote Details** + **Open Gmail Draft**.
✅ **Build is green** — `npx tsc --noEmit` and `npm run build` both pass with 0 errors.
✅ **DEPLOYED & LIVE** (2026-07-24) — **https://salemgorilla-gorilla-order-app.vercel.app/**
On Vercel, root dir `v2`, auto-deploys on every push to `main`. Verified end-to-end in production: homepage loads, S&S catalog returns all 6 garments, both flows render with correct pricing, and a real `/api/quote` submission **emails the shop via Gmail** — all with zero console errors.

**Checkpoint:** `v3.3.0 — Quote email works with Resend or Gmail` (see Section 2). Previous: `v3.2.0`, `v3.1.0`.

---

## 2. What changed most recently (2026-07-14)

### `v3.3.0` — Quote email works with Resend **or** Gmail _(pending commit)_
Resend signup was erroring out ("Something went wrong while processing your request" — and their status page showed no outage), so the app is no longer locked to one provider.

- `lib/email.ts` — now provider-agnostic. `getEmailProvider()` auto-detects: **Resend** (`RESEND_API_KEY`) or **Gmail SMTP** (`GMAIL_USER` + `GMAIL_APP_PASSWORD`), Resend winning if both are set. Neither configured → still skips safely.
- **New `GET /api/email-test`** — sends a sample quote and reports which provider was used, so you can confirm delivery without submitting a real quote.
- Added `nodemailer` (lazy-imported, so it only loads if Gmail is actually used).
- Both blocks are pre-stubbed in `.env.local` — fill in one and uncomment.

**Why Gmail is a fine option here:** no new signup, **no domain verification ever**, and quotes arrive *from* gorillaprinting@gmail.com so replies reach the customer naturally. Gmail's ~500/day limit is far above quote volume.

Verified: no provider → skipped cleanly with a clear hint; dummy Gmail credentials → reached Google's SMTP and returned a real auth rejection (`534-5.7.9`) **without crashing**, proving the path is wired correctly; `tsc` + `build` clean.

### `v3.2.0` — Printavo schema verified + real size mapping + rate-limit backoff
Verified the whole Printavo mutation against the **official v2 schema docs** (no credentials needed), which resolved the ⚠️ from v3.0.0 and let me fix a real bug and close a follow-up.

**✅ Schema verified** — every name/type I used is confirmed correct:
| Thing | Confirmed |
|---|---|
| `quoteCreate` → `QuoteCreateInput` | ✅ |
| `contact` | `IDInput!` — object w/ id, as used ✅ |
| `customerDueAt` / `dueAt` | `ISO8601Date!` (date-only) / `ISO8601DateTime!` — exactly the split implemented ✅ |
| `nickname`, `customerNote`, `productionNote`, `tags` | ✅ |
| `lineItemGroupCreate` → `LineItemGroupCreateInput` | ✅ |
| `description`, `itemNumber`, `position`, `price`, `taxed`, `sizes` | ✅ |

**🐛 Fixed a real bug:** `lineItems` is **`[[LineItemCreateInput!]]` — a nested array**, but the code (inherited from the old integration) passed a flat array. GraphQL would have coerced `[A, B]` into `[[A], [B]]`, splitting the decal and shipping lines into **separate groups**. Now correctly sends `[[A, B]]` as one group.

**✅ Real apparel sizes (closes Printavo follow-up #2).** The `LineItemSize` enum is confirmed lowercase snake_case (`size_s`, `size_m`, `size_2xl`, `size_ys`, `size_other`, …). Apparel line items now map the actual breakdown — `"S-4, M-8, L-8, XL-4"` → `size_s:4, size_m:8, size_l:8, size_xl:4` — instead of dumping everything into `size_other`. **Safety guard:** if the parsed counts don't equal the order quantity, it falls back to a single `size_other` row rather than sending Printavo wrong numbers. Decals still use `size_other`.

**✅ Rate-limit backoff.** Printavo allows **10 requests / 5 seconds**; one quote costs 3, so a couple of simultaneous submissions could trip it. `printavoRequest()` now retries `429`/5xx up to 3 times with exponential backoff (1s/2s/4s), honoring `Retry-After`.

Verified: size mapping + parsing (incl. `XXL`→`size_2xl`, unknown names merged, zero counts skipped, mismatch fallback); quote POST still succeeds with Printavo unconfigured; `tsc` + `build` clean.

> Still needs one live test once credentials exist — the schema is confirmed, but only a real call proves the account accepts it.

### `v3.1.0` — Pickup vs Ship on decals + fixed the fresh-load price bug
Implements decision **D1**: the customer now chooses **Local Pickup (free)** or **Ship (+$12)** on the decal flow, so walk-ins aren't overcharged and you stop eating shipping on mail orders.

- `features/decals/DecalBuilder.tsx` — new Delivery selector (Local Pickup / Ship It) showing the price of each.
- `types/order.ts` — new `DeliveryMethod` (`"Pickup" | "Ship"`) on `production`.
- `lib/pricing.ts` — `DECAL_SHIPPING_PRICE = 12` + `getShippingPrice()`. **Change the shipping price here.**
- `app/page.tsx` — `recalculateOrder()` now prices shipping too, and `updateProduction()` recalculates (so switching delivery updates the total). "Each" is now the **per-decal** price and excludes shipping.
- Shipping shows as its own line in the order summary, the copy/Gmail text, the quote email, and as a separate Printavo line item (so Printavo's total matches the site).

**🐛 Also fixed a real bug:** on a fresh page load the app showed **"Total $12 / $0.12 each"** — the old vestigial `shippingPrice: 12` with `stickerPrice: 0`, before any recalculation ran. `defaultOrder` now prices the default selection up front, so it correctly opens at **$89.00 / $0.89**.

Verified: fresh load $89.00/$0.89 ✓; Ship → $101.00 with "each" still $0.89 ✓; Holographic+Ship → $132.00, Holographic+Pickup → $120.00 ✓; delivery selector correctly does **not** appear in the apparel flow ✓; no console errors; `tsc` + `build` clean.

> **Open:** apparel has no shipping choice (its pricing never included shipping). If you want Pickup/Ship on apparel too, say so — it's a small follow-on.

### `v3.0.0` — Push quotes into Printavo as draft/unconfirmed
Production integration, first cut. When a quote is submitted, the server also creates a **Printavo quote tagged `#WebQuote` / `#Unconfirmed`** so nothing looks reviewed until you say so.

- **New `lib/printavo.ts`** — Printavo API v2 (GraphQL). Resolves the configured customer's contact → `quoteCreate` → `lineItemGroupCreate`. Handles **both flows** (the old code was decals-only). `buildPrintavoQuotePlan()` is a pure, testable mapper.
- **New `GET /api/printavo-test`** — verifies your credentials without creating anything.
- **`app/api/quote/route.ts`** — pushes to Printavo after emailing. **Best-effort**: if credentials are missing or the call fails, the customer still gets their confirmation; the outcome is logged and returned as `printavo`.
- **Replaced the old dead code.** The previous `create-printavo-order.js` (×3 copies) was written for the old Pages API (`handler(req,res)`), wasn't named `route.ts` so Next ignored it entirely, expected a payload shape the app no longer produces, and was decals-only. Deleted.

**⚙️ Off until you configure it** — see Section 3 → "Turn on Printavo".

**What's verified vs. not:**
- ✅ Payload mapping for both flows (apparel line item carries garment/color/locations/ink/size-breakdown/S&S style; decals carry size/shape/material); due date defaults to +14 days when none given; unit price math.
- ✅ Safety: no credentials → skipped, quote succeeds. Bad credentials → real Printavo response (`Unauthorized`) captured, quote still succeeds. So the endpoint, auth headers and request format are confirmed correct.
- ⚠️ **Not yet verified: the GraphQL schema itself** (`quoteCreate` / `lineItemGroupCreate` field names). Those mirror the previous working code but need one real test once you add credentials.

**Printavo follow-ups:**
1. **Real customers.** Every web quote currently attaches to one configured contact (`PRINTAVO_CUSTOMER_ID`), with the customer's real details in the quote's `customerNote`. Find-or-create of real Printavo customers (`customerCreate` / `contactCreate`) is the next step — doable now that the schema pattern is proven.
2. ~~**Real size mapping.**~~ ✅ **Done in v3.2.0** — apparel now maps to the real `LineItemSize` enums.
3. **Artwork upload.** Art is attached to the quote *email*, not uploaded to Printavo.

### `v2.9.0` — Split `page.tsx` into per-flow feature folders
Sprint E: pure tech-debt cleanup — **no behavior change**. `app/page.tsx` went from **2,071 → 1,098 lines (-47%)**, and each flow now lives in its own folder. Fixes Gap #6.

New structure:
```
features/
  types.ts                      ← shared catalog/quote types (were inline in page.tsx)
  QuoteConfirmation.tsx         ← the post-submit confirmation screen
  QuoteReviewCard.tsx           ← the shared "Review Your Quote" card
  apparel/
    ApparelBuilder.tsx          ← the whole apparel form (S&S catalog, colors, sizes, ink, size breakdown)
    ApparelSummaryCard.tsx      ← apparel summary + estimated pricing
  decals/
    DecalBuilder.tsx            ← quantity / size / shape / decal type
    DecalPreviewCard.tsx        ← live proof + size/shape/each + needed-by
```
`page.tsx` keeps the shared state, handlers, and layout and composes these — it's now the orchestrator, not the whole app.

**How it was done safely:** each block was extracted one at a time as a presentational component with explicit typed props (so TypeScript verifies every wire-up), running `tsc` after each step, then a full browser smoke test of both flows at the end. Also removed leftover junk (`ui` 0-byte file, empty `features/stickers/`) and now-orphaned imports.

Verified after refactor: decal pricing recalculates (Holographic $120/$1.20, Chrome $116/$1.16); apparel shows 6 garments across 4 categories with working filters; size-breakdown buttons update (0/24 → 1/24); review card renders for both flows; **zero console errors**; `tsc` + `build` clean.

### `v2.8.2` — Attach the uploaded artwork to the quote email
Sprint D: the real artwork file now rides along with the quote and is **attached to the quote email**, so you can open the art directly — not just see a filename. Fixes Gap #7.
- `app/page.tsx`: submit now sends `multipart/form-data` (order JSON + the actual file) instead of JSON-only.
- `app/api/quote/route.ts`: parses multipart (still accepts JSON for backward compat), and attaches the file to the email when it's **under 15 MB**. Over that, it skips the attachment and the email says "Too large to attach (X MB) — ask the customer to email the file directly," so nothing silently breaks.
- `lib/email.ts`: adds the attachment to the Resend send and an "Attachment" line in the email's Artwork section.
- Verified end-to-end from the browser: uploaded file → multipart POST → server attaches it → confirmation screen; also tested the 16 MB "too large" path and the legacy JSON path.

> ⚠️ **Hosting note:** attaching works great locally. If you later deploy to Vercel, serverless requests are capped at ~4.5 MB, so large uploads would fail before reaching the code. For big files on a hosted setup, switch to uploading the file to storage (S3/Supabase) and emailing a link — noted in Sprint D's follow-up.

### `v2.8.1` — Consistent validation + inline messages
Sprint B: fixes Gap #5 and removes the browser popups.
- **Phone is now optional on both flows** (decision D2). Both decal and apparel now require the same core: name, email, artwork, and need-by date. Apparel still also requires ≥1 print location and a matching size breakdown. Changed in `lib/validation.ts`.
- **Replaced all `alert()` popups with inline messages.** A failed/blocked submit now shows a red banner above the submit button; the confirmation screen's "Copy Quote Details" shows an inline "copied" confirmation instead of a popup. Changed in `app/page.tsx` (new `submitError` + `copyStatus` state). Zero `alert()` calls remain.
- Verified: decal required list dropped from 5 → 4 items (no "phone"); no console errors; `tsc` + `build` clean.

### `v2.8.0` — Auto-email each quote to the shop
Sprint C: when a customer submits, the server now emails the full quote to the shop via **Resend** — so quotes no longer vanish if the customer closes the tab or never clicks "Gmail Draft". Fixes Gaps #2 and #3.
- New `lib/email.ts` builds a formatted text + HTML email (works for both decal and apparel quotes) and sends it via the Resend API. `reply_to` is set to the customer so you can reply straight back to them.
- `app/api/quote/route.ts` calls it after logging the quote. **Best-effort:** if the email fails or no key is set, the customer still gets their confirmation — the failure is logged server-side and returned in the response's `notification` field.
- **⚙️ You must turn it on** — see **Section 3 → "Turn on quote emails"**. Until you add `RESEND_API_KEY`, sending is safely skipped.
- Verified: no-key path → quote succeeds, email skipped; dummy-key path → quote succeeds, failure captured (`Resend 401`) without blocking; email content correct for both flows; `tsc` + `build` clean.

### `v2.7.0` — Catalog labels, category filters, and real S&S style numbers
Sprint A (below) is **done and verified in the browser**:
1. **Merged customer-facing labels/categories into the API.** `app/api/ss-catalog/route.ts` now joins each S&S product to its `apparel-catalog.ts` entry (matched on the style code it was fetched under) and attaches `customerLabel`, `customerCategory`, `catalogStyle`, `catalogNotes`. `lib/ss-activewear.ts` was updated to thread the queried style code through to each product. This fixes Gap #1 — the apparel cards now show clean names ("Starter Tee") and the category filter shows real categories.
2. **Fixed 6 dead style codes (root cause found).** The catalog used **manufacturer model names** (`2000`, `3001CVC`, `18500`, `18000`, `2400`, `3001YCVC`) which S&S 404s ("discontinued"). S&S wants its **own styleID**. Looked up the correct styleIDs against the live S&S `/v2/styles/` API and verified each returns products:

   | Garment | Was (404) | Now (styleID) | Colors |
   |---|---|---|---|
   | Starter Tee (Gildan 2000) | `00760`* | `39` | 61 |
   | Premium Soft Tee (Bella 3001CVC) | `3001CVC` | `7584` | 85 |
   | Classic Hoodie (Gildan 18500) | `18500` | `395` | 47 |
   | Classic Crewneck (Gildan 18000) | `18000` | `372` | 41 |
   | Long Sleeve Tee (Gildan 2400) | `2400` | `135` | 28 |
   | Youth Soft Tee (Bella 3001YCVC) | `3001YCVC` | `10628` | 34 |

   _*`00760` (the partNumber) actually worked; the rest were manufacturer names and didn't._ Also removed the redundant "Basic Tee" entry — it pointed at the same Gildan 2000 as "Starter Tee" and was broken/invisible anyway.
3. **Verified:** apparel flow now shows **6 garments across 4 categories** (T-Shirts, Sweatshirts, Long Sleeves, Youth); the category filter works; garment prices render; no console errors; `tsc` + `build` clean.

> **To add a garment later:** put its S&S **styleID** in `apparel-catalog.ts` (not the manufacturer model number). Find styleIDs via the S&S catalog or `GET https://api.ssactivewear.com/v2/styles/`.

### `v2.6.2` — Fix decal pricing crash + repo cleanup
Two build-breaking bugs were fixed and dead files removed:

1. **🔴 Decal pricing crash (critical).** `app/page.tsx` imported `getDecalPrice` from `lib/pricing.ts`, but that file only exports `getStickerPrice`. The moment a customer touched any decal option, the app threw `getDecalPrice is not a function` and pricing never computed. **Fix:** `page.tsx` now imports and calls `getStickerPrice` (kept the internal name `sticker` per the "customer-facing = decal, code = sticker" rule). Verified live: 100 Gloss White = **$89 / $0.89 each**; switching to Holographic recalculated to **$120 / $1.20 each** (×1.35). ✔
2. **🟠 Build error from dead file.** `components/PriceCard.tsx` imported a non-existent `StickerOrder` type, failing `next build`. It was unused — deleted.
3. **🟡 Repo cleanup.** Removed 9 empty/junk files created by bad pastes:
   - Repo root: `setQuoteSubmitted(false)}`, `updateCustomer(updates)}`, `updateProduct({`, `updateProduction({`
   - `components/PreviewPanel.tsx`, `components/ProductPanel.tsx`, `components/uploads`
   - `components/upload/FileThumbnail.tsx`, `components/upload/UploadDropzone.tsx`, `components/upload/UploadedFileCard.tsx`

> These changes are **not committed yet.** Review, then commit as `v2.6.2` (Section 9).

---

## 3. Run + Verify checklist

**Start the app** (PowerShell, from the repo):
```powershell
cd v2
npm run dev
```
Open http://localhost:3000/ — if 3000 is busy, kill the old server instead of using 3001:
```powershell
# find the PID listening on 3000, then:
taskkill /PID <PID> /F
```

**Quick health checks:**
```powershell
npx tsc --noEmit          # must print nothing (0 type errors)
npm run build             # must end with "BUILD EXIT: 0" / no errors
```
Direct S&S API test (should return JSON): http://localhost:3000/api/ss-catalog?style=00760

### ⚙️ Turn on quote emails (one-time setup)

Quotes only email once a provider is configured. **Pick either one** — the app auto-detects which is set (Resend wins if both are). `v2/.env.local` already has both blocks stubbed out; you just fill one in.

**Check it any time:** http://localhost:3000/api/email-test — sends a sample quote and reports which provider was used.

#### Option A — Resend
1. **https://resend.com** → sign up (free, 3,000/mo) → **API Keys** → create one (starts with `re_`).
2. In `v2/.env.local`, uncomment and fill: `RESEND_API_KEY=re_...`
3. Restart `npm run dev`.
4. **Testing note:** the sandbox sender `onboarding@resend.dev` is for testing only. To email `quote@gorillasalem.com` you must **verify the gorillasalem.com domain** in Resend (Domains tab → add DNS records); until then, send to your own signup address. After verifying, set `QUOTE_FROM_EMAIL=Gorilla Salem Quotes <quotes@gorillasalem.com>`.

#### Option B — your own Gmail _(no new signup, no domain verification)_
Good fallback if Resend signup misbehaves. Quotes arrive **from your own address**, so replies work naturally.
1. Turn on **2-Step Verification**: Google Account → Security.
2. Create an **App Password**: Google Account → Security → 2-Step Verification → **App passwords**. Copy the 16-character password.
3. In `v2/.env.local`, uncomment and fill:
   ```
   GMAIL_USER=gorillaprinting@gmail.com
   GMAIL_APP_PASSWORD=the16charpassword
   ```
   (Leave `RESEND_API_KEY` commented out.) Spaces in the password are fine — they're stripped automatically.
4. Restart `npm run dev`.

> Gmail sends as the authenticated account, so `QUOTE_FROM_EMAIL` is ignored for Option B (only the display name is used). Gmail's ~500 emails/day limit is far above quote volume.

**Either way:** submit a test quote — the terminal logs `QUOTE EMAIL SENT for … via resend|gmail`, or `QUOTE EMAIL FAILED: <reason>`. Never paste the key/password into chat or commit it; it lives only in `.env.local` (git-ignored).

### ⚙️ Turn on Printavo (one-time setup)

Quotes only reach Printavo once these are set. Until then it's skipped and the app works exactly as it does today.

1. In Printavo: **My Account → Generate API Key**, then copy the token. (To check it later: **My Account → API Token**.)
   > **Recommended:** create a **separate Printavo user** for this integration and generate the key under that login, rather than using the owner's personal key. The token grants full account access, so a dedicated service user can be rotated or revoked without disrupting anyone's day-to-day login.
2. Find the Printavo **customer ID** that web quotes should attach to (open the customer in Printavo; the id is in the URL). Tip: make a customer literally called "Website Quotes" for this.
3. Add to `v2/.env.local`:
   ```
   PRINTAVO_EMAIL=your_printavo_login_email
   PRINTAVO_TOKEN=your_printavo_api_token
   PRINTAVO_CUSTOMER_ID=the_customer_id
   ```
4. Restart `npm run dev`, then open **http://localhost:3000/api/printavo-test** — it should say `"connected": true` and show your company name. It creates nothing.
5. Submit one test quote. Terminal logs `PRINTAVO QUOTE CREATED …` with a link; a failure logs `PRINTAVO FAILED: <reason>`.
6. **Check that first quote in Printavo carefully** — this is the step that confirms the GraphQL schema is right (see the ⚠️ in Section 2). If it errors, send me the exact message and I'll fix the mutation.

> Every web quote lands tagged `#WebQuote` + `#Unconfirmed`. Never paste the token into chat — it lives only in `.env.local` (git-ignored). Rotate it periodically.

**Printavo API facts worth knowing** (from the API handoff doc):
- Endpoint `POST https://www.printavo.com/api/v2`; headers `Content-Type`, `email`, `token`.
- **Rate limit: 10 requests / 5 seconds.** One quote costs 3 requests. The app retries `429` with backoff automatically.
- **No webhooks** — the API is request/response only. Our integration only *pushes*, so this doesn't affect us; but if you ever want Printavo status changes to flow *back* into the app, that requires polling.
- Query depth max 13, complexity max 25,000; large reads use cursor pagination.
- The same key works for v1 and v2 — build new work against **v2**.
- Docs: https://www.printavo.com/docs/api/v2 · Printavo does not provide implementation support, so the docs are the source of truth.

**Manual smoke test — do this after any change to `page.tsx`:**
- [ ] **Decal flow:** change quantity, size, shape, and decal type → price updates every time, no console errors. Holographic/Chrome/Clear cost more than Gloss/Matte.
- [ ] **Apparel flow:** click "T-Shirts & Apparel" → catalog loads → pick style/color/size → set size breakdown to match quantity → estimate shows.
- [ ] Fill customer info + date + upload art → **Submit** → confirmation screen shows a quote number → **Copy** and **Gmail Draft** both work.

---

## 4. Known issues & gaps (prioritized)

| # | Issue | Where | Impact | Priority |
|---|-------|-------|--------|----------|
| 1 | ~~Catalog labels/categories not merged into API response.~~ **✅ FIXED in v2.7.0** (Section 2). Also fixed the 6 dead S&S style codes. | — | Apparel cards now show clean labels + working category filters | ✅ Done |
| 2 | ~~Quotes not stored anywhere.~~ **✅ FIXED in v2.8.0** — each quote now auto-emails to the shop (`lib/email.ts`). _Needs the one-time Resend setup in Section 3 to activate._ Optional future add: also store to a Sheet/DB for a searchable record. | — | Quotes now land in the shop inbox | ✅ Done |
| 3 | ~~No real email.~~ **✅ FIXED in v2.8.0** — server sends automatically on submit; no reliance on the customer clicking Gmail Draft (that button stays as a manual backup). | — | Automatic delivery | ✅ Done |
| 4 | ~~Shipping defined but never charged.~~ **✅ FIXED in v3.1.0** — customer picks Pickup (free) or Ship (+$12); shipping is priced, shown as its own line, and sent to Printavo. Also fixed the fresh-load "$12/$0.12" bug. | — | Estimates now match what you'd actually charge | ✅ Done |
| 5 | ~~Validation inconsistent (decals required phone, apparel didn't).~~ **✅ FIXED in v2.8.1** — phone is now optional on both; shared core is name/email/artwork/need-by. | — | Consistent required fields | ✅ Done |
| 6 | ~~`page.tsx` is ~2,030 lines — one giant component.~~ **✅ FIXED in v2.9.0** — split into `features/apparel/`, `features/decals/`, and shared cards; now 1,098 lines and each flow is editable on its own. | — | Safe to edit one flow without touching the other | ✅ Done |
| 7 | ~~Artwork analyzed in-browser only; actual file never sent.~~ **✅ FIXED in v2.8.2** — the file is now sent on submit and attached to the quote email (under 15 MB). | — | Shop can open the art from the email | ✅ Done |

---

## 5. Roadmap (ordered sprints)

Do these in order. Each is scoped to stay small and commit-ready.

### ✅ Sprint A — Catalog labels & category filters `v2.7.0` — DONE 2026-07-14
**Goal:** Show clean names ("Starter Tee") and working category buttons instead of raw S&S names + only "All".
**Outcome (verified):** API merge implemented; 6 dead style codes replaced with real S&S styleIDs; apparel flow shows 6 garments across 4 categories; category filter works; both flows pass the smoke test; `tsc` + `build` clean. See Section 2 for details.
- [x] Category buttons show T-Shirts, Sweatshirts, Long Sleeves, Youth (not just All)
- [x] Product cards show the clean label ("Starter Tee"), raw S&S name as the secondary line
- [x] Both flows still pass the Section 3 smoke test

> **Optional polish (not blocking):** category chips currently order by product sort, not a fixed order; and the S&S `brandName` comes back as "Unknown Brand" for some styles (the clean customer label hides this, but the "S&S: …" secondary line shows it). Consider requesting/using the brand from the `/v2/styles/` endpoint later.

### ✅ Sprint B — Align validation + UX polish `v2.8.1` — DONE 2026-07-14
**Chosen (D2):** phone optional on both flows.
**Outcome (verified):** shared required core (name/email/artwork/need-by); all `alert()` popups replaced with inline messages. `tsc` + `build` clean.
- [x] Decal and apparel require the same core fields
- [x] No `alert()` anywhere; errors + copy feedback show in the UI

### ✅ Sprint C — Real quote capture (email) `v2.8.0` — DONE 2026-07-14
**Goal:** Every submitted quote reaches the shop automatically — no reliance on the customer hitting "send".
**Chosen (D3):** Email via Resend.
**Outcome (verified):** `lib/email.ts` + `route.ts` auto-email each quote (text + HTML, reply-to = customer). Best-effort so a mail failure never blocks the customer. Both flows produce correct emails; `tsc` + `build` clean.
- [x] Submitting a quote emails the shop without the customer doing anything extra
- [x] Failures don't block submission; they're logged + returned in `notification`
- [x] Secrets live only in `.env.local` (git-ignored)
- [ ] **YOUR STEP:** add the Resend key (Section 3 → "Turn on quote emails") to activate

> **Optional follow-up:** add a second sink (Google Sheet / Airtable) for a searchable record + status tracking. The code is structured so adding another sink alongside email is a small change in `route.ts`.

### ✅ Sprint D — Attach the actual artwork to the quote `v2.8.2` — DONE 2026-07-14
**Goal:** The shop can see the uploaded art, not just its filename.
**Outcome (verified):** submit sends multipart; the server attaches the file to the quote email (<15 MB) with graceful "too large" handling; JSON path kept for backward compat. Verified end-to-end from the browser + the 16 MB and no-file edge cases. `tsc` + `build` clean.
- [x] The quote email carries the uploaded artwork as an attachment

> **Optional follow-up (hosted setups / large files):** upload the file to storage (S3/Supabase) and email a link instead of an attachment — removes the 15 MB cap and the Vercel 4.5 MB request limit. Pairs well with adding a Sheet/DB record (Sprint C follow-up).

### ✅ Sprint E — Refactor `page.tsx` `v2.9.0` — DONE 2026-07-14
**Goal:** Split the 2,000-line page into smaller pieces so future changes are safe.
**Outcome (verified):** `page.tsx` 2,071 → 1,098 lines (-47%); each flow now lives in `features/apparel/` and `features/decals/`; confirmation + review cards extracted to `features/`. See Section 2 for the structure. Both flows pass the full smoke test unchanged; `tsc` + `build` clean.
- [x] Each flow lives in its own folder; `page.tsx` is now the orchestrator (state + handlers + layout)
- [x] Both flows pass the full smoke test unchanged

> **Optional further thinning (not needed now):** the remaining bulk of `page.tsx` is ~500 lines of shared state + handlers. If it ever gets unwieldy, move that into a `useQuoteBuilder()` hook and pass it down via context. Deliberately skipped for now — it's a riskier move than the presentational extraction, with less payoff.

**Where to make changes now:**
- Change an apparel form control → `features/apparel/ApparelBuilder.tsx`
- Change decal options → `features/decals/DecalBuilder.tsx`
- Change the confirmation screen → `features/QuoteConfirmation.tsx`
- Change shared state/handlers/pricing wiring → `app/page.tsx`

### 🟡 v3.0.0 — Production integration (Printavo) — BUILT, awaiting live credentials
**Decided:** target = **Printavo**; trigger = **auto-create, tagged draft/unconfirmed**.
**Built + verified:** mapping for both flows, safety (skip/fail never blocks a customer), `/api/printavo-test`. See Section 2.
- [x] Quotes push to Printavo as `#WebQuote` / `#Unconfirmed`
- [x] A Printavo outage/failure can never block a customer's quote
- [ ] **YOUR STEP:** add credentials (Section 3 → "Turn on Printavo") and submit one test quote
- [ ] Then: verify the GraphQL schema, and tackle the 3 Printavo follow-ups in Section 2 (real customers, size enums, artwork upload)

---

## 6. Decisions only Natalie can make

Answer these before the sprint that needs them:

All resolved. ✅

- ~~**D1 (Shipping):**~~ ✅ Decided: **customer picks Pickup (free) or Ship (+$12)** on decals (v3.1.0).
- ~~**D2 (Required fields):**~~ ✅ Decided: phone **optional** on both flows (v2.8.1).
- ~~**D3 (Quote storage):**~~ ✅ Decided: **email via Resend** (v2.8.0). A Sheet/Airtable record can still be added later as a second sink.
- ~~**D4 (Markup/pricing):**~~ ✅ Confirmed 2026-07-14: 40% markup and all decal + apparel prices in Section 8 are **current** — no changes.

_New decisions to note here as they come up (e.g. shipping on apparel, Printavo customer handling)._

---

## 7. Architecture map

```
v2/
  app/
    page.tsx                     ← orchestrator: shared state, handlers, layout (~1100 lines)
    layout.tsx, globals.css      ← shell + styles
    api/
      quote/route.ts             ← POST: receives a quote, emails it + pushes to Printavo
      ss-catalog/route.ts        ← GET: S&S catalog + merged customer labels/categories
      printavo-test/route.ts     ← GET: verifies Printavo credentials (creates nothing)
  features/                      ← per-flow UI (added in v2.9.0)
    types.ts                     ← shared catalog/quote types
    QuoteConfirmation.tsx        ← post-submit confirmation screen
    QuoteReviewCard.tsx          ← shared "Review Your Quote" card
    apparel/
      ApparelBuilder.tsx         ← the apparel form (catalog, colors, sizes, ink, size breakdown)
      ApparelSummaryCard.tsx     ← apparel summary + estimated pricing
    decals/
      DecalBuilder.tsx           ← quantity / size / shape / decal type
      DecalPreviewCard.tsx       ← live proof + each/needed-by
  components/
    Header, QuantitySelector, OptionSelector, NeedByDate, CustomerForm, SubmitButton
    preview/  ApparelPreview, StickerPreview, StickerShape   ← live proof visuals
    summary/  OrderSummary, OrderValidation, ArtworkAnalysisCard
    upload/   UploadBox                                       ← drag & drop art
  lib/
    catalog.ts                   ← decal options (sizes, shapes, materials, quantities)
    pricing.ts                   ← DECAL pricing  → getStickerPrice()
    order.ts / types/order.ts    ← decal order shape + defaults
    apparel.ts                   ← apparel dropdown options + defaults
    apparel-catalog.ts           ← clean labels + categories + S&S style codes
    apparel-pricing.ts           ← APPAREL pricing math → calculateApparelPricing()
    apparel-pricing-config.ts    ← APPAREL price knobs (edit numbers here)
    ss-activewear.ts             ← S&S API integration (auth, fetch, normalize)
    artwork.ts                   ← browser-side image color-count estimate
    validation.ts                ← decal-flow required fields
    email.ts                     ← builds + sends the quote email (Resend)
    printavo.ts                  ← maps + pushes quotes into Printavo (API v2)
```
**Golden rule (do not break):** `page.tsx` / `features/*` = React UI. `api/*/route.ts` = backend only. Never paste one into the other.

---

## 8. Where to change the numbers

_All confirmed current as of 2026-07-14 (decision D4)._

**Decal prices** — `lib/pricing.ts`:
- `baseStickerPrices` — price by quantity (50→$65, 100→$89, … 5000→$1541)
- material multipliers — Clear ×1.15, Holographic ×1.35, Chrome ×1.30, Gloss/Matte ×1.00
- `DECAL_SHIPPING_PRICE` — flat $12 when the customer picks "Ship" (pickup is free)

**Apparel prices** — `lib/apparel-pricing-config.ts`:
- `basePrintPrices` — print $/piece by quantity tier (24→$6.00 … 250+→$3.25)
- `extraLocationFeePerPiece` $2.50 · `extraInkColorFeePerPiece` $0.65 · `underbaseFeePerPiece` $0.75 · `setupFeePerColorPerLocation` $25

**Garment markup** — `.env.local`: `SS_MARKUP_RATE=0.4` (40%).

---

## 9. Working agreement + git flow

**Preferences:** step-by-step instructions, full replacement files when a change is large, explicit file paths, explicit terminal commands. VS Code on Windows.

**Secrets:** never paste API keys into chat; keep them only in `.env.local` (git-ignored via `.env*.local`). The S&S key was exposed in old screenshots — **rotate it** when convenient.

**Branch:** work on `develop`.

**Commit after each green sprint** (PowerShell):
```powershell
git add .
git commit -m "v2.7.0 - Merge catalog labels and category filters"
git push
```
Suggested next commit for today's fixes:
```powershell
git add .
git commit -m "v2.6.2 - Fix decal pricing crash and remove dead files"
git push
```

---

## 10. Going live (deployment)

Today the app runs **locally** (`npm run dev`). That's fine for testing, but a customer can't reach `localhost` — for real quotes to flow, the app has to be **deployed and always-on**.

**The key idea:** `.env.local` never leaves your machine. Every secret in it (`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SS_ACCOUNT_NUMBER`, `SS_API_KEY`, and Printavo keys once added) must be re-entered in the **hosting provider's** environment-variable settings.

**Vercel is the natural fit** (it's Next.js's maker) and there's already a `vercel.json` at the repo root:
1. Import the `salemgorilla/gorilla-order-app` repo at vercel.com.
2. **Set the project's Root Directory to `v2`** (the app lives in the subfolder, not the repo root).
3. Add every env var from `v2/.env.local` in **Vercel → Settings → Environment Variables**.
4. Deploy. Point your domain / a link at the resulting URL.

**One thing to re-check after deploying:** artwork attachments. Vercel's serverless functions cap request bodies at ~4.5 MB, so large uploads that work locally may fail in production (noted under Sprint D). If that bites, switch artwork to upload-to-storage + link.

> Want help with this? I can walk through the Vercel setup and confirm each env var, but the actual account/import steps happen in your browser.

---

## Version history
- **2026-07-24** — Quote emails confirmed **live** via Gmail (end-to-end); added deployment section (10)
- `v3.3.0` — Quote email supports Resend **or** Gmail SMTP; added `/api/email-test`
- `v3.2.0` — Printavo schema verified; real apparel size mapping; nested lineItems fix; 429 backoff
- `v3.1.0` — Pickup vs Ship on decals; fixed the fresh-load "$12/$0.12" price bug
- `v3.0.0` — Push quotes into Printavo as draft/unconfirmed (+ `/api/printavo-test`)
- `v2.9.0` — Split `page.tsx` into per-flow feature folders (-47% lines, no behavior change)
- `v2.8.2` — Attach uploaded artwork to the quote email (multipart submit)
- `v2.8.1` — Phone optional on both flows + inline messages (no popups)
- `v2.8.0` — Auto-email each quote to the shop (Resend)
- `v2.7.0` — Catalog labels + category filters (API merge) + real S&S style numbers
- `v2.6.2` — Fix decal pricing crash (`getStickerPrice`), remove dead/junk files
- `v2.6.1` — Rename stickers to decals
- `v2.6.0` — Simplify decal finish options
- `v2.5.0` — Add quote review screen
- `v2.4.0` — Add size breakdown buttons
- `v2.3.0` — Add garment thumbnails
- `v2.2.0` — Add garment category filters _(see Gap #1 — not fully wired)_
- `v2.1.0` — Improve customer garment labels _(see Gap #1)_
- `v2.0.1` / `v2.0.0` — S&S catalog styles + loader
- `v1.9.0` → `v1.8.0` — Apparel pricing estimator + webpack dev
