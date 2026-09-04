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
 * Extras are priced on the ASSUMED size mix (lib/apparel-blend.ts) even
 * when the first garment has exact sizes entered: a per-line size grid is
 * more form than a "how many hoodies" question deserves at estimate time,
 * and apparel is hand-confirmed before anything is charged. The basis note
 * on screen says which lines stand on which footing.
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
import { blendedGarmentUnitPrice } from "./apparel-blend";
import type { ApparelCartLine } from "./apparel-cart";

export type ExtraGarmentLine = {
  id: string;
  /** SsCatalogProduct.id, or "" until chosen. */
  productId: string;
  /** SsCatalogColor.colorName, or "" until chosen. */
  colorName: string;
  quantity: number;
};

let lineCounter = 0;

export function newExtraGarmentLine(): ExtraGarmentLine {
  lineCounter += 1;

  return {
    id: `garment-${Date.now().toString(36)}-${lineCounter}`,
    productId: "",
    colorName: "",
    quantity: 0,
  };
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

    if (!product || !color || !(line.quantity > 0)) continue;

    resolved.push({
      id: line.id,
      garmentLabel: product.customerLabel || product.displayName,
      colorName: color.colorName,
      catalogStyle: product.catalogStyle,
      garmentUnitPrice: blendedGarmentUnitPrice(color),
      quantity: Math.floor(line.quantity),
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
    } else if (!(line.quantity > 0)) {
      errors[line.id] = "Enter how many.";
    }
  }

  return errors;
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

/** "24 × Premium Tee / White · 12 × Hoodie / Black" — for the shop. */
export function describeGarmentLines(
  lines: Array<{ garmentLabel: string; colorName: string; quantity: number }>
): string {
  return lines
    .map((line) => `${line.quantity} × ${line.garmentLabel} / ${line.colorName}`)
    .join(" · ");
}
