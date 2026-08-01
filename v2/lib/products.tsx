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
    badge: "Beta",
    description:
      "Die-cut stickers, logo stickers, product labels, and custom vinyl stickers.",
    status: "active",
  },
  {
    id: "apparel",
    title: "T-Shirts & Apparel",
    badge: "Soon",
    description:
      "Screen printed tees and hoodies. Need something else? Just ask.",
    status: "coming-soon",
  },
  {
    id: "signs",
    title: "Banners & Signs",
    badge: "Beta",
    description:
      "Vinyl banners, yard signs, rigid signs, posters, and window graphics.",
    status: "active",
  },
];
