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

**Checkpoint:** `v2.7.0 — Catalog labels + category filters + real S&S style numbers` (see Section 2). Previous: `v2.6.2`, `v2.6.1`.

---

## 2. What changed most recently (2026-07-14)

### `v2.7.0` — Catalog labels, category filters, and real S&S style numbers _(pending commit)_
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

**Manual smoke test — do this after any change to `page.tsx`:**
- [ ] **Decal flow:** change quantity, size, shape, and decal type → price updates every time, no console errors. Holographic/Chrome/Clear cost more than Gloss/Matte.
- [ ] **Apparel flow:** click "T-Shirts & Apparel" → catalog loads → pick style/color/size → set size breakdown to match quantity → estimate shows.
- [ ] Fill customer info + date + upload art → **Submit** → confirmation screen shows a quote number → **Copy** and **Gmail Draft** both work.

---

## 4. Known issues & gaps (prioritized)

| # | Issue | Where | Impact | Priority |
|---|-------|-------|--------|----------|
| 1 | ~~Catalog labels/categories not merged into API response.~~ **✅ FIXED in v2.7.0** (Section 2). Also fixed the 6 dead S&S style codes. | — | Apparel cards now show clean labels + working category filters | ✅ Done |
| 2 | Quotes are **not stored anywhere**. `POST /api/quote` only `console.log`s and returns a number. Close the tab = quote is gone unless the customer clicks Gmail Draft. | `app/api/quote/route.ts` | No record of quote requests | 🔴 High — see Sprint C |
| 3 | **No real email.** "Open Gmail Draft" just opens a pre-filled compose window; nothing sends automatically and it requires the customer to be logged into Gmail. | `getEmailQuoteLink()` in `page.tsx` | Quotes can be lost if customer doesn't hit send | 🟠 Med — see Sprint C |
| 4 | **Shipping is defined but never charged.** `defaultOrder.pricing.shippingPrice = 12`, but `recalculateOrder()` sets `total = stickerPrice` only. Decal estimate excludes shipping. | `lib/order.ts`, `recalculateOrder()` in `page.tsx` | Estimate may be lower than real cost — *is this intended?* | 🟠 Med — Decision D1 |
| 5 | **Validation is inconsistent.** Decal flow requires a phone number; apparel flow does not. | `getOrderValidationErrors()` (`lib/validation.ts`) vs `getApparelValidationErrors()` (`page.tsx`) | Uneven data quality | 🟡 Low — Sprint B |
| 6 | `page.tsx` is **~2,030 lines** — one giant client component holding all state, pricing wiring, and both flows' markup. | `app/page.tsx` | Hard to edit safely; every change risks both flows | 🟡 Low — Sprint E (refactor) |
| 7 | Artwork files are **analyzed in the browser only** (color estimate); the actual file is never uploaded/stored. The quote sends only the filename. | `lib/artwork.ts`, `/api/quote` | Shop can't see the art from the quote record | 🟡 Low — Sprint D |

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

### Sprint B — Align validation + small UX polish `v2.7.1`
**Goal:** Consistent required-field rules across both flows; tidy copy.
**Files:** `lib/validation.ts`, `app/page.tsx` (`getApparelValidationErrors`)
**Steps:**
1. Decide the shared required set (Decision D2) and make both flows enforce it.
2. Replace the two `alert()` calls in `submitOrder()` with inline messages (nicer than a browser popup).
**Done when:**
- [ ] Decal and apparel require the same core fields
- [ ] No `alert()` on submit; errors show in the UI

### Sprint C — Real quote capture (storage + notification) `v2.8.0`
**Goal:** Every submitted quote is saved and the shop is notified automatically — no reliance on the customer hitting "send" in Gmail.
**Why:** Fixes Gaps #2 and #3.
**Pick one backend (Decision D3):** Google Sheets (simplest) · Airtable · Supabase · Resend/email API.
**Files:** `app/api/quote/route.ts` (+ new env vars in `.env.local`)
**Steps (Google Sheets example):**
1. Create a Google Sheet + a service account; share the sheet with it.
2. Add credentials to `.env.local` (never commit).
3. In `route.ts`, append a row per quote (quote number, timestamp, customer, product, estimate).
4. Optionally also send an email to `quote@gorillasalem.com` via an email API.
**Done when:**
- [ ] Submitting a test quote adds a row / record in the chosen backend
- [ ] Shop gets notified without the customer doing anything extra
- [ ] `.env.local` holds the secrets and is still git-ignored

### Sprint D — Attach the actual artwork to the quote `v2.8.1`
**Goal:** The shop can see the uploaded art, not just its filename.
**Files:** `components/upload/UploadBox.tsx`, `app/api/quote/route.ts`, wherever quotes are stored (Sprint C)
**Steps:** Upload the file (e.g. to the same backend / a storage bucket) on submit; store the link on the quote record.
**Done when:**
- [ ] The stored quote includes a viewable link to the uploaded artwork

### Sprint E — Refactor `page.tsx` (tech-debt, optional but recommended) `v2.9.0`
**Goal:** Split the 2,000-line page into smaller pieces so future changes are safe.
**Why:** Fixes Gap #6.
**Suggested split:** `features/decals/` and `features/apparel/` (there's already an empty `features/` folder), each owning its own form + summary; keep `page.tsx` as the thin shell that picks a flow.
**Do this only when the flows are stable** — refactor with the Section 3 smoke test open after every extraction.
**Done when:**
- [ ] `page.tsx` is a thin container; each flow lives in its own folder
- [ ] Both flows pass the full smoke test unchanged

### Later — Production integration `v3.0.0`
Connect confirmed quotes to a production/ordering system (Printavo, Shopify, QuickBooks). Design this after Sprint C exists, since it builds on stored quotes.

---

## 6. Decisions only Natalie can make

Answer these before the sprint that needs them:

- **D1 (Shipping):** Should the decal estimate include the $12 shipping, or is decal pricing shipping-free? (Blocks Gap #4.)
- **D2 (Required fields):** Is a phone number required for apparel quotes too, or should decals stop requiring it? (Blocks Sprint B.)
- **D3 (Quote storage):** Which backend — Google Sheets, Airtable, Supabase, or just email? (Blocks Sprint C.) Sheets is the lowest-effort start.
- **D4 (Markup):** Is the S&S garment markup staying at 40% (`SS_MARKUP_RATE=0.4`)? Are the decal + apparel print prices in Section 8 current?

---

## 7. Architecture map

```
v2/
  app/
    page.tsx                     ← the whole customer UI + all state (BIG: ~2030 lines)
    layout.tsx, globals.css      ← shell + styles
    api/
      quote/route.ts             ← POST: receives a quote, returns a quote number (no storage yet)
      ss-catalog/route.ts        ← GET: proxies S&S catalog for the apparel flow
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
```
**Golden rule (do not break):** `page.tsx` = React UI. `api/*/route.ts` = backend only. Never paste one into the other.

---

## 8. Where to change the numbers

**Decal prices** — `lib/pricing.ts`:
- `baseStickerPrices` — price by quantity (50→$65, 100→$89, … 5000→$1541)
- material multipliers — Clear ×1.15, Holographic ×1.35, Chrome ×1.30, Gloss/Matte ×1.00

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

## Version history
- `v2.7.0` — Catalog labels + category filters (API merge) + real S&S style numbers _(pending commit)_
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
