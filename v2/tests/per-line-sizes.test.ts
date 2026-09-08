/**
 * A SIZE BREAKDOWN FOR EVERY GARMENT, NOT JUST THE FIRST ONE.
 *
 * Gabe, 2026-09-08: "When I added another garment in the apparel button,
 * there was no way to enter the size breakdown. Can you make sure that each
 * step is consistent."
 *
 * The configurator asked for sizes with a grid; an added garment asked for a
 * rough count and nothing else. One question, two answers, on one screen.
 *
 * ── WHAT THAT ACTUALLY COST ───────────────────────────────────────────────
 * Not only tidiness. Two real consequences, both pinned below:
 *
 *   The hoodies were priced on the ASSUMED size mix while the tees were
 *   priced from real SKUs — so the same order stood on two different
 *   footings, and the shop email said so in a sentence that has now stopped
 *   being true.
 *
 *   Every garment row on a cart's Printavo invoice was filed under
 *   `size_other`, INCLUDING the tees, whose breakdown the customer had
 *   typed: the multi-line branch reads sizes off the line, and no line had
 *   any. A customer entered S/M/L/XL and watched those rows vanish the
 *   moment they added a second garment.
 *
 * The grid itself is now ONE component (features/apparel/SizeBreakdownGrid),
 * mounted by the configurator and by every added garment, so the two cannot
 * drift apart again.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

import type { SsCatalogProduct } from "../features/types";
import {
  blendedGarmentUnitPrice,
  garmentUnitPriceFromSizes,
} from "../lib/apparel-blend";
import {
  applyExtraLineUpdate,
  describeGarmentLines,
  describeQuoteSizeBasis,
  extraGarmentLineErrors,
  extraLineQuantity,
  extraLineSizeBreakdown,
  resetExtraLineSizes,
  resolveExtraGarmentLines,
  setExtraLineSize,
  shouldListGarments,
  stepExtraLineSize,
  type ExtraGarmentLine,
} from "../lib/apparel-cart-lines";
import { getApparelFieldErrors } from "../lib/validation";
import { quoteApparelCart } from "../lib/apparel-cart";
import { buildPrintavoQuotePlan } from "../lib/printavo";

const size = (sizeName: string, markedUpPrice: number) => ({
  sku: `SKU-${sizeName}`,
  sizeName,
  markedUpPrice,
  isAvailable: true,
  outOfStock: false,
});

const color = (colorName: string, base: number, sizes = ["S", "M", "L", "XL", "2XL", "3XL"]) => ({
  colorName,
  colorHex: null,
  swatchImage: null,
  frontImage: null,
  backImage: null,
  sideImage: null,
  isAvailable: true,
  outOfStock: false,
  sizes: sizes.map((name) =>
    size(name, name === "2XL" ? base + 2 : name === "3XL" ? base + 3 : base)
  ),
});

const CATALOG: SsCatalogProduct[] = [
  {
    id: "tee",
    brandName: "Gildan",
    styleName: "5000",
    displayName: "Gildan 5000",
    customerLabel: "Basic Tee",
    customerCategory: "T-Shirts",
    catalogStyle: "5000",
    catalogNotes: "",
    colors: [color("White", 3.49), color("Black", 3.81)],
  },
  {
    id: "hoodie",
    brandName: "Gildan",
    styleName: "18500",
    displayName: "Gildan 18500",
    customerLabel: "Heavy Hoodie",
    customerCategory: "Sweatshirts",
    catalogStyle: "18500",
    catalogNotes: "",
    // Deliberately a short size run: S&S does not stock every style in
    // every size, and that is what strands counts on a colour change.
    colors: [color("Black", 14.87, ["M", "L", "XL"]), color("Navy", 14.87, ["S", "M", "L"])],
  },
];

function line(overrides: Partial<ExtraGarmentLine> = {}): ExtraGarmentLine {
  return {
    id: "g1",
    productId: "hoodie",
    colorName: "Black",
    quantity: 0,
    sizeQuantities: {},
    ...overrides,
  };
}

describe("the grid is the count, exactly as it is for the first garment", () => {
  test("no sizes: the rough count stands", () => {
    assert.equal(extraLineQuantity(line({ quantity: 12 })), 12);
  });

  test("sizes entered: the grid wins, and the rough count is ignored", () => {
    // The first garment has worked this way since the grid became its
    // quantity. Two live numbers is the "Size breakdown must total 24,
    // current total is 22" failure this flow already removed once.
    const l = line({ quantity: 12, sizeQuantities: { M: 4, L: 6 } });

    assert.equal(extraLineQuantity(l), 10);
  });

  test("a line from before per-line sizes existed still counts", () => {
    // A restored draft, or an old payload: no grid at all is a rough count,
    // never an order of zero.
    const legacy = { id: "g1", productId: "tee", colorName: "White", quantity: 8 };

    assert.equal(extraLineQuantity(legacy as ExtraGarmentLine), 8);
  });

  test("a fractional or negative rough count cannot become garments", () => {
    assert.equal(extraLineQuantity(line({ quantity: 4.7 })), 4);
    assert.equal(extraLineQuantity(line({ quantity: -3 })), 0);
  });
});

describe("editing one line's grid", () => {
  test("+ and − move one size and leave the rest alone", () => {
    let l = line({ sizeQuantities: { M: 2 } });

    l = stepExtraLineSize(l, "L", 1);
    assert.deepEqual(l.sizeQuantities, { M: 2, L: 1 });

    l = stepExtraLineSize(l, "M", -1);
    assert.deepEqual(l.sizeQuantities, { M: 1, L: 1 });
  });

  test("a size at zero is REMOVED, not left as a zero row", () => {
    // extraLineHasSizes has to mean "the customer entered sizes", not "a
    // grid object exists" — otherwise stepping a size up and back down
    // would leave the line's rough count permanently disabled.
    const l = stepExtraLineSize(line({ sizeQuantities: { M: 1 } }), "M", -1);

    assert.deepEqual(l.sizeQuantities, {});
    assert.equal(extraLineSizeBreakdown(l), "");
  });

  test("a typed count is floored, and never negative", () => {
    assert.deepEqual(setExtraLineSize(line(), "M", 3.9).sizeQuantities, { M: 3 });
    assert.deepEqual(setExtraLineSize(line(), "M", -2).sizeQuantities, {});
    assert.deepEqual(setExtraLineSize(line(), "M", NaN).sizeQuantities, {});
  });

  test("reset hands the count back to the rough number", () => {
    const l = resetExtraLineSizes(line({ quantity: 12, sizeQuantities: { M: 4 } }));

    assert.deepEqual(l.sizeQuantities, {});
    assert.equal(extraLineQuantity(l), 12);
  });
});

describe("a colour change cannot strand sizes nobody can order", () => {
  test("counts for sizes the new colour does not carry are pruned", () => {
    // Black hoodies come in M/L/XL; Navy comes in S/M/L. The XL count has
    // to go — and here it matters more than it does for the first garment,
    // because the LINE'S COUNT IS THE GRID TOTAL: a stranded row would
    // silently order shirts that cannot be bought, with no control on
    // screen to see or zero it.
    const before = line({ sizeQuantities: { M: 2, L: 2, XL: 4 } });
    assert.equal(extraLineQuantity(before), 8);

    const after = applyExtraLineUpdate(before, { colorName: "Navy" }, CATALOG);

    assert.deepEqual(after.sizeQuantities, { M: 2, L: 2 });
    assert.equal(extraLineQuantity(after), 4);
  });

  test("sizes the new colour also carries survive", () => {
    const after = applyExtraLineUpdate(
      line({ sizeQuantities: { M: 6 } }),
      { colorName: "Navy" },
      CATALOG
    );

    assert.deepEqual(after.sizeQuantities, { M: 6 }, "a colour comparison lost the breakdown");
  });

  test("a garment change prunes too, and resets the colour", () => {
    const after = applyExtraLineUpdate(
      line({ productId: "tee", colorName: "White", sizeQuantities: { M: 2, "3XL": 1 } }),
      { productId: "hoodie", colorName: "Black" },
      CATALOG
    );

    assert.deepEqual(after.sizeQuantities, { M: 2 }, "hoodie Black has no 3XL");
  });

  test("an edit that touches neither leaves the grid alone", () => {
    const before = line({ sizeQuantities: { M: 2 } });

    assert.deepEqual(
      applyExtraLineUpdate(before, { quantity: 30 }, CATALOG).sizeQuantities,
      { M: 2 }
    );
  });

  test("a colour that does not resolve keeps what was typed", () => {
    // Mid-change, or a catalogue that has not loaded. Throwing the grid
    // away on a transient state is worse than keeping it: the next real
    // colour prunes it anyway.
    const after = applyExtraLineUpdate(
      line({ sizeQuantities: { M: 2 } }),
      { colorName: "Not A Colour" },
      CATALOG
    );

    assert.deepEqual(after.sizeQuantities, { M: 2 });
  });
});

describe("a line with sizes is priced from them, not from the blend", () => {
  test("its unit price is the exact one, and it carries its breakdown", () => {
    const [resolved] = resolveExtraGarmentLines(
      [line({ sizeQuantities: { M: 6, L: 6 } })],
      CATALOG
    );

    const hoodieBlack = CATALOG[1].colors[0];

    assert.equal(resolved.quantity, 12);
    assert.equal(resolved.sizeBreakdown, "M-6, L-6");
    assert.equal(
      resolved.garmentPriceByMarkup?.["150"],
      garmentUnitPriceFromSizes(hoodieBlack, { M: 6, L: 6 }, 12, 1.5)
    );
  });

  test("a line with no sizes still stands on the blend, unchanged", () => {
    const [resolved] = resolveExtraGarmentLines([line({ quantity: 12 })], CATALOG);

    assert.equal(resolved.sizeBreakdown, "");
    assert.equal(
      resolved.garmentPriceByMarkup?.["150"],
      blendedGarmentUnitPrice(CATALOG[1].colors[0], 1.5)
    );
  });

  test("an extended-size run costs MORE than the blend said it would", () => {
    // The point of asking. 12 hoodies all in 3XL is not 12 hoodies at the
    // blended figure, and before this the estimate said it was.
    const tee = CATALOG[0].colors[0];

    const [exact] = resolveExtraGarmentLines(
      [line({ productId: "tee", colorName: "White", sizeQuantities: { "3XL": 12 } })],
      CATALOG
    );
    const [assumed] = resolveExtraGarmentLines(
      [line({ productId: "tee", colorName: "White", quantity: 12 })],
      CATALOG
    );

    assert.ok(
      (exact.garmentPriceByMarkup?.["150"] ?? 0) >
        (assumed.garmentPriceByMarkup?.["150"] ?? 0),
      "an all-3XL run priced at or under the blended figure"
    );
    assert.equal(
      exact.garmentPriceByMarkup?.["150"],
      garmentUnitPriceFromSizes(tee, { "3XL": 12 }, 12, 1.5)
    );
  });

  test("the line prices at zero garments when the grid is emptied", () => {
    // Reset clears the grid AND the line had no rough count: nothing to
    // price, so the line is left out rather than quoted as a phantom.
    const emptied = resetExtraLineSizes(line({ sizeQuantities: { M: 4 } }));

    assert.deepEqual(resolveExtraGarmentLines([emptied], CATALOG), []);
  });
});

describe("the validator accepts either answer", () => {
  test("sizes alone clear the 'enter how many' error", () => {
    const withSizes = line({ quantity: 0, sizeQuantities: { M: 4 } });

    assert.deepEqual(extraGarmentLineErrors([withSizes], CATALOG), {});
  });

  test("neither still fails", () => {
    assert.match(
      extraGarmentLineErrors([line({ quantity: 0 })], CATALOG).g1,
      /how many/i
    );
  });
});

describe("what the shop is told about which garments are which", () => {
  test("the garment list carries each line's own sizes", () => {
    assert.equal(
      describeGarmentLines([
        { garmentLabel: "Basic Tee", colorName: "White", quantity: 24, sizeBreakdown: "M-12, L-12" },
        { garmentLabel: "Heavy Hoodie", colorName: "Black", quantity: 12 },
      ]),
      "24 × Basic Tee / White (M-12, L-12) · 12 × Heavy Hoodie / Black"
    );
  });

  test("the basis is derived from the lines, never asserted", () => {
    const tees = { garmentLabel: "Basic Tee", colorName: "White", quantity: 24, sizeBreakdown: "M-24" };
    const hoodies = { garmentLabel: "Heavy Hoodie", colorName: "Black", quantity: 12 };

    assert.equal(describeQuoteSizeBasis([tees]).basis, "exact");
    assert.equal(describeQuoteSizeBasis([hoodies]).basis, "assumed");

    const mixed = describeQuoteSizeBasis([tees, hoodies]);
    assert.equal(mixed.basis, "mixed");
    assert.deepEqual(mixed.assumedGarments, ["Heavy Hoodie / Black"]);

    // The old note said "added garments use an assumed size mix" on EVERY
    // cart. Now both garments can be exact, and it has to say so.
    assert.equal(
      describeQuoteSizeBasis([tees, { ...hoodies, sizeBreakdown: "L-12" }]).basis,
      "exact"
    );
  });

  test("lines nobody ordered do not decide the basis", () => {
    assert.equal(
      describeQuoteSizeBasis([
        { garmentLabel: "Basic Tee", colorName: "White", quantity: 24, sizeBreakdown: "M-24" },
        { garmentLabel: "Heavy Hoodie", colorName: "Black", quantity: 0 },
      ]).basis,
      "exact"
    );
  });
});

describe("the Printavo invoice files every row under its own sizes", () => {
  /** The plan the route pushes, for one order. */
  function planFor(order: Record<string, unknown>) {
    return buildPrintavoQuotePlan({
      quoteNumber: "GS-20260908-SIZES",
      order,
      artworkAnalysis: null,
    });
  }

  /** A cart payload in the shape app/page.tsx builds. */
  function cartPayload() {
    const quote = quoteApparelCart(
      [
        {
          id: "line-1",
          garmentLabel: "Basic Tee",
          colorName: "White",
          catalogStyle: "5000",
          garmentPriceByMarkup: { "150": 5.24, "140": 5.0, "130": 4.75 },
          quantity: 24,
          sizeBreakdown: "M-12, L-12",
        },
        ...resolveExtraGarmentLines(
          [line({ sizeQuantities: { M: 6, L: 6 } })],
          CATALOG
        ),
      ],
      { printLocations: ["Front"], inkColors: "1 color", hasUnderbase: false }
    );

    return {
      customer: { customerName: "Dana", email: "dana@example.com" },
      production: { deliveryMethod: "Pickup", needBy: "2026-11-02" },
      product: {
        type: "T-Shirts & Apparel",
        garmentType: "T-Shirts",
        supplier: { productName: "Gildan 5000", catalogStyle: "5000" },
        garmentColor: "White",
        quantity: quote.quantity,
        printLocations: ["Front"],
        inkColors: "1 color",
        sizeBreakdown: "M-12, L-12",
        garmentLines: describeGarmentLines(quote.lines),
      },
      pricing: { ...quote, quoteRequired: false },
    };
  }

  test("the tees keep the S/M/L rows the customer typed", () => {
    // THE REGRESSION. Before per-line sizes, adding a second garment sent
    // every row — including this one — as a single `size_other` bucket,
    // because the multi-line branch reads sizes off the LINE and only the
    // whole quote had a breakdown.
    const rows = planFor(cartPayload()).lineItems;

    assert.equal(rows.length, 2, "a cart should file one row per garment");

    const tees = rows[0];
    assert.equal(tees.quantity, 24);
    assert.deepEqual(
      [...tees.sizes].sort((a, b) => a.size.localeCompare(b.size)),
      [
        { size: "size_l", count: 12 },
        { size: "size_m", count: 12 },
      ]
    );
    assert.ok(
      !tees.sizes.some((s) => s.size === "size_other"),
      "the customer's sizes were dropped into one bucket"
    );
  });

  test("the hoodies carry their own, and not the tees'", () => {
    const rows = planFor(cartPayload()).lineItems;
    const hoodies = rows[1];

    assert.equal(hoodies.quantity, 12);
    assert.deepEqual(
      [...hoodies.sizes].sort((a, b) => a.size.localeCompare(b.size)),
      [
        { size: "size_l", count: 6 },
        { size: "size_m", count: 6 },
      ]
    );
  });

  test("a line with no sizes still files one honest bucket", () => {
    const payload = cartPayload();
    const pricing = payload.pricing as { lines: Array<Record<string, unknown>> };
    pricing.lines[1].sizeBreakdown = "";

    const rows = planFor(payload).lineItems;

    assert.deepEqual(rows[1].sizes, [{ size: "size_other", count: 12 }]);
  });

  test("a breakdown that does not account for the line is not trusted", () => {
    // The same rule the single-garment branch has always used: a total that
    // does not match the count means something is out of step, and one
    // honest bucket beats confident wrong rows.
    const payload = cartPayload();
    const pricing = payload.pricing as { lines: Array<Record<string, unknown>> };
    pricing.lines[1].sizeBreakdown = "M-3";

    const rows = planFor(payload).lineItems;

    assert.deepEqual(rows[1].sizes, [{ size: "size_other", count: 12 }]);
  });
});

