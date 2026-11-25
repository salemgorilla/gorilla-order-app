/**
 * The 50 Hoodie Special — Gabe, 2026-11-23: "a flat fee, nothing will change
 * the end price as it's a fixed rate ... as long as it's 2 colors or under,
 * there should be 2 pricing outcomes."
 *
 * Pins the two prices, that nothing else moves them, the 2-colour cap, the
 * 50-piece floor, the Dec 1 cut-off on Salem's clock, and what reaches the
 * shop: one Printavo row at the flat price, no printing or setup rows, and
 * never a sticker order.
 *
 * Gabe, 2026-11-23, later the same day: "Cutter and Buck is the only option
 * for the 50 hoodie" and "there's the limit of two colors printing, so
 * there's no breaking that rule." Pinned below too.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  HOODIE_SPECIAL,
  clampHoodieSpecialInk,
  hoodieSpecialFieldErrors,
  hoodieSpecialNote,
  hoodieSpecialSubmissionProblem,
  isHoodieSpecialOpen,
  quoteHoodieSpecial,
  shopTodayIso,
} from "../lib/hoodie-special";
import { getApparelFieldErrors } from "../lib/validation";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { buildQuoteEmail } from "../lib/email";
import { isStickerOrder } from "../lib/sticker-repricing";

const MIXED = "XS-2, S-6, M-12, L-12, XL-8, 2XL-5, 3XL-3, 4XL-1, 5XL-1"; // 50

describe("two prices, and nothing else moves them", () => {
  test("front only is $27 a piece, front and back $33", () => {
    const front = quoteHoodieSpecial({
      quantity: 50,
      colorName: "Black",
      printLocations: ["Front"],
      sizeBreakdown: MIXED,
    });
    assert.equal(front.unitPrice, 27);
    assert.equal(front.total, 1350);

    const both = quoteHoodieSpecial({
      quantity: 50,
      colorName: "Black",
      printLocations: ["Front", "Back"],
      sizeBreakdown: MIXED,
    });
    assert.equal(both.unitPrice, 33);
    assert.equal(both.total, 1650);
  });

  test("size mix, colour, placement and ink cannot change the figure", () => {
    const totals = new Set<number>();
    for (const colorName of HOODIE_SPECIAL.colors.map((c) => c.name)) {
      for (const front of HOODIE_SPECIAL.frontPlacements) {
        for (const sizeBreakdown of [MIXED, "M-50", "5XL-50", "XS-50"]) {
          totals.add(
            quoteHoodieSpecial({
              quantity: 50,
              colorName,
              printLocations: [front],
              sizeBreakdown,
            }).total
          );
        }
      }
    }
    assert.deepEqual([...totals], [1350]);
  });

  test("no printing, setup, underbase or rush is ever added", () => {
    const quote = quoteHoodieSpecial({
      quantity: 64,
      colorName: "Dark Navy",
      printLocations: ["Left Chest", "Upper Back"],
      sizeBreakdown: "M-32, L-32",
    });
    assert.equal(quote.printTotal, 0);
    assert.equal(quote.setupTotal, 0);
    assert.equal(quote.underbaseFeePerPiece, 0);
    assert.equal(quote.rushFee, 0);
    assert.equal(quote.total, 64 * 33);
    assert.equal(quote.garmentTotal, quote.total);
  });
});

describe("the special's rules", () => {
  const base = {
    quantity: 50,
    sizeQuantityTotal: 50,
    colorName: "Black",
    printLocations: ["Front"],
    inkColors: "2 colors",
    inkColorsByLocation: { Front: "2 colors" },
    today: "2026-11-23",
  };

  test("a 2-colour front and a 2-colour back pass", () => {
    assert.deepEqual(
      hoodieSpecialFieldErrors({
        ...base,
        printLocations: ["Front", "Back"],
        inkColorsByLocation: { Front: "2 colors", Back: "2 colors" },
      }),
      {}
    );
  });

  test("3 colours on any side is refused, and the menu clamps to 2", () => {
    const errors = hoodieSpecialFieldErrors({
      ...base,
      printLocations: ["Front", "Back"],
      inkColorsByLocation: { Front: "1 color", Back: "3 colors" },
    });
    assert.match(errors.printLocations ?? "", /up to 2 ink colors per side/);
    assert.equal(clampHoodieSpecialInk("3 colors"), "2 colors");
    assert.equal(clampHoodieSpecialInk("5+ colors / Full color / Not sure"), "2 colors");
    assert.equal(clampHoodieSpecialInk("1 color"), "1 color");
  });

  test("50 is the floor; more is fine at the same rate", () => {
    assert.match(
      hoodieSpecialFieldErrors({ ...base, sizeQuantityTotal: 49 }).quantity ?? "",
      /add 1 more/
    );
    assert.match(
      hoodieSpecialFieldErrors({ ...base, sizeQuantityTotal: 0 }).quantity ?? "",
      /Enter your sizes/
    );
    assert.deepEqual(hoodieSpecialFieldErrors({ ...base, sizeQuantityTotal: 120 }), {});
  });

  test("a colour outside the eight is refused", () => {
    assert.ok(hoodieSpecialFieldErrors({ ...base, colorName: "Maroon" }).printLocations);
    // Gildan's names are not the Stockholm's.
    assert.ok(hoodieSpecialFieldErrors({ ...base, colorName: "Sport Grey" }).printLocations);
  });

  test("two prints on one side are refused: that would be 4 inks on it", () => {
    assert.ok(
      hoodieSpecialFieldErrors({
        ...base,
        printLocations: ["Front", "Back", "Upper Back"],
        inkColorsByLocation: { Front: "2 colors", Back: "2 colors", "Upper Back": "2 colors" },
      }).printLocations
    );
    assert.ok(
      hoodieSpecialFieldErrors({
        ...base,
        printLocations: ["Front", "Left Chest"],
        inkColorsByLocation: { Front: "2 colors", "Left Chest": "2 colors" },
      }).printLocations
    );
    assert.ok(
      hoodieSpecialFieldErrors({
        ...base,
        printLocations: ["Front", "Sleeve"],
        inkColorsByLocation: { Front: "1 color", Sleeve: "1 color" },
      }).printLocations
    );
  });

  test("art that reads busier than 2 needs the customer's own tick", () => {
    const busy = { ...base, artworkColorCount: 4 };
    assert.match(hoodieSpecialFieldErrors(busy).artwork ?? "", /about 4 colors/);
    assert.equal(hoodieSpecialFieldErrors({ ...busy, artConfirmed: true }).artwork, undefined);
    assert.equal(hoodieSpecialFieldErrors({ ...base, artworkColorCount: 2 }).artwork, undefined);
  });

  test("it runs through December 1 on Salem's clock, then closes", () => {
    assert.equal(isHoodieSpecialOpen("2026-12-01"), true);
    assert.equal(isHoodieSpecialOpen("2026-12-02"), false);
    // 10 PM on Dec 1 in Salem is already Dec 2 in UTC.
    assert.equal(shopTodayIso(new Date("2026-12-02T03:00:00Z")), "2026-12-01");
    assert.match(
      hoodieSpecialFieldErrors({ ...base, today: "2026-12-02" }).quantity ?? "",
      /ended December 1/
    );
  });
});

describe("the regular apparel rules are untouched", () => {
  const order = {
    customer: { customerName: "Test", email: "test@example.com" },
    artwork: { file: {} },
    production: { needBy: "2027-03-01" },
  };

  test("without the promo, the colour minimum still applies", () => {
    const errors = getApparelFieldErrors(
      {
        specialOrder: false,
        specialOrderNotes: "",
        quantity: 30,
        printLocations: ["Front"],
        inkColors: "3 colors",
        hasUnderbase: false,
      },
      order,
      30,
      "2026-11-23"
    );
    assert.match(errors.quantity ?? "", /48/);
  });

  test("with the promo, the special's rules replace the matrix's", () => {
    const errors = getApparelFieldErrors(
      {
        specialOrder: false,
        specialOrderNotes: "",
        quantity: 50,
        printLocations: ["Front"],
        inkColors: "2 colors",
        // 2 inks + underbase on black is 3 colours: 48 under the regular
        // rule, which 50 clears anyway — and the special does not count it.
        hasUnderbase: true,
        promo: HOODIE_SPECIAL.id,
        garmentColor: "Black",
        // Pinned: the special ends Dec 1, and CI also runs the suite with
        // the clock moved forward (npm run test:future).
        promoToday: "2026-11-23",
      },
      order,
      50,
      "2026-11-23"
    );
    assert.deepEqual(errors, {});
  });
});

describe("one blank only: Cutter & Buck", () => {
  test("the special is the Clique Stockholm Pullover Hoodie, MQK00107", () => {
    assert.equal(HOODIE_SPECIAL.supplier, "Cutter & Buck");
    assert.equal(HOODIE_SPECIAL.catalogStyle, "MQK00107");
    assert.match(HOODIE_SPECIAL.supplierProductName, /Stockholm Pullover Hoodie/);
    assert.equal(HOODIE_SPECIAL.colors.length, 8);
  });
});

describe("the quote endpoint holds the rules too", () => {
  const product = (overrides: Record<string, unknown> = {}) => ({
    promo: HOODIE_SPECIAL.id,
    quantity: 50,
    garmentColor: "Black",
    printLocations: ["Front", "Back"],
    inkColors: "Front 2 colors · Back 1 color",
    ...overrides,
  });
  const pricing = (unitPrice = 33, total = 1650) => ({ unitPrice, total });

  test("a clean special passes", () => {
    assert.equal(hoodieSpecialSubmissionProblem(product(), pricing()), null);
  });

  test("a third ink is refused however it arrives", () => {
    for (const inkColors of [
      "3 colors",
      "Front 2 colors · Back 3 colors",
      "5+ colors / Full color / Not sure",
      "",
    ]) {
      assert.match(
        hoodieSpecialSubmissionProblem(product({ inkColors }), pricing()) ?? "",
        /up to 2 ink colors/,
        inkColors
      );
    }
  });

  test("a second print on a side, another colour, too few, or another price is refused", () => {
    assert.ok(
      hoodieSpecialSubmissionProblem(
        product({ printLocations: ["Front", "Back", "Upper Back"] }),
        pricing()
      )
    );
    assert.ok(hoodieSpecialSubmissionProblem(product({ garmentColor: "Maroon" }), pricing()));
    assert.ok(hoodieSpecialSubmissionProblem(product({ quantity: 49 }), pricing(33, 1617)));
    assert.ok(hoodieSpecialSubmissionProblem(product(), pricing(27, 1350)));
    assert.ok(hoodieSpecialSubmissionProblem(product(), undefined));
  });
});

describe("what reaches the shop", () => {
  const order = (printLocations: string[]) => {
    const pricing = quoteHoodieSpecial({
      quantity: 50,
      colorName: "Grey Melange",
      printLocations,
      sizeBreakdown: MIXED,
    });

    return {
      customer: { customerName: "Test Customer", email: "test@example.com" },
      production: { needBy: "2026-12-18" },
      product: {
        type: "T-Shirts & Apparel",
        garmentType: HOODIE_SPECIAL.garmentLabel,
        quantity: 50,
        garmentColor: "Grey Melange",
        printLocations,
        inkColors: "2 colors",
        sizeBreakdown: MIXED,
        specialOrder: false,
        specialOrderNotes: "",
        promo: HOODIE_SPECIAL.id,
        promoName: HOODIE_SPECIAL.name,
        supplier: {
          source: HOODIE_SPECIAL.supplier,
          productName: `Hoodie Special (${HOODIE_SPECIAL.garmentLabel})`,
          supplierProductName: HOODIE_SPECIAL.supplierProductName,
          catalogStyle: HOODIE_SPECIAL.catalogStyle,
          colorName: "Grey Melange",
          sampleSize: "Not applicable (flat rate)",
          sku: "Not applicable (flat rate)",
          markedUpGarmentPrice: 0,
        },
      },
      artwork: { fileName: "logo.png" },
      pricing: {
        ...pricing,
        quoteRequired: false,
        promo: HOODIE_SPECIAL.id,
        note: hoodieSpecialNote(printLocations),
      },
    };
  };

  test("never a sticker order, so never a payment link", () => {
    assert.equal(isStickerOrder(order(["Front"])), false);
  });

  test("Printavo gets one row at the flat price and no printing or setup rows", () => {
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-20261123-TEST1",
      order: order(["Front", "Back"]),
      artworkAnalysis: null,
    });

    assert.equal(plan.lineItems.length, 1);
    assert.equal(plan.lineItems[0].price, 33);
    assert.equal(plan.lineItems[0].quantity, 50);
    // XS through 5XL map to Printavo's own size columns.
    const sizes = Object.fromEntries(
      (plan.lineItems[0].sizes ?? []).map((s: { size: string; count: number }) => [s.size, s.count])
    );
    assert.equal(sizes.size_xs, 2);
    assert.equal(sizes.size_5xl, 1);
    assert.equal(
      plan.feeLineItems.filter((row: { itemNumber?: string }) =>
        /PRINT|SETUP/i.test(String(row.itemNumber))
      ).length,
      0
    );
    assert.match(plan.lineItems[0].description, /50 Hoodie Special: flat \$33\.00 each/);
    assert.match(plan.lineItems[0].description, /HARD LIMIT: 2 ink colors per side/);
    assert.match(plan.customerNote, /Blank: Clique Stockholm Pullover Hoodie .*order from Cutter & Buck/);
    assert.doesNotMatch(plan.customerNote, /S&S style/);
    assert.match(
      plan.nickname,
      /GS-20261123-TEST1 - 50 Hoodie Special \(Stockholm Pullover Hoodie\)/
    );
  });

  test("the shop email names the promo and the flat rate", () => {
    const email = buildQuoteEmail({
      quoteNumber: "GS-20261123-TEST1",
      receivedAt: "2026-11-23T14:00:00Z",
      order: order(["Front"]),
      artworkAnalysis: null,
    });
    const body = email.text;
    assert.match(body, /PROMO \*\*\*: 50 Hoodie Special/);
    assert.match(body, /Flat rate: 50 x \$27\.00 = \$1,?350\.00/);
    assert.match(body, /Printing \/ Setup: Included in the flat rate/);
    assert.doesNotMatch(body, /Setup \/ Screens: \$0\.00/);
    assert.match(body, /INK LIMIT \*\*\*: HARD LIMIT: 2 ink colors per side/);
    assert.match(body, /order from Cutter & Buck/);
  });
});
