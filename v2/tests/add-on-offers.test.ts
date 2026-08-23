import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ADD_ON_CATALOG,
  getAddOnOffers,
  summariseAddOns,
  toAddOn,
} from "../lib/addons";
import { STICKER_SETUP_FEE, getStickerPrice } from "../lib/pricing";
import { asciiSafe } from "../lib/printavo";
import { buildQuoteEmail } from "../lib/email";

/**
 * "Add to this quote" — the catalogue nothing was checking.
 *
 * lib/addons.ts opens by naming TWO rules as load-bearing:
 *
 *   1. Prices are COMPUTED by calling the real engines, never typed in here.
 *   2. Labels must be plain ASCII and must NOT contain ": ".
 *
 * Both are real. Rule 2 is not style: lib/email.ts renders every row as
 * `label: value` and htmlRows splits it on the FIRST ": ", so a colon in a
 * label puts half the label in the value column and the price somewhere the
 * shop does not read. lib/printavo.ts runs asciiSafe over the note, which
 * strips anything left outside \x20-\x7E — so "Café" arrives as "Caf" and a
 * `×` or a `3″` quietly loses a character.
 *
 * The file had NO tests. Both rules held by the author's care alone, in a
 * catalogue whose whole job is to be edited when the shop wants to sell
 * something new. AGENTS.md names this exact situation: "the rules nothing
 * could test were the ones with gaps."
 *
 * ── AND ONE OF THEM HAD ALREADY OPENED ────────────────────────────────────
 * bannerPrice guards its engine call — `!priceable || total <= 0` falls back
 * to a hand quote rather than offering a confident $0. stickerPackPrice, ten
 * lines below it, guarded nothing.
 *
 * Copying the banner's test would not have helped: getStickerPrice adds
 * STICKER_SETUP_FEE, so a sticker offer can never reach $0 however badly the
 * material prices. It would offer 100 stickers for $25 — the setup fee alone,
 * which app/api/quote/route.ts names as "not a price to charge against
 * unattended" and now refuses to auto-bill.
 *
 * The engine reaches $0 of material whenever it cannot resolve the size:
 * area is width x height, parseSizeNumbers finds nothing in a label it does
 * not recognise, and 0 x rate x quantity is 0 with no complaint. Verified by
 * calling it: getStickerPrice(100, "Gloss White Vinyl", "Gloss", "") returns
 * 25.00 — a hundred stickers for the setup fee.
 */

describe("rule 2: labels survive the transports that carry them", () => {
  test("no label contains the separator the email splits on", () => {
    for (const offer of ADD_ON_CATALOG) {
      assert.equal(
        offer.label.includes(": "),
        false,
        `"${offer.label}" would be cut in half by htmlRows`
      );
    }
  });

  test("every label reaches Printavo unchanged", () => {
    // The real function, not a restatement of its character class.
    for (const offer of ADD_ON_CATALOG) {
      assert.equal(
        asciiSafe(offer.label),
        offer.label,
        `"${offer.label}" is altered on the way into the note`
      );
    }
  });

  test("the detail lines too — they are shown to the customer", () => {
    for (const offer of ADD_ON_CATALOG) {
      assert.equal(asciiSafe(offer.detail), offer.detail);
    }
  });

  test("a label survives the shop email whole", () => {
    // Driven through the real builder rather than asserted about in the
    // abstract: this is the render that would split it.
    const email = buildQuoteEmail({
      quoteNumber: "GS-TEST",
      receivedAt: new Date("2026-08-23T15:00:00Z").toISOString(),
      order: {
        customer: {},
        product: { type: "Custom Stickers", quantity: 100 },
        production: {},
        pricing: { total: 53.8 },
        addOns: ADD_ON_CATALOG.map(toAddOn),
      },
      artworkAnalysis: null,
    } as never);

    for (const offer of ADD_ON_CATALOG) {
      assert.ok(
        email.text.includes(`${offer.label}: `),
        `"${offer.label}" is not a readable row`
      );
    }
  });

  test("the specific characters the rule exists to keep out", () => {
    // 3" and 3ft x 6ft are written the long way ON PURPOSE — a straight
    // quote is fine, but the inch mark and the multiplication sign are not.
    for (const offer of ADD_ON_CATALOG) {
      assert.doesNotMatch(offer.label, /[×✕✖″′—–“”‘’…]/);
    }
  });
});