describe("a quote whose only garment is an ADDED one", () => {
  /**
   * Reachable, and it read wrong. Set the configured garment to 0 and put
   * 12 hoodies on a line: the quote prices ONE line, the hoodie, and every
   * surface testing `lines.length > 1` took the single-garment branch and
   * described the tee — at quantity 0, beside a $397 estimate for hoodies.
   * Two numbers on one card that cannot both be about the same thing.
   */
  test("the surfaces list the garments rather than describe the configured one", () => {
    const hoodie = { quantity: 12 };

    assert.equal(shouldListGarments([hoodie], 0), true, "described a garment nobody ordered");
    assert.equal(shouldListGarments([{ quantity: 24 }], 24), false, "an ordinary one-garment order");
    assert.equal(shouldListGarments([{ quantity: 24 }, hoodie], 24), true);
  });

  test("a line nobody ordered does not make it a list", () => {
    assert.equal(shouldListGarments([{ quantity: 24 }, { quantity: 0 }], 24), false);
  });

  test("an empty quote describes the configured garment, as it always did", () => {
    assert.equal(shouldListGarments([], 0), false);
  });

  test("the count rule names WHICH garment it wants", () => {
    // "Enter roughly how many you need" pointed at a box the customer could
    // reasonably think they had already answered — they had typed 12
    // hoodies. The garment's name is what makes it a different question.
    const errors = getApparelFieldErrors(
      {
        specialOrder: false,
        specialOrderNotes: "",
        quantity: 0,
        printLocations: ["Front"],
        garmentLabel: "Premium Soft Tee",
      },
      {
        customer: { customerName: "Dana", email: "dana@example.com" },
        artwork: { file: {} },
        production: { needBy: "2026-12-07" },
      },
      0
    );

    assert.equal(errors.quantity, "Enter how many Premium Soft Tee you need.");
  });

  test("without a catalogue label it says what it always said", () => {
    // The fallback garment list and the request flow have no label.
    const errors = getApparelFieldErrors(
      {
        specialOrder: false,
        specialOrderNotes: "",
        quantity: 0,
        printLocations: ["Front"],
      },
      {
        customer: { customerName: "Dana", email: "dana@example.com" },
        artwork: { file: {} },
        production: { needBy: "2026-12-07" },
      },
      0
    );

    assert.equal(errors.quantity, "Enter roughly how many you need.");
  });
});

