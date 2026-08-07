/**
 * Paper printing prices — SELL prices, what the customer pays.
 *
 * THIS FILE IS THE ONLY PLACE PAPER PRICES LIVE. The catalog (lib/paper.ts)
 * says what can be ordered; this says what it costs. Same split as
 * signs-pricing-config.ts, for the same reason: prices change far more often
 * than products do, and changing one should never risk breaking the other.
 *
 * EVERY NUMBER BELOW IS A PLACEHOLDER pending Gabe's real rates. Nothing
 * reads this yet — the paper tab is not wired to it — so no customer can be
 * quoted from these. `pricesConfirmed` below is the gate: while it is false,
 * paper products are quoted by hand and no online price is shown, exactly the
 * way Window & Wall Graphics already works on the signs tab.
 */

/**
 * Flip to true ONLY when the numbers below are Gabe's real prices.
 *
 * Left false deliberately. A placeholder price that reaches a customer is
 * worse than no price at all: stickers auto-generate a payment link, and the
 * same mistake here would take real money for a guessed figure.
 */
export const pricesConfirmed = false;

/**
 * Quantity breaks, cheapest-per-unit at the largest run.
 *
 * Priced as a total for the run, not per piece — that is how print is sold and
 * how the shop's own sheets read. The engine divides for a per-unit figure.
 */
export type QuantityBreak = {
  quantity: number;
  /** Total price for this run, in dollars. */
  total: number;
};

export const paperPricingConfig = {
  businessCards: {
    label: "Business Cards",
    /** Finished size. Standard US card. */
    widthInches: 3.5,
    heightInches: 2,

    // TODO(gabe): real prices. One row per quantity you actually sell.
    breaks: {
      "14pt Matte": [
        { quantity: 100, total: 0 },
        { quantity: 250, total: 0 },
        { quantity: 500, total: 0 },
        { quantity: 1000, total: 0 },
        { quantity: 2500, total: 0 },
      ] as QuantityBreak[],
      "14pt Gloss": [] as QuantityBreak[],
      "16pt Matte": [] as QuantityBreak[],
      "16pt Gloss": [] as QuantityBreak[],
      "16pt Soft Touch": [] as QuantityBreak[],
      "Uncoated": [] as QuantityBreak[],
    },

    /** Surcharges added to the run total. 0 = included, null = not offered. */
    addOns: {
      doubleSided: 0,
      roundedCorners: 0,
      spotUV: null as number | null,
      foil: null as number | null,
    },
  },

  rackCards: {
    label: "Rack Cards",
    widthInches: 4,
    heightInches: 9,
    breaks: {
      "14pt Gloss": [] as QuantityBreak[],
      "16pt Matte": [] as QuantityBreak[],
      "100lb Text": [] as QuantityBreak[],
    },
    addOns: { doubleSided: 0 },
  },

  trifoldBrochures: {
    label: "Trifold Brochures",
    /** Flat size; folds to 3.67" x 8.5". */
    widthInches: 11,
    heightInches: 8.5,
    breaks: {
      "100lb Gloss Text": [] as QuantityBreak[],
      "100lb Matte Text": [] as QuantityBreak[],
      "80lb Uncoated": [] as QuantityBreak[],
    },
    /** Folding is labour, so it is priced separately from the sheet. */
    addOns: { doubleSided: 0, folding: 0 },
  },

  letterhead: {
    label: "Letterhead",
    widthInches: 8.5,
    heightInches: 11,
    breaks: {
      "70lb Uncoated Text": [] as QuantityBreak[],
      "24lb Bond": [] as QuantityBreak[],
      "100lb Gloss Text": [] as QuantityBreak[],
    },
    addOns: { doubleSided: 0 },
  },
} as const;

export type PaperProductKey = keyof typeof paperPricingConfig;
