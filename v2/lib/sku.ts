/**
 * The SKU grammar — the codes the Printavo invoice files every line under.
 *
 * ── WHY THIS IS ITS OWN FILE ──────────────────────────────────────────────
 * DESIGN-SYSTEM.md §7 decided against inventing a ticket grammar because the
 * app already has a real one: `GS-…` quote numbers, `DESIGN 01`, and the
 * `GORILLA-*` item numbers every Printavo row carries. The house rule on
 * spec furniture is that it points at a real value, so the code a customer
 * sees on the review screen has to be the code the shop bills under — not a
 * lookalike. Both sides read it from here, and tests/sku-agreement.test.ts
 * holds the review's codes equal to the invoice plan's item numbers.
 *
 * These are pure string functions. lib/printavo.ts used to own them, but it
 * is server-side (it reads Printavo credentials), so a client component
 * could not import from it without dragging that along.
 *
 * ── THE GRAMMAR ───────────────────────────────────────────────────────────
 *   GORILLA-DECAL                one sticker design (the whole order)
 *   GORILLA-DECAL-<n>            design n of a cart — the same n as DESIGN 0n
 *                                and the design-n-*.png attachment
 *   GORILLA-DECAL-SETUP          sticker setup, one row however many designs
 *   GORILLA-DECAL-MINIMUM        the top-up to the $45 sticker order minimum
 *   GORILLA-SIGN-<PRODUCT>       a sign, named by the product, never the
 *                                cart position (so "how many yard signs" has
 *                                an answer across carts)
 *   GORILLA-SIGN-<CHARGE>        a signs fee, named by the charge code from
 *                                lib/signs-pricing.ts, never its wording
 *   GORILLA-APPAREL-<STYLE>      a garment line, by S&S style when known
 *   GORILLA-APPAREL-PRINT        the print run
 *   GORILLA-APPAREL-SETUP        screens
 *   GORILLA-RUSH                 rush scheduling, both hand-quoted flows
 *   GORILLA-SHIPPING             shipping
 *
 * Every code encodes something real — the product, the charge, or the cart
 * position — which is what separates a SKU from decoration.
 */

export const SKU = {
  DECAL: "GORILLA-DECAL",
  DECAL_SETUP: "GORILLA-DECAL-SETUP",
  DECAL_MINIMUM: "GORILLA-DECAL-MINIMUM",
  APPAREL_PRINT: "GORILLA-APPAREL-PRINT",
  APPAREL_SETUP: "GORILLA-APPAREL-SETUP",
  RUSH: "GORILLA-RUSH",
  SHIPPING: "GORILLA-SHIPPING",
} as const;

/** The family prefix a flow files under — the review card's header chip. */
export const SKU_FAMILY = {
  stickers: "GORILLA-DECAL",
  signs: "GORILLA-SIGN",
  apparel: "GORILLA-APPAREL",
} as const;

/**
 * A name, as an item number fragment: upper case, single dashes, no edges.
 * Shared so every SKU is built the same way — the sign SKU, the signs fee
 * SKUs and the apparel cart's garment rows.
 */
export function skuPart(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A sticker design's code. Numbered only in a cart: two identical designs
 * once produced byte-identical rows the shop could not tell apart, and the
 * number is the cart position the shop email and the attachment name use.
 * A single design is the whole order and keeps the bare code.
 */
export function decalSku(index: number, designCount: number): string {
  return designCount > 1 ? `${SKU.DECAL}-${index + 1}` : SKU.DECAL;
}

/**
 * One function so a one-design quote and a cart cannot file the same product
 * under two different SKUs — which is precisely what happened when the cart
 * numbered its rows by position. Printavo's records are the shop's records:
 * "how many yard signs did we sell this quarter" is only answerable if the
 * same sign always lands in the same place.
 */
export function signSku(signType: string): string {
  return `${SKU_FAMILY.signs}-${skuPart(signType)}`;
}

/** A signs fee row, by its charge code (`SETUP`, `ADDON-HOLES`, `MINIMUM`…). */
export function signFeeSku(code: string): string {
  return `${SKU_FAMILY.signs}-${code}`;
}

/**
 * A single-garment apparel order: the S&S style, raw. This path predates
 * skuPart and is kept byte-for-byte so existing Printavo history keeps
 * filing under the same code.
 */
export function apparelSku(catalogStyle: string | undefined): string {
  return `${SKU_FAMILY.apparel}-${catalogStyle || "NA"}`;
}

/**
 * One garment line of an apparel cart. Named by the garment, the way signs
 * rows are named by the product: `catalogStyle` when the line knows its S&S
 * style, the garment label otherwise, the cart position as a last resort.
 */
export function apparelLineSku(
  line: { catalogStyle?: string; garmentLabel?: string },
  index: number
): string {
  return `${SKU_FAMILY.apparel}-${
    skuPart(line.catalogStyle || "") ||
    skuPart(line.garmentLabel || "") ||
    `LINE-${index + 1}`
  }`;
}
