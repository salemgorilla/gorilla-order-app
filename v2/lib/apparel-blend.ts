import type { SsCatalogColor } from "../features/types";

/**
 * The blended garment price — apparel's number before sizes are known.
 *
 * Extended sizes cost more, and the size mix is unknown at estimate time:
 * every real apparel quote in the four-week readout recorded
 * "Size Breakdown: Not entered". So the estimate assumes a mix, STATES it
 * on screen, and drops the assumption entirely the moment the customer
 * enters real sizes — from then on every size is priced from its own SKU
 * (exactGarmentTotal below) and the screen says "priced from your sizes".
 *
 * Gabe's call, 29 Aug 2026: one blended figure, never a range — a customer
 * deciding something cannot act on an interval. (Stacey Beer negotiated
 * three submissions against a price the app never showed her.)
 *
 * LANGUAGE: "upcharge" is an internal name only. No customer surface may
 * say upcharge, markup, wholesale, our cost, or name a vendor. The blended
 * figure IS the shirt price; the only customer-facing trace of this file
 * is the assumption sentence (describeAssumedMix), which talks about
 * quantity mix, never money.
 */

/**
 * Assumed size mix, used ONLY until the customer enters a real breakdown.
 * Shares are of the whole order, not of the extended sizes.
 * Set by Gabe, 2026-08-29: 15% oversize total, 2XL and 3XL both common,
 * 4XL/5XL rare. Revisit against real order history.
 */
export const ASSUMED_EXTENDED_MIX = [
  { size: "2XL", share: 0.09 },
  { size: "3XL", share: 0.06 },
];

/** The sizes that share the style's base price. Everything above costs more. */
const STANDARD_SIZES = ["S", "M", "L", "XL"];

function priceOf(color: SsCatalogColor, sizeName: string): number | null {
  const size = color.sizes.find((s) => s.sizeName === sizeName);
  return size ? size.markedUpPrice : null;
}

/**
 * The style's base garment price for this colour: M when carried, else the
 * first standard size, else the first size the colour has at all (a colour
 * sold only in extended sizes prices from what exists rather than nothing).
 */
export function baseGarmentUnitPrice(color: SsCatalogColor): number {
  for (const name of ["M", ...STANDARD_SIZES]) {
    const price = priceOf(color, name);
    if (price !== null) return price;
  }

  return color.sizes[0]?.markedUpPrice ?? 0;
}

/**
 * base + Σ ( share × sizeDifference ), rounded UP to the next 5 cents.
 *
 * Each size's difference is read from the LIVE catalogue — S&S prices each
 * size as its own SKU — never hardcoded, so it differs by garment and
 * moves when supplier repricing lands. A size the style does not carry
 * contributes nothing: the row is dropped, never substituted with a
 * neighbouring size's price (some styles stop at 2XL).
 *
 * ROUNDING, deliberate and stated per the handoff: a 15% oversize
 * assumption still sits near the LOW end of realistic mixes, so the
 * blend's error runs one way — under the invoice, the direction customers
 * remember. Rounding the per-shirt figure UP to the next 5¢ is the
 * handoff's option 1 for leaning against that, chosen over inflating the
 * mix shares because it is visible right here rather than buried in data
 * that claims to be a measurement.
 */
export function blendedGarmentUnitPrice(color: SsCatalogColor): number {
  const base = baseGarmentUnitPrice(color);

  let blended = base;
  for (const { size, share } of ASSUMED_EXTENDED_MIX) {
    const price = priceOf(color, size);
    if (price === null) continue;

    blended += share * Math.max(0, price - base);
  }

  return Math.ceil(blended * 20) / 20;
}

/**
 * The exact garment total once real sizes exist: every size priced from
 * its own SKU, no assumption left. Sizes the colour does not carry are
 * skipped — the grid can no longer hold them (they are pruned on colour
 * change), so this guard is belt-and-braces, not a pricing policy.
 */
export function exactGarmentTotal(
  color: SsCatalogColor,
  sizeQuantities: Record<string, number>
): number {
  let total = 0;

  for (const [sizeName, quantity] of Object.entries(sizeQuantities)) {
    if (!(quantity > 0)) continue;

    const price = priceOf(color, sizeName);
    if (price === null) continue;

    total += price * quantity;
  }

  return total;
}

/**
 * The per-shirt garment price once real sizes exist, as a CLEAN 2dp unit.
 *
 * Why not the raw SKU sum: Printavo stores a 4dp unit price and
 * multiplies, and total/quantity is a repeating decimal on most mixed
 * orders — the exact drift class the Printavo module documents (invoices
 * up to $0.02 over the quote, growing with quantity). Quantizing the
 * PER-SHIRT figure and defining the garment component as unit × quantity
 * keeps the screen, the payload and the future invoice identical by
 * construction.
 *
 * Ceil, not round: the residue is under half a cent per shirt, and it
 * lands on the side the customer never remembers — the invoice can only
 * match or run a hair under the estimate, never over it.
 */
export function garmentUnitPriceFromSizes(
  color: SsCatalogColor,
  sizeQuantities: Record<string, number>,
  quantity: number
): number {
  const total = exactGarmentTotal(color, sizeQuantities);

  return Math.ceil((total / Math.max(1, quantity)) * 100) / 100;
}

/**
 * The assumption, as the sentence the screen shows — derived from the mix
 * table so the copy and the arithmetic cannot disagree. Talks about
 * quantity mix, never money.
 */
export function describeAssumedMix(): string {
  const totalShare = ASSUMED_EXTENDED_MIX.reduce((sum, row) => sum + row.share, 0);
  const sizes = ASSUMED_EXTENDED_MIX.map((row) => row.size).join(" or ");

  return `Assumes about ${Math.round(totalShare * 100)}% of the order is ${sizes}.`;
}
