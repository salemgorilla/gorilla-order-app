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

/**
 * Every `?start=` value the order page acts on (app/page.tsx). A deal can
 * only start at one of these.
 */
export const DEAL_STARTS = [
  "hoodie-special",
  "stickers-deal",
  "tees-24-1c",
  "tees-24-2c",
  "apparel",
] as const;
export type DealStart = (typeof DEAL_STARTS)[number];

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
  start?: DealStart;
  /** Replaces the page's usual line under the deal, when it needs saying. */
  note?: string;
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
    details: ["Any shape up to 3 inches", "One design, Gloss White Vinyl", "Setup included"],
    how: "order",
    start: "stickers-deal",
  },
  {
    id: "tees-24-1color",
    title: "24 Tees, 1-Color Front",
    price: "25% off, no screen fee",
    details: ["24 T-shirts", "1-color print on the front"],
    how: "order",
    start: "tees-24-1c",
    note: "Priced for you at 25% off as you build it. We confirm every tee quote before we invoice.",
  },
  {
    id: "tees-24-2color",
    title: "24 Tees, 2-Color Front",
    price: "25% off, no screen fee",
    details: [
      "24 T-shirts",
      "2-color print on the front",
      "Dark tees: 1-color art, as the white underbase is the 2nd color",
    ],
    how: "order",
    start: "tees-24-2c",
    note: "Priced for you at 25% off as you build it. We confirm every tee quote before we invoice.",
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
  return `/?start=${deal.start ?? "apparel"}`;
}
