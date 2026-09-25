/**
 * Which pipeline is this order, and may it bill itself?
 *
 * ── WHY ONE FILE ──────────────────────────────────────────────────────────
 * Five functions in four files answered these questions, in three different
 * ways, all claiming to agree:
 *
 *   isStickerOrder  lib/sticker-repricing.ts  repricing AND billing
 *   isSignsOrder    lib/auto-bill.ts          the signs auto-bill
 *   isSigns         lib/printavo.ts           which INVOICE rows exist
 *   isSigns         lib/email.ts              which SHOP EMAIL sections exist
 *   isApparel       both of the above         a copy each
 *
 * They did not agree. `lib/printavo.ts` gained a bail on "sticker" in #186,
 * after `type: "Custom Sticker Banners"` was priced and billed as stickers
 * while being INVOICED as signs — which empties the sticker rows and drops
 * the $15 setup and the $45 order minimum. `lib/email.ts` holds the same
 * function and never got the fix, so the shop's own brief still described
 * such an order as signs. The sibling that did not get it: this repo's most
 * repeated shape.
 *
 * ── THE TWO QUESTIONS, WHICH ARE NOT THE SAME QUESTION ────────────────────
 * The near-copies hid the fact that they were answering different things,
 * which is why "make them identical" was never the right fix.
 *
 *   SHAPE — what does this order LOOK like? Which invoice rows, which email
 *   sections, which SKU prefix. Answered by classifyOrderFlow(). Broad on
 *   purpose: a hand-fed payload that says "Vinyl Banners" and carries no
 *   signType should still be PRESENTED as a sign. Nothing here moves money,
 *   so breadth is cheap and a wrong shape is a formatting complaint.
 *
 *   AUTHORITY — may this order raise a payment link with no human looking?
 *   Answered by maySignsAutoBill() and by isStickerFlow(). Narrow on
 *   purpose, and POSITIVE: every clause must be satisfied, never inferred
 *   from absence. A wrong answer here charges a card, so the worst case has
 *   to be an order that does not self-check-out and gets followed up by
 *   hand — never one billed for a figure nobody set.
 *
 * `/api/quote` is public, so `product.type` is caller-supplied text. Every
 * predicate here treats it as hostile.
 *
 * ── PRECEDENCE ────────────────────────────────────────────────────────────
 * apparel, then signs, then stickers — read off the call sites this
 * replaces, which all branch `apparel ? … : signs ? … : stickers`. Stickers
 * are the FALLTHROUGH for shape and a POSITIVE test for authority, and
 * those two facts are why one function could never have covered both.
 */

type AnyRecord = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function productOf(order: AnyRecord): AnyRecord {
  return (order.product || {}) as AnyRecord;
}

function typeText(product: AnyRecord): string {
  return str(product.type).toLowerCase();
}

/** The four shapes an order can be presented as. */
export type OrderFlow = "apparel" | "signs" | "stickers";

/**
 * Does the type string claim stickers?
 *
 * The one clause every other predicate here is built on, named once. Both
 * signs predicates bail on it and the sticker gate requires it, so a change
 * to what counts as "saying stickers" has to move all of them together.
 */
export function namesStickers(product: AnyRecord): boolean {
  return typeText(product).includes("sticker");
}

/** SHAPE. Garments, by type string or by either field the flow sets. */
export function isApparelProduct(product: AnyRecord): boolean {
  return (
    typeText(product).includes("apparel") ||
    Boolean(product.supplier) ||
    Boolean(product.garmentType)
  );
}

/**
 * SHAPE. Signs and banners — never a sticker order.
 *
 * `signType` is the load-bearing test; every payload the machinery builds
 * carries it. The type strings are belt and braces for anything hand-fed.
 * The sticker bail is #186's fix, applied here to BOTH consumers at once
 * rather than to whichever one the author was looking at.
 */
export function isSignsProduct(product: AnyRecord): boolean {
  if (namesStickers(product)) return false;

  return (
    typeText(product).includes("signs") ||
    typeText(product).includes("banner") ||
    Boolean(product.signType)
  );
}

/**
 * SHAPE. The single answer — which pipeline this order is presented as.
 *
 * Total: every order gets one of the three, and stickers are the
 * fallthrough exactly as the invoice and email builders have always treated
 * them. Being the fallthrough is safe HERE and would not be safe for
 * billing, which is what isStickerFlow below exists to keep separate.
 */
export function classifyOrderFlow(order: AnyRecord): OrderFlow {
  const product = productOf(order);

  if (isApparelProduct(product)) return "apparel";
  if (isSignsProduct(product)) return "signs";
  return "stickers";
}

/**
 * AUTHORITY. May this payload be repriced against the sticker table and
 * billed from it?
 *
 * POSITIVE classification, and never weakened — see AGENTS.md. It used to
 * be defined purely by absence (no supplier, no garmentType, no signType,
 * "signs" not in the type), and membership by omission means any NEW flow
 * that forgets a field is silently priced as stickers and auto-billed with
 * no human in the loop. A lead-capture or hand-quote payload is exactly
 * that shape.
 *
 * Requiring the type to actually say stickers can only ever SHRINK the set
 * that auto-bills, so the worst case is a sticker order followed up by hand.
 */
export function isStickerFlow(order: AnyRecord): boolean {
  const product = productOf(order);

  if (!namesStickers(product)) return false;

  return (
    !product.supplier &&
    !product.garmentType &&
    !product.signType &&
    !typeText(product).includes("signs")
  );
}

/**
 * AUTHORITY. May a signs order raise a payment link unattended?
 *
 * Strictly narrower than `classifyOrderFlow(order) === "signs"`, and the
 * difference is deliberate: this demands the type name the pipeline AND a
 * `signType` to be present. A payload carrying only one of the two is
 * presented as a sign and quoted by a human.
 *
 * Do not "simplify" this to the shape predicate. A hand-fed payload saying
 * "Vinyl Banners" with no spec would become billable, and lib/auto-bill's
 * own rule is that it bills only what the server repriced.
 */
export function maySignsAutoBill(order: AnyRecord): boolean {
  const product = productOf(order);

  // Never both. A payload claiming stickers is the sticker gate's business.
  if (namesStickers(product)) return false;

  /**
   * NOR A GARMENT ORDER. The same defect as the sticker bail above, in the
   * pair nobody had put side by side.
   *
   * `{ type: "Vinyl Banners", signType: "Banner", garmentType: "Tee" }` was
   * SHAPED as apparel — apparel invoice rows, apparel email sections — and
   * still cleared this gate, so it acquired an automatic payment link.
   * AGENTS.md is explicit that apparel must not: it is an estimate priced
   * off a supplier catalogue that can be stale, and the shop confirms it
   * before any money moves.
   *
   * `/api/quote` is public and every one of these fields is caller-supplied,
   * so this is reachable, not theoretical. Like every other clause here it
   * can only SHRINK what auto-bills.
   */
  if (isApparelProduct(product)) return false;

  const namesThePipeline =
    typeText(product).includes("sign") || typeText(product).includes("banner");

  return namesThePipeline && Boolean(product.signType);
}
