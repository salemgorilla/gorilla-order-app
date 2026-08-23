import { getStickerMaterialPrice, quoteStickerCart } from "./pricing";

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
export function isStickerOrder(order: Record<string, unknown>) {
  const product = (order.product || {}) as Record<string, unknown>;
  const type = String(product.type || "").toLowerCase();

  // Positive requirement, checked FIRST.
  //
  // This used to be defined purely by absence — no supplier, no garmentType,
  // no signType, "signs" not in the type. Membership by omission means any
  // NEW flow that fails to set one of those fields is silently classified as
  // stickers, gets repriced against the sticker table, and auto-generates a
  // Printavo payment link with no human in the loop. A lead-capture or
  // hand-quote payload is exactly the shape that slips through.
  //
  // Requiring the type to actually say stickers can only ever shrink the set
  // that auto-bills, so the worst case here is a sticker order that does not
  // self-check-out and gets followed up by hand — not a customer billed for
  // something nobody priced.
  if (!type.includes("sticker")) {
    return false;
  }

  return (
    !product.supplier &&
    !product.garmentType &&
    !product.signType &&
    !type.includes("signs")
  );
}

/**
 * Recompute a sticker total from its spec, server-side.
 *
 * Returns the order with server pricing substituted, plus what the browser
 * claimed, so a disagreement can be logged. Non-sticker flows pass straight
 * through: they are hand-quoted or priced by a different engine, and nothing
 * auto-bills them.
 */
export function repriceStickers(order: Record<string, unknown>) {
  const clientPricing = (order.pricing || {}) as Record<string, unknown>;
  const clientTotal = Number(clientPricing.total) || 0;

  if (!isStickerOrder(order)) {
    return {
      order,
      mismatch: false,
      unpriceable: false,
      clientTotal,
      serverTotal: clientTotal,
    };
  }

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
  const pricedItems = items.map((item) => ({
    ...item,
    linePrice: getStickerMaterialPrice(
      Number(item.quantity) || 0,
      String(item.material || ""),
      String(item.size || ""),
      {
        widthInches: Number(item.widthInches) || 0,
        heightInches: Number(item.heightInches) || 0,
      }
    ),
  }));

  const stickerPrice =
    Math.round(
      pricedItems.reduce((sum, item) => sum + item.linePrice, 0) * 100
    ) / 100;

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
  const unpriceable = pricedItems.some((item) => item.linePrice <= 0);

  /**
   * The same call the BROWSER makes in recalculateOrder.
   *
   * Counted from the items the server can see, never from a client-supplied
   * design count — that number decides how much setup is charged, and
   * quoteStickerCart takes the count from the priced array rather than as a
   * separate argument for exactly that reason.
   */
  const { setupPrice, shippingPrice, total: serverTotal } = quoteStickerCart({
    materialPrices: pricedItems.map((item) => item.linePrice),
    deliveryMethod: String(production.deliveryMethod || ""),
  });

  return {
    order: {
      ...order,
      // Only when the payload really carried a cart — `items` falls back to
      // [product] above, and writing that back would invent a one-design cart
      // on a payload that never had one.
      ...(Array.isArray(order.items) ? { items: pricedItems } : {}),
      pricing: {
        ...clientPricing,
        stickerPrice,
        setupPrice,
        shippingPrice,
        total: serverTotal,
      },
    },
    // Cents of float drift are not worth shouting about; real tampering is.
    mismatch: Math.abs(serverTotal - clientTotal) > 0.01,
    unpriceable,
    clientTotal,
    serverTotal,
  };
}
