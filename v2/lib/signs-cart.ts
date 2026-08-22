import {
  calculateSignsPricing,
  type SignsPricingLine,
  type SignsPricingResult,
} from "./signs-pricing";
import { signsPricingConfig } from "./signs-pricing-config";
import {
  getSignDimensions,
  getSignProduct,
  getYardSignSizeKey,
  type SignsDesign,
} from "./signs";

/**
 * One signs quote, several designs.
 *
 * ── WHY THE SUM IS THE WHOLE MODEL ────────────────────────────────────────
 * The setup fee is $15 PER DESIGN (Gabe, 2026-08-22), and
 * calculateSignsPricing already prices exactly one design including its own
 * setup. So a cart is genuinely the sum of its designs — there is no
 * cart-level arithmetic to get wrong, and no second copy of the pricing rules
 * living here.
 *
 * That is the opposite of the sticker cart, where setup TAPERS ($25 for the
 * first design, $12.50 for each after) and therefore cannot be computed one
 * design at a time. Worth knowing before anyone "makes the two consistent":
 * they are different on purpose, because the shop prices them differently.
 *
 * ── ONE DESIGN MUST BE UNCHANGED ──────────────────────────────────────────
 * A single-design cart has to produce exactly what a single sign produced
 * before carts existed — same total, same lines, same wording. Every signs
 * quote the shop has ever taken is that shape, and tests/signs-price-sheet
 * pins 120 of those totals. The multi-design branches below are additive:
 * nothing runs differently when `designs.length === 1`.
 */

export type SignsCartDesign = {
  id: string;
  /** "Design 1" — position, for the customer and the shop. */
  label: string;
  /** "Yard Sign" — what it actually is. */
  productLabel: string;
  pricing: SignsPricingResult;
};

export type SignsCartQuote = {
  /** False when ANY design cannot be priced. */
  priceable: boolean;
  reason?: string;
  designs: SignsCartDesign[];
  /** Flat, for the estimate table, the shop email and Printavo. */
  lines: SignsPricingLine[];
  subtotal: number;
  total: number;
  /** Across the whole cart — total divided by the number of SIGNS. */
  unitPrice: number;
  /** Signs, not designs. Three designs of ten is thirty. */
  quantity: number;
  note: string;
  hasQuotedExtras: boolean;
  suggestions: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Price one design, driven exactly the way the builder drives it. */
export function priceSignsDesign(design: SignsDesign): SignsPricingResult {
  const product = getSignProduct(design.productId);
  const { widthInches, heightInches } = getSignDimensions(design);

  if (product.pricingMethod === null) {
    return {
      priceable: false,
      reason:
        "We price these to your space. Send the request with your measurements or a photo and Gorilla Salem will reply with a quote.",
      lines: [],
      subtotal: 0,
      total: 0,
      unitPrice: 0,
      sqftEach: 0,
      note: "",
    };
  }

  return calculateSignsPricing({
    method: product.pricingMethod,
    quantity: design.quantity,
    sizeKey: getYardSignSizeKey(widthInches, heightInches),
    widthInches,
    heightInches,
    material: design.material,
    doubleSided: design.doubleSided,
    stepStakes: design.finishing === "With Step Stakes",
    finishing: design.finishing,
    bannerAddOns: design.bannerAddOns,
  });
}

export function quoteSignsCart(designs: SignsDesign[]): SignsCartQuote {
  const priced: SignsCartDesign[] = designs.map((design, index) => ({
    id: design.id,
    label: `Design ${index + 1}`,
    productLabel: getSignProduct(design.productId).label,
    pricing: priceSignsDesign(design),
  }));

  const unpriceable = priced.find((entry) => !entry.pricing.priceable);
  const quantity = designs.reduce(
    (sum, design) => sum + Math.max(1, Math.floor(design.quantity || 1)),
    0
  );

  if (unpriceable) {
    // One hand-quoted design makes the whole quote hand-quoted. Showing a
    // total for the other two would be quoting part of an order — the
    // customer reads it as the price and the shop has to walk it back.
    return {
      priceable: false,
      reason:
        designs.length > 1
          ? `${unpriceable.label} (${unpriceable.productLabel}) — ${unpriceable.pricing.reason}`
          : unpriceable.pricing.reason,
      designs: priced,
      lines: [],
      subtotal: 0,
      total: 0,
      unitPrice: 0,
      quantity,
      note: signsPricingConfig.taxNote,
      hasQuotedExtras: false,
      suggestions: [],
    };
  }

  const total = round2(
    priced.reduce((sum, entry) => sum + entry.pricing.total, 0)
  );
  const subtotal = round2(
    priced.reduce((sum, entry) => sum + entry.pricing.subtotal, 0)
  );

  return {
    priceable: true,
    designs: priced,
    lines: buildCartLines(priced),
    subtotal,
    total,
    unitPrice: quantity > 0 ? round2(total / quantity) : 0,
    quantity,
    note: signsPricingConfig.taxNote,
    hasQuotedExtras: priced.some((entry) => entry.pricing.hasQuotedExtras),
    // Deduped: three big banners should not say the same thing about
    // reinforcement three times.
    suggestions: [
      ...new Set(priced.flatMap((entry) => entry.pricing.suggestions ?? [])),
    ],
  };
}

/**
 * The flat line list.
 *
 * One design: exactly the engine's own lines, untouched.
 *
 * Several: each design's lines prefixed with its number, and the per-design
 * setup fees collapsed into one row. Two reasons for the collapse — a quote
 * repeating "Setup fee" three times reads like a mistake, and every one of
 * these labels lands in a `white-space: nowrap` cell in the shop email, where
 * a long one squeezes the value column for the WHOLE table.
 */
function buildCartLines(priced: SignsCartDesign[]): SignsPricingLine[] {
  if (priced.length === 1) return priced[0].pricing.lines;

  const lines: SignsPricingLine[] = [];
  let setupTotal = 0;

  for (const [index, entry] of priced.entries()) {
    for (const line of entry.pricing.lines) {
      if (line.kind === "setup") {
        setupTotal += line.amount;
        continue;
      }

      lines.push({ ...line, label: `${index + 1} · ${line.label}` });
    }
  }

  lines.push({
    label: `Setup (${priced.length} designs × $${signsPricingConfig.setupFee})`,
    amount: round2(setupTotal),
    kind: "setup",
  });

  return lines;
}
