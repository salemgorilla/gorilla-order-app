export type ProductCategory = {
  id: string;
  title: string;
  /** null when the product needs no qualifier. */
  badge: string | null;
  description: string;
  status: "active" | "coming-soon";
};

export const productCategories: ProductCategory[] = [
  {
    id: "stickers",
    title: "Custom Stickers",
    // No badge. Stickers are the one flow that takes payment unattended, and
    // "Beta" sat on the card right where the customer is deciding whether to
    // trust it with a card number. Signs keeps its badge — that one really is
    // still settling.
    badge: null,
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
