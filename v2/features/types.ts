// Shared types for the quote-builder feature components.

/**
 * Present and `ready` only for stickers, the one flow that prices itself
 * completely and so can take payment without the shop looking first.
 */
export type StickerCheckout = {
  ready: boolean;
  payUrl?: string;
  amount?: number;
  error?: string;
};

export type QuoteConfirmation = {
  quoteNumber: string;
  receivedAt: string;
  message: string;
  checkout?: StickerCheckout | null;
  /**
   * What happened to the customer's Printavo record. Shown at the counter
   * only — see lib/customer-record.ts for why the website does not get it.
   */
  customerRecord?: {
    created: boolean;
    skipped?: boolean;
    matchedExistingCustomer?: boolean;
    createdCustomer?: boolean;
  } | null;
  /**
   * Whether Printavo accepted the quote. Decides whether a tracking link is
   * offered at all — /track queries Printavo, so without this the link
   * answers "no such order". See canOfferTracker in lib/order-status.
   */
  printavoCreated?: boolean;
};

export type SsCatalogSize = {
  sku: string;
  sizeName: string;
  markedUpPrice: number;
  isAvailable: boolean;
  outOfStock: boolean;
};

export type SsCatalogColor = {
  colorName: string;
  colorHex: string | null;
  swatchImage: string | null;
  frontImage: string | null;
  backImage: string | null;
  sideImage: string | null;
  isAvailable: boolean;
  outOfStock: boolean;
  sizes: SsCatalogSize[];
};

export type SsCatalogProduct = {
  id: string;
  brandName: string;
  styleName: string;
  displayName: string;
  customerLabel: string;
  customerCategory: string;
  catalogStyle: string;
  catalogNotes: string;
  colors: SsCatalogColor[];
};

export type SsCatalogResponse = {
  products: SsCatalogProduct[];
  error?: string;
};
