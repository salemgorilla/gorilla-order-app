/**
 * DISCOUNT CODES — THE SHAPE, AND THE ARITHMETIC. Client-safe.
 *
 * Gabe, 2026-09-15: "can we add a discount code section at the checkout
 * page? I could give you a list of codes that are always working, and
 * invent more as we go." And on where the money comes off: "code would
 * discount before it gets to printavo, or it could be added as a line
 * item with negative money in price."
 *
 * It comes off BEFORE Printavo. A percent code is folded into each sticker
 * design's four-decimal unit price, and into the setup and minimum fee
 * rows to the cent, so the invoice is built from the same arithmetic that
 * already reconciles to the cent (unit x qty, summed once) and
 * Massachusetts tax follows the discounted price on its own. A negative
 * line item is unverified against Printavo's API, and a rejected line on a
 * live order fails the whole quote, so it is not used.
 *
 * The CODES themselves live server-side in lib/discount-codes.ts and are
 * never shipped to the browser. This file holds only what both sides need:
 * the shape of an applied discount and how it changes a unit price.
 */

export type Discount =
  | {
      code: string;
      kind: "percent";
      /**
       * 1–100. Off the ORDER, not including shipping — Gabe, 2026-09-15:
       * "40% off order not including shipping". Stickers, setup and the
       * minimum top-up all take it; the shipping line does not.
       */
      percent: number;
    }
  | {
      code: string;
      kind: "shipping";
    };

/** Upper-case, trimmed, spaces removed — "salem 10" and "SALEM10" are one code. */
export function normalizeDiscountCode(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 32);
}

/**
 * A percent code off a four-decimal unit price, back to four decimals — the
 * figure Printavo stores. Anything else leaves the unit alone.
 */
export function applyDiscountToUnit(unit: number, discount?: Discount | null): number {
  if (!discount || discount.kind !== "percent") return unit;
  return Number((unit * discountFactor(discount)).toFixed(4));
}

/** "10% off your order (not shipping)" / "Free shipping" — the customer-facing phrase. */
export function describeDiscount(discount: Discount): string {
  return discount.kind === "percent"
    ? `${discount.percent}% off your order (not shipping)`
    : "Free shipping";
}

/** The multiplier a percent code applies; 1 for anything else. */
export function discountFactor(discount?: Discount | null): number {
  if (!discount || discount.kind !== "percent") return 1;
  return 1 - Math.min(100, Math.max(0, discount.percent)) / 100;
}

/** True when the payload's `discount` is well-formed enough to look up. */
export function isDiscountShape(value: unknown): value is Discount {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  if (typeof d.code !== "string" || !d.code) return false;
  if (d.kind === "shipping") return true;
  return d.kind === "percent" && typeof d.percent === "number" && d.percent > 0 && d.percent <= 100;
}
