import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSignsDesign, type SignsDesign } from "../lib/signs";
import { quoteSignsCart } from "../lib/signs-cart";
import { buildSignsPayloadParts } from "../lib/signs-payload";
import { repriceSigns } from "../lib/signs-repricing";
import { buildPrintavoQuotePlan } from "../lib/printavo";

/**
 * The server prices signs and banners; the browser only proposes.
 *
 * ── WHY, WHEN NOTHING AUTO-BILLS ──────────────────────────────────────────
 * Stickers were repriced because a payment link is raised unattended. Signs
 * and banners never get that link — but their figures land as Printavo LINE
 * ITEMS on the quote the shop invoices from, and the by-hand review reads
 * the very numbers the browser sent. A tampered payload does not look
 * tampered; it looks priced. Same three causes as the sticker repricing
 * note lists: a stale page, an edited total, a real engine disagreement.
 *
 * ── THE METHOD: RE-SYNTHESIS ──────────────────────────────────────────────
 * Each design carries `spec` — its raw pricing inputs. The server rebuilds
 * the designs and pushes them through the SAME buildSignsPayloadParts +
 * quoteSignsCart the browser used. One construction, so the display is
 * re-derived from the same spec as the charge: a payload whose prose says
 * "quantity 100" while its spec says 1 comes out saying — and costing — 1.
 *
 * ── THE PROOF NO HONEST PRICE MOVES ───────────────────────────────────────
 * The equivalence matrix below runs real payloads straight back through the
 * repricer and asserts every figure identical. That, plus the full suite
 * (the 120-row price sheet included) passing unchanged with the repricer
 * wired into the route, is the in-repo evidence. The out-of-repo evidence
 * is Gabe's owed reconciliation (HANDOFF: one yard-sign order and one
 * two-design order against the Printavo invoice, to the cent) — per
 * AGENTS.md, a pricing change ends there, not here.
 */

function design(overrides: Partial<SignsDesign> = {}) {
  return createSignsDesign({
    productId: "vinyl-banner",
    quantity: 1,
    customWidthInches: 72,
    customHeightInches: 36,
    material: "13 oz Scrim Vinyl",
    finishing: "Hemmed + Grommets",
    ...overrides,
  });
}

const YARD = {
  productId: "yard-sign",
  quantity: 10,
  material: "Coroplast",
  finishing: "Signs Only",
  customWidthInches: 0,
  customHeightInches: 0,
} as const;

function payloadFor(designs: SignsDesign[]) {
  return {
    customer: { customerName: "Dana", email: "dana@example.com" },
    production: { deliveryMethod: "Pickup" },
    ...buildSignsPayloadParts(designs, quoteSignsCart(designs)),
  } as Record<string, unknown>;
}

describe("an honest payload comes back to the cent", () => {
  const MATRIX: Array<[string, SignsDesign[]]> = [
    ["one banner", [design()]],
    ["ten yard signs", [design(YARD)]],
    ["a two-design signs cart", [design(YARD), design({ productId: "rigid-sign", customWidthInches: 36, customHeightInches: 24, material: 'PVC 1/8"', finishing: "Drilled Holes" })]],
    ["a banners cart with add-ons", [design({ bannerAddOns: ["polePockets", "windSlits"] }), design({ quantity: 2 })]],
    ["the no-hem credit", [design({ material: "18 oz Heavy Duty Vinyl", finishing: "No Hem or Grommets" })]],
    ["a double-sided 18 oz banner", [design({ material: "18 oz Heavy Duty Vinyl", doubleSided: true })]],
  ];

  for (const [name, designs] of MATRIX) {
    test(name, () => {
      const sent = payloadFor(designs);
      const result = repriceSigns(sent);

      assert.equal(result.repriced, true);
      assert.equal(result.mismatch, false, "an honest payload flagged as tampered");

      const before = sent.pricing as { total: number };
      const after = (result.order as { pricing: { total: number } }).pricing;
      assert.equal(after.total, before.total);

      // Per-design money identical too — the invoice is built from these.
      const sentDesigns = sent.signsDesigns as Array<{ lineTotal: number }>;
      const outDesigns = (result.order as { signsDesigns: Array<{ lineTotal: number }> }).signsDesigns;
      assert.deepEqual(
        outDesigns.map((entry) => entry.lineTotal),
        sentDesigns.map((entry) => entry.lineTotal)
      );
    });
  }
});

