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
    title: "Custom Decals",
    badge: "Live",
    description:
      "Die-cut decals, logo decals, product labels, and custom vinyl decals.",
    status: "active",
  },
  {
    id: "apparel",
    title: "T-Shirts & Apparel",
    badge: "Beta",
    description:
      "Quote requests for tees, hoodies, crewnecks, long sleeves, and youth apparel.",
    status: "active",
  },
  {
    id: "signs",
    title: "Banners & Signs",
    badge: "Soon",
    description:
      "Future quote builder for banners, signs, posters, and larger-format print jobs.",
    status: "coming-soon",
  },
];
