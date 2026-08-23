import {
  getSignDimensions,
  getSignProduct,
  getSignSizeLabel,
  SIGN_FAMILIES,
  type SignFamily,
  type SignsDesign,
} from "./signs";
import type { SignsCartQuote } from "./signs-cart";
import { getTemplate, resolveTemplateText } from "./templates";

/**
 * What a signs quote looks like once it leaves the browser.
 *
 * ── WHY THIS IS NOT IN app/page.tsx ───────────────────────────────────────
 * It was. The first version of tests/signs-cart-payload.test.ts had to
 * REBUILD this shape to test it, because buildQuotePayload is a closure over
 * component state — and a test that rebuilds the thing it is testing proves
 * only that the test agrees with itself. Mutation testing showed exactly
 * that: sending each design's full total instead of its subtotal — the
 * double-charge this file's `lineTotal` comment exists to prevent — passed
 * every assertion.
 *
 * So the mapping lives here, where the test can drive the real one. Same
 * reasoning AGENTS.md gives for validation rules: "the rules nothing could
 * test were the ones with gaps."
 */

export type SignsDesignPayload = {
  id: string;
  label: string;
  signType: string;
  quantity: number;
  size: string;
  material: string;
  finishing: string;
  sides: string;
  fileName: string | null;
  template: { id: string; name: string; text: unknown } | null;
  /**
   * The PRODUCT, and nothing else: this design's credits included, its $15
   * setup and its finishing add-ons both EXCLUDED.
   *
   * Both exclusions are for the same reason. Setup reaches Printavo as one
   * fee line for the whole quote (the collapsed "Setup (3 designs × $15)"
   * row) and each add-on reaches it as its own fee line, so anything counted
   * here as well would be invoiced twice.
   *
   * Add-ons used to be left in, which was not a double charge — they were
   * simply absent from the fee lines instead — but it meant a cart buried
   * "Pole Pockets $30" inside a $177 unit price while a single-design quote
   * itemised it. Same money, two different invoices for the same work.
   */
  lineTotal: number;
  /**
   * This design's finishing add-ons, each its own charge. Printavo gets one
   * fee line per entry so the shop can adjust or waive one without unpicking
   * a lumped total — the same reason setup is its own line.
   */
  addOns: Array<{ label: string; amount: number; code?: string }>;
  /**
   * The RAW inputs this design was priced from — what the server needs to
   * price it AGAIN. Everything above is prose for humans ("72" x 36"",
   * "$162.00"); none of it can be fed back into the engine. This can, and
   * lib/signs-repricing.ts does exactly that: rebuilds the designs from
   * these fields, reprices with the same quoteSignsCart the browser used,
   * and substitutes its own figures. A payload without it (from before this
   * shipped) passes through unrepriced.
   */
  spec: SignsDesignSpec;
};

export type SignsDesignSpec = {
  productId: string;
  quantity: number;
  widthInches: number;
  heightInches: number;
  material: string;
  finishing: string;
  doubleSided: boolean;
  bannerAddOns: string[];
  templateId: string | null;
  templateText: Record<string, string>;
};

function describeDesign(
  design: SignsDesign,
  index: number,
  pricing: SignsCartQuote
): SignsDesignPayload {
  const product = getSignProduct(design.productId);
  const priced = pricing.designs.find((entry) => entry.id === design.id);

  return {
    id: design.id,
    label: `Design ${index + 1}`,
    signType: product.label,
    quantity: design.quantity,
    size: getSignSizeLabel(design),
    material: design.material,
    finishing: design.finishing,
    sides: design.doubleSided ? "Double-sided" : "Single-sided",
    fileName: design.artwork.file?.name || null,
    // Template work has no uploaded file — this IS the artwork brief.
    template: design.templateId
      ? {
          id: design.templateId,
          name: getTemplate(design.templateId)?.name || design.templateId,
          text: resolveTemplateText(design.templateId, design.templateText),
        }
      : null,
    ...describeMoney(priced?.pricing),
    spec: {
      productId: design.productId,
      quantity: design.quantity,
      // The dimensions the PRICE derives from, not the raw boxes — yard
      // signs freeze at 18" x 24" whatever was typed, and the server must
      // price the same shape the browser did.
      ...(() => {
        const { widthInches, heightInches } = getSignDimensions(design);
        return { widthInches, heightInches };
      })(),
      material: design.material,
      finishing: design.finishing,
      doubleSided: design.doubleSided,
      bannerAddOns: design.bannerAddOns ?? [],
      templateId: design.templateId,
      templateText: design.templateText ?? {},
    },
  };
}

