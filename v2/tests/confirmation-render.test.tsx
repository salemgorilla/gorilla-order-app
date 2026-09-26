import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import QuoteConfirmationScreen from "../features/QuoteConfirmation";
import { defaultApparelQuote } from "../lib/apparel";
import { createStickerItem, defaultOrder } from "../lib/order";
import { chargeableTotal } from "../lib/tax";
import { repriceStickers } from "../lib/sticker-repricing";
import { repriceSigns } from "../lib/signs-repricing";

/**
 * The screen the customer holds, rendered — not read.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * `tests/confirmation-total.test.ts` pins the ARITHMETIC behind this screen
 * and says so in its own header: "the component has no test renderer; the
 * behaviour was verified by driving the real flow in Chromium." Every defect
 * this screen has shipped lived in the gap that leaves — not in the maths,
 * but in which figure got handed to it:
 *
 *   - the signs branch rendered `signsTotal` RAW, pre-tax, one second after
 *     a review card that said $188.06 with a tax line;
 *   - the sticker branch read `order.pricing` — the browser's state — while
 *     Printavo emailed a payable link for the SERVER's repriced figure.
 *
 * Both were correct arithmetic on the wrong input, so both passed a suite
 * that only checked the arithmetic. This renders the real component and
 * reads the real characters, so the next one of that shape fails here.
 *
 * ── THE ONE ASSERTION ─────────────────────────────────────────────────────
 * For every row of the matrix: **the figure printed on this screen equals
 * what the card is actually charged**, where "actually charged" is
 * `chargeableTotal()` — the single derivation lib/auto-bill.ts reads to pick
 * the ceiling. One number, two surfaces, no third opinion.
 *
 * The server pricing is produced by the REAL repricing functions, not typed
 * in, so a change to either reprice path moves both sides of the comparison
 * together and this test keeps meaning what it says.
 *
 * ── WHAT IT CANNOT DO ─────────────────────────────────────────────────────
 * `renderToStaticMarkup` runs no effects and takes no clicks. It proves what
 * this screen PRINTS, which is the thing the customer screenshots. It does
 * not replace tests/e2e/smoke.mjs, and it certainly does not replace the
 * Printavo reconciliation.
 */

/**
 * The money inside ONE marked node — `data-money="order-total"` is the
 * headline, `data-money="quoted-before"` is the stale figure in the
 * correction notice.
 *
 * WHY NOT A SET OVER THE WHOLE PAGE, WHICH IS WHAT THIS FILE SHIPPED:
 * `moneyOn(html).includes(charged)` cannot tell the headline from the
 * notice. An adversarial review swapped the two — stale figure as the
 * headline, charged figure buried in "you were seeing $…" — and all 9 tests
 * here plus all 2,467 in the suite stayed green, while the screen was
 * showing the customer a number they are not being billed. That is the
 * precise defect this file was written for.
 *
 * Deliberately a regex over the rendered HTML rather than a DOM parse: this
 * suite has no jsdom, adding one to read one attribute is a dependency for
 * a string search, and `renderToStaticMarkup` output is not user-authored.
 */
function moneyInNode(html: string, name: string): number | null {
  const match = html.match(
    new RegExp(`data-money="${name}"[^>]*>([\\s\\S]*?)</(?:p|span)>`)
  );
  if (!match) return null;

  const money = match[1].replace(/<[^>]+>/g, "").match(/([\d,]+\.\d{2})/);
  return money ? Number(money[1].replace(/,/g, "")) : null;
}

