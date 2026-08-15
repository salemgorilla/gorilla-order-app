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

import { signsPricingConfig } from "./signs-pricing-config";

export const CUSTOM_SIZE = "Custom size";

/**
 * Yard signs are frozen at one size.
 *
 * Unlike banners and rigid signs, which price per square foot at any
 * dimension, yard signs price from a per-unit quantity table keyed on the
 * size STRING ('18" x 24"'). Opening them to free entry would mean every
 * typed dimension missed the table and fell through to hand-pricing.
 */
export const YARD_SIGN_WIDTH_INCHES = 18;
export const YARD_SIGN_HEIGHT_INCHES = 24;
export const YARD_SIGN_SIZE_KEY = '18" x 24"';

/**
 * The key the yard-sign price table is looked up by, derived from real
 * dimensions so the table still resolves once sizes are typed rather than
 * picked. Returns "" when the dimensions match no table entry, which the
 * pricing engine correctly treats as priced-by-hand.
 */
export function getYardSignSizeKey(widthInches: number, heightInches: number) {
  return `${widthInches}" x ${heightInches}"`;
}

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
    // One stock, no thickness choice. The shop runs a single coroplast for
    // yard signs, so "4mm vs 10mm" was a question with only one real answer —
    // and the yard price table is keyed on size, never on material, so the
    // second entry never changed a price either.
    materials: ["Coroplast"],
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
    detail:
      "Heavy-duty reinforcement for big or high-wind banners. $6 per linear foot around the edge.",
  },
] as const;

/** The one material/build the shop reinforces. */
export const REINFORCEMENT_MATERIAL = "13 oz Scrim Vinyl";
export const REINFORCEMENT_ADD_ON_KEY = "reinforcedWebbing";

/**
 * Webbing / D-rings / rope is offered on 13 oz double-sided banners only.
 *
 * A double-sided 13 oz is built "sewn" — two banners sewn back to back, since
 * 13 oz shows through — and that is the heavy, high-load construction the
 * reinforcement exists for. Anything else either does not need it or is not
 * built in a way that takes it.
 *
 * The UI and the pricing engine both go through this, so the checkbox and the
 * charge can never disagree. A rule enforced only in the UI leaks: the quote
 * payload carries whatever is in state.
 */
export function allowsReinforcement(material: string, doubleSided: boolean) {
  return doubleSided && String(material).trim() === REINFORCEMENT_MATERIAL;
}

/** Add-ons valid for the chosen material and build. */
export function getBannerAddOns(material: string, doubleSided: boolean) {
  if (allowsReinforcement(material, doubleSided)) return BANNER_ADD_ONS;
  return BANNER_ADD_ONS.filter(
    (addOn) => addOn.key !== REINFORCEMENT_ADD_ON_KEY
  );
}

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
  /**
   * A shop-authored template the customer personalised, or null when they are
   * uploading their own artwork. The two are alternatives — see
   * lib/templates.ts.
   */
  templateId: null as string | null,
  /** Field id -> what the customer typed. */
  templateText: {} as Record<string, string>,
};

export type SignsQuote = typeof defaultSignsQuote;

/** All selectable size labels for a product, including the custom option. */
/**
 * Whether a product can be printed double-sided in the chosen material.
 *
 * Product-level `allowDoubleSided` is not enough for banners: rigid and
 * corrugated take double-sided fine, but among banners only 18 oz can — 13 oz
 * shows through and mesh is perforated.
 *
 * The UI and the pricing engine both go through this rule, so the checkbox
 * and the surcharge can never disagree.
 */
export function allowsDoubleSided(product: SignProduct, material: string) {
  if (!product.allowDoubleSided) return false;

  if (product.pricingMethod === "banner") {
    return Boolean(signsPricingConfig.banner.doubleSided[material]);
  }

  return true;
}

/**
 * How a banner material achieves double-sided, for customer-facing copy.
 * "sewn" costs materially more than "surcharge", so the UI says so up front
 * rather than letting the price jump without explanation.
 */
export function getDoubleSidedMethod(product: SignProduct, material: string) {
  if (product.pricingMethod !== "banner") return null;
  return signsPricingConfig.banner.doubleSided[material]?.method ?? null;
}

/**
 * Finishing options valid for the chosen material.
 *
 * Skipping the hem is offered on 18 oz only — 13 oz and mesh need the
 * reinforced edge — so the option is removed rather than shown and refused.
 */
export function getFinishingOptions(product: SignProduct, material: string) {
  if (product.pricingMethod !== "banner") return product.finishing;

  const cfg = signsPricingConfig.banner;
  if (cfg.noHemMaterials.includes(material)) return product.finishing;

  return product.finishing.filter((f) => f !== cfg.noHemFinishingLabel);
}

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
  const product = getSignProduct(quote.productId);

  // Yard signs are frozen — the customer never types their dimensions.
  if (product.pricingMethod === "yard") {
    return {
      widthInches: YARD_SIGN_WIDTH_INCHES,
      heightInches: YARD_SIGN_HEIGHT_INCHES,
    };
  }

  // Everything else is typed. Presets are gone, so the custom fields are the
  // only source; the old label lookup is kept below purely so a quote created
  // before this change still resolves.
  if (quote.customWidthInches > 0 && quote.customHeightInches > 0) {
    return {
      widthInches: quote.customWidthInches,
      heightInches: quote.customHeightInches,
    };
  }

  const size = product.sizes.find((s) => s.label === quote.size);

  return {
    widthInches: size?.widthInches || 0,
    heightInches: size?.heightInches || 0,
  };
}
