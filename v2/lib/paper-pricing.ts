/**
 * PAPER PRICE = 4OVER COST + THE SHOP'S MARKUP — or no price at all.
 *
 * Pure arithmetic over lib/paper-pricing-config.ts. It answers one question:
 * can this option be priced, and if so, for how much. When the answer is no,
 * the flow is a quote request: no price shown, no payment link.
 *
 * ── THE FAILURE IT REFUSES ────────────────────────────────────────────────
 * "Sell at cost" and "sell for $0" are both one missing number away. Every
 * path to a price below requires that the number was actually entered, that it
 * is positive, that the markup was set, and that the shop has switched the
 * whole thing on (`pricesConfirmed`). Anything else is `ok: false` with the
 * reason, and a reason is what lets the shop see WHICH number is missing.
 *
 * Nothing here is wired to billing. A paper order is a quote request until a
 * paper auto-bill decision exists, which needs a real 4over cost table and a
 * test order reconciled against Printavo (see HANDOFF.md).
 */

import { paperProductById, type PaperSpec } from "./paper";
import { paperPricingConfig, type PaperPricingConfig } from "./paper-pricing-config";

export type PaperPrice =
  | {
      ok: true;
      /** What 4over charges the shop, including finishing. */
      cost: number;
      /** The markup applied, as a fraction. */
      markup: number;
      /** What the customer pays, rounded to cents. */
      sell: number;
    }
  | { ok: false; reason: string };

/** The key a spec is looked up under in paperCostTable. */
export function paperCostKey(spec: PaperSpec): string {
  return [spec.productId, spec.size, spec.stock, spec.sides, String(spec.quantity)].join("|");
}

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function priceForPaper(
  spec: PaperSpec,
  config: PaperPricingConfig = paperPricingConfig
): PaperPrice {
  if (!config.pricesConfirmed) {
    return { ok: false, reason: "paper prices are not confirmed" };
  }

  const product = paperProductById(spec.productId);
  if (!product) return { ok: false, reason: "unknown paper product" };

  const run = config.costs[paperCostKey(spec)];
  if (typeof run !== "number" || !Number.isFinite(run) || run <= 0) {
    return { ok: false, reason: "no 4over cost for this option" };
  }

  let cost = run;

  for (const item of spec.finishing) {
    const extra = config.finishingCosts[`${spec.productId}|${item}`];
    if (typeof extra !== "number" || !Number.isFinite(extra) || extra < 0) {
      return { ok: false, reason: `no 4over cost for ${item}` };
    }
    cost += extra;
  }

  const markup = config.markup.byProduct[spec.productId] ?? config.markup.default;
  if (typeof markup !== "number" || !Number.isFinite(markup) || markup < 0) {
    return { ok: false, reason: "no markup has been set" };
  }

  return { ok: true, cost: cents(cost), markup, sell: cents(cost * (1 + markup)) };
}

/** Whether the customer can be shown a price for this spec. */
export function isPaperPriced(
  spec: PaperSpec,
  config: PaperPricingConfig = paperPricingConfig
): boolean {
  return priceForPaper(spec, config).ok;
}