describe("a tampered payload is corrected, and the shop is told", () => {
  test("an edited total is restored to the engine's figure", () => {
    const sent = payloadFor([design()]);
    const honest = (sent.pricing as { total: number }).total;
    (sent.pricing as Record<string, unknown>).total = 20;

    const result = repriceSigns(sent);

    assert.equal(result.mismatch, true);
    assert.equal(result.serverTotal, honest);
    assert.equal((result.order as { pricing: { total: number } }).pricing.total, honest);
  });

  test("an edited per-design lineTotal cannot reach the invoice", () => {
    const sent = payloadFor([design(), design(YARD)]);
    const tampered = sent.signsDesigns as Array<Record<string, unknown>>;
    tampered[0].lineTotal = 1;

    const repriced = repriceSigns(sent).order as Record<string, unknown>;
    const plan = buildPrintavoQuotePlan({
      quoteNumber: "GS-RP-1",
      order: repriced,
    } as never) as never as {
      lineItems: Array<{ price: number; quantity: number }>;
      feeLineItems: Array<{ price: number }>;
    };

    const printavo =
      plan.lineItems.reduce((sum, li) => sum + li.price * li.quantity, 0) +
      plan.feeLineItems.reduce((sum, fee) => sum + fee.price, 0);
    const honest = quoteSignsCart([design(), design(YARD)]).total;

    assert.ok(Math.abs(printavo - honest) < 0.005, `Printavo got $${printavo}`);
  });

  test("prose and charge cannot disagree — both re-derive from the spec", () => {
    // The display-says-100-charge-says-1 shape. Spec says 1; the prose
    // claims 100 at a 100-unit price.
    const sent = payloadFor([design(YARD)]);
    const entry = (sent.signsDesigns as Array<Record<string, unknown>>)[0];
    entry.quantity = 100;
    entry.lineTotal = 1350;
    (sent.pricing as Record<string, unknown>).total = 1365;

    const out = repriceSigns(sent).order as {
      signsDesigns: Array<{ quantity: number }>;
      product: { quantity: number };
      pricing: { total: number };
    };

    assert.equal(out.signsDesigns[0].quantity, 10);
    assert.equal(out.product.quantity, 10);
    assert.equal(out.pricing.total, quoteSignsCart([design(YARD)]).total);
  });

  test("a claimed price on an unpriceable quote is refused, not believed", () => {
    const sent = payloadFor([design({ productId: "window-graphics" })]);
    (sent.pricing as Record<string, unknown>) = {
      total: 500,
      quoteRequired: false,
      note: "totally real price",
    };

    const result = repriceSigns(sent);

    assert.equal(result.mismatch, true);
    const pricing = (result.order as { pricing: { quoteRequired: boolean; total: number } }).pricing;
    assert.equal(pricing.quoteRequired, true);
    assert.equal(pricing.total, 0);
  });

  test("an honestly unpriceable quote passes quietly", () => {
    const sent = payloadFor([design({ productId: "window-graphics" })]);
    const result = repriceSigns(sent);

    assert.equal(result.mismatch, false);
    assert.equal(result.unpriceable, true);
  });
});

describe("what survives from the client, and what does not", () => {
  test("design ids survive — the artwork attachments are keyed on them", () => {
    const designs = [design(), design(YARD)];
    const sent = payloadFor(designs);
    const out = repriceSigns(sent).order as { signsDesigns: Array<{ id: string }> };

    assert.deepEqual(
      out.signsDesigns.map((entry) => entry.id),
      designs.map((entry) => entry.id)
    );
  });

  test("file names survive — the server cannot recompute an upload", () => {
    const withFile = design();
    withFile.artwork = { file: { name: "banner-art.pdf" } as never };
    const sent = payloadFor([withFile, design(YARD)]);
    const out = repriceSigns(sent).order as {
      signsDesigns: Array<{ fileName: string | null }>;
    };

    assert.deepEqual(
      out.signsDesigns.map((entry) => entry.fileName),
      ["banner-art.pdf", null]
    );
  });

  test("a payload without spec passes through untouched", () => {
    // An open tab from before spec existed. Its money was built by our own
    // bundle; refusing it would fail a real order over an upgrade.
    const sent = payloadFor([design()]);
    for (const entry of sent.signsDesigns as Array<Record<string, unknown>>) {
      delete entry.spec;
    }
    (sent.pricing as Record<string, unknown>).total = 999;

    const result = repriceSigns(sent);

    assert.equal(result.repriced, false);
    assert.equal((result.order as { pricing: { total: number } }).pricing.total, 999);
  });

  test("a sticker order passes through by construction", () => {
    const result = repriceSigns({ product: { type: "Custom Stickers" }, pricing: { total: 50 } });
    assert.equal(result.repriced, false);
  });
});

describe("the route actually calls it", () => {
  test("wired after repriceStickers, feeding the same shop-facing note", () => {
    const route = readFileSync(
      new URL("../app/api/quote/route.ts", import.meta.url),
      "utf8"
    );

    assert.match(route, /const signsPriced = repriceSigns\(priced\.order\)/);
    assert.match(route, /const pricedOrder = signsPriced\.order/);
    // The mismatch note and the console line read whichever flow repriced.
    assert.match(route, /describeRepricing\(priceCheck\)/);
  });
});
