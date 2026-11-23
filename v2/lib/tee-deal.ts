import type { ApparelCartQuote } from "./apparel-cart";
import { getInkColorCount } from "./apparel-pricing";
import { isLightGarment } from "./light-garments";

/**
 * BLACK FRIDAY TEE DEALS: 24 Basic Tees, one front print, ONE FIXED PRICE.
 *
 * Gabe, 2026-11-23: "Twenty-four T-shirts, one color print on the front,
 * it's the same price it would be, but take 25% off. and no screen fee."
 * Then the 2-color version, and: "2 color is strictly 2 color. No 3 color no
 * underbase after 1 color images." Then: "everything will be canned
 * pricing ... so it'll always be the same price", and "They can't add more,
 * they can't add less ... There's no breaking the quantity."
 *
 * So each deal is a flat price for exactly 24 tees. The customer adds
 * artwork, a colour and their sizes; nothing they pick moves the total.
 *
 * ── HOW THE PRICES WERE SET (2026-11-23) ─────────────────────────────────
 * The app's own regular estimate for 24 Basic Tees (Gildan, style 39), one
 * front print, before sizes (its usual mix: about 15% 2XL/3XL), less 25%,
 * with no screen fee, per tee rounded to the cent:
 *
 *   1-color deal: 1 screen  (1 ink on a light tee)            $8.59 a tee
 *   2-color deal: 2 screens (2 inks on a light tee, or 1 ink
 *                 plus the white underbase on a dark tee)    $10.31 a tee
 *
 * A dark tee needs the white underbase, which counts as a colour (Gabe,
 * 2026-11-21), so 1-colour art on a dark tee is two screens: that is the
 * 2-color deal, and the 1-color deal is light tees only.
 *
 * Change a price here and nowhere else; tests/tee-deal.test.ts pins them.
 * Apparel is a quote the shop confirms before invoicing (AGENTS.md).
 */
export const TEE_DEAL_QUANTITY = 24;
/** Gildan Basic Tee (S&S style 39): the deal's only blank. */
export const TEE_DEAL_STYLE = "39";
export const TEE_DEAL_GARMENT = "Basic Tee";
/** Sizes the flat price covers. */
export const TEE_DEAL_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"] as const;
/** One front print. The chart's front placements (lib/print-placements.ts). */
export const TEE_DEAL_FRONTS = ["Left Chest", "Center Chest", "Front", "Oversize Front"];

export const TEE_DEALS = [
  {
    id: "tees-24-1c",
    name: "24 Tees, 1-Color Front",
    /** Per tee. 24 x this is the whole price. */
    unitPrice: 8.59,
    /** Ink colours the art may print in. */
    maxInks: 1,
    /** Screens on press, white underbase included. */
    maxScreens: 1,
  },
  {
    id: "tees-24-2c",
    name: "24 Tees, 2-Color Front",
    unitPrice: 10.31,
    maxInks: 2,
    maxScreens: 2,
  },
] as const;

export type TeeDealId = (typeof TEE_DEALS)[number]["id"];
export type TeeDeal = (typeof TEE_DEALS)[number];

