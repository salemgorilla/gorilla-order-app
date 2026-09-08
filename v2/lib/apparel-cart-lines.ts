/**
 * The garment lines a customer ADDS to an apparel quote — "also 12 of these
 * as hoodies" — as the form holds them, before they are priced.
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────────
 * The configurator (ApparelBuilder) stays exactly what it is: it configures
 * the FIRST garment in full — catalogue product, colour, the size grid, the
 * print spec. This module is the "and also" underneath it: extra garments
 * that share the same print, each named by catalogue product and colour
 * with a rough count. lib/apparel-cart.ts then prices the whole thing as
 * one quote — combined quantity for the print tier, setup charged once.
 *
 * ── SIZES, PER LINE — Gabe, 2026-09-08 ────────────────────────────────────
 * "When I added another garment in the apparel button, there was no way to
 * enter the size breakdown. Can you make sure that each step is consistent."
 *
 * Extras used to carry a rough count and nothing else, priced on the
 * ASSUMED size mix even when the first garment had exact sizes entered.
 * The reasoning was that a per-line grid is more form than "how many
 * hoodies" deserves — but it left the SAME question answered two different
 * ways on one screen, and it cost more than tidiness: the hoodies were
 * blended while the tees were exact, and every row on a cart's Printavo
 * invoice was filed under `size_other` because no line had sizes to send.
 *
 * So a line now holds its own `sizeQuantities`, exactly as the first
 * garment does, and its count comes from the grid the moment the grid
 * holds anything — extraLineQuantity() below is the ONE place that rule is
 * spelled. A line with no sizes entered still stands on the blend and
 * still says so; nothing is forced.
 *
 * ── WHY LINES REFERENCE THE CATALOGUE BY ID ───────────────────────────────
 * A line stores `productId` and `colorName`, never a price. It is resolved
 * against the live catalogue every render (resolveExtraGarmentLines), so
 * the figure is always today's — the same rule the reorder link follows.
 * A line whose product has left the catalogue resolves to nothing and the
 * validator says so, rather than pricing a garment that no longer exists.
 *
 * ── WHY A NEW LINE IS EMPTY ───────────────────────────────────────────────
 * newExtraGarmentLine() has no product, no colour and a count of 0. A
 * default of "12 of the first product in white" would put a figure on the
 * screen for a garment nobody chose — the phantom-shirt shape the cart
 * engine already refuses. An empty line prices nothing, and the validator
 * refuses to submit with one still blank.
 */
import type { SsCatalogColor, SsCatalogProduct } from "../features/types";
import { blendedGarmentUnitPrice, garmentPriceByMarkup } from "./apparel-blend";
import type { ApparelCartLine } from "./apparel-cart";
import { pruneSizeQuantities } from "./size-quantities";

export type ExtraGarmentLine = {
  id: string;
  /** SsCatalogProduct.id, or "" until chosen. */
  productId: string;
  /** SsCatalogColor.colorName, or "" until chosen. */
  colorName: string;
  /**
   * The ROUGH count — what the line stands on until sizes are entered.
   * Read through extraLineQuantity(), never directly: once the grid holds
   * anything the grid is the count, and reading this field on its own is
   * how the two would disagree.
   */
  quantity: number;
  /**
   * This line's own size grid, `{ M: 12, L: 6 }`. Empty until the customer
   * opens it. Same shape and same rules as the first garment's, including
   * pruning on a colour change (pruneSizeQuantities).
   *
   * OPTIONAL on purpose: a line restored from a draft written before 8 Sep
   * has no grid at all, and "no grid" must keep meaning "stands on its
   * rough count" rather than "an order of zero". newExtraGarmentLine always
   * sets it; every reader goes through extraLineQuantity().
   */
  sizeQuantities?: Record<string, number>;
};

let lineCounter = 0;

export function newExtraGarmentLine(): ExtraGarmentLine {
  lineCounter += 1;

  return {
    id: `garment-${Date.now().toString(36)}-${lineCounter}`,
    productId: "",
    colorName: "",
    quantity: 0,
    sizeQuantities: {},
  };
}

/**
 * How many garments this line is, from whichever answer the customer gave.
 *
 * THE SIZE GRID WINS. The first garment has worked this way since the size
 * grid became its quantity — typing M-4 L-6 2XL-2 IS the order, and there
 * is no second number to reconcile against. That removed this flow's only
 * failure state ("Size breakdown must total 24, current total is 22"), and
 * a line that asked the same question twice would put it straight back.
 *
 * Tolerates a line from before per-line sizes existed (a restored draft, an
 * old test fixture): no grid is not an empty grid, it is a rough count.
 */
export function extraLineQuantity(line: ExtraGarmentLine): number {
  const fromSizes = Object.values(line.sizeQuantities || {}).reduce(
    (sum, quantity) => sum + (quantity > 0 ? quantity : 0),
    0
  );

  return fromSizes > 0 ? fromSizes : Math.max(0, Math.floor(line.quantity || 0));
}

