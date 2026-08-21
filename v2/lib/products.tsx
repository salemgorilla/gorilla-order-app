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
  /**
   * What actually happens after you press submit, in the customer's terms.
   *
   * ── WHY `status` COULD NOT CARRY THIS ─────────────────────────────────
   * Stickers and signs are BOTH `active`, so both cards said "Available
   * now" — and the two are not the same offer at all:
   *
   *   stickers  priced online AND billed online. isStickerOrder() gates the
   *             payment link, and stickers is the only flow that passes it.
   *   signs     priced online, but no payment link — the shop confirms and
   *             invoices.
   *   apparel   no online price; quoted by hand.
   *
   * A buyer deciding whether to spend five steps needs to know which of
   * those they are about to get, and the card was the one place that could
   * tell them and did not. Stickers — the fully automated path, and the one
   * that returns a number in a minute — was the card with nothing marking
   * it as different.
   *
   * Kept as data rather than derived in the view: "which flow self-bills" is
   * decided on the server by isStickerOrder(), and a second copy of that
   * rule living in a card component is how the two come to disagree.
   */
  fulfilment: string;
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
    fulfilment: "Instant price · pay online",
  },
  {
    id: "apparel",
    title: "T-Shirts & Apparel",
    badge: "By request",
    description:
      "Screen printed tees, hoodies, crewnecks and hats. Quoted by hand, usually same day.",
    status: "request",
    fulfilment: "Quoted by hand",
  },
  {
    id: "signs",
    title: "Banners & Signs",
    badge: "Beta",
    description:
      "Vinyl banners, yard signs, rigid signs, posters, and window graphics.",
    status: "active",
    // Priced online like stickers, but never self-billed — signs do not pass
    // isStickerOrder(), so no payment link is ever raised for one.
    fulfilment: "Instant price · we invoice",
  },
];