/** Every dollar figure on the rendered screen, in order, as numbers. */
function moneyOn(html: string): number[] {
  const text = html.replace(/<[^>]+>/g, " ");
  return [...text.matchAll(/\$\s*([\d,]+\.\d{2})/g)].map((match) =>
    Number(match[1].replace(/,/g, ""))
  );
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

type RenderOverrides = Partial<Parameters<typeof QuoteConfirmationScreen>[0]>;

function render(overrides: RenderOverrides): string {
  return renderToStaticMarkup(
    <QuoteConfirmationScreen
      quoteConfirmation={null}
      order={{} as never}
      isApparelSubmitted={false}
      isApparelRequest={false}
      apparelEstimateBasis="exact"
      isSignsSubmitted={false}
      signsQuote={{ designs: [] } as never}
      signsTotal={null}
      signsFeeTotal={0}
      apparelQuote={defaultApparelQuote}
      selectedGarmentLabel="Basic Tee"
      selectedSsColor={null}
      apparelPricing={
        {
          garmentUnitPrice: 0,
          garmentMarkup: 1,
          garmentTotal: 0,
          printUnitPrice: 0,
          printTotal: 0,
          setupTotal: 0,
          total: 0,
          unitPrice: 0,
          locationCount: 0,
          inkColorCount: 0,
          colorsByLocation: [],
          underbaseFeePerPiece: 0,
          lines: [],
        } as never
      }
      unitPrice={0}
      copyStatus="idle"
      emailHref="mailto:shop@example.com"
      onCopy={() => {}}
      onStartNew={() => {}}
      onBackToBuilder={() => {}}
      {...overrides}
    />
  );
}

/**
 * A sticker order in the shape `buildQuotePayload` sends.
 *
 * Built from the REAL `defaultOrder` and `createStickerItem`, with `product`
 * synthesised the way app/page.tsx:2244 synthesises it — spread of the first
 * item, the run's total quantity, the design count. Hand-rolling this shape
 * is how a fixture ends up proving something about a payload the app never
 * sends; AGENTS.md is explicit that dropping `product` makes isStickerOrder()
 * return false and stickers silently stop checking out, so the fixture has
 * to carry what the real one carries.
 */
function stickerOrder(input: {
  items: Array<{ size: string; quantity: number; material?: string; shape?: string }>;
  deliveryMethod?: string;
  /** What the browser BELIEVED, when it disagrees with the server. */
  clientTotal?: number;
}) {
  const items = input.items.map((item) =>
    createStickerItem({
      size: item.size,
      quantity: item.quantity,
      widthInches: Number.parseFloat(item.size) || 3,
      heightInches: Number.parseFloat(item.size) || 3,
      ...(item.material ? { material: item.material } : {}),
      ...(item.shape ? { shape: item.shape } : {}),
    })
  );

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    ...defaultOrder,
    customer: {
      ...defaultOrder.customer,
      customerName: "Test Customer",
      email: "test@example.com",
    },
    items,
    production: {
      ...defaultOrder.production,
      needBy: "2026-10-10",
      deliveryMethod: input.deliveryMethod ?? "Pickup",
    },
    pricing: {
      ...defaultOrder.pricing,
      total: input.clientTotal ?? 0,
    },
    product: {
      ...items[0],
      quantity: totalQuantity,
      designCount: items.length,
    },
  } as unknown as Record<string, unknown>;
}

/** Reprice exactly as app/api/quote does, and hand back both halves. */
function asServerWould(order: Record<string, unknown>, discountCodes?: readonly never[]) {
  const repriced = repriceStickers(order, discountCodes ? { discountCodes } : {});
  return {
    order: repriced.order as Record<string, unknown>,
    serverPricing: (repriced.order as { pricing: Record<string, number> }).pricing,
  };
}