export function teeDealFor(promo: unknown): TeeDeal | null {
  return TEE_DEALS.find((deal) => deal.id === promo) ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The deal's whole price: 24 x the per-tee price. */
export function teeDealTotal(deal: TeeDeal): number {
  return round2(deal.unitPrice * TEE_DEAL_QUANTITY);
}

/**
 * The deal's quote, in the shape every apparel surface already reads: one
 * garment line, 24 x the flat price, and nothing else. Printing, screens,
 * underbase and rush are zero because the price includes or waives them,
 * so Printavo writes one row and the total never moves.
 */
export function quoteTeeDeal(
  deal: TeeDeal,
  input: { colorName: string; sizeBreakdown: string }
): ApparelCartQuote {
  const quantity = TEE_DEAL_QUANTITY;
  const total = teeDealTotal(deal);
  return {
    lines: [
      {
        id: "line-1",
        garmentLabel: `${deal.name} - ${TEE_DEAL_GARMENT}`,
        colorName: input.colorName,
        catalogStyle: TEE_DEAL_STYLE,
        garmentUnitPrice: deal.unitPrice,
        garmentTotal: total,
        quantity,
        sizeBreakdown: input.sizeBreakdown,
      },
    ],
    garmentMarkup: 0,
    quantity,
    garmentTotal: total,
    garmentUnitPrice: deal.unitPrice,
    underbaseFeePerPiece: 0,
    printUnitPrice: 0,
    printTotal: 0,
    setupTotal: 0,
    total,
    unitPrice: deal.unitPrice,
    inkColorCount: deal.maxInks,
    colorsByLocation: [deal.maxScreens],
    locationCount: 1,
    printTierQuantity: quantity,
    rushFee: 0,
  };
}

const sizeName = (entry: string) => entry.split("-")[0].trim().toUpperCase();
const sizeCount = (entry: string) => Number(entry.split("-")[1]) || 0;

/** "M-12, L-12" read into its sizes and the total. */
function readSizes(breakdown: string): { sizes: string[]; total: number } {
  const entries = (breakdown || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    sizes: entries.map(sizeName),
    total: entries.reduce((sum, e) => sum + sizeCount(e), 0),
  };
}

/**
 * Why a quote does not fit the deal, in words for the customer, or null.
 * The same rules for the form and for the quote endpoint.
 */
export function teeDealProblem(
  deal: TeeDeal,
  input: {
    catalogStyle?: string;
    garmentColor: string;
    printLocations: string[];
    inkColors: string;
    inkColorsByLocation?: Record<string, string>;
    /** "M-12, L-12": the sizes ARE the quantity, and must make exactly 24. */
    sizeBreakdown: string;
    /** Added garments on the quote. The deal is one tee. */
    extraLines?: number;
  }
): string | null {
  if (input.catalogStyle !== TEE_DEAL_STYLE) {
    return `The deal is on the ${TEE_DEAL_GARMENT}. Pick the ${TEE_DEAL_GARMENT}, or use a regular quote.`;
  }
  if ((input.extraLines ?? 0) > 0) {
    return "The deal is one tee style. Remove the added garment, or use a regular quote.";
  }

  const dark = !isLightGarment(input.garmentColor);
  if (dark && deal.maxScreens < 2) {
    return `The 1-color deal is for light tees (white, off-white, Ash, Natural or Sand). A dark tee needs a white underbase, so pick the 2-color deal for it.`;
  }

  if (input.printLocations.length !== 1 || !TEE_DEAL_FRONTS.includes(input.printLocations[0])) {
    return "The deal is one print on the front. Pick one front placement.";
  }

  const inkText = input.inkColorsByLocation?.[input.printLocations[0]] || input.inkColors;
  const inks = getInkColorCount(inkText);
  if (!/^\d/.test(inkText) || inks > deal.maxInks) {
    return `The ${deal.name} deal prints ${deal.maxInks === 1 ? "1 color" : "up to 2 colors"}.`;
  }
  if (inks + (dark ? 1 : 0) > deal.maxScreens) {
    return `On a dark tee the white underbase counts as a color, so the 2-color deal takes 1-color art. Pick a light tee (white, off-white, Ash, Natural or Sand), or use a regular quote.`;
  }

  const { sizes, total } = readSizes(input.sizeBreakdown);
  const outside = sizes.filter((s) => !(TEE_DEAL_SIZES as readonly string[]).includes(s));
  if (outside.length > 0) {
    return `The deal covers sizes ${TEE_DEAL_SIZES[0]} to ${TEE_DEAL_SIZES[TEE_DEAL_SIZES.length - 1]}. Remove ${outside.join(", ")}.`;
  }
  if (total !== TEE_DEAL_QUANTITY) {
    return total === 0
      ? `Enter your sizes. They need to add up to exactly ${TEE_DEAL_QUANTITY} tees.`
      : `Your sizes add up to ${total}. The deal is exactly ${TEE_DEAL_QUANTITY} tees, so ${
          total < TEE_DEAL_QUANTITY ? `add ${TEE_DEAL_QUANTITY - total}` : `take off ${total - TEE_DEAL_QUANTITY}`
        }.`;
  }

  return null;
}

/** The line the shop reads beside the figure. */
export function teeDealNote(deal: TeeDeal): string {
  return `Black Friday deal, ${deal.name}: exactly ${TEE_DEAL_QUANTITY} ${TEE_DEAL_GARMENT}s (Gildan, style ${TEE_DEAL_STYLE}), sizes ${TEE_DEAL_SIZES[0]}-${
    TEE_DEAL_SIZES[TEE_DEAL_SIZES.length - 1]
  }, one front print, flat $${deal.unitPrice.toFixed(2)} a tee ($${teeDealTotal(deal).toFixed(
    2
  )}), printing and screens included. Never more than ${deal.maxScreens} screen${
    deal.maxScreens === 1 ? "" : "s"
  }, underbase included.`;
}

/**
 * The quote endpoint's check of a submitted tee deal (app/api/quote). The
 * browser enforces all of this; a request that skipped the form still cannot
 * carry the deal on a quote it does not fit, or at another price.
 */
export function teeDealSubmissionProblem(
  product: Record<string, unknown>,
  pricing: Record<string, unknown> | undefined
): string | null {
  const deal = teeDealFor(product.promo);
  if (!deal) return null;

  const supplier = (product.supplier ?? {}) as Record<string, unknown>;
  if (Number(product.quantity) !== TEE_DEAL_QUANTITY) {
    return `The ${deal.name} deal is exactly ${TEE_DEAL_QUANTITY} tees.`;
  }
  const problem = teeDealProblem(deal, {
    catalogStyle: String(supplier.catalogStyle ?? ""),
    garmentColor: String(product.garmentColor ?? ""),
    printLocations: Array.isArray(product.printLocations) ? product.printLocations.map(String) : [],
    inkColors: String(product.inkColors ?? ""),
    sizeBreakdown: String(product.sizeBreakdown ?? ""),
    extraLines: str(product.garmentLines) ? 1 : 0,
  });
  if (problem) return problem;

  if (
    !pricing ||
    String(pricing.promo ?? "") !== deal.id ||
    Number(pricing.unitPrice) !== deal.unitPrice ||
    Math.abs(Number(pricing.total) - teeDealTotal(deal)) > 0.005
  ) {
    return `The ${deal.name} price did not match the deal. Please refresh and try again.`;
  }
  return null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
