// Signs & Banners catalog.
//
// Each product declares how it is priced (see lib/signs-pricing.ts):
//   "yard"   - per-unit corrugated quantity table
//   "banner" - $/sqft
//   "poster" - $/sqft
//   "rigid"  - $/sqft by material
//   null     - quoted by hand, no online price
//
// To add/edit products, sizes, materials or finishing, edit the arrays below.
// To change PRICES, edit lib/signs-pricing-config.ts.

export const CUSTOM_SIZE = "Custom size";

export type SignPricingMethod = "yard" | "banner" | "poster" | "rigid" | null;

export type SignSize = {
  label: string;
  widthInches: number;
  heightInches: number;
};

export type SignProduct = {
  id: string;
  label: string;
  blurb: string;
  pricingMethod: SignPricingMethod;
  sizes: SignSize[];
  materials: string[];
  finishing: string[];
  allowDoubleSided: boolean;
  allowStakes: boolean;
};

export const signProducts: SignProduct[] = [
  {
    id: "vinyl-banner",
    label: "Vinyl Banner",
    blurb: "Full-color banner for events, storefronts, and fields.",
    pricingMethod: "banner",
    sizes: [
      { label: "2' x 4'", widthInches: 48, heightInches: 24 },
      { label: "3' x 6'", widthInches: 72, heightInches: 36 },
      { label: "4' x 8'", widthInches: 96, heightInches: 48 },
      { label: "2' x 8'", widthInches: 96, heightInches: 24 },
    ],
    // These MUST match the keys in signsPricingConfig.banner.perSqftByMaterial.
    materials: [
      "13 oz Scrim Vinyl",
      "18 oz Heavy Duty Vinyl",
      "Mesh Vinyl (windy areas)",
    ],
    // 18 oz is heavy enough that hemming is optional, so the hem choice is
    // spelled out rather than hidden behind "No Finishing".
    finishing: ["Hemmed + Grommets", "Pole Pockets", "No Hem or Grommets"],
    allowDoubleSided: true,
    allowStakes: false,
  },
  {
    id: "yard-sign",
    label: "Yard Sign",
    blurb: "Coroplast lawn signs for events, real estate, and campaigns.",
    pricingMethod: "yard",
    // These labels MUST match the keys in signsPricingConfig.yardSigns.sizes
    sizes: [
      { label: '18" x 24"', widthInches: 24, heightInches: 18 },
      { label: '24" x 36"', widthInches: 36, heightInches: 24 },
    ],
    materials: ["4mm Coroplast", "10mm Coroplast"],
    finishing: ["Signs Only", "With Step Stakes"],
    allowDoubleSided: true,
    allowStakes: true,
  },
  {
    id: "rigid-sign",
    label: "Rigid Sign",
    blurb: "Durable indoor/outdoor signage that lasts.",
    pricingMethod: "rigid",
    sizes: [
      { label: '12" x 18"', widthInches: 18, heightInches: 12 },
      { label: '18" x 24"', widthInches: 24, heightInches: 18 },
      { label: "2' x 3'", widthInches: 36, heightInches: 24 },
      { label: "4' x 8'", widthInches: 96, heightInches: 48 },
    ],
    materials: [
      'PVC 1/8"',
      'PVC 1/4"',
      'PVC 1/2"',
      'Dibond 1/8"',
      'Dibond 1/4"',
      'AlumaCorr 0.2"',
      'AlumaCorr 0.4"',
      "Aluminum 040",
      "Aluminum 080",
      'Corrugated 1/4"',
      'Corrugated 1/2"',
    ],
    finishing: ["Drilled Holes", "No Holes"],
    allowDoubleSided: true,
    allowStakes: false,
  },
  {
    id: "poster",
    label: "Poster",
    blurb: "Large-format indoor posters.",
    pricingMethod: "poster",
    sizes: [
      { label: '18" x 24"', widthInches: 24, heightInches: 18 },
      { label: '24" x 36"', widthInches: 36, heightInches: 24 },
      { label: "3' x 4'", widthInches: 48, heightInches: 36 },
    ],
    materials: ["Indoor Poster Paper"],
    finishing: ["Standard", "Laminated"],
    allowDoubleSided: false,
    allowStakes: false,
  },
  {
    id: "window-graphics",
    label: "Window & Wall Graphics",
    blurb: "Adhesive window and wall graphics — quoted to your space.",
    pricingMethod: null, // quoted by hand
    sizes: [],
    materials: ["Adhesive Vinyl", "Perforated Window Vinyl"],
    finishing: ["Standard", "Laminated"],
    allowDoubleSided: false,
    allowStakes: false,
  },
];

export const signsCatalog = {
  quantities: [1, 2, 5, 10, 20, 30, 40, 50],
  products: signProducts,
};

export function getSignProduct(productId: string): SignProduct {
  return signProducts.find((p) => p.id === productId) || signProducts[0];
}

/** Banner finishing add-ons the customer can tick on. */
export const BANNER_ADD_ONS = [
  {
    key: "polePockets",
    label: "Pole Pockets",
    detail: "Sewn sleeves for a pole. Replaces grommets on those edges.",
  },
  {
    key: "windSlits",
    label: "Wind Slits",
    // Replaced the old "mesh vinyl is sturdier" line: mesh is no longer
    // offered, and wind slits solve the same problem on a solid banner.
    detail: "Half-moon cuts that let wind pass through. The fix for windy spots.",
  },
  {
    key: "reinforcedWebbing",
    label: "Webbing / D-Rings / Rope",
    detail: "Heavy-duty reinforcement for big or high-wind banners. Quoted separately.",
  },
] as const;

export const defaultSignsQuote = {
  productId: "vinyl-banner",
  quantity: 1,
  size: "3' x 6'",
  customSize: "",
  customWidthInches: 0,
  customHeightInches: 0,
  material: "13 oz Scrim Vinyl",
  finishing: "Hemmed + Grommets",
  doubleSided: false,
  bannerAddOns: [] as string[],
};

export type SignsQuote = typeof defaultSignsQuote;

/** All selectable size labels for a product, including the custom option. */
export function getSizeOptions(product: SignProduct) {
  const labels = product.sizes.map((s) => s.label);
  return product.sizes.length > 0 ? [...labels, CUSTOM_SIZE] : [CUSTOM_SIZE];
}

/** Human-readable size, honoring a custom entry. */
export function getSignSizeLabel(quote: SignsQuote) {
  if (quote.size === CUSTOM_SIZE) {
    if (quote.customWidthInches > 0 && quote.customHeightInches > 0) {
      return `${quote.customWidthInches}" x ${quote.customHeightInches}" (custom)`;
    }
    return quote.customSize.trim() || "Custom size (not specified)";
  }
  return quote.size;
}

/** Finished dimensions of one piece, in inches. */
export function getSignDimensions(quote: SignsQuote) {
  if (quote.size === CUSTOM_SIZE) {
    return {
      widthInches: quote.customWidthInches,
      heightInches: quote.customHeightInches,
    };
  }

  const product = getSignProduct(quote.productId);
  const size = product.sizes.find((s) => s.label === quote.size);

  return {
    widthInches: size?.widthInches || 0,
    heightInches: size?.heightInches || 0,
  };
}
