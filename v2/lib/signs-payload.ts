import { getSignProduct, getSignSizeLabel, type SignsDesign } from "./signs";
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
   * Product only — this design's own add-ons and credits included, its $15
   * setup EXCLUDED.
   *
   * Setup reaches Printavo as ONE fee line for the whole quote (the collapsed
   * "Setup (3 designs × $15)" row). Sending the design's full total here
   * would put those $15 in the line item as well, and the shop would invoice
   * setup twice.
   */
  lineTotal: number;
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
    lineTotal: priced?.pricing.priceable ? priced.pricing.subtotal : 0,
  };
}

export function buildSignsPayloadParts(
  designs: SignsDesign[],
  pricing: SignsCartQuote
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
     */
    product: {
      type: "Banners & Signs",
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
