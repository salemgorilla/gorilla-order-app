import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { POST } from "../app/api/quote/route";

/**
 * One file per design, all the way to the shop.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * The submit path built its artwork parts like this:
 *
 *     const artworkParts = isStickerFlow
 *       ? order.items.filter(...).map(...)
 *       : order.artwork.file ? [{ id: "order", file: order.artwork.file }] : [];
 *
 * with a comment saying "Signs and apparel are single-file flows and keep the
 * order-level slot." That was true until the morning signs grew a design
 * list, and then the comment aged into a lie that cost the customer their
 * artwork.
 *
 * `order.artwork.file` is still written on every signs upload, so it held
 * whichever file was uploaded LAST. Driving a two-design quote in a browser
 * and reading the multipart body showed exactly one part leaving:
 *
 *     artwork:order -> design-two.png
 *
 * Design 1's file never left the browser. Meanwhile the payload went on
 * listing BOTH filenames, because those come from each design — so the shop
 * received an email naming two files with one attached, and no way to tell
 * which design the one belonged to.
 *
 * Artwork is the one thing in a quote that cannot be regenerated or asked for
 * again without the customer doing work, which is why this ranks above the
 * size label that shipped the same day.
 *
 * ── THE SERVER HALF, STATED ACCURATELY ────────────────────────────────────
 * This comment used to claim the route ALSO dropped every signs attachment,
 * because it ordered parts by `order.items` and a signs order's ids matched
 * nothing — so a client-only fix "would have posted two files and enumerated
 * neither."
 *
 * That is wrong, and it was written without checking. A signs payload carries
 * no `items` at all: buildQuotePayload's signs branch returns exactly
 * `{...orderEnvelope, ...buildSignsPayloadParts(...)}`, and neither half has
 * one. So `orderedItems` was EMPTY, not mismatched, and the route's
 * `orderedItems.length ? ... : artworkParts` fallback passed every part
 * through. A client-only fix would have worked.
 *
 * What the server change actually buys is that the ordering and the design
 * numbers are correct BY CONSTRUCTION rather than by luck. With an empty
 * `orderedItems` the numbers came from this loop's index over the multipart
 * Map — which happens to be insertion order, which happens to be cart order.
 * That is three coincidences deep, and the numbering it produces is the
 * file-to-design map the shop prints from. Reading `signsDesigns` makes it a
 * rule instead of an accident, and covers the day a signs payload does carry
 * `items`.
 *
 * Left as a correction rather than deleted: the overstated version was in a
 * merged commit message and a PR body, and this file is where anyone would
 * come to check.
 */

function designs() {
  return [
    createSignsDesign({
      productId: "vinyl-banner",
      quantity: 1,
      customWidthInches: 72,
      customHeightInches: 36,
      material: "13 oz Scrim Vinyl",
      finishing: "Hemmed + Grommets",
    }),
    createSignsDesign({
      productId: "yard-sign",
      quantity: 10,
      material: "Coroplast",
      finishing: "Signs Only",
      customWidthInches: 0,
      customHeightInches: 0,
    }),
  ];
}

describe("the browser sends one part per design", () => {
  const page = readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8"
  );

  test("signs build their parts from the designs, not the order slot", () => {
    // Read from the source because this lives in a component this repo has no
    // renderer for. The behaviour itself was verified in a browser.
    assert.match(
      page,
      /isSignsSelected\s*\?\s*signsQuote\.designs\s*\n?\s*\.filter\(\(design\) => design\.artwork\.file\)/
    );
  });

  test("the order-level slot is still there for apparel", () => {
    // Apparel really is single-file. Removing the slot would break it.
    assert.match(page, /\[\{ id: "order", file: order\.artwork\.file \}\]/);
  });

  test("the stale claim is gone from the comment", () => {
    assert.doesNotMatch(
      page,
      /Signs and apparel are\s*\n?\s*\/\/ single-file flows/
    );
  });
});

describe("the server keeps them apart", () => {
  function post(order: unknown, files: Array<[string, string]>) {
    const body = new FormData();
    body.append("order", JSON.stringify(order));

    for (const [key, name] of files) {
      body.append(
        key,
        new File([new Uint8Array(64)], name, { type: "image/png" }),
        name
      );
    }

    return POST(
      new Request("https://labs.gorillasalem.com/api/quote", {
        method: "POST",
        body,
      })
    );
  }

  function payloadFor(list: ReturnType<typeof designs>) {
    return {
      customer: {
        customerName: "Dana Whitfield",
        email: "dana@example.com",
        company: "",
        phone: "",
        notes: "",
        heardAbout: [],
        newsletterOptIn: false,
      },
      production: { deliveryMethod: "Pickup", needBy: "2026-09-15" },
      ...buildSignsPayloadParts(list, quoteSignsCart(list)),
    };
  }

  test("a two-design signs quote with a file each is accepted", async () => {
    const list = designs();

    const response = await post(
      payloadFor(list),
      list.map((design, index) => [
        `artwork:${design.id}`,
        `design-${index + 1}.png`,
      ])
    );

    // 200 or 502 is a DELIVERY outcome — credentials are absent here. Either
    // means the route parsed the payload and walked the artwork without
    // throwing, which is what the ordering change could have broken.
    assert.ok(
      response.status === 200 || response.status === 502,
      `returned ${response.status}`
    );
  });

  test("the payload names every design's file", () => {
    // What the shop email reads. It listed both before the fix too — that was
    // the trap, since only one file was attached.
    const list = designs();
    const parts = buildSignsPayloadParts(list, quoteSignsCart(list)) as {
      signsDesigns: Array<{ id: string; fileName: string | null }>;
    };

    assert.equal(parts.signsDesigns.length, 2);
    assert.deepEqual(
      parts.signsDesigns.map((design) => design.id),
      list.map((design) => design.id)
    );
  });

  test("a signs payload carries no sticker cart to be confused by", () => {
    // The premise the corrected comment above rests on. If a signs payload
    // ever grows an `items` key, the route's fallback stops being reached and
    // the ordering rule below is the only thing keeping the numbers right.
    const list = designs();
    const parts = buildSignsPayloadParts(list, quoteSignsCart(list));

    assert.ok(!("items" in parts), "the signs payload now carries `items`");
  });

  test("the route orders by signsDesigns when the quote is a signs cart", () => {
    const route = readFileSync(
      new URL("../app/api/quote/route.ts", import.meta.url),
      "utf8"
    );

    assert.match(route, /signsDesignList\.length\s*\n?\s*\?\s*signsDesignList/);
  });

  test("a design with no file simply sends no part", async () => {
    // The drop policy is per design and must not fail the submission: a quote
    // can be sent with artwork still to come.
    const list = designs();

    const response = await post(payloadFor(list), [
      [`artwork:${list[1].id}`, "only-the-second.png"],
    ]);

    assert.ok(response.status === 200 || response.status === 502);
  });
});
