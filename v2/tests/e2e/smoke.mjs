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

import { isStickerOrder } from "../../lib/sticker-repricing";

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
    await page.close();
  }

  // ── Flow 3: APPAREL REQUEST, submitted — the hand-quote path ──────────
  {
    const state = { catalogRequests: 0, quoteRaw: null };
    const page = await openPage(state);

    await page.click("text=T-Shirts & Apparel");
    await page.waitForTimeout(600);
    check("catalog: fetched exactly once, on apparel selection", state.catalogRequests === 1, `${state.catalogRequests} requests`);

    await page.click('button:has-text("02")');
    await page.click('button:has-text("Hats")');
    await page.fill("#apparel-request-quantity", "25");
    await page.fill("#apparel-request-notes", "25 black hats, front logo embroidery");
    await page.locator("input[type=date]").first().fill(NEED_BY);
    await page.click('button:has-text("04")');
    await page.locator("input[id*=ame], input[name*=ame]").first().fill("Smoke Test");
    await page.locator("input[type=email]").first().fill("smoke@example.com");
    await page.click('button:has-text("05")');
    await page.waitForTimeout(400);

    const review = await reviewText(page);
    check("apparel: review shows the chosen garment", /Garment\s*\n?\s*Hats/.test(review));
    check("apparel: review carries the notes verbatim", review.includes("front logo embroidery"));
    check(
      "apparel: review never shows a catalog default",
      !review.includes("Starter Tee"),
      "the pinned product leaked into the request review"
    );

    await page.click('button:has-text("Request Quote")');
    const confirmed = await page
      .waitForSelector("text=25 Hats", { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check("apparel: confirmation renders after submit", confirmed);

    const order = JSON.parse(formField(state.quoteRaw || "", "order") || "null");
    check("apparel: payload captured", Boolean(order));
    if (order) {
      const product = order.product || {};
      check("apparel: garmentType is the customer's chip", product.garmentType === "Hats");
      check("apparel: request mode is a special order", product.specialOrder === true);
      check(
        "apparel: supplier names no unchosen SKU",
        product.supplier?.sku === "Not selected",
        String(product.supplier?.sku)
      );
      check("apparel: pricing requires a hand quote", order.pricing?.quoteRequired === true);
      check(
        "apparel: THE invariant, inverted — a hand quote must never auto-bill",
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
