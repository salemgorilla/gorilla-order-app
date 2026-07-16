// Shared types for the quote-builder feature components.

export type QuoteConfirmation = {
  quoteNumber: string;
  receivedAt: string;
  message: string;
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
