export type DeadlineType = "Firm" | "Flexible";

export type DeliveryMethod = "Pickup" | "Ship";

export type Customer = {
  customerName: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
  /**
   * How they found the shop. Multi-select — someone can be sent by a friend
   * AND check the Google listing before calling, and forcing one answer would
   * record the wrong one.
   *
   * Optional by design: it is marketing intel, not order data, and this form's
   * known failure is abandonment. Nothing validates it and nothing downstream
   * depends on it.
   */
  heardAbout: string[];
  /**
   * Newsletter opt-in. Ships PRE-CHECKED by decision (Gabe, 2026-08-10).
   *
   * Worth knowing what that means: pre-ticked is lawful under US CAN-SPAM,
   * which is opt-out rather than opt-in. It is NOT valid consent under GDPR,
   * and it sits awkwardly with Constant Contact's own permission-based-list
   * policy — the practical risk is to the shop's CC account and sender
   * reputation, not a fine.
   *
   * Two things follow, and both are load-bearing: the box must stay obvious
   * and trivially clearable, and every submission records what the customer
   * was actually shown (see newsletterConsent below).
   */
  newsletterOptIn: boolean;
};

/**
 * The consent record for a newsletter sign-up.
 *
 * Stamped at submit, not at tick time, so it describes the state the customer
 * actually sent. Exists so the shop can answer "where did this address come
 * from?" — the question an ESP asks when a list gets flagged, and the one a
 * pre-checked box makes more likely to be asked.
 */
export type NewsletterConsent = {
  optedIn: boolean;
  /** ISO timestamp of the submission that carried the opt-in. */
  at: string;
  /** Where it was collected, and how it was presented. */
  source: string;
  /** True when the box was checked by default rather than by the customer. */
  preChecked: boolean;
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

/**
 * One sticker design in the cart.
 *
 * The cart is stickers-only by decision (CART-PLAN.md §Scope). Signs and
 * apparel remain one configuration per order and keep using `Order.artwork` —
 * they are deliberately NOT migrated.
 *
 * Artwork lives ON the item rather than beside it. Single-file state is what
 * let the magenta auto-detect write `magentaCutLine` onto "the product" with
 * no idea which design the file belonged to; binding the file to the item is
 * what makes that question answerable at all.
 */
export type StickerItem = Product & {
  /**
   * Stable per-item id. Submit keys its form parts on it (`artwork:${id}`),
   * so it must NEVER be an array index — removing a design would silently
   * rebind every later file to the wrong design.
   */
  id: string;
  artwork: Artwork;
};

export type Production = {
  needBy: string;
  deadlineType: DeadlineType;
  deliveryMethod: DeliveryMethod;
};

export type Pricing = {
  /** Material across every design in the cart. Setup is its own line now. */
  stickerPrice: number;
  /**
   * $25 for the first design, $12.50 for each one after.
   *
   * Broken out rather than folded into `stickerPrice` because Printavo has to
   * render it as an explicit line — three setup fees amortised into three
   * unit prices is unreviewable, and signs already do this correctly.
   */
  setupPrice: number;
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
  /**
   * The sticker cart. One entry per design; never empty.
   *
   * Replaces the old single `product`. A `product` object is still
   * SYNTHESISED at payload time in buildQuotePayload — dropping it makes
   * isStickerOrder() in app/api/quote/route.ts return false, and stickers
   * silently stop generating a Printavo payment link. That function, and the
   * flow duck-typing in lib/email.ts and lib/printavo.ts, key off `product`.
   */
  items: StickerItem[];
  /**
   * Signs and apparel only — those flows are single-file and are not part of
   * the cart. Sticker artwork lives on each item.
   */
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