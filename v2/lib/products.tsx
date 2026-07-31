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
      "Quote requests for tees, hoodies, crewnecks, long sleeves, and youth apparel.",
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
