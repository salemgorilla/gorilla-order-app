export type DeadlineType = "Firm" | "Flexible";

export type DeliveryMethod = "Pickup" | "Ship";

export type Customer = {
  customerName: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
};

export type Product = {
  type: string;
  quantity: number;
  /** Preset label, e.g. '3"', or CUSTOM_STICKER_SIZE when dimensions are used. */
  size: string;
  /**
   * Real dimensions. Price is area x rate, so these are what actually drive
   * cost — the preset `size` is just a shortcut that fills them in as a square.
   * 0 means "not set, fall back to the preset".
   */
  widthInches: number;
  heightInches: number;
  shape: string;
  material: string;
  finish: string;
  // Preview/production placement of the art on the decal (0–100).
  // artScale = how large the art is; artMargin = die-cut border / shape margin.
  artScale: number;
  artMargin: number;
  // Customer confirms their artwork includes a magenta line marking the cut edge.
  magentaCutLine: boolean;
};

export type Artwork = {
  file: File | null;
};

export type Production = {
  needBy: string;
  deadlineType: DeadlineType;
  deliveryMethod: DeliveryMethod;
};

export type Pricing = {
  stickerPrice: number;
  shippingPrice: number;
  total: number;
};

/**
 * An extra item the customer asked to add to this quote.
 *
 * Add-ons never touch `Pricing.total`. Both lib/email.ts and lib/printavo.ts
 * derive a per-unit price by dividing a total by the PRIMARY product's
 * quantity, so folding add-on money into the total silently corrupts the
 * per-unit figure the shop prices from.
 */
export type AddOn = {
  id: string;
  label: string;
  /** 0 when the shop has to price it by hand. */
  amount: number;
  quoteRequired: boolean;
};

export type Order = {
  customer: Customer;
  product: Product;
  artwork: Artwork;
  production: Production;
  pricing: Pricing;
  /**
   * Top level, deliberately NOT inside `Product` — the signs and apparel
   * flows replace `product` wholesale when they build their payloads, and
   * lib/email.ts / lib/printavo.ts duck-type the flow off its keys.
   */
  addOns: AddOn[];
  /** Free-text catch-all for anything the list does not cover. */
  addOnsNote: string;
};