describe("the figure on the confirmation screen is the figure that bills", () => {
  const rows: Array<{
    name: string;
    build: () => { order: Record<string, unknown>; props: RenderOverrides };
  }> = [
    {
      name: "one design, pickup",
      build: () => {
        const order = stickerOrder({ items: [{ size: '3"', quantity: 100 }] });
        const { order: server, serverPricing } = asServerWould(order);
        return {
          order: server,
          props: {
            order: server as never,
            quoteConfirmation: {
              quoteNumber: "GS-20260925-AAAAA",
              serverPricing,
            } as never,
          },
        };
      },
    },
    {
      name: "a multi-design cart",
      build: () => {
        const order = stickerOrder({
          items: [
            { size: '3"', quantity: 100 },
            { size: '4"', quantity: 250, material: "Gloss" },
            { size: '2"', quantity: 500, shape: "Square" },
          ],
        });
        const { order: server, serverPricing } = asServerWould(order);
        return {
          order: server,
          props: {
            order: server as never,
            quoteConfirmation: {
              quoteNumber: "GS-20260925-BBBBB",
              serverPricing,
            } as never,
          },
        };
      },
    },
    {
      name: "a cart with shipping, not pickup",
      build: () => {
        const order = stickerOrder({
          items: [
            { size: '3"', quantity: 100 },
            { size: '5"', quantity: 300 },
          ],
          deliveryMethod: "Ship",
        });
        const { order: server, serverPricing } = asServerWould(order);
        return {
          order: server,
          props: {
            order: server as never,
            quoteConfirmation: {
              quoteNumber: "GS-20260925-CCCCC",
              serverPricing,
            } as never,
          },
        };
      },
    },
    {
      name: "an order big enough to take a 50% deposit",
      build: () => {
        // Over FULL_PAYMENT_CEILING, where auto-bill stops charging in full.
        // The screen must still print the WHOLE order's charge: the deposit
        // is how much is collected today, not what the job costs.
        const order = stickerOrder({
          items: [
            { size: '6"', quantity: 5000 },
            { size: '4"', quantity: 5000 },
          ],
        });
        const { order: server, serverPricing } = asServerWould(order);
        return {
          order: server,
          props: {
            order: server as never,
            quoteConfirmation: {
              quoteNumber: "GS-20260925-DDDDD",
              serverPricing,
            } as never,
          },
        };
      },
    },
  ];

  for (const row of rows) {
    test(row.name, () => {
      const { order, props } = row.build();
      const html = render(props);
      const charged = chargeableTotal(order as never);
      const headline = moneyInNode(html, "order-total");

      assert.ok(charged !== null, "chargeableTotal could not derive a figure");
      assert.ok(
        headline !== null,
        `no [data-money="order-total"] node on the screen — the hook the ` +
          `headline assertion reads was renamed or dropped`
      );
      assert.strictEqual(
        headline,
        Number(charged.toFixed(2)),
        `the HEADLINE says $${headline?.toFixed(2)} and the card is charged ` +
          `$${charged.toFixed(2)} (every figure on screen: [${moneyOn(html).join(", ")}])`
      );
    });
  }
});