/** "M-12, L-6" for this line, or "" when it stands on a rough count. */
export function extraLineSizeBreakdown(line: ExtraGarmentLine): string {
  return Object.entries(line.sizeQuantities || {})
    .filter(([, quantity]) => quantity > 0)
    .map(([size, quantity]) => `${size}-${quantity}`)
    .join(", ");
}

/** True once this line prices from its own sizes rather than the blend. */
export function extraLineHasSizes(line: ExtraGarmentLine): boolean {
  return extraLineSizeBreakdown(line).length > 0;
}

/**
 * One edit to one line, with the size grid kept honest.
 *
 * A line's grid rows ARE the chosen colour's size run, so changing the
 * garment or the colour can strand counts for sizes the new colour is not
 * stocked in — they keep totalling, invisibly, with no row on screen to
 * zero them. That is the same trap the first garment fell into (see
 * lib/size-quantities.ts, found by driving the live catalogue), and it
 * bites harder here: the line's COUNT is the grid total, so a stranded row
 * would silently order shirts that cannot be bought.
 *
 * Sizes the new colour also carries survive, so switching a hoodie from
 * Black to Navy keeps the breakdown. Written as a pure function rather than
 * inside the setState callback because this is a rule, not plumbing.
 */
export function applyExtraLineUpdate(
  line: ExtraGarmentLine,
  updates: Partial<ExtraGarmentLine>,
  products: SsCatalogProduct[]
): ExtraGarmentLine {
  const next = { ...line, ...updates };

  const changedGarment =
    updates.productId !== undefined && updates.productId !== line.productId;
  const changedColor =
    updates.colorName !== undefined && updates.colorName !== line.colorName;

  if (!changedGarment && !changedColor) return next;

  const color = findExtraLineColor(next, products);

  // No colour yet — mid-change, or a garment whose colours have not loaded.
  // Keep what was typed rather than throwing it away on a transient state.
  if (!color) return next;

  return {
    ...next,
    sizeQuantities: pruneSizeQuantities(
      next.sizeQuantities || {},
      color.sizes.map((size) => size.sizeName)
    ).quantities,
  };
}

/** −/+ one of a size on one line, dropping the row when it reaches zero. */
export function stepExtraLineSize(
  line: ExtraGarmentLine,
  sizeName: string,
  change: number
): ExtraGarmentLine {
  const current = line.sizeQuantities || {};

  return setExtraLineSize(line, sizeName, (current[sizeName] || 0) + change);
}

/** A typed count for one size on one line. Zero removes the row. */
export function setExtraLineSize(
  line: ExtraGarmentLine,
  sizeName: string,
  value: number
): ExtraGarmentLine {
  const quantity = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const next = { ...(line.sizeQuantities || {}) };

  // Deleted rather than left at 0, so extraLineHasSizes() means "the
  // customer entered sizes" and not "a grid object exists".
  if (quantity > 0) {
    next[sizeName] = quantity;
  } else {
    delete next[sizeName];
  }

  return { ...line, sizeQuantities: next };
}

/** Clears one line's grid, handing the count back to its rough number. */
export function resetExtraLineSizes(line: ExtraGarmentLine): ExtraGarmentLine {
  return { ...line, sizeQuantities: {} };
}

export function findExtraLineProduct(
  line: ExtraGarmentLine,
  products: SsCatalogProduct[]
): SsCatalogProduct | null {
  return products.find((product) => product.id === line.productId) ?? null;
}

export function findExtraLineColor(
  line: ExtraGarmentLine,
  products: SsCatalogProduct[]
): SsCatalogColor | null {
  const product = findExtraLineProduct(line, products);

  return (
    product?.colors.find((color) => color.colorName === line.colorName) ?? null
  );
}

/**
 * The lines as the cart engine wants them: label, colour, a clean per-shirt
 * price, and a count. Lines that cannot be priced — no product, no colour,
 * no count, or a product the catalogue no longer carries — are LEFT OUT,
 * so they contribute nothing to the figure. The validator is what stops a
 * blank line from being submitted; this only stops it from being priced.
 */
export function resolveExtraGarmentLines(
  lines: ExtraGarmentLine[],
  products: SsCatalogProduct[]
): ApparelCartLine[] {
  const resolved: ApparelCartLine[] = [];

  for (const line of lines) {
    const product = findExtraLineProduct(line, products);
    const color = findExtraLineColor(line, products);
    const quantity = extraLineQuantity(line);

    if (!product || !color || !(quantity > 0)) continue;

    const sizeQuantities = extraLineHasSizes(line)
      ? line.sizeQuantities ?? null
      : null;

    resolved.push({
      id: line.id,
      garmentLabel: product.customerLabel || product.displayName,
      colorName: color.colorName,
      catalogStyle: product.catalogStyle,
      // At every markup: the cart picks the tier for the WHOLE run and, with
      // it, which of these the blank is charged at. EXACT from this line's
      // own grid when it has one — every size at its own SKU, the same
      // footing the first garment gets — and blended when it does not.
      garmentPriceByMarkup: garmentPriceByMarkup(color, sizeQuantities, quantity),
      garmentUnitPrice: blendedGarmentUnitPrice(color),
      quantity,
      // Carried so the invoice can file this line under real S/M/L rows
      // rather than one `size_other` bucket. "" when it has no sizes.
      sizeBreakdown: extraLineSizeBreakdown(line),
    });
  }

  return resolved;
}

