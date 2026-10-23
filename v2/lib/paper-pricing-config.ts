/**
 * Paper printing prices: 4over COST, plus the shop's markup.
 *
 * THIS FILE IS THE ONLY PLACE PAPER PRICES LIVE. The catalogue (lib/paper.ts)
 * says what can be ordered; this says what it costs. Same split as
 * signs-pricing-config.ts, for the same reason: prices change far more often
 * than products do, and changing one should never risk breaking the other.
 *
 * ── WHERE THE NUMBERS COME FROM ───────────────────────────────────────────
 * Gabe, 2026-10-23: the shop prints paper through its 4over trade-partner
 * account, and the customer price is "4over cost + my markup". So the table
 * below holds what 4over charges the SHOP (dollars, for the whole run), and
 * lib/paper-pricing.ts adds the markup. Nothing here is a sell price.
 *
 * ── THE TABLE IS EMPTY ON PURPOSE ─────────────────────────────────────────
 * This repository has no 4over credentials and has never seen a 4over price.
 * Inventing a cost would be worse than having none: stickers and signs
 * generate a payment link automatically, and the same mistake here would take
 * real money for a guessed figure. With no cost for an option, that option is
 * a QUOTE REQUEST (no price shown, no payment link), and the shop prices it by
 * hand. Entries are added only from 4over's own price list.
 *
 * Filling the table in is one row per option the shop sells: the key is built
 * by paperCostKey() in lib/paper-pricing.ts, so a typo in a stock name is a
 * missing price (a quote request), never a wrong one.
 */

/**
 * Flip to true ONLY when the table and markup below are real and a test order
 * has been reconciled against the Printavo invoice to the cent.
 *
 * Left false deliberately: while it is false NO paper option is priced, whatever
 * the table holds.
 */
export const pricesConfirmed = false;

/**
 * The shop's markup over 4over cost, as a fraction (0.4 = cost + 40%).
 *
 * `null` means Gabe has not set one. A priced option with no markup is not
 * priced: the engine refuses rather than sell at cost by accident.
 */
export const paperMarkup: { default: number | null; byProduct: Partial<Record<string, number>> } = {
  default: null,
  byProduct: {},
};

/**
 * 4over cost for a whole run, in dollars, by paperCostKey(spec).
 *
 * e.g. "business-cards|3.5\" x 2\"|14pt Matte|Double-sided|500": 21.85
 * (an illustration of the key shape only; no real cost has been entered).
 */
export const paperCostTable: Readonly<Record<string, number>> = {};

/**
 * 4over cost of each finishing option, added to the run cost, in dollars.
 *
 * A missing entry means the option cannot be priced, so an order that ticks it
 * is a quote request.
 */
export const paperFinishingCost: Readonly<Record<string, number>> = {};

export type PaperPricingConfig = {
  pricesConfirmed: boolean;
  markup: typeof paperMarkup;
  costs: Readonly<Record<string, number>>;
  finishingCosts: Readonly<Record<string, number>>;
};

export const paperPricingConfig: PaperPricingConfig = {
  pricesConfirmed,
  markup: paperMarkup,
  costs: paperCostTable,
  finishingCosts: paperFinishingCost,
};