/**
 * Split one design's cost into the product and its add-ons.
 *
 * `subtotal` is everything except setup, so the add-ons are subtracted back
 * out rather than recomputed — there is no second copy of an add-on's price
 * anywhere, and a new add-on kind is carried by this without being taught
 * about.
 */
function describeMoney(pricing: SignsCartQuote["designs"][number]["pricing"] | undefined) {
  if (!pricing?.priceable) return { lineTotal: 0, addOns: [] };

  const addOns = pricing.lines
    .filter((line) => line.kind === "addOn" && line.amount > 0)
    .map((line) => ({
      label: line.label,
      amount: line.amount,
      code: line.code,
    }));

  const addOnTotal = addOns.reduce((sum, addOn) => sum + addOn.amount, 0);

  return {
    lineTotal: Math.round((pricing.subtotal - addOnTotal) * 100) / 100,
    addOns,
  };
}

export function buildSignsPayloadParts(
  designs: SignsDesign[],
  pricing: SignsCartQuote,
  /**
   * Which large-format pipeline this quote came down. Banners and signs are
   * separate products with separate carts (Gabe, 2026-08-23); the family is
   * what names the order in the shop email, the Printavo nickname and the
   * customer's record. Defaults from design 1's product so a caller that
   * predates the split still files under the right pipeline.
   */
  family: SignFamily = getSignProduct(designs[0]?.productId).family
) {
  const first = designs[0];
  const firstProduct = getSignProduct(first.productId);

  return {
    /**
     * SYNTHESISED, and it has to stay that way. lib/email.ts and
     * lib/printavo.ts duck-type the flow off `product` — dropping it makes a
     * signs quote stop looking like a signs quote, exactly as AGENTS.md
     * describes for the sticker cart. It describes design 1 and carries the
     * whole order's sign count, so anything that reads the JOB off it alone
     * is wrong on a cart; both consumers read `signsDesigns` instead.
     *
     * `type` names the PIPELINE now — "Vinyl Banners" or "Signs", not the
     * old combined card. Classification downstream is safe either way:
     * isSigns() in both consumers keys on `signType` being present, and
     * isStickerOrder() requires "sticker" in the type, so neither string can
     * change which branch handles the quote — only what the branch calls it.
     */
    product: {
      type: SIGN_FAMILIES[family].label,
      family,
      signType: firstProduct.label,
      quantity: pricing.quantity,
      size: getSignSizeLabel(first),
      material: first.material,
      finishing: first.finishing,
      sides: first.doubleSided ? "Double-sided" : "Single-sided",
      designCount: designs.length,
    },
    /**
     * The real content of the quote. Present even for one design, so nothing
     * downstream has to branch on the count to find the truth.
     */
    signsDesigns: designs.map((design, index) =>
      describeDesign(design, index, pricing)
    ),
    /** Design 1's, kept for consumers that predate the design list. */
    artwork: {
      fileName: first.artwork.file?.name || null,
      template: first.templateId
        ? {
            id: first.templateId,
            name: getTemplate(first.templateId)?.name || first.templateId,
            text: resolveTemplateText(first.templateId, first.templateText),
          }
        : null,
    },
    pricing: pricing.priceable
      ? {
          total: pricing.total,
          unitPrice: pricing.unitPrice,
          lines: pricing.lines,
          quoteRequired: false,
          note: `${pricing.note} Estimate — Gorilla Salem confirms artwork and add-ons before production.`,
        }
      : {
          total: 0,
          quoteRequired: true,
          note:
            pricing.reason ||
            "Priced by hand. Gorilla Salem will reply with the price.",
        },
  };
}
