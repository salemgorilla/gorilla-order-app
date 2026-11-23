/**
 * THE DEALS. One list, one place to edit (Gabe, 2026-11-23: "a page with a
 * list of all our special deals"). The deals page at /deals renders exactly
 * these, in this order; the Thanksgiving banner's tag links there.
 *
 * Every word and figure here is shown to customers as written. A deal that
 * names a price must be one Gabe set. Add a deal: copy a row. Retire one:
 * delete its row, or give it an `endsOn` and it hides itself after that day
 * on the shop's clock.
 *
 * `how` says what pressing the button does, so the page can say it plainly:
 *   - "order": opens the order builder with the deal already set up, priced
 *     by the app.
 *   - "estimate": opens the order builder; the estimate there shows regular
 *     pricing and the shop applies the deal when it confirms the quote.
 *   - "ask": no in-app order; the customer emails the shop to claim it.
 *   - "soon": a placeholder with no terms yet; no button, just a line saying
 *     details are coming.
 */

export type DealHow = "order" | "estimate" | "ask" | "soon";

export interface Deal {
  id: string;
  title: string;
  /** The headline price, as the customer reads it. */
  price: string;
  /** Short facts, one line each. */
  details: string[];
  /** Last day, YYYY-MM-DD on the shop's clock, inclusive. Omit for no end. */
  endsOn?: string;
  how: DealHow;
  /** For "order" and "estimate": where in the app it starts. */
  start?: "hoodie-special" | "apparel" | "stickers";
  /** For "ask": the email subject line. */
  subject?: string;
}

export const DEALS: readonly Deal[] = [
  {
    id: "hoodie-special",
    title: "50 Hoodie Special",
    price: "$27 each front · $33 front and back",
    details: [
      "50 hoodies or more, Cutter & Buck Clique Stockholm Pullover",
      "Up to 2 ink colors per side, setup included",
      "One price XS to 5XL, 8 colors",
    ],
    endsOn: "2026-12-01",
    how: "order",
    start: "hoodie-special",
  },
  {
    id: "stickers-50",
    title: "50 Stickers for $25",
    price: "$25 for 50",
    details: ["Any size up to 3 inches", "One design"],
    how: "ask",
    subject: "Black Friday deal: 50 stickers for $25",
  },
  {
    id: "tees-24-1color",
    title: "24 Tees, 1-Color Front",
    price: "25% off, no screen fee",
    details: ["24 T-shirts", "1-color print on the front"],
    how: "estimate",
    start: "apparel",
  },
  {
    id: "tees-24-2color",
    title: "24 Tees, 2-Color Front",
    price: "25% off, no screen fee",
    details: ["24 T-shirts", "2-color print on the front"],
    how: "estimate",
    start: "apparel",
  },
  {
    // Gabe, 2026-11-23: details to come. Fill in price/details and change
    // `how` once they're set.
    id: "beanies-12",
    title: "12 Knit Beanies",
    price: "Deal coming soon",
    details: ["12 knit hats or beanies"],
    how: "soon",
  },
];

/** The deals still running on a shop-clock day (YYYY-MM-DD). */
export function liveDeals(todayIso: string, deals: readonly Deal[] = DEALS): Deal[] {
  return deals.filter((deal) => !deal.endsOn || todayIso <= deal.endsOn);
}

/** Where a deal's button goes. Only app paths and the shop's own address. */
export function dealHref(deal: Deal, shopEmail: string): string {
  if (deal.how === "ask") {
    return `mailto:${shopEmail}?subject=${encodeURIComponent(deal.subject || deal.title)}`;
  }
  return `/?start=${deal.start ?? "stickers"}`;
}
