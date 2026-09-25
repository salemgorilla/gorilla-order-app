/**
 * A TICKED ADD-ON IS A ROW ON THE QUOTE, AND NEVER A CHARGE.
 *
 * ── THE REPORT ────────────────────────────────────────────────────────────
 * Gabe, 2026-09-25, after a test order (GS-20260925-A87QL): "I checked to
 * add a banner but when I completed the quote, neither the banner nor the
 * cost was added to the bill."
 *
 * Both halves were true and only one was a defect. The request DID arrive —
 * a browser drive confirmed `order.addOns` reached the server intact, with
 * the right label and $177 — and it was written into the Printavo customer
 * note. But a note is not something anyone reads off an invoice at a
 * glance, and the shop had no row to work from.
 *
 * ── THE LINE THIS SUITE DEFENDS ───────────────────────────────────────────
 * createPaymentRequest sends NO amount, so Printavo bills its own
 * `amountOutstanding` — the sum of these rows. Stickers, signs and banners
 * auto-bill with no human in the loop. So pricing this row is not "showing
 * the banner on the quote": it is charging a card $177 for a banner with no
 * artwork, no confirmed size and no proof, scoped by one checkbox.
 *
 * Zero-priced, the row is visible, itemised and filterable, and the
 * customer is charged exactly what they were quoted.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildPrintavoQuotePlan } from "../lib/printavo";
import { SKU } from "../lib/sku";

type Line = {
  description?: string;
  itemNumber?: string;
  price?: unknown;
  taxed?: boolean;
};

/** A priced sticker order, with and without the banner ticked. */
function stickerOrder(addOns: unknown[]) {
  return {
    customer: { customerName: "Test", email: "t@example.com" },
    product: {
      type: "Custom Stickers",
      quantity: 100,
      size: '3" x 3"',
      material: "Gloss White Vinyl",
      finish: "Gloss",
      shape: "Die Cut",
    },
    items: [],
    production: {},
    pricing: { total: 99, stickerPrice: 84, setupPrice: 15, shippingPrice: 0 },
    addOns,
    addOnsNote: "",
  };
}

const BANNER = {
  id: "banner-3x6",
  label: "3ft x 6ft vinyl banner, hemmed with grommets",
  amount: 177,
  quoteRequired: false,
};

type Plan = {
  customerNote: string;
  lineItems: Line[];
  feeLineItems: Line[];
  shippingLineItem: Line | null;
  tags: string[];
};

function plan(addOns: unknown[]): Plan {
  return buildPrintavoQuotePlan({
    quoteNumber: "GS-TEST",
    order: stickerOrder(addOns),
    artworkAnalysis: null,
  } as never) as never as Plan;
}

/**
 * EVERY row the quote will carry, in one list.
 *
 * The plan splits them three ways — product, fees, shipping — and
 * createPrintavoQuote concatenates all three into the invoice. Summing only
 * one of them would miss the very row under test, which is what the first
 * version of this suite did: it looked in `lineItems`, found nothing, and
 * reported a bug that was not there.
 */
const allRows = (p: Plan): Line[] => [
  ...p.lineItems,
  ...p.feeLineItems,
  ...(p.shippingLineItem ? [p.shippingLineItem] : []),
];

const priceOf = (l: Line) => Number(l.price ?? 0);
const sum = (lines: Line[]) => lines.reduce((t, l) => t + priceOf(l), 0);

describe("the add-on is a real row now", () => {
  test("it appears as a line item, not only in the note", () => {
    const row = allRows(plan([BANNER])).find(
      (l) => l.itemNumber === SKU.ADD_ON_REQUEST
    );

    assert.ok(row, "the ticked add-on produced no line item");
    assert.match(String(row.description), /3ft x 6ft vinyl banner/);
  });

  test("the description carries the figure the shop needs", () => {
    const row = allRows(plan([BANNER])).find(
      (l) => l.itemNumber === SKU.ADD_ON_REQUEST
    );

    assert.match(String(row?.description), /177\.00/);
    assert.match(String(row?.description), /confirm the spec/i);
  });

  test("a hand-quoted add-on says so instead of inventing a figure", () => {
    const row = allRows(
      plan([
        { id: "window-decal", label: "Window or door decal", amount: 0, quoteRequired: true },
      ])
    ).find((l) => l.itemNumber === SKU.ADD_ON_REQUEST);

    assert.match(String(row?.description), /priced by the shop/i);
    assert.doesNotMatch(String(row?.description), /\$0\.00/);
  });

  test("it is still in the note, for anyone reading that instead", () => {
    assert.match(plan([BANNER]).customerNote, /3ft x 6ft vinyl banner/);
  });
});

describe("THE INVARIANT — an add-on cannot change what is charged", () => {
  test("the row is priced at zero", () => {
    const row = allRows(plan([BANNER])).find(
      (l) => l.itemNumber === SKU.ADD_ON_REQUEST
    );

    assert.equal(
      priceOf(row as Line),
      0,
      "a priced add-on row auto-charges a card for an unspecced item"
    );
  });

  test("the sum of every line is identical with and without it", () => {
    /**
     * THE ONE THAT MATTERS. createPaymentRequest passes no amount, so this
     * sum IS the number a customer's card is charged. If ticking a checkbox
     * moves it, the app is selling an unspecced banner automatically.
     */
    const without = sum(allRows(plan([])));
    const withIt = sum(allRows(plan([BANNER])));

    assert.equal(withIt, without, "ticking an add-on moved the billed total");
  });

  test("three add-ons still move nothing", () => {
    const many = [
      BANNER,
      { id: "window-decal", label: "Window or door decal", amount: 0, quoteRequired: true },
      { id: "apparel-screenprint", label: "Screen printed tees or hoodies", amount: 0, quoteRequired: true },
    ];

    assert.equal(sum(allRows(plan(many))), sum(allRows(plan([]))));
    assert.equal(
      allRows(plan(many)).filter((l) => l.itemNumber === SKU.ADD_ON_REQUEST).length,
      3
    );
  });

  test("the row is untaxed — nothing was sold", () => {
    const row = allRows(plan([BANNER])).find(
      (l) => l.itemNumber === SKU.ADD_ON_REQUEST
    );

    assert.equal(row?.taxed, false, "tax on a zero row implies it is part of the sale");
  });

  test("no add-ons means no add-on rows at all", () => {
    assert.equal(
      allRows(plan([])).some((l) => l.itemNumber === SKU.ADD_ON_REQUEST),
      false
    );
  });
});
