import type { ApparelCartQuote } from "./apparel-cart";
import { apparelCatalogItems } from "./apparel-catalog";
import { getInkColorCount } from "./apparel-pricing";
import { isLightGarment } from "./light-garments";

/**
 * BLACK FRIDAY TEE DEALS: 24 tees, one print on the front, the regular price
 * less 25%, and no screen fee.
 *
 * Gabe, 2026-11-23: "Twenty-four T-shirts, one color print on the front,
 * it's the same price it would be, but take 25% off. and no screen fee."
 * Then "the same thing with the t-shirts, except instead of one color, it's
 * two color." And on the 2-color one: "2 color is strictly 2 color. No 3
 * color no underbase after 1 color images."
 *
 * So the deal is the REGULAR estimate (the same engine, the same blanks,
 * the same tiers, lib/apparel-cart.ts) with two changes: every garment and
 * print unit is taken down 25%, and setup is zero. Regular quotes are not
 * touched by any of this; a quote is only on a deal when `promo` says so.
 *
 * ── THE COLOUR RULE, AS BUILT ─────────────────────────────────────────────
 * A dark tee needs a white underbase, and the underbase counts as a colour
 * (Gabe, 2026-11-21). Screens on press:
 *
 *   1-color deal: 1 ink. On a light tee that is 1 screen; on a dark tee it
 *                 is 1 ink + underbase = 2, which still meets the 24-piece
 *                 minimum. ALLOWED on dark tees: flip `allowDarkTees` to
 *                 false to make it light tees only.
 *   2-color deal: never more than 2 in all, underbase included. Light tee:
 *                 up to 2 inks. Dark tee: 1-color art only (1 ink + the
 *                 underbase). 2-color art on a dark tee is refused with a
 *                 note saying why.
 *
 * Apparel is an estimate the shop confirms before invoicing (AGENTS.md),
 * so nothing here bills by itself; the shop reads the deal on the quote.
 * Change the numbers here and nowhere else; tests/tee-deal.test.ts pins
 * them.
 */
export const TEE_DEALS = [
  {
    id: "tees-24-1c",
    name: "24 Tees, 1-Color Front",
    /** Ink colours the art may print in. */
    maxInks: 1,
    /** Screens on press, white underbase included. */
    maxScreens: 2,
    allowDarkTees: true,
  },
  {
    id: "tees-24-2c",
    name: "24 Tees, 2-Color Front",
    maxInks: 2,
    maxScreens: 2,
    allowDarkTees: true,
  },
] as const;

export type TeeDealId = (typeof TEE_DEALS)[number]["id"];
export type TeeDeal = (typeof TEE_DEALS)[number];

export const TEE_DEAL_QUANTITY = 24;
/** "take 25% off": what is left of the regular price. */
export const TEE_DEAL_PRICE_FACTOR = 0.75;
/** One front print. The chart's front placements (lib/print-placements.ts). */
export const TEE_DEAL_FRONTS = ["Left Chest", "Center Chest", "Front", "Oversize Front"];
/** The tees the builder sells: every catalogue style filed as a T-Shirt. */
export const TEE_DEAL_STYLES: readonly string[] = apparelCatalogItems
  .filter((item) => item.category === "T-Shirts")
  .map((item) => item.style);

