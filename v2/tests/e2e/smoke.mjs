/**
 * Browser smoke — the wiring check the unit suite cannot do.
 *
 * Every sweep in this repo's history found its defects the same way: drive
 * the real page in a real browser and read what the surfaces claim. The
 * node:test suite proves functions; THIS proves the wiring between them —
 * the class of break where every function is correct and the page still
 * shows the wrong thing (a review card reading order.items[0], a request
 * flow renamed by a catalog default, a fetch firing for visitors who never
 * needed it).
 *
 * The one that matters most: the STICKER SUBMIT. Stickers auto-bill with no
 * human in the loop, and AGENTS.md's core invariant is that a payload
 * without a product object — or with a type that stops saying "sticker" —
 * makes checkout silently stop, with no error and no log. So this script
 * submits a real sticker order from a real browser and feeds the captured
 * payload to the REAL isStickerOrder(): the exact classifier production
 * uses, asserting the exact decision production would make.
 *
 * Backends are stubbed at the network layer — this tests OUR wiring, not
 * S&S's uptime, and CI must never create a real quote or a real payment
 * link. The blob upload is left to fail on purpose: upload failure must
 * never cost the shop the order, so the submit is exercised down its
 * fallback path.
 *
 * Runs against a served build:   npm run test:e2e   (tsx, for the lib import)
 *   SMOKE_URL       target origin        (default http://localhost:3100)
 *   SMOKE_CHROMIUM  chromium executable  (default: playwright's own)
 */

import { chromium } from "playwright";

import { defaultSignsDesign } from "../../lib/signs";
import { quoteSignsCart } from "../../lib/signs-cart";
import { isStickerOrder } from "../../lib/sticker-repricing";
import { getSignsTotals } from "../../lib/tax";

const BASE = process.env.SMOKE_URL || "http://localhost:3100";

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


const CATALOG = {
  products: [
    {
      id: "39",
      brandName: "Gildan",
      styleName: "2000",
      displayName: "Gildan 2000 Ultra Cotton",
      customerLabel: "Basic Tee",
      customerCategory: "T-Shirts",
      catalogStyle: "39",
      catalogNotes: "",
      colors: [
        {
          colorName: "White",
          colorHex: "#FFFFFF",
          swatchImage: null,
          frontImage: null,
          backImage: null,
          sideImage: null,
          isAvailable: true,
          outOfStock: false,
          sizes: [
            {
              sku: "B00760004",
              sizeName: "M",
              // At the matrix's 150% base; the engine re-prices the blank
              // per run size from priceByMarkup.
              markedUpPrice: 15.18,
              priceByMarkup: { "150": 15.18, "140": 14.57, "130": 13.96 },
              isAvailable: true,
              outOfStock: false,
            },
          ],
        },
      ],
    },
  ],
};

/** What /api/quote actually returns on success, minimally. checkout: null is
    the documented signs/apparel shape and the confirmation's fallback path. */
