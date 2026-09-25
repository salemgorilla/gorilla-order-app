import { isDiscountShape, type Discount } from "./discount";
import { findDiscountCode } from "./discount-codes";
import {
  getStickerMaterialPrice,
  getStickerUnitMaterialPrice,
  quoteStickerCart,
} from "./pricing";
import { isStickerFlow } from "./order-flow";
import { MAX_STICKER_SIZE_INCHES } from "./units";

/**
 * Which submissions self-bill, and what they are billed.
 *
 * ── WHY THIS IS NOT IN app/api/quote/route.ts ANY MORE ────────────────────
 * It was, exported for the ten test files that drive it — and Next's route
 * typegen rejects any export from a route file that is not a handler, so
 * `tsc --noEmit` failed whenever the dev server had generated
 * `.next/dev/types` (which tsconfig deliberately includes). Every session
 * hit that, cleared the folder, and moved on; the folder came back on the
 * next `next dev`. Moving the functions is the fix the contract actually
 * asks for: a route file exports handlers, logic lives in lib where the
 * tests import it directly.
 *
 * NOTHING HERE CHANGED IN THE MOVE. AGENTS.md's invariants about
 * isStickerOrder() — positive classification, never weakened — apply to
 * this file now; the route imports and calls these exactly as before.
 */

/** True for the sticker flow, which is the only one that self-checks-out. */
/**
 * Re-exported from lib/order-flow, where the rule now lives beside the four
 * predicates it has to stay consistent with. The name stays: AGENTS.md
 * names `isStickerOrder()` as the gate that decides repricing AND billing,
 * and a rename would silently orphan that instruction.
 */
export const isStickerOrder = isStickerFlow;

/**
 * Recompute a sticker total from its spec, server-side.
 *
 * Returns the order with server pricing substituted, plus what the browser
 * claimed, so a disagreement can be logged. Non-sticker flows pass straight
 * through: they are hand-quoted or priced by a different engine, and nothing
 * auto-bills them.
 */
