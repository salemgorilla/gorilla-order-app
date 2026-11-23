/**
 * The 50 Hoodie Special — Gabe, 2026-11-23: "a flat fee, nothing will change
 * the end price as it's a fixed rate ... as long as it's 2 colors or under,
 * there should be 2 pricing outcomes."
 *
 * Pins the two prices, that nothing else moves them, the 2-colour cap, the
 * 50-piece floor, the Dec 1 cut-off on Salem's clock, and what reaches the
 * shop: one Printavo row at the flat price, no printing or setup rows, and
 * never a sticker order.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  HOODIE_SPECIAL,
  clampHoodieSpecialInk,
  hoodieSpecialFieldErrors,
  hoodieSpecialNote,
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
      colorName: "Navy",
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
      },
      order,
      50,
      "2026-11-23"
    );
    assert.deepEqual(errors, {});
  });
});

describe("what reaches the shop", () => {
  const order = (printLocations: string[]) => {
    const pricing = quoteHoodieSpecial({
      quantity: 50,
      colorName: "Sport Grey",
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
        garmentColor: "Sport Grey",
        printLocations,
        inkColors: "2 colors",
        sizeBreakdown: MIXED,
        specialOrder: false,
        specialOrderNotes: "",
        promo: HOODIE_SPECIAL.id,
        promoName: HOODIE_SPECIAL.name,
        supplier: {
          source: "S&S Activewear",
          productName: "Hoodie Special (Classic Hoodie)",
          catalogStyle: HOODIE_SPECIAL.catalogStyle,
          colorName: "Sport Grey",
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
    assert.match(plan.nickname, /GS-20261123-TEST1 - 50 Hoodie Special \(Classic Hoodie\)/);
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
  });
});
