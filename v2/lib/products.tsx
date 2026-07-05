export type ProductCategory = {
  id: string;
  title: string;
  badge: string;
  description: string;
  status: "active" | "coming-soon";
};

export const productCategories: ProductCategory[] = [
  {
    id: "stickers",
    title: "Custom Stickers",
    badge: "Live",
    description:
      "Die-cut, circle, square, rounded square, clear, chrome, holographic, gloss, and matte sticker quote requests.",
    status: "active",
  },
  {
    id: "apparel",
    title: "T-Shirts & Apparel",
    badge: "Beta",
    description:
      "Quote requests for tees, hoodies, crewnecks, garment colors, print locations, ink colors, and size breakdowns.",
    status: "active",
  },
  {
    id: "signs",
    title: "Banners & Signs",
    badge: "Soon",
    description:
      "Future quote builder for banners, event signage, merch displays, and local business signs.",
    status: "coming-soon",
  },
];
