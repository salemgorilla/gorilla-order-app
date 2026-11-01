/**
 * PAPER PRINTING — what can be ordered. No prices live here.
 *
 * Gabe, 2026-10-23: paper is printed through the shop's 4over trade-partner
 * account; he asked for business cards, rack cards, postcards, trifold
 * brochures, letterhead and menus, with "instant price, pay online" and prices
 * built from 4over cost plus his markup.
 *
 * Same split as signs: this file says WHAT can be ordered, and
 * lib/paper-pricing-config.ts says what it COSTS. A price changes weekly; a
 * product list does not, and editing one must never be able to break the other.
 *
 * ── THE OPTIONS ARE THE SHOP'S CATALOGUE, NOT 4OVER'S ─────────────────────
 * Stocks, sizes and quantity breaks below are the customer-facing menu. They
 * are NOT yet mapped to 4over product codes: that mapping needs 4over's own
 * product data (API credentials or an export), which this repo does not have.
 * Until it does, nothing here is priced and every paper order is a quote
 * request (see isPaperPriced in lib/paper-pricing.ts).
 *
 * ── THE PRODUCT TYPE STRING ───────────────────────────────────────────────
 * Every paper payload carries `product.type === PAPER_PRODUCT_TYPE`. That string
 * is load-bearing: lib/order-flow.ts classifies by substrings of it, and a
 * product type containing "sign", "banner", "sticker" or "apparel" is read as
 * that flow ("Paper Printing - Business Card Designs" would be read as SIGNS,
 * because "designs" contains "signs"). Do not add words to it.
 */

export const PAPER_PRODUCT_TYPE = "Paper Printing";

export type PaperProductId =
  | "business-cards"
  | "rack-cards"
  | "postcards"
  | "brochures"
  | "letterhead"
  | "menus";

export type PaperSize = {
  /** What the customer sees, e.g. `3.5" x 2"`. */
  label: string;
  widthInches: number;
  heightInches: number;
};

export type PaperProduct = {
  id: PaperProductId;
  label: string;
  /** Singular, for sentences and line-item titles. */
  singular: string;
  blurb: string;
  sizes: PaperSize[];
  stocks: string[];
  /** Fixed run sizes. Print is sold in breaks, not by the piece. */
  quantities: number[];
  /** Optional extras the customer can tick. Priced separately later. */
  finishing: string[];
};

export const SINGLE_SIDED = "Single-sided";
export const DOUBLE_SIDED = "Double-sided";
export const PAPER_SIDES = [SINGLE_SIDED, DOUBLE_SIDED] as const;

const size = (label: string, widthInches: number, heightInches: number): PaperSize => ({
  label,
  widthInches,
  heightInches,
});

export const paperProducts: PaperProduct[] = [
  {
    id: "business-cards",
    label: "Business Cards",
    singular: "Business Card",
    blurb: "Standard 3.5 x 2 in cards on 14pt or 16pt stock.",
    sizes: [size('3.5" x 2"', 3.5, 2)],
    stocks: [
      "14pt Matte",
      "14pt Gloss",
      "16pt Matte",
      "16pt Gloss",
      "16pt Soft Touch",
      "Uncoated",
    ],
    quantities: [100, 250, 500, 1000, 2500],
    finishing: ["Rounded corners"],
  },
  {
    id: "rack-cards",
    label: "Rack Cards",
    singular: "Rack Card",
    blurb: "4 x 9 in cards for counters, racks and handouts.",
    sizes: [size('4" x 9"', 4, 9)],
    stocks: ["14pt Gloss", "16pt Matte", "100lb Text"],
    quantities: [100, 250, 500, 1000, 2500],
    finishing: [],
  },
  {
    id: "postcards",
    label: "Postcards",
    singular: "Postcard",
    blurb: "Mailers and handouts in three common sizes.",
    sizes: [size('4" x 6"', 4, 6), size('5" x 7"', 5, 7), size('6" x 9"', 6, 9)],
    stocks: ["14pt Gloss", "14pt Matte", "16pt Matte"],
    quantities: [100, 250, 500, 1000, 2500, 5000],
    finishing: [],
  },
  {
    id: "brochures",
    label: "Trifold Brochures",
    singular: "Trifold Brochure",
    blurb: "8.5 x 11 in, folded in three. Folding is included.",
    sizes: [size('8.5" x 11" (folds to 3.67" x 8.5")', 8.5, 11)],
    stocks: ["100lb Gloss Text", "100lb Matte Text", "80lb Uncoated"],
    quantities: [100, 250, 500, 1000],
    finishing: [],
  },
  {
    id: "letterhead",
    label: "Letterhead",
    singular: "Letterhead",
    blurb: "8.5 x 11 in sheets for your office stationery.",
    sizes: [size('8.5" x 11"', 8.5, 11)],
    stocks: ["70lb Uncoated Text", "24lb Bond", "100lb Gloss Text"],
    quantities: [250, 500, 1000],
    finishing: [],
  },
  {
    id: "menus",
    label: "Menus",
    singular: "Menu",
    blurb: "Flat menus in three sizes, on gloss or matte text.",
    sizes: [
      size('8.5" x 11"', 8.5, 11),
      size('8.5" x 14"', 8.5, 14),
      size('11" x 17"', 11, 17),
    ],
    stocks: ["100lb Gloss Text", "100lb Matte Text", "14pt Gloss"],
    quantities: [50, 100, 250, 500],
    finishing: [],
  },
];

export function paperProductById(id: unknown): PaperProduct | undefined {
  return paperProducts.find((product) => product.id === id);
}