describe("the two inputs this screen has been given wrong", () => {
  test("the SERVER's figure wins over the tab's, and the move is said out loud", () => {
    // The live defect: a tab opened before a re-rate and submitted after.
    // The route logs "PRICE MISMATCH … Charging the server figure" and
    // Printavo bills it; this screen used to print the tab's number above a
    // pay button asking for the other one.
    const order = stickerOrder({ items: [{ size: '3"', quantity: 100 }], clientTotal: 53.8 });
    const { order: server, serverPricing } = asServerWould(order);

    const html = render({
      order: { ...server, pricing: { ...(server.pricing as object), total: 53.8 } } as never,
      quoteConfirmation: {
        quoteNumber: "GS-20260925-EEEEE",
        serverPricing,
      } as never,
    });

    const charged = chargeableTotal(server as never);
    assert.ok(charged !== null);

    const headline = moneyInNode(html, "order-total");
    const before = moneyInNode(html, "quoted-before");

    // BOTH figures are pinned to their own node, and to each other. Pinning
    // only the headline would catch the swap that found this; pinning both
    // fixes the MEANING of each, so neither can drift into the other's slot.
    assert.strictEqual(
      headline,
      Number(charged.toFixed(2)),
      "the headline is showing the tab's stale figure, not the server's"
    );
    assert.strictEqual(
      before,
      53.8,
      "the correction notice is not quoting the figure the customer actually saw"
    );
    assert.notStrictEqual(
      headline,
      before,
      "the fixture cannot prove anything — the stale and charged figures are equal"
    );
    assert.match(
      textOf(html),
      /prices changed while you were building this quote/i,
      "the price moved and the screen did not say so"
    );
  });

  test("a signs total is printed WITH tax, and the fee is not taxed", () => {
    // $162 of banner + $15 setup, and THREE figures this screen has printed:
    //
    //   $177.00  the pre-tax total. The original defect — printed one second
    //            after a review card showing tax, so it read as a discount
    //            until the invoice arrived.
    //   $188.06  tax on the whole $177, fee included. What it printed after
    //            the first fix, and 94c too much: a setup fee is not taxable
    //            in MA (#185, #188).
    //   $187.13  $162 x 1.0625 + $15. What Printavo bills.
    //
    // Worth spelling out because $188.06 is the number the old doc comments
    // name, and writing this test from those comments rather than from the
    // arithmetic is how it first asserted the wrong one.
    const html = render({
      isSignsSubmitted: true,
      signsTotal: 177,
      signsFeeTotal: 15,
      signsQuote: { designs: [] } as never,
      order: {
        ...defaultOrder,
        customer: {
          ...defaultOrder.customer,
          customerName: "Test Customer",
          email: "test@example.com",
        },
        production: { ...defaultOrder.production, needBy: "2026-10-10" },
        product: { type: "Banner" },
        pricing: { ...defaultOrder.pricing, total: 177 },
      } as never,
      quoteConfirmation: { quoteNumber: "GS-20260925-FFFFF" } as never,
    });

    const headline = moneyInNode(html, "order-total");
    const shown = moneyOn(html);

    assert.strictEqual(
      headline,
      187.13,
      `the signs headline says $${headline?.toFixed(2)} (all figures: [${shown.join(", ")}])`
    );
    assert.ok(
      !shown.includes(177.0),
      "the pre-tax figure is on the screen — that is the original defect"
    );
    assert.ok(
      !shown.includes(188.06),
      "the setup fee is being taxed — 94c too much on this banner"
    );
  });
});

describe("apparel is never given a price on this screen", () => {
  test("the estimate is not called a price, and carries no payable figure", () => {
    // AGENTS.md: apparel is an ESTIMATE off a supplier catalogue that can be
    // stale, and it must not acquire a payment link. The word matters as
    // much as the number.
    const html = render({
      isApparelSubmitted: true,
      apparelQuote: { ...defaultApparelQuote, quantity: 24 },
      order: {
        ...defaultOrder,
        customer: {
          ...defaultOrder.customer,
          customerName: "Test Customer",
          email: "test@example.com",
        },
        production: { ...defaultOrder.production, needBy: "2026-10-10" },
        product: { type: "T-Shirts & Apparel", garmentType: "T-Shirts", quantity: 24 },
        pricing: { ...defaultOrder.pricing, total: 0 },
      } as never,
      quoteConfirmation: { quoteNumber: "GS-20260925-GGGGG" } as never,
    });

    const text = textOf(html).toLowerCase();
    assert.ok(!/\bthe price is\b|\byour price\b/.test(text), "apparel called it a price");
    assert.ok(
      !/pay now|pay online|payment link/.test(text),
      "apparel must not acquire a payment link"
    );
  });
});

describe("the harness itself", () => {
  test("it is rendering the real component, not an empty string", () => {
    // The failure this repo has been bitten by: a check that matches
    // nothing and passes forever. A render that silently produced "" would
    // make every assertion above vacuously true.
    const order = stickerOrder({ items: [{ size: '3"', quantity: 100 }] });
    const { order: server, serverPricing } = asServerWould(order);
    const html = render({
      order: server as never,
      quoteConfirmation: { quoteNumber: "GS-20260925-HHHHH", serverPricing } as never,
    });

    assert.ok(html.length > 2000, `rendered only ${html.length} characters`);
    assert.match(textOf(html), /GS-20260925-HHHHH/, "the quote number is not on the screen");
    assert.ok(moneyOn(html).length >= 2, "fewer money figures than any real screen has");
  });

  test("repriceSigns is reachable from here too", () => {
    // Imported so the signs row above can be extended to a real reprice
    // without discovering then that the module does not load under tsx.
    assert.equal(typeof repriceSigns, "function");
  });
});
