/**
 * THE ROLL IS 50" WIDE.
 *
 * Gabe, 2026-09-12: "My max print size is 50"." Before this the sticker form
 * said "any size" and meant it — 1 x 48"x96" priced at $200 and auto-billed,
 * a banner-sized print sold as a sticker with nothing checking it could come
 * off the machine.
 *
 * Held in the validator AND the server's repricer, because the validator is
 * a courtesy and the repricer is what decides whether a payment link is
 * raised. The two must agree on the number, so both read it from one place.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { repriceStickers } from "../lib/sticker-repricing";
import { MAX_STICKER_SIZE_INCHES } from "../lib/units";
import { getItemFieldErrors } from "../lib/validation";

const design = (widthInches: number, heightInches: number) =>
  ({
    id: "d1",
    quantity: 1,
    widthInches,
    heightInches,
    material: "Gloss White Vinyl",
    shape: "Square Corners",
    artwork: { file: { name: "a.png" } },
  }) as never;

describe("the form", () => {
  test("refuses a width or height over the roll, and names the way round it", () => {
    const wide = getItemFieldErrors(design(51, 3));
    const tall = getItemFieldErrors(design(3, 51));

    assert.match(wide.width ?? "", /50"/);
    assert.match(wide.width ?? "", /Signs & Banners/);
    assert.equal(wide.height, undefined);
    assert.match(tall.height ?? "", /50"/);
  });

  test("50\" exactly is allowed — the limit is the roll, not a margin inside it", () => {
    const errors = getItemFieldErrors(design(50, 50));

    assert.equal(errors.width, undefined);
    assert.equal(errors.height, undefined);
  });

  test("the input carries the same limit", () => {
    const builder = readFileSync(
      new URL("../features/decals/DecalBuilder.tsx", import.meta.url),
      "utf8"
    );

    assert.match(builder, /max=\{MAX_STICKER_SIZE_INCHES\}/);
    assert.doesNotMatch(builder, /Any size, any amount/);
  });
});

describe("the server", () => {
  const order = (w: number, h: number) => ({
    customer: { customerName: "T", email: "t@example.com" },
    production: { deliveryMethod: "Pickup" },
    product: { type: "Custom Stickers", quantity: 1 },
    items: [design(w, h)],
    pricing: { total: 0 },
  });

  test("an over-size design is flagged, not billed", () => {
    // It still prices — the shop gets the quote and the email and can
    // decide what to do with it. Only the link is withheld, which is the
    // same shape as a design with no dimensions at all.
    const priced = repriceStickers(order(60, 3));

    assert.equal(priced.unpriceable, true);
    assert.ok(priced.serverTotal > 0, "the shop still gets a figure to work from");
  });

  test("at the limit it bills as normal", () => {
    assert.equal(repriceStickers(order(50, 50)).unpriceable, false);
  });

  test("the validator and the server read one number", () => {
    // Two copies of "50" is two chances for one to be edited alone.
    for (const file of ["../lib/validation.ts", "../lib/sticker-repricing.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      assert.match(source, /MAX_STICKER_SIZE_INCHES/, file);
      assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /\b50\b/, `${file} hard-codes the limit`);
    }
    assert.equal(MAX_STICKER_SIZE_INCHES, 50);
  });
});