describe("rule 1: prices come from the engines", () => {
  test("the sticker packs equal a live engine call", () => {
    // Not "equals 53.80". A literal here would be the typed-in price the
    // rule forbids, and it would stop moving when the rate does.
    //
    // The size is restated here deliberately, and that is the second thing
    // this checks: the LABEL says "3 inch", so the price has to be a 3-inch
    // price. If someone changes the size the offer is priced at without
    // changing what the offer says it is, this is what notices.
    for (const [id, quantity] of [
      ["stickers-100", 100],
      ["stickers-250", 250],
    ] as const) {
      const offer = ADD_ON_CATALOG.find((entry) => entry.id === id);
      assert.ok(offer, `${id} is gone from the catalogue`);

      assert.equal(
        offer.price().amount,
        getStickerPrice(quantity, "Gloss White Vinyl", "Gloss", '3"')
      );
    }
  });

  test("a hand-quoted offer carries no number at all", () => {
    // $0 next to "Window or door decal" reads as free.
    for (const offer of ADD_ON_CATALOG) {
      const { amount, quoteRequired } = offer.price();
      if (quoteRequired) assert.equal(amount, 0);
    }
  });
});

describe("no offer is ever a confident nearly-nothing", () => {
  test("a priced offer is never zero or negative", () => {
    for (const offer of ADD_ON_CATALOG) {
      const { amount, quoteRequired } = offer.price();
      if (!quoteRequired) {
        assert.ok(amount > 0, `${offer.id} offers ${amount} as a firm price`);
      }
    }
  });

  test("a sticker pack always carries real material, not just the setup fee", () => {
    /**
     * The assertion that would have caught the missing guard. $25 for 100
     * stickers is not an implausible-looking number — it is the setup fee
     * with the material silently priced at zero, which is what an
     * unresolvable size produces. Anything at or below the setup fee is that
     * failure, not a bargain.
     */
    for (const id of ["stickers-100", "stickers-250"]) {
      const offer = ADD_ON_CATALOG.find((entry) => entry.id === id);
      assert.ok(offer);

      const { amount, quoteRequired } = offer.price();
      if (quoteRequired) continue;

      assert.ok(
        amount > STICKER_SETUP_FEE,
        `${id} is $${amount}, which is the $${STICKER_SETUP_FEE} setup fee and no material`
      );
    }
  });
});

describe("which offers each flow sees", () => {
  test("no flow is offered the thing it is already buying", () => {
    // A signs quote offering a banner, or a sticker quote offering stickers,
    // reads as the form not knowing what the customer just built.
    assert.ok(!getAddOnOffers("signs").some((o) => o.id === "banner-3x6"));
    assert.ok(!getAddOnOffers("stickers").some((o) => o.id.startsWith("stickers-")));
    assert.ok(
      !getAddOnOffers("apparel").some((o) => o.id === "apparel-screenprint")
    );
  });

  test("decals is an alias for stickers, not an empty flow", () => {
    // The builder calls its flow "decals" in places and "stickers" in
    // others. Without the alias the strip renders with nothing in it.
    assert.deepEqual(
      getAddOnOffers("decals").map((o) => o.id),
      getAddOnOffers("stickers").map((o) => o.id)
    );
    assert.ok(getAddOnOffers("decals").length > 0);
  });

  test("an unknown flow gets nothing rather than everything", () => {
    assert.deepEqual(getAddOnOffers("hats"), []);
  });

  test("every flow gets a scannable number of them", () => {
    for (const flow of ["stickers", "signs", "apparel"]) {
      const offers = getAddOnOffers(flow);
      assert.ok(offers.length > 0, `${flow} is offered nothing`);
      assert.ok(offers.length <= 4, `${flow} is offered ${offers.length}`);
    }
  });

  test("ids are unique, because the checkbox filters by id", () => {
    // A duplicate id would make ticking one offer untick another.
    const ids = ADD_ON_CATALOG.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("the two figures stay two figures", () => {
  test("unpriced offers are counted, never summed in as zero", () => {
    const summary = summariseAddOns(ADD_ON_CATALOG.map(toAddOn));
    const quoted = ADD_ON_CATALOG.filter((o) => o.price().quoteRequired);

    assert.equal(summary.quoteCount, quoted.length);
    assert.ok(quoted.length > 0, "no hand-quoted offer left to test with");

    // A dollar total that absorbed them would read as the whole cost.
    const priced = ADD_ON_CATALOG.filter((o) => !o.price().quoteRequired);
    assert.equal(
      summary.priced,
      priced.reduce((sum, o) => sum + o.price().amount, 0)
    );
  });

  test("an empty selection is zero and zero, not a NaN", () => {
    assert.deepEqual(summariseAddOns([]), { priced: 0, quoteCount: 0 });
  });
});