describe("one grid, mounted twice", () => {
  /**
   * Read from source. The failure this catches is a SECOND grid appearing
   * beside the shared one — the shape "make the added garments consistent"
   * usually takes, and the shape that drifts apart again on the next
   * change.
   */
  const grid = readFileSync(
    new URL("../features/apparel/SizeBreakdownGrid.tsx", import.meta.url),
    "utf8"
  );
  const builder = readFileSync(
    new URL("../features/apparel/ApparelBuilder.tsx", import.meta.url),
    "utf8"
  );
  const cartLines = readFileSync(
    new URL("../features/apparel/ApparelCartLines.tsx", import.meta.url),
    "utf8"
  );

  test("both the configurator and the added garments mount it", () => {
    assert.match(builder, /<SizeBreakdownGrid/);
    assert.match(cartLines, /<SizeBreakdownGrid/);
  });

  test("neither draws its own stepper any more", () => {
    for (const [name, source] of [
      ["the configurator", builder],
      ["the added garments", cartLines],
    ] as Array<[string, string]>) {
      assert.doesNotMatch(
        source,
        /aria-label=\{`\$\{sizeName\} quantity`\}/,
        `${name} has its own copy of the size grid`
      );
    }
  });

  test("the inputs are distinguishable once several grids share a page", () => {
    // "2XL quantity" on three garments is three identical accessible names.
    assert.match(grid, /labelPrefix/);
    assert.match(cartLines, /labelPrefix=/);
  });

  test("the grid's own + is capped by stock and nothing else", () => {
    // It used to also stop at a separately chosen quantity, which is always
    // false now that the grid IS the quantity — and would freeze every +.
    assert.match(grid, /disabled=\{!isAvailable\}/);
  });
});