/** The ordering a customer's choices are held in. */
export type PaperSpec = {
  productId: PaperProductId;
  size: string;
  stock: string;
  quantity: number;
  sides: (typeof PAPER_SIDES)[number];
  finishing: string[];
  notes: string;
};

export function defaultPaperSpec(productId: PaperProductId = "business-cards"): PaperSpec {
  const product = paperProductById(productId) ?? paperProducts[0];

  return {
    productId: product.id,
    size: product.sizes[0].label,
    stock: product.stocks[0],
    quantity: product.quantities[Math.min(1, product.quantities.length - 1)],
    sides: DOUBLE_SIDED,
    finishing: [],
    notes: "",
  };
}

/**
 * Re-point a spec at another product, keeping what still applies.
 *
 * Switching from business cards to postcards must not leave a "16pt Soft
 * Touch" stock or a 2,500-piece run selected on a product that does not sell
 * them: the stale value would validate nowhere and fail late, at submit.
 */
export function paperSpecForProduct(
  spec: PaperSpec,
  productId: PaperProductId
): PaperSpec {
  const product = paperProductById(productId) ?? paperProducts[0];

  return {
    productId: product.id,
    size: product.sizes.some((s) => s.label === spec.size) ? spec.size : product.sizes[0].label,
    stock: product.stocks.includes(spec.stock) ? spec.stock : product.stocks[0],
    quantity: product.quantities.includes(spec.quantity)
      ? spec.quantity
      : product.quantities[Math.min(1, product.quantities.length - 1)],
    sides: spec.sides,
    finishing: spec.finishing.filter((item) => product.finishing.includes(item)),
    notes: spec.notes,
  };
}

export type PaperSpecErrors = Partial<Record<keyof PaperSpec, string>>;

/**
 * What is wrong with a spec, by field. Empty means it can be quoted.
 *
 * Checked against the catalogue rather than against the form: the server runs
 * this too, and a payload that names a stock the product does not offer is not
 * one to price, whoever built it.
 */
export function validatePaperSpec(spec: PaperSpec | null | undefined): PaperSpecErrors {
  const errors: PaperSpecErrors = {};
  const product = paperProductById(spec?.productId);

  if (!spec || !product) {
    return { productId: "Choose what you would like printed." };
  }

  if (!product.sizes.some((s) => s.label === spec.size)) {
    errors.size = "Choose one of the available sizes.";
  }

  if (!product.stocks.includes(spec.stock)) {
    errors.stock = "Choose one of the available paper stocks.";
  }

  if (!product.quantities.includes(spec.quantity)) {
    errors.quantity = "Choose one of the available quantities.";
  }

  if (!PAPER_SIDES.includes(spec.sides)) {
    errors.sides = "Choose single-sided or double-sided.";
  }

  if (
    !Array.isArray(spec.finishing) ||
    spec.finishing.some((item) => !product.finishing.includes(item))
  ) {
    errors.finishing = "One of the finishing options is not offered for this product.";
  }

  return errors;
}

/** The spec as readable lines, for the shop email and the Printavo description. */
export function describePaperSpec(spec: PaperSpec): string[] {
  const product = paperProductById(spec.productId);

  return [
    `Product: ${product?.label ?? spec.productId}`,
    `Size: ${spec.size}`,
    `Stock: ${spec.stock}`,
    `Quantity: ${spec.quantity.toLocaleString("en-US")}`,
    `Printing: ${spec.sides}`,
    ...(spec.finishing.length ? [`Finishing: ${spec.finishing.join(", ")}`] : []),
    ...(spec.notes.trim() ? [`Notes: ${spec.notes.trim()}`] : []),
  ];
}

/**
 * A paper spec out of a payload's `product` object, or null.
 *
 * `/api/quote` is public, so every field is caller-supplied text. This only
 * COERCES to the right types; it does not decide the spec is valid. Validity is
 * validatePaperSpec's job, and a payload that fails it is refused by the route.
 *
 * Fields on the payload: `paperProductId`, `size`, `stock`, `quantity`, `sides`,
 * `finishing` (array) and `paperNotes`.
 */
export function paperSpecFromProduct(product: Record<string, unknown>): PaperSpec | null {
  const productId = paperProductById(product.paperProductId)?.id;
  if (!productId) return null;

  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const quantity = Number(product.quantity);

  return {
    productId,
    size: text(product.size),
    stock: text(product.stock),
    quantity: Number.isFinite(quantity) ? quantity : 0,
    sides: text(product.sides) as PaperSpec["sides"],
    finishing: Array.isArray(product.finishing) ? product.finishing.map(text).filter(Boolean) : [],
    notes: text(product.paperNotes).slice(0, 2000),
  };
}

export const PAPER_QUOTE_NOTE =
  "Paper printing is priced by hand from the shop's 4over account.";

/**
 * THE ORDER AS THE SERVER WILL STORE AND SEND IT: no money in it.
 *
 * `/api/quote` is public and `pricing` arrives from the browser. For paper
 * every figure in it is replaced here, before the record, the shop email, the
 * Printavo quote or anything else reads it: a total of $0, a hand quote, no
 * discount, no shipping, no setup, no rush. A tampered `pricing.total` on a
 * paper order therefore cannot reach an invoice line, and no code path can
 * mistake a paper order for a priced one.
 *
 * The other half of the guarantee is that nothing here can raise a payment
 * link at all: see isPaperProduct in lib/order-flow.ts, which is a SHAPE
 * predicate with no authority counterpart.
 */
export function paperQuoteOrder<T extends Record<string, unknown>>(order: T): T {
  return {
    ...order,
    discount: null,
    pricing: { total: 0, quoteRequired: true, note: PAPER_QUOTE_NOTE },
  };
}
