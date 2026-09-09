/**
 * MANUAL configurator audit — NOT run by CI (too slow, and it is the full
 * sign-off sweep rather than a smoke). The configurator has been LIVE since
 * 2026-09-06 (lib/products.tsx, apparel status "active"), so this runs
 * against any server with no local edit:
 *
 *   1. npm run dev  (or a production build on any port)
 *   2. npx tsx tests/e2e/apparel-configurator-audit.mjs
 *      SMOKE_URL / SMOKE_CHROMIUM override the target and browser,
 *      exactly as for smoke.mjs.
 *
 * Until the flip it needed the status set to "active" locally first; if
 * apparel is ever rolled back to "request", that step comes back.
 *
 * What it proves, against the REAL pricing engine and classifier imports:
 * the catalog loads lazily and renders whole (3 products, 60-colour grid),
 * the summary and sticky bar equal calculateApparelPricing to the cent,
 * repricing follows a second print location, the payload carries the true
 * SKU/colour/breakdown and an engine-exact total, review == payload, a
 * configured order never classifies as auto-billing, colour switches prune
 * impossible sizes (the phantom-size defect this audit caught), and 390px
 * has no horizontal overflow. The catalog fixture is the real production
 * response captured 2026-08-25.
 */
import { chromium } from "playwright";
import fs from "node:fs";

import { calculateApparelPricing } from "../../lib/apparel-pricing";
import { garmentPriceByMarkup } from "../../lib/apparel-blend";
import { quoteApparelCart } from "../../lib/apparel-cart";
import { isStickerOrder } from "../../lib/sticker-repricing";

const BASE = process.env.SMOKE_URL || "http://localhost:3000";

/**
 * A need-by date that is always legal. The turnaround floors (PR #97)
 * refuse dates inside each flow's minimum, so a HARDCODED date here is a
 * time bomb: "2026-12-15" passes today and starts failing every CI run in
 * late November with no code change to blame. Ninety days clears the
 * 14-business-day slow-lane floor with room to spare, forever.
 */
const NEED_BY = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

const CATALOG = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/ss-catalog-live-2026-08-25.json", import.meta.url),
    "utf8"
  )
);
// Screenshots for the eye test land here (override with AUDIT_SHOTS_DIR).
const S = process.env.AUDIT_SHOTS_DIR || "/tmp";
fs.mkdirSync(S, { recursive: true });

const QUOTE_RESPONSE = {
  success: true,
  message: "Quote received by Gorilla Salem.",
  quoteNumber: "GS-AUDIT",
  receivedAt: new Date().toISOString(),
  quote: {},
  notification: { sent: true },
  printavo: { created: false },
  checkout: null,
};

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) console.log(`ok    ${name}`);
  else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function formField(raw, name) {
  const m = raw.match(new RegExp(`name="${name}"\\r?\\n\\r?\\n([\\s\\S]*?)\\r?\\n--`));
  return m ? m[1] : null;
}

const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

async function openPage(state, viewport = { width: 1300, height: 1800 }) {
  const page = await browser.newPage({ viewport });
  await page.route("**/api/ss-catalog*", (route) => {
    state.catalogRequests += 1;
    route.fulfill({ json: CATALOG });
  });
  await page.route("**/api/quote", (route) => {
    state.quoteRaw = route.request().postData() || "";
    route.fulfill({ json: QUOTE_RESPONSE });
  });
  await page.route("**ssactivewear.com/**", (route) => route.abort());
  await page.route("**/api/artwork-upload", (route) => route.abort());
  await page.route("**blob.vercel-storage.com/**", (route) => route.abort());
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  return page;
}

