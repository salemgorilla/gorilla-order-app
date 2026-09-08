import { DECAL_SHIPPING_PRICE } from "./pricing";

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
   * How this product reaches the customer.
   *
   * ── WHY EVERY PRODUCT HAS ONE ─────────────────────────────────────────
   * Gabe, 2026-09-07: "We offer shipping on all products, so you can
   * include that detail for all 4 buttons." Required rather than optional
   * for exactly that reason — a product that could omit it is a product
   * whose card would silently stop saying the shop ships.
   *
   * ── WHY THE FOUR DO NOT SAY THE SAME THING ────────────────────────────
   * The offer is universal; the TERMS are not, and the card is where a
   * customer decides what they are committing to:
   *
   *   stickers   priced in the total, flat, from lib/pricing
   *   signs      offered in the flow, quoted separately (never priced)
   *   banners    same as signs
   *   apparel    no delivery step exists — it is settled when the shop
   *              confirms the estimate, which is what that card must say
   *              rather than implying a choice the flow never offers
   *
   * Two of them ARE identical, and that is fine: this is a spec line, not
   * prose. The fulfilment line below is already word-for-word identical on
   * three cards and reads as consistency, because a fact repeated is not
   * the same defect as an explanation repeated.
   */
  shipping: string;
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
    // The one flow that PRICES delivery, so the card can name the figure.
    // Interpolated from lib/pricing rather than typed: the hero's terms
    // chips learned the same lesson, and a card quoting a stale postage
    // rate is a card quoting a wrong price.
    shipping: `Ships nationwide for $${DECAL_SHIPPING_PRICE} · free local pickup`,
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
    /**
     * LIVE since 2026-09-06 — Gabe: "Yes flip." The configurator prices
     * garments from the S&S catalog and printing from the in-repo table
     * (PRICING.md §4a; D9 decided the same week: "app pricing is the default
     * for now"). It was `"request"` — a three-question hand-quote form —
     * from 21 Aug until then, while the numbers were unconfirmed.
     *
     * The fulfilment line says ESTIMATE, not price, on purpose: the garment
     * figure stands on an assumed size mix until sizes are entered, and the
     * shop confirms blanks, artwork and print before anything is agreed
     * (the handoff's language rule — never call it a price). And it must
     * never say "pay online": apparel gets no payment link, and
     * tests/product-fulfilment.test.ts checks that claim against
     * isStickerOrder itself.
     *
     * Rollback is this one word back to "request" — the hand-quote form is
     * still in the tree and page.tsx routes on the status.
     */
    status: "active",
    /**
     * Deliberately not "choose shipping at checkout": the apparel flow has
     * NO delivery step, so an order defaults to pickup and a customer who
     * wants 48 shirts shipped has no box to say so in. Promising a choice
     * the flow never offers is the defect; saying it is settled when the
     * shop confirms the estimate is both true and already how that flow
     * works. Flagged to Gabe on 2026-09-07 — if he wants the choice in the
     * form, it is the SignsDelivery pattern and this line changes with it.
     */
    shipping: "Ships nationwide · delivery confirmed with your estimate",
    fulfilment: "Instant estimate · we confirm, then invoice",
  },
  /**
   * Two large-format pipelines, not one (Gabe, 2026-08-23). "Banners & Signs"
   * was one card and one cart; a banner quote and a signs quote are now
   * separate products with separate carts — the hard split. They share the
   * pricing machinery in lib/signs.ts, which is a fact about the code, not
   * about the offer.
   */
  {
    id: "banners",
    title: "Vinyl Banners",
    description:
      "Full-color banners for events, storefronts, fences and fields.",
    segment: "large-format",
    status: "active",
    // The Beta badge is gone. It told a buyer "this returns a real price" and
    // "this is unfinished" in the same breath, on the one card that already
    // does the hard thing.
    //
    // Shipping is the one thing this price does not cover — the delivery step
    // says so, and so does the confirmation. Stated on the card too, because
    // a customer choosing between products should know before they invest
    // five steps, not at the end.
    shipping: "Ships nationwide · delivery quoted separately",
    /**
     * Pays online, same as stickers — Gabe, 2026-09-07: "All 3 should be
     * instant price - pay online."
     *
     * This is a PROMISE, and lib/auto-bill.ts is what keeps it: a signs order
     * the server could reprice, under the $5,000 self-checkout ceiling,
     * raises a live payment link with no human in the loop. Over the
     * ceiling, or on a payload the server could not re-derive, the shop
     * invoices by hand instead — so the line can be true for the orders this
     * shop actually takes without the ceiling case making it a lie. Stickers
     * make the same promise under the same ceiling.
     */
    fulfilment: "Instant price · pay online",
  },
  {
    id: "signs",
    title: "Signs",
    description:
      "Yard signs, rigid signs, posters and window graphics.",
    segment: "large-format",
    status: "active",
    // Word for word the banner's terms, because they ARE the banner's terms
    // — same department, same freight. See `shipping` on the type.
    shipping: "Ships nationwide · delivery quoted separately",
    fulfilment: "Instant price · pay online",
  },
];