export function repriceStickers(
  order: Record<string, unknown>,
  options: {
    /** The code list to validate against. Tests inject; production reads env. */
    discountCodes?: readonly Discount[];
  } = {}
) {
  const clientPricing = (order.pricing || {}) as Record<string, unknown>;
  const clientTotal = Number(clientPricing.total) || 0;

  if (!isStickerOrder(order)) {
    return {
      order,
      mismatch: false,
      unpriceable: false,
      discountRejected: false,
      clientTotal,
      serverTotal: clientTotal,
    };
  }

  /**
   * The discount, LOOKED UP AGAIN from the code — never taken from the
   * payload's `kind`/`percent`. The browser was told what its code is
   * worth by /api/discount-code; a browser that says otherwise is repriced
   * at whatever the code is really worth, or at list when the code is not
   * one of ours. `discountRejected` is the flag the shop email reads.
   */
  const claimed = isDiscountShape(order.discount) ? order.discount : null;
  const discount = claimed
    ? options.discountCodes
      ? findDiscountCode(claimed.code, options.discountCodes)
      : findDiscountCode(claimed.code)
    : null;
  const discountRejected = Boolean(claimed) && !discount;

  const product = (order.product || {}) as Record<string, unknown>;
  const production = (order.production || {}) as Record<string, unknown>;

  // Reprice from `items` when the payload carries a cart, falling back to the
  // synthesised `product` so an older payload still reprices exactly as it
  // used to. The browser is never the authority on price — this is the figure
  // the payment link is generated from.
  const items = Array.isArray(order.items)
    ? (order.items as Record<string, unknown>[])
    : [product];

  /**
   * Each design with the price the SERVER put on it.
   *
   * Written back onto the item so everything downstream bills the figure that
   * was actually computed here, rather than calling the pricing engine a
   * second time and hoping the two agree. Printavo's per-design line items
   * read this.
   */
  const pricedItems = items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const material = String(item.material || "");
    const size = String(item.size || "");
    const dims = {
      widthInches: Number(item.widthInches) || 0,
      heightInches: Number(item.heightInches) || 0,
    };

    const shape = String(item.shape || "");

    return {
      ...item,
      // The line, exact to four decimals. What the total is summed from.
      // Discounted, when a code applies — see lib/discount.ts.
      lineExact: getStickerMaterialPrice(quantity, material, size, dims, shape, discount),
      // The same line at list, for the discount row.
      lineListExact: getStickerMaterialPrice(quantity, material, size, dims, shape),
      // The line, to the cent. What the shop email prints beside the design.
      linePrice:
        Math.round(
          getStickerMaterialPrice(quantity, material, size, dims, shape, discount) * 100
        ) / 100,
      // The unit Printavo will store — four decimals, and THE figure
      // lib/printavo.ts puts on the row. Not derived from linePrice: dividing
      // a rounded total back into a unit is how the two came to differ.
      lineUnitPrice: getStickerUnitMaterialPrice(quantity, material, size, dims, shape, discount),
    };
  });


  /**
   * A design with no usable area cannot be priced, and must not auto-bill.
   *
   * ── WHAT THIS CATCHES ─────────────────────────────────────────────────
   * The material formula is area x rate, so a payload carrying no width, no
   * height and no usable size label prices at exactly $0 and says nothing.
   * A submission for 1,000 stickers came out of here at $25 — the setup fee
   * alone — and stickers self-check-out, so that is a live payable link at a
   * price nobody set.
   *
   * The browser blocks the missing-dimensions case today: width and height
   * are validated and submit is refused. That is not the point. This function
   * exists BECAUSE the browser is not the authority on price, and it was
   * trusting the browser for the one input the price is computed from.
   *
   * The test is the FIGURE, not one cause of it — any design whose material
   * comes out at $0 or less. Missing dimensions is how it was found, and it
   * is the case that matters; a real but tiny order lands there too (10 at
   * 0.1" x 0.1" rounds to $0.00, though 1,000 of them is $0.32 and bills
   * normally). Either way, $0 of material is not a price to charge against
   * unattended.
   *
   * Deliberately not an error. The shop still gets the quote, the email and
   * the Printavo record, and can price it by hand — the only thing withheld
   * is the automatic payment link. Refusing the order outright would lose a
   * real customer over a field we can ask about.
   */
  const unpriceable = pricedItems.some(
    (item) =>
      item.linePrice <= 0 ||
      // Wider than the roll. The form refuses it too, but the form is not
      // what decides whether money moves — this is. A 48" x 96" "sticker"
      // priced perfectly well; it just could not be printed.
      Number((item as Record<string, unknown>).widthInches) > MAX_STICKER_SIZE_INCHES ||
      Number((item as Record<string, unknown>).heightInches) > MAX_STICKER_SIZE_INCHES
  );

  /**
   * The same call the BROWSER makes in recalculateOrder.
   *
   * Counted from the items the server can see, never from a client-supplied
   * design count — that number decides how much setup is charged, and
   * quoteStickerCart takes the count from the priced array rather than as a
   * separate argument for exactly that reason.
   */
  const {
    stickerPrice,
    setupPrice,
    minimumPrice,
    shippingPrice,
    shippingNote,
    discountPrice,
    discountCode,
    stickerListPrice,
    setupListPrice,
    minimumListPrice,
    total: serverTotal,
  } = quoteStickerCart({
    // The EXACT four-decimal lines, not the per-line figures rounded for the
    // email. quoteStickerCart sums and rounds ONCE, which is Printavo's
    // arithmetic; summing the rounded lines instead differs by a cent
    // whenever two of them each carry half a cent — $470.56 quoted against
    // $470.57 billed, on the flow that bills with nobody watching. One call,
    // one rounding, and the same call the browser makes.
    materialPrices: pricedItems.map((item) => item.lineExact),
    deliveryMethod: String(production.deliveryMethod || ""),
    // The parcel is weighed from the SERVER's view of the items, and the ZIP
    // is whatever the customer typed — the same two inputs the browser used,
    // so the shipping it showed is the shipping this bills.
    items: pricedItems.map((item) => {
      const raw = item as Record<string, unknown>;
      return {
        quantity: Number(raw.quantity) || 0,
        widthInches: Number(raw.widthInches) || 0,
        heightInches: Number(raw.heightInches) || 0,
      };
    }),
    destZip: String(production.shipZip || ""),
    listPrices: pricedItems.map((item) => item.lineListExact),
    discount,
  });

  /**
   * WHAT WAS ORDERED, REBUILT FROM WHAT WAS PRICED.
   *
   * ── THE HOLE THIS CLOSES ──────────────────────────────────────────────
   * This function priced `items[]` and copied `product` through untouched.
   * But for a SINGLE-DESIGN order every shop-facing and invoice-facing
   * surface reads `product.quantity`, not the item:
   *
   *   lib/printavo.ts   the decal row's quantity and sizes[].count
   *   lib/email.ts      the subject line and the Quantity row
   *
   * So the two could disagree, and nothing reconciled them. Verified
   * against the real code on 2026-09-25:
   *
   *   product.quantity 5000, items[0].quantity 1
   *     -> server prices ONE sticker, total $45.00 (the order minimum)
   *     -> Printavo row reads "5000x Custom Stickers" at $0.0002 each
   *     -> shop prints 5,000, collects $45. Correct price: ~$2,057.
   *
   * /api/quote is public and unauthenticated and stickers auto-bill, so
   * that is a crafted payload away, and the true quantity appears on NO
   * shop-facing surface for a single-design order.
   *
   * Invariant 2 was enforced on the PRICE and not on WHAT WAS ORDERED.
   * `product` is a client-supplied synthesis; the server now restates its
   * quantity and design count from the same array it priced, the way
   * repriceSigns rebuilds its product wholesale. A forged quantity is
   * overwritten rather than detected — there is nothing to salvage in a
   * number that disagrees with the cart it came with.
   *
   * NOT touched: size, shape, material and finish. Those describe the
   * design and are already read from the item on the row that matters
   * (printavo.ts spreads `stickerItems[0]` over product). Quantity is the
   * one field passed as an explicit argument, so the spread cannot correct
   * it.
   */
  const orderedQuantity = pricedItems.reduce(
    (sum, item) => sum + (Number((item as Record<string, unknown>).quantity) || 0),
    0
  );

  return {
    order: {
      ...order,
      // Only when the payload really carried a cart — `items` falls back to
      // [product] above, and writing that back would invent a one-design cart
      // on a payload that never had one.
      ...(Array.isArray(order.items) ? { items: pricedItems } : {}),
      product: {
        ...(order.product as Record<string, unknown>),
        ...(orderedQuantity > 0 ? { quantity: orderedQuantity } : {}),
        designCount: pricedItems.length,
      },
      // The discount as the SERVER found it — null when the code was not
      // ours, so nothing downstream repeats an unearned claim.
      discount,
      pricing: {
        ...clientPricing,
        stickerPrice,
        setupPrice,
        minimumPrice,
        shippingPrice,
        shippingNote,
        discountPrice,
        discountCode,
        stickerListPrice,
        setupListPrice,
        minimumListPrice,
        total: serverTotal,
      },
    },
    // Cents of float drift are not worth shouting about; real tampering is.
    mismatch: Math.abs(serverTotal - clientTotal) > 0.01,
    unpriceable,
    discountRejected,
    clientTotal,
    serverTotal,
  };
}
