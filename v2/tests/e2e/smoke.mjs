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
 * Scope, deliberately small: one pass per flow to the review screen, one
 * real submission (apparel request) with the payload asserted, and the
 * catalog-laziness contract. Backends are stubbed at the network layer —
 * this tests OUR wiring, not S&S's uptime, and CI must never create real
 * quotes. The deeper flow-specific assertions live in the unit suite; a
 * failure here means "a customer clicking through sees it too".
 *
 * Runs against a served build:   node tests/e2e/smoke.mjs
 *   SMOKE_URL       target origin        (default http://localhost:3100)
 *   SMOKE_CHROMIUM  chromium executable  (default: playwright's own)
 */

import { chromium } from "playwright";

const BASE = process.env.SMOKE_URL || "http://localhost:3100";

const CATALOG = {
  products: [
    {
      id: "39",
      brandName: "Gildan",
      styleName: "2000",
      displayName: "Gildan 2000 Ultra Cotton",
      customerLabel: "Starter Tee",
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
              markedUpPrice: 8.5,
              isAvailable: true,
              outOfStock: false,
            },
          ],
        },
      ],
    },
  ],
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

try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1600 } });

  let catalogRequests = 0;
  let quotePayload = null;

  await page.route("**/api/ss-catalog*", (route) => {
    catalogRequests += 1;
    route.fulfill({ json: CATALOG });
  });
  await page.route("**/api/quote", (route) => {
    const raw = route.request().postData() || "";
    try {
      quotePayload = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    } catch {
      quotePayload = null;
    }
    route.fulfill({
      json: { success: true, quote: { id: "SMOKE", visualId: "GS-SMOKE" } },
    });
  });
  // No external hosts: the smoke must pass with the internet dark.
  await page.route("**ssactivewear.com/**", (route) => route.abort());

  await page.goto(BASE, { waitUntil: "networkidle" });

  // ── The entry screen carries its price anchor ─────────────────────────
  const entry = await page.evaluate(() => document.body.innerText);
  check("entry: price anchor renders a dollar figure", /from\s*\$\d+\.\d{2}/i.test(entry));
  check("catalog: not fetched on page load", catalogRequests === 0, `${catalogRequests} requests`);

  // ── Stickers: the default flow reaches review with a taxed total ──────
  await page.click("text=Custom Stickers");
  await page.click('button:has-text("05")');
  await page.waitForTimeout(400);
  let review = await reviewText(page);
  check("stickers: review card renders", review.includes("Check everything before submitting."));
  check(
    "stickers: review shows an estimated dollar total",
    /Estimate(d total)?\s*\$\d+\.\d{2}/.test(review.replace(/\n/g, " ")),
    JSON.stringify(review.slice(0, 120))
  );
  check("catalog: stickers never fetch it", catalogRequests === 0);

  // ── Banners: the hard split's first pipeline reaches review ───────────
  await page.click('button:has-text("01")');
  await page.click("text=Vinyl Banners");
  await page.click('button:has-text("05")');
  await page.waitForTimeout(400);
  review = await reviewText(page);
  check("banners: review shows the banner product", review.includes("Vinyl Banner"));
  check("catalog: banners never fetch it", catalogRequests === 0);

  // ── Apparel request: end to end, payload asserted ─────────────────────
  await page.click('button:has-text("01")');
  await page.click("text=T-Shirts & Apparel");
  await page.waitForTimeout(600);
  check("catalog: fetched exactly once, on apparel selection", catalogRequests === 1, `${catalogRequests} requests`);

  await page.click('button:has-text("02")');
  await page.click('button:has-text("Hats")');
  await page.fill("#apparel-request-quantity", "25");
  await page.fill(
    "#apparel-request-notes",
    "25 black hats, front logo embroidery"
  );
  await page.locator("input[type=date]").first().fill("2026-12-15");
  await page.click('button:has-text("04")');
  await page.locator("input[id*=ame], input[name*=ame]").first().fill("Smoke Test");
  await page.locator("input[type=email]").first().fill("smoke@example.com");
  await page.click('button:has-text("05")');
  await page.waitForTimeout(400);

  review = await reviewText(page);
  check("apparel: review shows the chosen garment", /Garment\s*\n?\s*Hats/.test(review));
  check("apparel: review carries the notes verbatim", review.includes("front logo embroidery"));
  check(
    "apparel: review never shows a catalog default",
    !review.includes("Starter Tee"),
    "the pinned product leaked into the request review"
  );

  await page.click('button:has-text("Request Quote")');
  await page.waitForTimeout(1200);

  const confirmation = await page.evaluate(() => document.body.innerText);
  check("apparel: confirmation renders after submit", confirmation.includes("25 Hats"));

  check("payload: captured", Boolean(quotePayload));
  if (quotePayload) {
    const product = quotePayload.product || {};
    check("payload: garmentType is the customer's chip", product.garmentType === "Hats");
    check("payload: request mode is a special order", product.specialOrder === true);
    check(
      "payload: supplier names no unchosen SKU",
      product.supplier?.sku === "Not selected",
      String(product.supplier?.sku)
    );
    check(
      "payload: pricing requires a hand quote",
      quotePayload.pricing?.quoteRequired === true
    );
  }
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\n${failures} smoke check(s) failed`);
  process.exit(1);
}
console.log("\nsmoke: all checks passed");
