// Signs & Banners catalog.
//
// This flow is QUOTE-ONLY on purpose: no prices are shown or calculated,
// because sign pricing depends on square footage, material and finishing that
// Gorilla Salem quotes by hand. The customer configures exactly what they
// want, and the shop replies with the price.
//
// To add/edit products, sizes, materials or finishing, just edit the arrays
// below — nothing else in the app needs to change.

export const CUSTOM_SIZE = "Custom size";

export type SignProduct = {
  id: string;
  label: string;
  blurb: string;
  sizes: string[];
  materials: string[];
  finishing: string[];
};

export const signProducts: SignProduct[] = [
  {
    id: "vinyl-banner",
    label: "Vinyl Banner",
    blurb: "Full-color banner for events, storefronts, and fields.",
    sizes: ["2' x 4'", "3' x 6'", "4' x 8'", "2' x 8'", CUSTOM_SIZE],
    materials: ["13 oz Scrim Vinyl", "Mesh Vinyl (windy areas)"],
    finishing: ["Hemmed + Grommets", "Pole Pockets", "No Finishing"],
  },
  {
    id: "yard-sign",
    label: "Yard Sign",
    blurb: "Coroplast lawn signs for events, real estate, and campaigns.",
    sizes: ['18" x 24"', '12" x 18"', '24" x 36"', CUSTOM_SIZE],
    materials: ["4mm Coroplast", "10mm Coroplast"],
    finishing: ["With H-Stakes", "Signs Only"],
  },
  {
    id: "rigid-sign",
    label: "Rigid Sign",
    blurb: "Durable indoor/outdoor signage that lasts.",
    sizes: ['12" x 18"', '18" x 24"', "2' x 3'", "4' x 8'", CUSTOM_SIZE],
    materials: ["Aluminum", "PVC", "Dibond"],
    finishing: ["Drilled Holes", "No Holes"],
  },
  {
    id: "poster-decal",
    label: "Posters & Window Decals",
    blurb: "Large-format posters and adhesive window or wall graphics.",
    sizes: ['18" x 24"', '24" x 36"', "3' x 4'", CUSTOM_SIZE],
    materials: ["Indoor Poster Paper", "Adhesive Vinyl", "Perforated Window Vinyl"],
    finishing: ["Standard", "Laminated"],
  },
];

export const signsCatalog = {
  quantities: [1, 2, 5, 10, 25, 50, 100],
  products: signProducts,
};

export function getSignProduct(productId: string): SignProduct {
  return signProducts.find((p) => p.id === productId) || signProducts[0];
}

export const defaultSignsQuote = {
  productId: signProducts[0].id,
  quantity: 1,
  size: signProducts[0].sizes[1],
  customSize: "",
  material: signProducts[0].materials[0],
  finishing: signProducts[0].finishing[0],
  doubleSided: false,
};

export type SignsQuote = typeof defaultSignsQuote;

/** Human-readable size, honoring a custom entry. */
export function getSignSizeLabel(quote: SignsQuote) {
  if (quote.size === CUSTOM_SIZE) {
    return quote.customSize.trim() || "Custom size (not specified)";
  }
  return quote.size;
}
