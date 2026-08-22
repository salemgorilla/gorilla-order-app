export type ProductCategory = {
  id: string;
  title: string;
  description: string;
  /**
   * Which half of the shop makes it.
   *
   * ── WHY THIS IS DATA ──────────────────────────────────────────────────
   * Three equal cards implied three equal choices, and they are not equal.
   * The honest split is not beta-vs-live, it is decoration vs large format —
   * different equipment, different substrate, different department. Stickers
   * and apparel are decorated goods; banners, yard signs, rigid signs,
   * posters and window graphics are large format.
   *
   * Kept here rather than as `id === "signs"` in the view, for the same
   * reason as `fulfilment` below: a rule about the business that lives in a
   * card component is a rule nobody can find later.
   */
  segment: "decorated" | "large-format";
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
  /**
   * One extra line, shown only where there is room for it — currently the
   * large-format band. The invoicing model needs explaining once, and the
   * two-up cards have no space to do it.
   */
  note?: string;
};

export const productCategories: ProductCategory[] = [
  {
    id: "stickers",
    title: "Custom Stickers",
    description:
      "Die-cut stickers, logo stickers, product labels, and custom vinyl stickers.",
    segment: "decorated",
    status: "active",
    fulfilment: "Instant price · pay online",
  },
  {
    id: "apparel",
    title: "T-Shirts & Apparel",
    // Was "Screen printed tees, hoodies, crewnecks and hats. Quoted by hand,
    // usually same day." — the trailing clause said the same thing as the
    // "By request" badge beside it and the fulfilment line below it, three
    // times in three vocabularies. The status line carries it now.
    description: "Screen printed tees, hoodies, crewnecks and hats.",
    segment: "decorated",
    status: "request",
    fulfilment: "Hand quote · usually same day",
  },
  {
    id: "signs",
    title: "Banners & Signs",
    description:
      "Vinyl banners, yard signs, rigid signs, posters and window graphics.",
    segment: "large-format",
    status: "active",
    // The Beta badge is gone. It told a buyer "this returns a real price" and
    // "this is unfinished" in the same breath, on the one card that already
    // does the hard thing. The pricing is real — it is confirmed and invoiced
    // rather than charged, which is what the fulfilment line says.
    note: "Real price now — we send an invoice instead of taking a card.",
    // Priced online like stickers, but never self-billed — signs do not pass
    // isStickerOrder(), so no payment link is ever raised for one.
    fulfilment: "Instant price · we invoice",
  },
];