export function teeDealFor(promo: unknown): TeeDeal | null {
  return TEE_DEALS.find((deal) => deal.id === promo) ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The regular quote, on the deal: each garment unit and the print unit at
 * 75% (rounded to the cent PER UNIT, so unit x quantity is what Printavo
 * shows), and no setup. Applied before rush, so a rush date adds its fee to
 * the deal price, not to the regular one.
 */
export function applyTeeDeal(quote: ApparelCartQuote): ApparelCartQuote {
  if (quote.quantity === 0) return { ...quote, setupTotal: 0 };

  const lines = quote.lines.map((line) => {
    const unit = round2(line.garmentUnitPrice * TEE_DEAL_PRICE_FACTOR);
    return { ...line, garmentUnitPrice: unit, garmentTotal: round2(unit * line.quantity) };
  });
  const garmentTotal = round2(lines.reduce((sum, line) => sum + line.garmentTotal, 0));
  const printUnitPrice = round2(quote.printUnitPrice * TEE_DEAL_PRICE_FACTOR);
  const printTotal = round2(printUnitPrice * quote.quantity);
  const total = round2(garmentTotal + printTotal);

  return {
    ...quote,
    lines,
    garmentTotal,
    garmentUnitPrice: round2(garmentTotal / quote.quantity),
    printUnitPrice,
    printTotal,
    setupTotal: 0,
    total,
    unitPrice: round2(total / quote.quantity),
  };
}

/**
 * Why a quote does not fit the deal, in words for the customer, or null.
 * The same rules for the form and for the quote endpoint.
 */
export function teeDealProblem(
  deal: TeeDeal,
  input: {
    quantity: number;
    catalogStyle?: string;
    garmentColor: string;
    printLocations: string[];
    inkColors: string;
    inkColorsByLocation?: Record<string, string>;
    /** Added garments on the quote. The deal is one tee. */
    extraLines?: number;
  }
): string | null {
  if (input.catalogStyle && !TEE_DEAL_STYLES.includes(input.catalogStyle)) {
    return `The ${deal.name} deal is for T-shirts. Pick a tee or use a regular quote.`;
  }
  if ((input.extraLines ?? 0) > 0) {
    return `The ${deal.name} deal is one tee style and color. Remove the added garment or use a regular quote.`;
  }
  if (input.quantity !== TEE_DEAL_QUANTITY) {
    return `The deal is exactly ${TEE_DEAL_QUANTITY} tees. You have ${input.quantity || 0}.`;
  }
  if (input.printLocations.length !== 1 || !TEE_DEAL_FRONTS.includes(input.printLocations[0])) {
    return "The deal is one print on the front. Pick one front placement.";
  }

  const inks = getInkColorCount(
    input.inkColorsByLocation?.[input.printLocations[0]] || input.inkColors
  );
  if (!/^\d/.test(input.inkColorsByLocation?.[input.printLocations[0]] || input.inkColors) || inks > deal.maxInks) {
    return `The ${deal.name} deal prints ${deal.maxInks === 1 ? "1 color" : `up to ${deal.maxInks} colors`}.`;
  }

  const dark = !isLightGarment(input.garmentColor);
  if (dark && !deal.allowDarkTees) {
    return `The ${deal.name} deal is for light tees: white, off-white, Ash, Natural or Sand.`;
  }
  if (inks + (dark ? 1 : 0) > deal.maxScreens) {
    return `On a dark tee the white underbase counts as a color, so the ${deal.name} deal takes 1-color art. Pick a light tee (white, off-white, Ash, Natural or Sand) or use a regular quote.`;
  }

  return null;
}

/** The line the shop reads beside the figure. */
export function teeDealNote(deal: TeeDeal): string {
  return `Black Friday deal, ${deal.name}: ${TEE_DEAL_QUANTITY} tees, one front print, regular price less 25%, no screen fee. Never more than ${deal.maxScreens} screens, underbase included.`;
}

/**
 * The quote endpoint's check of a submitted tee deal (app/api/quote). The
 * figure itself is an estimate the shop confirms; this keeps a request that
 * skipped the form from carrying the deal on a quote it does not fit.
 */
export function teeDealSubmissionProblem(
  product: Record<string, unknown>,
  pricing: Record<string, unknown> | undefined
): string | null {
  const deal = teeDealFor(product.promo);
  if (!deal) return null;

  const supplier = (product.supplier ?? {}) as Record<string, unknown>;
  const problem = teeDealProblem(deal, {
    quantity: Number(product.quantity),
    catalogStyle: String(supplier.catalogStyle ?? ""),
    garmentColor: String(product.garmentColor ?? ""),
    printLocations: Array.isArray(product.printLocations) ? product.printLocations.map(String) : [],
    inkColors: String(product.inkColors ?? ""),
    extraLines: str(product.garmentLines) ? 1 : 0,
  });
  if (problem) return problem;

  if (!TEE_DEAL_STYLES.includes(String(supplier.catalogStyle ?? ""))) {
    return `The ${deal.name} deal is for T-shirts. Pick a tee or use a regular quote.`;
  }
  if (!pricing || Number(pricing.setupTotal) !== 0 || String(pricing.promo ?? "") !== deal.id) {
    return `The ${deal.name} price did not match the deal. Please refresh and try again.`;
  }
  return null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
