export type ProductCategory = {
  id: string;
  title: string;
  /** null when the product needs no qualifier. */
  badge: string | null;
  description: string;
  /**
   * `request` is selectable but carries no online price — the flow collects
   * enough to quote it by hand. Apparel sat on `coming-soon` (a disabled
   * card) while being the shop's highest-value segment, so every visitor who
   * came here for shirts left without the shop even learning their name.
   */
  status: "active" | "request" | "coming-soon";
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
    badge: "By request",
    description:
      "Screen printed tees, hoodies, crewnecks and hats. Quoted by hand, usually same day.",
    status: "request",
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