const QUOTE_RESPONSE = {
  success: true,
  message: "Quote received by Gorilla Salem.",
  quoteNumber: "GS-SMOKE",
  receivedAt: new Date().toISOString(),
  quote: {},
  // sent:true, or the client's belt-and-braces delivery check — correctly —
  // throws UNDELIVERED and never shows the confirmation. (Found by this very
  // smoke: an earlier stub omitted the field and tripped the guard.)
  notification: { sent: true },
  printavo: { created: false },
  checkout: null,
};

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`ok    ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** One field out of the multipart /api/quote body, boundary-delimited. */
function formField(raw, name) {
  const match = raw.match(
    new RegExp(`name="${name}"\\r?\\n\\r?\\n([\\s\\S]*?)\\r?\\n--`)
  );
  return match ? match[1] : null;
}

/** The review card's text, located by its heading. */
async function reviewText(page) {
  return page.evaluate(() => {
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
}

const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROMIUM || undefined,
});

/**
 * The summary block's LABELS, as a stable snapshot.
 *
 * Not the values — those move with a rate change and would make this a
 * second price sheet maintained by hand. The labels are the structure: a row
 * that silently stops rendering is the defect this catches, and it is the
 * one that has actually happened. A cart of two garments was once confirmed
 * back as its FIRST garment carrying the COMBINED count.
 */
function summaryLabels(reviewBlock) {
  // Every line that is a LABEL rather than a value: short, wordy, no digits
  // and no currency. Derived from the block rather than filtered against a
  // list, so a flow whose rows are named differently is described honestly
  // instead of reading as a block with rows missing.
  return reviewBlock
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        line.length <= 24 &&
        /^[A-Za-z][A-Za-z ']*$/.test(line) &&
        !/^(Not entered|Not uploaded|Single-sided|Double-sided)$/.test(line)
    );
}

/** Every dollar figure in the block, as numbers, in order. */
function moneyIn(text) {
  return [...text.matchAll(/\$\s*([\d,]+\.\d{2})/g)].map((m) =>
    Number(m[1].replace(/,/g, ""))
  );
}

/** Fresh page per flow, with the stubs and capture wired. */
async function openPage(state, path = "/") {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });

  await page.route("**/api/ss-catalog*", (route) => {
    state.catalogRequests += 1;
    route.fulfill({ json: CATALOG });
  });
  await page.route("**/api/quote", (route) => {
    state.quoteRaw = route.request().postData() || "";
    route.fulfill({ json: QUOTE_RESPONSE });
  });
  // No external hosts: the smoke must pass with the internet dark, and the
  // blob upload failing is the fallback path the submit must survive.
  await page.route("**ssactivewear.com/**", (route) => route.abort());
  await page.route("**/api/artwork-upload", (route) => route.abort());
  await page.route("**blob.vercel-storage.com/**", (route) => route.abort());

  await page.goto(BASE + path, { waitUntil: "networkidle" });
  return page;
}

/** A real decodable PNG, drawn in the page — the analyzer reads its pixels. */
async function makePng(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 900;
    const x = c.getContext("2d");
    x.fillStyle = "#1b5e20";
    x.fillRect(0, 0, 900, 900);
    x.fillStyle = "#ffffff";
    x.font = "bold 200px sans-serif";
    x.textAlign = "center";
    x.fillText("GS", 450, 520);
    return c.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

try {
  // ── Flow 1: STICKERS, submitted — the auto-billing path ───────────────
  {
    const state = { catalogRequests: 0, quoteRaw: null };
    const page = await openPage(state);

    const entry = await page.evaluate(() => document.body.innerText);
    check("entry: price anchor renders a dollar figure", /from\s*\$\d+\.\d{2}/i.test(entry));
    check("catalog: not fetched on page load", state.catalogRequests === 0);

    await page.click("text=Custom Stickers");
    await page.click('button:has-text("02")');
    await page.locator("input[type=date]").first().fill(NEED_BY);
    await page.click('button:has-text("03")');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "smoke-art.png",
      mimeType: "image/png",
      buffer: await makePng(page),
    });
    await page.waitForTimeout(900);
    await page.click('button:has-text("04")');
    await page.locator("input[id*=ame], input[name*=ame]").first().fill("Smoke Test");
    await page.locator("input[type=email]").first().fill("smoke@example.com");
    await page.click('button:has-text("05")');
    await page.waitForTimeout(400);

    const review = await reviewText(page);
    check("stickers: review card renders", review.includes("Check everything before submitting."));
    check(
      "stickers: review shows an estimated dollar total",
      /Estimate(d total)?\s*\$\d+\.\d{2}/.test(review.replace(/\n/g, " ")),
      JSON.stringify(review.slice(0, 120))
    );
    check("catalog: stickers never fetch it", state.catalogRequests === 0);

    await page.click('button:has-text("Request Quote")');
    await page.waitForTimeout(1500);

    const order = JSON.parse(formField(state.quoteRaw || "", "order") || "null");
    check("stickers: payload captured with an order field", Boolean(order));
    if (order) {
      check(
        "stickers: THE invariant — the real isStickerOrder() says auto-bill",
        isStickerOrder(order),
        `product.type=${JSON.stringify(order.product?.type)}`
      );
      check("stickers: a priced total rides the payload", Number(order.pricing?.total) > 0);
      check("stickers: a web order claims no kiosk", !order.kiosk);
      check(
        "stickers: the failed blob upload did not cost the order its file name",
        JSON.stringify(order).includes("smoke-art.png") ||
          (state.quoteRaw || "").includes("smoke-art.png"),
        "artwork vanished from the submission"
      );
    }
    await page.close();
  }

  // ── Flow 2: BANNERS — the hard split's pipeline reaches review ────────
  {
    const state = { catalogRequests: 0, quoteRaw: null };
    const page = await openPage(state);

    await page.click("text=Vinyl Banners");
    await page.click('button:has-text("05")');
    await page.waitForTimeout(400);
    const review = await reviewText(page);
    check("banners: review shows the banner product", review.includes("Vinyl Banner"));
    check("catalog: banners never fetch it", state.catalogRequests === 0);

    /**
     * THE FIGURE, IN A REAL BROWSER, AGAINST THE SERVER'S OWN DERIVATION.
     *
     * The defect class this closes has shipped twice on this exact number.
     * The confirmation screen printed $177.00 — the PRE-TAX total — one
     * second after this card showed a tax-inclusive figure; then the fix
     * taxed the setup fee too and made it $188.06, 94c over what Printavo
     * bills. Both were correct arithmetic on the wrong input, and both
     * passed the whole suite.
     *
     * Expected is computed HERE from quoteSignsCart and getSignsTotals, so
     * a legitimate rate change moves both sides together and this does not
     * become a second price sheet maintained by hand.
     */
    const bannerCart = quoteSignsCart([defaultSignsDesign]);
    const bannerExpected = getSignsTotals({
      total: Number(bannerCart.total),
      feeTotal: Number(bannerCart.feeTotal),
    }).estimatedTotal;
    const bannerShown = moneyIn(review);

    check(
      "banners: review shows the TAX-INCLUSIVE total, from the same derivation",
      bannerShown.includes(Number(bannerExpected.toFixed(2))),
      `expected $${bannerExpected.toFixed(2)}, saw [${bannerShown.join(", ")}]`
    );
    check(
      "banners: the pre-tax figure is NOT on the review card",
      !bannerShown.includes(Number(Number(bannerCart.total).toFixed(2))),
      `pre-tax $${Number(bannerCart.total).toFixed(2)} is on screen`
    );

    const bannerLabels = summaryLabels(review);
    check(
      "banners: the summary block still renders every spec row",
      ["Product", "Quantity", "Size", "Material", "Finishing", "Sides", "Estimated total"].every(
        (label) => bannerLabels.includes(label)
      ),
      `saw [${bannerLabels.join(", ")}]`
    );
    console.log(`      banners summary: ${bannerLabels.join(" | ")}`);
    await page.close();
  }

  // ── Flow 2b: YARD SIGNS — the OTHER large-format pipeline ────────────
  // Banners and signs split in #122 and have priced separately since. The
  // suite drove only one of them, which is how the sibling that did not get
  // the fix keeps being the one that ships.
  {
    const state = { catalogRequests: 0, quoteRaw: null };
    const page = await openPage(state);

    await page.click("text=Yard Signs");
    await page.click('button:has-text("05")');
    await page.waitForTimeout(400);
    const review = await reviewText(page);

    check("signs: review shows the yard sign product", review.includes("Yard Sign"));
    check("catalog: signs never fetch it", state.catalogRequests === 0);

    const signShown = moneyIn(review);
    check(
      "signs: review shows a dollar total",
      signShown.length > 0 && signShown.every((value) => value > 0),
      `saw [${signShown.join(", ")}]`
    );
    check(
      "signs: the review never calls the figure a price",
      !/\bPrice\b/.test(review),
      JSON.stringify(review.slice(0, 120))
    );

    const signLabels = summaryLabels(review);
    check(
      "signs: the summary block still renders every spec row",
      ["Product", "Quantity", "Size", "Material", "Estimated total"].every((label) =>
        signLabels.includes(label)
      ),
      `saw [${signLabels.join(", ")}]`
    );
    console.log(`      signs summary: ${signLabels.join(" | ")}`);
    await page.close();
  }

  // ── Flow 3: APPAREL, configured and submitted — priced, never billed ──
  // Live since the 6 Sep flip. The hand-quote form this used to drive is
  // one status word away (lib/products.tsx) and comes back with it; what is
  // pinned here is the configurator's money shape: a real estimate rides
  // the payload, and it still never classifies as auto-billing.
  {
    const state = { catalogRequests: 0, quoteRaw: null };
    const page = await openPage(state);

    await page.click("text=T-Shirts & Apparel");
    await page.waitForTimeout(600);
    check("catalog: fetched exactly once, on apparel selection", state.catalogRequests === 1, `${state.catalogRequests} requests`);

    await page.click('button:has-text("02")');
    await page.waitForSelector("text=Garment Catalog");
    await page.click('button:has-text("Basic Tee")');
    await page.waitForTimeout(300);
    await page.locator("input[type=date]").first().fill(NEED_BY);
    await page.click('button:has-text("03")');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "smoke-shirt.png",
      mimeType: "image/png",
      buffer: await makePng(page),
    });
    await page.waitForTimeout(900);
    await page.click('button:has-text("04")');
    await page.locator("input[id*=ame], input[name*=ame]").first().fill("Smoke Test");
    await page.locator("input[type=email]").first().fill("smoke@example.com");
    await page.click('button:has-text("05")');
    await page.waitForTimeout(400);

    const review = await reviewText(page);
    check("apparel: review shows the chosen garment", review.includes("Basic Tee"));
    /**
     * BOTH figures, since 9 Sep. This asked only for "an estimated dollar
     * figure" and the card answered with a total — which is how it went
     * live with no per-piece figure at all on the screen headed "Check
     * everything before submitting", for the one product customers
     * negotiate per shirt (Gabe: "the price per item does not appear").
     */
    check(
      "apparel: review shows the per-piece figure",
      /ESTIMATED EACH\s*\n*\s*\$[\d,]+\.\d{2}/i.test(review),
      JSON.stringify(review.slice(0, 200))
    );
    check(
      "apparel: review shows the run total beside it",
      /\d+ PIECES · TOTAL\s*\n*\s*\$[\d,]+\.\d{2}/i.test(review),
      JSON.stringify(review.slice(0, 200))
    );
    check("apparel: review does not call it a price", !/\bPrice\b/.test(review));

    /**
     * Apparel must not acquire a payment link — AGENTS.md, in as many
     * words. It is an estimate off a supplier catalogue that can be stale,
     * so the shop confirms it first. Checked on the CARD, because the words
     * on the card are what a customer reads as a promise.
     */
    check(
      "apparel: the review offers no way to pay",
      !/pay now|pay online|payment link|pay deposit/i.test(review),
      JSON.stringify(review.slice(0, 160))
    );

    /**
     * Apparel's own rows — NOT the signs list. It names a Garment rather
     * than a Product, and its money row is "ESTIMATED EACH", never
     * "Estimated total": the estimate language is the invariant, and this
     * is where it gets to be checked as structure rather than as prose.
     */
    const apparelLabels = summaryLabels(review);
    check(
      "apparel: the summary block still renders its spec rows",
      ["Garment", "Color", "Quantity", "Sizes", "Print Locations", "Ink Colors"].every(
        (label) => apparelLabels.includes(label)
      ),
      `saw [${apparelLabels.join(", ")}]`
    );
    check(
      "apparel: the money row is an ESTIMATE, not a total",
      /ESTIMATED EACH/.test(review) && !/^Estimated total$/m.test(review),
      JSON.stringify(review.slice(0, 160))
    );
    console.log(`      apparel summary: ${apparelLabels.join(" | ")}`);

    await page.click('button:has-text("Request Quote")');
    const confirmed = await page
      .waitForSelector("text=Quote Number", { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check("apparel: confirmation renders after submit", confirmed);

    const order = JSON.parse(formField(state.quoteRaw || "", "order") || "null");
    check("apparel: payload captured", Boolean(order));
    if (order) {
      const product = order.product || {};
      check("apparel: garmentType is the catalog label", product.garmentType === "Basic Tee", product.garmentType);
      check("apparel: a configured order is not a special order", product.specialOrder === false);
      check("apparel: the real SKU rides the payload", product.supplier?.sku === "B00760004", String(product.supplier?.sku));
      check("apparel: a priced total rides the payload", Number(order.pricing?.total) > 0 && order.pricing?.quoteRequired === false);
      check(
        "apparel: THE invariant, inverted — a priced apparel order must never auto-bill",
        !isStickerOrder(order)
      );
    }
    await page.close();
  }

  // ── Flow 4: KIOSK self-service — the consent and no-payment-link path ─
  // The kiosk breaks every one-browser-one-person assumption at once, so
  // its invariants are their own class: the newsletter box must arrive
  // unticked (consent typed by staff is nobody's consent), and the payload
  // must carry the kiosk marker the SERVER reads to withhold the payment
  // link. Both were verified by hand once; this keeps them verified.
  {
    const state = { catalogRequests: 0, quoteRaw: null };
    const page = await openPage(state, "/kiosk");

    await page.click("text=Custom Stickers");
    await page.click('button:has-text("02")');
    await page.locator("input[type=date]").first().fill(NEED_BY);
    await page.click('button:has-text("03")');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "kiosk-art.png",
      mimeType: "image/png",
      buffer: await makePng(page),
    });
    await page.waitForTimeout(900);
    await page.click('button:has-text("04")');

    const newsletterTicked = await page.evaluate(() =>
      [...document.querySelectorAll("input[type=checkbox]")].some(
        (box) =>
          box.checked &&
          /news|offer|newsletter/i.test(box.closest("label")?.textContent || "")
      )
    );
    check("kiosk: the newsletter box arrives unticked", !newsletterTicked);

    await page.locator("input[id*=ame], input[name*=ame]").first().fill("Walk-in Customer");
    await page.locator("input[type=email]").first().fill("walkin@example.com");
    await page.click('button:has-text("05")');
    await page.waitForTimeout(400);
    await page.click('button:has-text("Request Quote")');
    await page.waitForTimeout(1500);

    const order = JSON.parse(formField(state.quoteRaw || "", "order") || "null");
    check("kiosk: payload captured", Boolean(order));
    if (order) {
      check(
        "kiosk: the payload carries the marker the server withholds the payment link on",
        order.kiosk?.mode === "self",
        JSON.stringify(order.kiosk)
      );
      check("kiosk: consent was not invented", order.customer?.newsletterOptIn === false);
      check("kiosk: still classifies as a sticker order", isStickerOrder(order));
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed`);
  process.exit(1);
}
console.log("\nsmoke: all checks passed");