/**
 * What is wrong with each line, keyed by line id. Empty when nothing is.
 * Short, because each message sits inside the line's own row.
 */
export function extraGarmentLineErrors(
  lines: ExtraGarmentLine[],
  products: SsCatalogProduct[]
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const line of lines) {
    if (!line.productId) {
      errors[line.id] = "Choose a garment.";
    } else if (!findExtraLineProduct(line, products)) {
      errors[line.id] = "That garment is no longer in the catalog — choose another.";
    } else if (!line.colorName || !findExtraLineColor(line, products)) {
      errors[line.id] = "Choose a color.";
    } else if (!(extraLineQuantity(line) > 0)) {
      // Either answer clears it — a rough count, or any size typed in the
      // grid. The message names the simpler one.
      errors[line.id] = "Enter how many.";
    }
  }

  return errors;
}

/**
 * Should a surface LIST the garments, rather than describe the configured
 * one?
 *
 * The obvious test — "more than one line" — has a hole, found by driving it
 * on 8 Sep: set the configured garment to 0 and put 12 hoodies on an added
 * line, and the quote prices exactly one line, the hoodie. The review card
 * took the single-garment branch and described the TEE, at quantity 0,
 * beside a $397 estimate for hoodies. Two numbers on one card that cannot
 * both be about the same thing.
 *
 * That state cannot be submitted — the count rule blocks it, and now says
 * which garment it means — but it is reachable, readable, and the card is
 * where a customer checks their order.
 */
export function shouldListGarments(
  lines: Array<{ quantity: number }>,
  configuredQuantity: number
): boolean {
  const priced = lines.filter((line) => line.quantity > 0);

  // Several garments, or one that is not the configured one.
  return priced.length > 1 || (priced.length === 1 && !(configuredQuantity > 0));
}

type PricedLine = {
  garmentLabel: string;
  colorName: string;
  quantity: number;
  sizeBreakdown?: string;
};

/**
 * Which footing the quote's garments stand on: their own sizes, or the
 * assumed mix — and, when it is both, WHICH garments are which.
 *
 * Until per-line sizes existed this could only ever be "the first garment
 * is exact, the rest are assumed", and the note said exactly that in every
 * cart. Now any combination is reachable, so the sentence is derived from
 * the lines rather than asserted.
 */
export function describeQuoteSizeBasis(lines: PricedLine[]): {
  basis: "exact" | "assumed" | "mixed";
  /** Garments still on the assumption, named. Empty when none are. */
  assumedGarments: string[];
} {
  const priced = lines.filter((line) => line.quantity > 0);

  const assumedGarments = priced
    .filter((line) => !(line.sizeBreakdown || "").trim())
    .map((line) =>
      line.colorName ? `${line.garmentLabel} / ${line.colorName}` : line.garmentLabel
    );

  if (priced.length === 0 || assumedGarments.length === priced.length) {
    return { basis: "assumed", assumedGarments };
  }

  return {
    basis: assumedGarments.length === 0 ? "exact" : "mixed",
    assumedGarments,
  };
}

/**
 * Does any garment in the quote need a white underbase?
 *
 * The print spec is shared across the quote, and the engine applies one
 * underbase decision to every piece. So a quote with white tees AND black
 * hoodies is priced WITH the underbase on all of it — over on the white
 * tees, never under on the black ones. Stated here so it can be argued
 * with: apparel is hand-confirmed before anything is charged, and the
 * direction an estimate errs in matters more than its size.
 */
export function anyGarmentNeedsUnderbase(
  primaryColorName: string,
  lines: ExtraGarmentLine[]
): boolean {
  if (primaryColorName !== "White") return true;

  return lines.some((line) => line.colorName && line.colorName !== "White");
}

/**
 * "24 × Premium Tee / White (M-12, L-12) · 12 × Hoodie / Black" — for the shop.
 *
 * The sizes are in the sentence because this is the line the shop email and
 * the Printavo note lead with, and a cart's garments each have their own
 * breakdown now. A line with no sizes entered simply has no parenthesis:
 * the shop can see at a glance which garments were specified and which are
 * still a rough count.
 */
export function describeGarmentLines(
  lines: Array<{
    garmentLabel: string;
    colorName: string;
    quantity: number;
    sizeBreakdown?: string;
  }>
): string {
  return lines
    .map((line) => {
      const sizes = (line.sizeBreakdown || "").trim();

      return `${line.quantity} × ${line.garmentLabel} / ${line.colorName}${
        sizes ? ` (${sizes})` : ""
      }`;
    })
    .join(" · ");
}
