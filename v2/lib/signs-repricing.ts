import { quoteSignsCart } from "./signs-cart";
import {
  buildSignsPayloadParts,
  type SignsDesignSpec,
} from "./signs-payload";
import { getSignProduct, type SignsDesign } from "./signs";

/**
 * Reprice a signs or banners quote on the SERVER, before anything downstream
 * reads a number from it.
 *
 * ── WHY, WHEN NOTHING AUTO-BILLS ──────────────────────────────────────────
 * Stickers get repriced because a payment link is raised unattended. Signs
 * and banners never get that link — but their figures still land as Printavo
 * LINE ITEMS on a quote the shop invoices from. The protection until now was
 * "the shop reviews it by hand", and the review reads the very numbers the
 * browser sent: a tampered payload does not look tampered, it looks like a
 * priced quote. Same three causes as the sticker note lists — a stale page,
 * an edited total, or a genuine engine disagreement — and the shop wants to
 * know about all of them before quoting a customer from the figure.
 *
 * ── HOW: RE-SYNTHESIS, NOT PATCHING ───────────────────────────────────────
 * Each payload design carries `spec` — the raw inputs it was priced from.
 * The designs are rebuilt from those specs and pushed through the SAME
 * buildSignsPayloadParts + quoteSignsCart the browser used, so the server's
 * product block, per-design money, size labels and pricing are one
 * construction, not a second copy that can drift. Only what the server
 * cannot know survives from the client: the design ids (the multipart
 * artwork keys — rewriting them would orphan every attachment) and each
 * design's artwork file name.
 *
 * A consequence worth naming: the DISPLAY is re-derived from the same spec
 * as the CHARGE. A payload claiming "quantity 100" in its prose while its
 * spec says 1 comes out saying — and costing — 1 of everything, instead of
 * displaying 100 and charging for 1.
 *
 * ── WHAT PASSES THROUGH ───────────────────────────────────────────────────
 * Payloads from before `spec` existed (an open tab) have nothing to reprice
 * from and pass through untouched — they were built by our own bundle, and
 * refusing them would fail real orders over an upgrade. Non-signs orders
 * pass through by construction.
 */
export function repriceSigns(order: Record<string, unknown>) {
  const clientPricing = (order.pricing || {}) as Record<string, unknown>;
  const clientTotal = Number(clientPricing.total) || 0;

  const passThrough = {
    order,
    mismatch: false,
    unpriceable: false,
    clientTotal,
    serverTotal: clientTotal,
    /** True only when this function actually recomputed the money. */
    repriced: false,
  };

  const entries = Array.isArray(order.signsDesigns)
    ? (order.signsDesigns as Record<string, unknown>[])
    : [];

  if (!entries.length) return passThrough;
  if (!entries.every((entry) => entry && typeof entry.spec === "object" && entry.spec)) {
    return passThrough;
  }

  const designs: SignsDesign[] = entries.map((entry, index) => {
    const spec = entry.spec as SignsDesignSpec;

    return {
      // The client's id, kept deliberately: artwork parts arrive keyed
      // `artwork:<id>` and the route orders attachments by these.
      id: String(entry.id || `repriced-${index + 1}`),
      productId: String(spec.productId || ""),
      quantity: Math.max(1, Math.floor(Number(spec.quantity) || 1)),
      size: "",
      customSize: "",
      customWidthInches: Number(spec.widthInches) || 0,
      customHeightInches: Number(spec.heightInches) || 0,
      material: String(spec.material || ""),
      finishing: String(spec.finishing || ""),
      doubleSided: Boolean(spec.doubleSided),
      bannerAddOns: Array.isArray(spec.bannerAddOns)
        ? spec.bannerAddOns.map(String)
        : [],
      templateId: spec.templateId ? String(spec.templateId) : null,
      templateText:
        spec.templateText && typeof spec.templateText === "object"
          ? (spec.templateText as Record<string, string>)
          : {},
      artwork: { file: null },
    };
  });

  const cart = quoteSignsCart(designs);
  const family = getSignProduct(designs[0].productId).family;
  const rebuilt = buildSignsPayloadParts(designs, cart, family);

  const serverTotal = cart.priceable ? cart.total : 0;
  const clientClaimedPriceable = !clientPricing.quoteRequired && clientTotal > 0;

  return {
    order: {
      ...order,
      product: rebuilt.product,
      pricing: rebuilt.pricing,
      signsDesigns: rebuilt.signsDesigns.map((entry, index) => ({
        ...entry,
        // The one fact the server cannot recompute: which file the customer
        // attached to this design.
        fileName: (entries[index]?.fileName as string | null) ?? null,
      })),
    },
    /**
     * Cents of float drift are not worth shouting about; real tampering is —
     * the same threshold repriceStickers uses. A quote the server cannot
     * price at all while the client claimed a figure is a mismatch too:
     * the claimed number was not one our engine produced.
     */
    mismatch: cart.priceable
      ? Math.abs(serverTotal - clientTotal) > 0.01
      : clientClaimedPriceable,
    unpriceable: !cart.priceable,
    clientTotal,
    serverTotal,
    repriced: true,
  };
}