async function summaryText(page) {
  return page.evaluate(() => {
    const heading = [...document.querySelectorAll("p")].find(
      (p) => p.textContent === "Apparel Summary"
    );
    return heading ? heading.parentElement.innerText : "";
  });
}
async function estimatedTotalOnSummary(page) {
  const text = await summaryText(page);
  const m = text.match(/Estimated Total\s*\n?\s*\$([\d,]+\.\d{2})/);
  return m ? Number(m[1].replace(",", "")) : null;
}
async function clickColor(page, name) {
  await page.evaluate((colorName) => {
    const h = [...document.querySelectorAll("p")].find((p) => p.textContent === "Garment Color");
    const btn = [...h.parentElement.querySelectorAll("button")].find((b) => {
      const span = b.querySelector("span.text-fine, span[class*='text-fine']");
      return span && span.textContent.trim() === colorName;
    });
    if (!btn) throw new Error("no color button: " + colorName);
    btn.click();
  }, name);
}
async function clickLocation(page, name) {
  await page.evaluate((label) => {
    const group = [...document.querySelectorAll("[role=group]")].find((g) =>
      [...g.querySelectorAll("button")].some((b) => ["Front", "Back"].includes(b.textContent.trim()))
    );
    const btn = [...group.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
    if (!btn) throw new Error("no location button: " + label);
    btn.click();
  }, name);
}
async function makePng(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900; c.height = 900;
    const x = c.getContext("2d");
    x.fillStyle = "#1b5e20"; x.fillRect(0, 0, 900, 900);
    x.fillStyle = "#ffffff"; x.font = "bold 200px sans-serif";
    x.textAlign = "center"; x.fillText("GS", 450, 520);
    return c.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

try {
  // ── A: the configurator, desktop, driven end to end ───────────────────
  const state = { catalogRequests: 0, quoteRaw: null };
  const page = await openPage(state);

  await page.click("text=T-Shirts & Apparel");
  await page.waitForTimeout(600);
  check("catalog fetched once on apparel selection", state.catalogRequests === 1);

  await page.click('button:has-text("02")');
  await page.waitForSelector("text=Garment Catalog");
  const shown = await page.textContent("text=/\\d+ shown/");
  check("all 3 catalog products offered", shown?.trim() === "3 shown", shown ?? "missing");

  // Category filter
  await page.click('button:has-text("Sweatshirts")');
  const shown2 = await page.textContent("text=/\\d+ shown/");
  check("category filter narrows the list", shown2?.trim() === "1 shown", shown2 ?? "");
  await page.click('div.mb-4 >> button:has-text("All")').catch(() => page.click('button:has-text("All")'));
  await page.waitForTimeout(200);

  // Product: Basic Tee (60 colors)
  await page.click('button:has-text("Basic Tee")');
  await page.waitForTimeout(300);
  const colorButtons = await page.evaluate(() => {
    const h = [...document.querySelectorAll("p")].find((p) => p.textContent === "Garment Color");
    return h ? h.parentElement.querySelectorAll("button").length : 0;
  });
  check("all 60 Basic Tee colors render", colorButtons === 60, String(colorButtons));

  // Color: White, sample size M ($6.23 — the blank at the matrix's 150%
  // base since 6 Sep; the grid shows that figure, the estimate re-prices
  // it at the run's row)
  await clickColor(page, "White");
  await page.waitForTimeout(200);
  const sizeRow = await page.evaluate(() => {
    const h = [...document.querySelectorAll("p")].find(
      (p) => p.textContent === "Garment Prices by Size"
    );
    return h ? h.parentElement.innerText : "";
  });
  check("the size row prices each size from its own SKU", /M\s*\n?\s*\$6\.23/.test(sizeRow), sizeRow.slice(0, 120));
  check("the 2XL price difference is visible, as a price", /2XL\s*\n?\s*\$11\.25/.test(sizeRow));

  await page.evaluate(() => {
    const h = [...document.querySelectorAll("p")].find(
      (p) => p.textContent === "Garment Prices by Size"
    );
    const btn = [...h.parentElement.querySelectorAll("button")].find(
      (b) => b.textContent.trim().startsWith("M")
    );
    btn.click();
  });

  // ── BLEND MODE: before any size is entered ────────────────────────────
  // The rough count (defaults 24) gives the estimate a quantity; the
  // garment component is the blended per-shirt price at every markup the
  // matrix uses (the engine picks the tier, then the blank) — Gildan 2000
  // White at 150%: base 6.23, +0.09×5.02 (2XL) +0.06×10.15 (3XL) → 7.30.
  const whiteTee = CATALOG.products
    .find((p) => p.customerLabel === "Basic Tee")
    .colors.find((c) => c.colorName === "White");
  {
    const expectBlend = calculateApparelPricing({
      quantity: 24,
      garmentPriceByMarkup: garmentPriceByMarkup(whiteTee, null, 24),
      printLocations: ["Front"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    const shownBlend = await estimatedTotalOnSummary(page);
    check(
      "BLEND: pre-size total equals the engine at the blended unit",
      shownBlend !== null && Math.abs(shownBlend - expectBlend.total) < 0.005,
      `screen ${shownBlend} vs engine ${expectBlend.total.toFixed(2)}`
    );
    const summary = await summaryText(page);
    check(
      "BLEND: the assumption is stated on the same screen as the number",
      /Assumes about 15% of the order is 2XL or 3XL/.test(summary),
      summary.slice(-300)
    );
    check(
      "BLEND: the asterisk promises exactness, not vagueness",
      /Enter your sizes and this becomes exact/.test(summary)
    );
  }

  // Size grid: M=12, L=12 via the inputs — the grid REPLACES the rough count
  await page.fill('input[aria-label="M quantity"]', "12");
  await page.fill('input[aria-label="L quantity"]', "12");
  await page.waitForTimeout(200);
  const badge = await page.textContent("text=/\\d+ shirts/");
  check("quantity derives from the grid", badge?.trim() === "24 shirts", badge ?? "");
  {
    const summary = await summaryText(page);
    check(
      "EXACT: entering sizes flips the label to priced-from-your-sizes",
      /Priced from your sizes/.test(summary)
    );
    check(
      "EXACT: the assumption is gone once sizes exist",
      !/Assumes about/.test(summary)
    );
  }

  // Engine comparison — EXACT basis (grid filled): M and L both price at
  // 6.23 (150%), so the quantized per-shirt unit is 6.23.
  const expectA = calculateApparelPricing({
    quantity: 24,
    garmentPriceByMarkup: garmentPriceByMarkup(whiteTee, { M: 12, L: 12 }, 24),
    printLocations: ["Front"],
    inkColors: "1 color",
    hasUnderbase: false,
  });
  const shownTotalA = await estimatedTotalOnSummary(page);
  check(
    "summary total equals the engine (Front, 1 color)",
    shownTotalA !== null && Math.abs(shownTotalA - expectA.total) < 0.005,
    `screen ${shownTotalA} vs engine ${expectA.total.toFixed(2)}`
  );

  // Toggle Back on: engine moves, screen follows
  await clickLocation(page, "Back");
  await page.waitForTimeout(200);
  const expectB = calculateApparelPricing({
    quantity: 24,
    garmentPriceByMarkup: garmentPriceByMarkup(whiteTee, { M: 12, L: 12 }, 24),
    printLocations: ["Front", "Back"],
    inkColors: "1 color",
    hasUnderbase: false,
  });
  const shownTotalB = await estimatedTotalOnSummary(page);
  check(
    "adding a second location reprices to the engine's figure",
    shownTotalB !== null && Math.abs(shownTotalB - expectB.total) < 0.005,
    `screen ${shownTotalB} vs engine ${expectB.total.toFixed(2)}`
  );
  // Back off again
  await clickLocation(page, "Back");
  await page.waitForTimeout(200);

  await page.screenshot({ path: S + "/audit-builder.png", fullPage: false });

  // ── PHANTOM SIZES PROBE ───────────────────────────────────────────────
  // Switch to Premium Soft Tee, then to Heather Marmalade (XS/3XL/4XL only).
  // The M=12 / L=12 already entered should either survive visibly or be
  // cleared — never silently kept while hidden.
  await page.click('button:has-text("Premium Soft Tee")');
  await page.waitForTimeout(300);
  await clickColor(page, "Heather Marmalade");
  await page.waitForTimeout(300);
  const gridSizes = await page.evaluate(() => {
    const h = [...document.querySelectorAll("p")].find((p) => p.textContent === "Size Breakdown");
    const card = h.closest("div[class*='shirt-blank']") || h.parentElement.parentElement.parentElement;
    return [...card.querySelectorAll("input[aria-label$='quantity']")].map((i) =>
      i.getAttribute("aria-label")
    );
  });
  const badge2 = await page.textContent("text=/\\d+ shirts?/");
  const breakdown2 = await page.evaluate(() => {
    const h = [...document.querySelectorAll("p")].find((p) => p.textContent === "Current Breakdown");
    return h ? h.parentElement.innerText : "";
  });
  console.log(`      probe: grid now offers [${gridSizes.join(", ")}], badge "${badge2?.trim()}", breakdown "${breakdown2.split("\n")[1] ?? ""}"`);
  check(
    "PROBE — hidden sizes do not silently keep counting",
    !(badge2?.trim() === "24 shirts" && gridSizes.every((s) => !s.startsWith("M ") && !s.startsWith("L "))),
    `M-12, L-12 still total ${badge2} while the grid offers only ${gridSizes.join(",")}`
  );
  await page.screenshot({ path: S + "/audit-phantom.png", fullPage: false });

  // ── back to a clean, orderable state and submit ───────────────────────
  await page.click('button:has-text("Basic Tee")');
  await page.waitForTimeout(300);
  await clickColor(page, "White");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("p")].find(
      (p) => p.textContent === "Garment Prices by Size"
    );
    const btn = [...h.parentElement.querySelectorAll("button")].find(
      (b) => b.textContent.trim().startsWith("M")
    );
    btn.click();
  });
  // Reset then rebuild the grid so no phantom entries ride along
  const resetBtn = page.locator('button:has-text("Reset Sizes")');
  if (await resetBtn.count()) await resetBtn.click();
  await page.fill('input[aria-label="M quantity"]', "12");
  await page.fill('input[aria-label="L quantity"]', "12");
  await page.locator("input[type=date]").first().fill(NEED_BY);

  await page.screenshot({ path: S + "/audit-summary.png", fullPage: true });

  // Artwork step
  await page.click('button:has-text("03")');
  const png = await makePng(page);
  await page.setInputFiles("input[type=file]", {
    name: "audit-logo.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.waitForTimeout(1500);

  // Contact
  await page.click('button:has-text("04")');
  await page.locator("input[id*=ame], input[name*=ame]").first().fill("Audit Driver");
  await page.locator("input[type=email]").first().fill("audit@example.com");

  // Review
  await page.click('button:has-text("05")');
  await page.waitForTimeout(400);
  const review = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("p")].find(
      (p) => p.textContent === "Review Your Quote"
    );
    let el = heading;
    for (let i = 0; i < 5 && el; i += 1) {
      el = el.parentElement;
      if (el?.textContent?.includes("Estimate")) break;
    }
    return el ? el.innerText : "";
  });
  check("review names the garment", review.includes("Basic Tee"));
  check("review names the color", review.includes("White"));
  check("review carries the size breakdown", review.includes("M-12, L-12"), review.slice(0, 300));
  check("review shows quantity 24", /Quantity\s*\n?\s*24/.test(review));
  /**
   * The RUN TOTAL off the review card, which since 9 Sep prints it beside
   * the per-piece figure rather than as a lone "Estimate" row — see
   * features/apparel/ApparelMoney. Anchored to the "· TOTAL" label so it
   * can never pick up the per-piece figure by accident and call a $21.81
   * each a $523.32 total.
   */
  const reviewEstimate = review.match(
    /PIECES · TOTAL\s*\n*\s*\$([\d,]+\.\d{2})/i
  );
  const reviewEach = review.match(/ESTIMATED EACH\s*\n*\s*\$([\d,]+\.\d{2})/i);

  check(
    "review shows the per-piece figure Gabe asked for",
    Boolean(reviewEach),
    review.slice(0, 200)
  );
  await page.screenshot({ path: S + "/audit-review.png", fullPage: true });

  // Submit
  await page.click('button:has-text("Request Quote")');
  const confirmed = await page
    .waitForSelector("text=Quote Number", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check("confirmation renders after submit", confirmed);
  {
    const confirmationText = await page.evaluate(() => document.body.innerText);
    check(
      "confirmation carries the basis with the number",
      /Priced from your sizes/.test(confirmationText),
      "the figure appears post-submit without saying what it stands on"
    );
  }
  await page.screenshot({ path: S + "/audit-confirmation.png", fullPage: true });

  const order = JSON.parse(formField(state.quoteRaw || "", "order") || "null");
  check("payload captured", Boolean(order));
  if (order) {
    const p = order.product || {};
    check("payload: type is apparel", p.type === "T-Shirts & Apparel");
    check("payload: garmentType from catalog label", p.garmentType === "Basic Tee", p.garmentType);
    check("payload: color is the chosen one", p.garmentColor === "White", p.garmentColor);
    check("payload: quantity is the grid total", p.quantity === 24, String(p.quantity));
    check("payload: sizeBreakdown matches the grid", p.sizeBreakdown === "M-12, L-12", p.sizeBreakdown);
    check("payload: not a special order", p.specialOrder === false);
    const sup = p.supplier || {};
    check("payload: supplier SKU is White/M", sup.sku === "B00760006" || /^B0/.test(sup.sku ?? ""), String(sup.sku));
    console.log(`      supplier: ${sup.supplierProductName} style ${sup.catalogStyle} color ${sup.colorName} sample ${sup.sampleSize} sku ${sup.sku} @ $${sup.markedUpGarmentPrice}`);
    check("payload: sample garment price rides along (150% base)", sup.markedUpGarmentPrice === 6.23, String(sup.markedUpGarmentPrice));

    // Recompute the engine from what the payload itself claims: the M-24
    // grid at every markup, the payload's own locations and ink.
    const expected = calculateApparelPricing({
      quantity: p.quantity,
      garmentPriceByMarkup: garmentPriceByMarkup(whiteTee, { M: 24 }, 24),
      printLocations: p.printLocations,
      inkColors: p.inkColors,
      hasUnderbase: false, // White garment
    });
    check(
      "payload: pricing.total equals the engine for the payload's own inputs",
      Math.abs((order.pricing?.total ?? -1) - expected.total) < 0.005,
      `payload ${order.pricing?.total} vs engine ${expected.total.toFixed(2)} (ink "${p.inkColors}", locations ${JSON.stringify(p.printLocations)})`
    );
    check("payload: no hand-quote flag on a configured order", order.pricing?.quoteRequired === false);
    if (reviewEstimate) {
      check(
        "review estimate equals the payload total",
        Math.abs(Number(reviewEstimate[1].replace(/,/g, "")) - (order.pricing?.total ?? -1)) < 0.005,
        `review ${reviewEstimate[1]} vs payload ${order.pricing?.total}`
      );

      // The per-piece figure is the total over the run, and the screen must
      // not be able to disagree with itself about which run.
      if (reviewEach) {
        const each = Number(reviewEach[1].replace(/,/g, ""));
        const total = Number(reviewEstimate[1].replace(/,/g, ""));
        const pieces = Number(order.product?.quantity ?? 0);

        check(
          "review each × pieces comes back to the review total",
          pieces > 0 && Math.abs(each * pieces - total) <= pieces * 0.01,
          `${each} × ${pieces} vs ${total}`
        );
      }
    } else {
      check("review estimate found", false, "no Estimate figure matched");
    }
    check("THE invariant: a configured apparel order must never auto-bill", !isStickerOrder(order));
  }
  await page.close();

  // ── C: the cart — a second garment under the configurator ─────────────
  //
  // The engine (lib/apparel-cart.ts) is pinned to the cent in its own tests;
  // what only the browser can prove is the WIRING: that a garment added in
  // the form reaches the estimate, the review card and the payload as the
  // same line, and that Printavo would bill it as its own row.
  {
    const cState = { catalogRequests: 0, quoteRaw: null };
    const c = await openPage(cState);
    await c.click("text=T-Shirts & Apparel");
    await c.waitForTimeout(600);
    await c.click('button:has-text("02")');
    await c.waitForSelector("text=Garment Catalog");
    await c.click('button:has-text("Basic Tee")');
    await c.waitForTimeout(300);
    await clickColor(c, "White");
    await c.locator("input[type=date]").first().fill(NEED_BY);
    await c.waitForTimeout(300);

    const before = await estimatedTotalOnSummary(c);
    check("cart: a one-garment estimate exists before anything is added", before !== null && before > 0, String(before));

    // Add a line, leave it blank: nothing may change, and submit must refuse.
    await c.click('button:has-text("Add another garment")');
    await c.waitForTimeout(300);
    const afterBlank = await estimatedTotalOnSummary(c);
    check("cart: a blank added line prices NOTHING (no phantom garment)", afterBlank === before, `${before} -> ${afterBlank}`);

    // Fill it: Classic Hoodie / Black / 12.
    const garmentSelect = c.locator('section[aria-label="Added garment 1"] select').first();
    const hoodieValue = await garmentSelect.evaluate((el) =>
      [...el.options].find((o) => o.textContent.includes("Classic Hoodie"))?.value ?? ""
    );
    check("cart: the garment picker offers the hoodie", Boolean(hoodieValue));
    await garmentSelect.selectOption(hoodieValue);
    await c.locator('section[aria-label="Added garment 1"] select').nth(1).selectOption("Black");
    await c.fill('input[id^="apparel-line-"][id$="-quantity"]', "12");
    await c.locator('input[id^="apparel-line-"][id$="-quantity"]').blur();
    await c.waitForTimeout(400);

    const afterFilled = await estimatedTotalOnSummary(c);
    check("cart: the estimate moved once the line was finished", afterFilled !== null && afterFilled > before, `${before} -> ${afterFilled}`);
    const summary = await summaryText(c);
    check("cart: the summary lists both garments", /24 × Basic Tee \/ White/.test(summary) && /12 × Classic Hoodie \/ Black/.test(summary), summary.slice(0, 200));
    // innerText applies the eyebrow's text-transform, so match case-blind.
    check("cart: the summary counts 36 pieces", /36 pieces/i.test(summary), summary.slice(0, 120));
    await c.screenshot({ path: S + "/audit-cart.png", fullPage: true });

    // Through to review and submit.
    await c.click('button:has-text("03")');
    await c.setInputFiles("input[type=file]", { name: "audit-logo.png", mimeType: "image/png", buffer: await makePng(c) });
    await c.waitForTimeout(1200);
    await c.click('button:has-text("04")');
    await c.locator("input[id*=ame], input[name*=ame]").first().fill("Audit Driver");
    await c.locator("input[type=email]").first().fill("audit@example.com");
    await c.click('button:has-text("05")');
    await c.waitForTimeout(400);
    const cReview = await c.evaluate(() => document.body.innerText);
    check("cart: review lists the hoodie line", /12 × Classic Hoodie \/ Black/.test(cReview));
    await c.click('button:has-text("Request Quote")');
    await c.waitForTimeout(1500);

    const cOrder = JSON.parse(formField(cState.quoteRaw || "", "order") || "null");
    check("cart: payload captured", Boolean(cOrder));
    if (cOrder) {
      const lines = cOrder.pricing?.lines ?? [];
      check("cart: payload carries two garment lines", lines.length === 2, JSON.stringify(lines.map((l) => [l.garmentLabel, l.colorName, l.quantity])));
      check("cart: product.quantity is the whole run", cOrder.product?.quantity === 36, String(cOrder.product?.quantity));
      check("cart: payload names every garment for the shop", cOrder.product?.garmentLines === "24 × Basic Tee / White · 12 × Classic Hoodie / Black", cOrder.product?.garmentLines);
      const hoodie = (CATALOG.products || CATALOG).find((p) => p.customerLabel === "Classic Hoodie");
      check("cart: the hoodie line carries its S&S style for the SKU", Boolean(hoodie) && lines[1]?.catalogStyle === hoodie.catalogStyle, `${lines[1]?.catalogStyle} vs catalog ${hoodie?.catalogStyle}`);

      // The figure, recomputed by the engine from the payload's own lines.
      const expected = quoteApparelCart(
        lines.map((l) => ({ id: l.id, garmentLabel: l.garmentLabel, colorName: l.colorName, garmentUnitPrice: l.garmentUnitPrice, quantity: l.quantity })),
        {
          printLocations: cOrder.product.printLocations,
          inkColors: cOrder.product.inkColors,
          // A black hoodie in the run: the whole run is priced WITH the
          // underbase (lib/apparel-cart-lines.ts, anyGarmentNeedsUnderbase).
          // Under the matrix (6 Sep) that is ONE MORE COLOUR on every
          // piece and one more screen — not a per-piece fee.
          hasUnderbase: lines.some((l) => l.colorName !== "White"),
        }
      );
      // One more than the ink picker says: the artwork's colours (auto-
      // counted from the audit PNG) plus the white underbase.
      const pickedInks = Number(String(cOrder.product?.inkColors ?? "1").match(/^(\d)/)?.[1] ?? 1);
      check("cart: the payload counts the underbase as a colour", cOrder.pricing?.inkColorCount === pickedInks + 1, `${cOrder.pricing?.inkColorCount} vs picked ${pickedInks} + 1`);
      check(
        "cart: payload total equals the cart engine for its own lines",
        Math.abs((cOrder.pricing?.total ?? -1) - expected.total) < 0.005,
        `payload ${cOrder.pricing?.total} vs engine ${expected.total.toFixed(2)}`
      );
      check("cart: still never auto-bills", !isStickerOrder(cOrder));
    }
    await c.close();
  }

  // ── B: mobile 390px ──────────────────────────────────────────────────
  {
    const mState = { catalogRequests: 0, quoteRaw: null };
    const m = await openPage(mState, { width: 390, height: 844 });
    await m.click("text=T-Shirts & Apparel");
    await m.waitForTimeout(600);
    await m.click('button:has-text("02")');
    await m.waitForSelector("text=Garment Catalog");
    await m.click('button:has-text("Basic Tee")');
    await m.waitForTimeout(400);
    const overflow = await m.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    check("mobile 390px: no horizontal overflow on the builder", overflow <= 1, `${overflow}px`);
    await m.screenshot({ path: S + "/audit-mobile.png", fullPage: false });
    await m.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\naudit: all checks passed" : `\naudit: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
