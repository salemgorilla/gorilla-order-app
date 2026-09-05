import { applyRush, RUSH_LINE_LABEL } from "./rush";
import type { TurnaroundLane } from "./turnaround";
import {
  calculateSignsPricing,
  signsFeeTotal,
  type SignsPricingLine,
  type SignsPricingResult,
} from "./signs-pricing";
import { signsPricingConfig } from "./signs-pricing-config";
import {
  getSignDimensions,
  getSignProduct,
  getYardSignSizeKey,
  SIGN_FAMILIES,
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
  /**
   * The order minimum this quote was lifted TO, when it was — $60 for signs,
   * $45 for banners (signsPricingConfig.minimumOrder). Absent when the quote
   * cleared it on its own. The summary card reads this to say why the total
   * is what it is; the "Minimum order" line in `lines` carries the amount.
   */
  minimumApplied?: number;
  /**
   * Setup and finishing add-ons — the part of `total` that is fee rather
   * than goods, and therefore untaxed (lib/tax.ts). Carried on the quote so
   * every surface reads the same figure; app/page.tsx adds rush to it when
   * the date calls for one.
   */
  feeTotal: number;
  /**
   * Rush scheduling, when the need-by date falls inside the rush window
   * (lib/rush.ts). Not computed here — the date lives on the ORDER, not on
   * a design — but declared here because the payload has to carry it: a
   * rushed quote whose `rushFee` never left the browser reached Printavo
   * either as a mis-SKU'd taxable fee (one design) or not at all (a cart,
   * $163.75 short on a two-design test). See lib/signs-payload.ts.
   */
  rushFee?: number;
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
      feeTotal: 0,
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

  // Built once: the fee figure has to be derived from the SAME list the
  // estimate table and the invoice read, not from a second call that could
  // one day be given different arguments.
  const lines = buildCartLines(priced);

  /**
   * THE ORDER MINIMUM — Gabe, 2026-09-05. $60 for signs, $45 for banners,
   * applied once to the whole quote after designs and setup are summed.
   *
   * Cart-level on purpose, not per design: two $46 yard-sign designs are a
   * $92 order and clear it; one is $46 and does not. The family is design
   * one's — the pipelines are hard-split, so a cart is all one family.
   *
   * The top-up is its own line so the customer sees WHY the total is $60
   * (and so Printavo bills it as a row rather than burying it in a unit
   * price). Its kind is "minimum": goods, taxed — see SignsPricingLine.
   */
  const family = getSignProduct(designs[0]?.productId).family;
  const minimum = signsPricingConfig.minimumOrder[family];
  const shortfall = round2(minimum - total);
  const minimumApplied = shortfall > 0;

  if (minimumApplied) {
    lines.push({
      label: `Minimum order (${SIGN_FAMILIES[family].label.toLowerCase()} start at $${minimum})`,
      amount: shortfall,
      kind: "minimum",
      code: "MINIMUM",
    });
  }

  const chargedTotal = minimumApplied ? minimum : total;

  return {
    priceable: true,
    designs: priced,
    lines,
    subtotal,
    total: chargedTotal,
    ...(minimumApplied ? { minimumApplied: minimum } : {}),
    feeTotal: signsFeeTotal(lines),
    unitPrice: quantity > 0 ? round2(chargedTotal / quantity) : 0,
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
 * setup fees collapsed into one row, because a quote repeating "Setup fee"
 * three times reads like a mistake.
 *
 * This used to give a second reason — that a long label would squeeze the
 * shop email's value column, since the label cell carried
 * `white-space: nowrap`. It no longer does: the email now lets labels wrap and
 * protects the NUMBERS instead (see tests/email-money-wrapping.test.ts). Left
 * corrected rather than deleted, because "keep these labels short or the email
 * breaks" was true for months and is the kind of thing someone would
 * reasonably still believe.
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
    // The same SKU a one-design quote files it under. The label says how many
    // designs; the item number must not, or the shop cannot report on setup
    // across orders. See the note in lib/printavo.ts.
    code: "SETUP",
  });

  return lines;
}

/**
 * The same quote with rush scheduling applied, when the need-by date calls
 * for one. Returns the quote UNCHANGED when it does not.
 *
 * ── WHY THIS IS A FUNCTION AND NOT A useMemo ──────────────────────────────
 * It lived inside app/page.tsx's pricing memo, which no node test can mount.
 * That is not a style point: the composition it performs — add a line, add
 * to the total, add to the fee figure, expose `rushFee` — is exactly where a
 * rushed cart went to Printavo $163.75 SHORT of the quote and a rushed
 * single design went with tax on a fee that had been exempted. The tests
 * covering "Printavo invoices what the site quoted" could not reach any of
 * it; they hand-built a payload instead, so they agreed with themselves.
 *
 * A hand-quoted cart is returned untouched: there is no goods figure to take
 * a share of, and the shop prices the whole thing, rush included.
 */
export function withSignsRush(
  quote: SignsCartQuote,
  when: { needBy: string; lane: TurnaroundLane; today?: string }
): SignsCartQuote {
  if (!quote.priceable) return quote;

  const rush = applyRush({
    goodsSubtotal: quote.total,
    needBy: when.needBy,
    lane: when.lane,
    today: when.today,
  });

  if (!rush.isRush) return quote;

  return {
    ...quote,
    // Into `lines` so the estimate table, the shop email and the copied
    // record all pick it up from the one place they already read.
    lines: [
      ...quote.lines,
      {
        label: RUSH_LINE_LABEL,
        amount: rush.fee,
        // Tagged, because lib/printavo.ts bills rush from `rushFee` under its
        // own GORILLA-RUSH SKU. Untagged it was ALSO the last entry of a
        // one-design quote's `lines.slice(1)` fee sweep, so it invoiced as
        // GORILLA-SIGN-RUSH-SCHEDULING and carried tax the estimate had
        // already taken off. Found by kind, never by label text.
        kind: "rush" as const,
        code: "RUSH",
      },
    ],
    total: round2(quote.total + rush.fee),
    // Rush is a fee, so it lands in BOTH figures: the customer pays it, and
    // it is not taxed (lib/tax.ts).
    feeTotal: round2(quote.feeTotal + rush.fee),
    rushFee: rush.fee,
  };
}
