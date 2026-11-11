import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildQuoteEmail } from "../lib/email";
import { buildPrintavoQuotePlan } from "../lib/printavo";
import { achRefund } from "../lib/retail";
import { repriceStickers } from "../lib/sticker-repricing";

/**
 * THE BANK-TRANSFER REFUND, ON EVERY SURFACE THAT SHOULD CARRY IT.
 *
 * Gabe, 2026-11-11, option A: every price is retail (+3%), no card fee ever,
 * and a customer who pays by bank transfer (ACH) is refunded the 3% afterwards
 * — by the shop, so the figure has to be written where the shop reads the
 * order. Three surfaces carry it and must agree to the cent: the shop email,
 * the Printavo customer note and the screens (QuoteTotals.achRefund). A fourth
 * truth is the negative: nothing priced, nothing to refund, and no fee line
 * anywhere.
 */

const stickerOrder = () => ({
  customer: { customerName: "Dana", email: "dana@example.com" },
  production: { deliveryMethod: "Pickup", needBy: "2026-12-15" },
  product: { type: "Custom Stickers", quantity: 100 },
  items: [
    {
      id: "d1",
      quantity: 100,
      widthInches: 3,
      heightInches: 3,
      material: "Gloss White Vinyl",
      shape: "Circle",
      artwork: { file: { name: "a.png" } },
    },
  ],
  pricing: { total: 0 },
});

const priced = () => repriceStickers(stickerOrder() as never).order;

describe("a priced sticker order", () => {
  const order = priced();
  const total = Number((order.pricing as Record<string, number>).total);
  const refund = achRefund(total);

  test("the reference order is $87.55 retail and refunds $2.55 to a bank-transfer payer", () => {
    assert.equal(total, 87.55);
    assert.equal(refund, 2.55);
  });

  test("the shop email says what to refund, from the same figure", () => {
    const { text, html } = buildQuoteEmail({
      quoteNumber: "GS-T1",
      receivedAt: new Date().toISOString(),
      order,
      artworkAnalysis: null,
    } as never);

    for (const body of [text, html]) {
      assert.match(body, /If paid by bank transfer/);
      assert.ok(body.includes(`$${refund.toFixed(2)}`), "the refund figure is missing");
      assert.match(body, /there is no card fee/i);
    }
  });

  test("the Printavo customer note says it, and the tax-inclusive total the reconciler reads is untouched", () => {
    const plan = buildPrintavoQuotePlan({ quoteNumber: "GS-T1", order, artworkAnalysis: null } as never);

    assert.ok(
      plan.customerNote.includes(
        `Pay by bank transfer (ACH) and save $${refund.toFixed(2)}: refund the 3% after payment clears.`
      )
    );
    // The reconciler reads "Total:" and "Total incl. tax:" off this note; the
    // new line must not start with either.
    assert.match(plan.customerNote, /^Total: \$87\.55$/m);
    // Tax is 6.25% on the stickers only ($72.10 -> $4.51); setup is untaxed.
    assert.match(plan.customerNote, /^Total incl\. tax: \$92\.06$/m);
    assert.doesNotMatch(plan.customerNote, /^Total.*bank transfer/im);
  });

  test("nothing anywhere is a card fee, surcharge or processing charge", () => {
    const { text } = buildQuoteEmail({
      quoteNumber: "GS-T1",
      receivedAt: new Date().toISOString(),
      order,
      artworkAnalysis: null,
    } as never);
    const plan = buildPrintavoQuotePlan({ quoteNumber: "GS-T1", order, artworkAnalysis: null } as never);
    const rows = [...plan.feeLineItems, ...plan.lineItems].map((row) => `${row.description} ${row.itemNumber}`);

    for (const haystack of [...rows, plan.customerNote]) {
      assert.doesNotMatch(haystack, /card (processing )?fee|processing fee|surcharge/i);
    }
    // The email itself says "there is no card fee" — so it is the OTHER words
    // for a fee that must be absent.
    assert.doesNotMatch(text, /card processing|processing fee|surcharge/i);
  });
});

describe("what carries no price carries no refund", () => {
  test("a paper request prints no refund line anywhere", () => {
    const paper = {
      customer: { customerName: "Dana", email: "dana@example.com", company: "", phone: "" },
      production: { deliveryMethod: "Pickup", needBy: "2027-01-15", deadlineType: "Flexible" },
      product: {
        type: "Paper Printing",
        paperProductId: "business-cards",
        size: '3.5" x 2"',
        stock: "14pt Matte",
        quantity: 500,
        sides: "Double-sided",
        finishing: [],
        paperNotes: "",
      },
      pricing: { total: 0, quoteRequired: true },
    };
    const { text } = buildQuoteEmail({
      quoteNumber: "GS-T2",
      receivedAt: new Date().toISOString(),
      order: paper,
      artworkAnalysis: null,
    } as never);
    const plan = buildPrintavoQuotePlan({ quoteNumber: "GS-T2", order: paper, artworkAnalysis: null } as never);

    assert.doesNotMatch(text, /bank transfer/i);
    assert.doesNotMatch(plan.customerNote, /bank transfer/i);
  });

  test("a zero or missing total refunds nothing", () => {
    assert.equal(achRefund(0), 0);
    assert.equal(achRefund(undefined as never), 0);
  });
});

describe("the screens", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  test("the note renders the figure it is handed, and nothing for zero", () => {
    const source = read("../features/BankTransferNote.tsx");

    assert.match(source, /refund > 0/);
    assert.match(source, /refund\.toFixed\(2\)/);
    assert.match(source, /Pay by bank transfer \(ACH\) and we refund/);
    // Phrased as a saving, never as a charge on the other method. Only the
    // rendered JSX is checked: the header comment explains why there is no fee.
    const rendered = source.slice(source.indexOf("return ("));
    assert.doesNotMatch(rendered, /card fee|surcharge|extra for card/i);
  });

  test("the confirmation and the review card both show it, from QuoteTotals", () => {
    const confirmation = read("../features/QuoteConfirmation.tsx");
    const review = read("../features/QuoteReviewCard.tsx");

    assert.match(confirmation, /<BankTransferNote refund=\{stickerTotals\.achRefund\} \/>/);
    assert.match(confirmation, /<BankTransferNote refund=\{signsTotals\.achRefund\} \/>/);
    assert.match(review, /<BankTransferNote refund=\{stickerTotals\.achRefund\} \/>/);
    assert.match(review, /<BankTransferNote refund=\{signsTotals\.achRefund\} \/>/);
  });
});
