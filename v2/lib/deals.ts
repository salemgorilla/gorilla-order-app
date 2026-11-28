import { STICKER_DEAL } from "./sticker-deal";
import { TEE_DEALS, TEE_DEAL_SIZES, teeDealTotal } from "./tee-deal";

/**
 * THE DEALS. One list, one place to edit (Gabe, 2026-11-23: "a page with a
 * list of all our special deals"). The deals page at /deals renders exactly
 * these, in this order, every card in the same layout:
 *
 *   name · the one fixed price · what you get · quantity · print · you add
 *
 * Gabe, 2026-11-23: "everything will be canned pricing ... it'll always be
 * the same price", and "They can't add more, they can't add less." So every
 * Black Friday deal is a set quantity at a set price. (The 50 Hoodie Special
 * is the exception he named: "hoodie deal is different from this.", and
 * on 2026-11-23 he took it off this page: "Remove the 50 hoodie deal off of
 * the Black Friday page." It keeps its own badge on the order page.)
 *
 * Every word and figure here is shown to customers as written. Every deal
 * on this list has a price: Gabe, 2026-11-28, "On the deals page, can you
 * remove all the products that are without pricing?" So a deal goes on the
 * list only once it has a number (tests/deals.test.ts fails otherwise). Add
 * a deal: copy a row. Retire one: delete its row, or give it an `endsOn` and
 * it hides itself after that day on the shop's clock.
 *
 * `how`:
 *   - "order": the button opens the order builder with the deal already set
 *     up at its fixed price (`start` says where).
 *   - "soon": no button yet; the card says ordering opens soon.
 */

export type DealHow = "order" | "soon";

/**
 * Every `?start=` value the order page acts on (app/page.tsx). A deal can
 * only start at one of these.
 */
export const DEAL_STARTS = [
  "hoodie-special",
  "stickers-deal",
  "tees-12-1c",
  "tees-24-1c",
  "tees-24-2c",
] as const;
export type DealStart = (typeof DEAL_STARTS)[number];

export interface Deal {
  id: string;
  title: string;
  /** The one fixed price for the whole deal, or null while Gabe sets it. */
  price: number | null;
  /**
   * What the same order costs at the app's regular price, shown struck
   * through beside the deal price (Gabe, 2026-11-23: "show both prices to
   * the client"). Null where there is no regular figure to show.
   */
  regularPrice: number | null;
  /** Replaces the price line, for a deal priced per piece (the hoodie special). */
  priceText?: string;
  /** What you get: the item and its spec. */
  item: string;
  /** How many, exactly. */
  quantity: string;
  /** Print or decoration: colours, sides, method. */
  print: string;
  /** What the customer supplies. */
  youAdd: string;
  /** Last day, YYYY-MM-DD on the shop's clock, inclusive. Omit for no end. */
  endsOn?: string;
  how: DealHow;
  /** For "order": where in the app it starts. */
  start?: DealStart;
}

const [teeTwelve, teeOne, teeTwo] = TEE_DEALS;
const teeSizes = `sizes ${TEE_DEAL_SIZES[0]} to ${TEE_DEAL_SIZES[TEE_DEAL_SIZES.length - 1]}`;

export const DEALS: readonly Deal[] = [
  {
    id: "stickers-50",
    title: "50 Stickers",
    price: STICKER_DEAL.price,
    // 50 x 3" die cut at list: $42.00 stickers + $15.00 setup.
    regularPrice: 57,
    item: `Gloss White Vinyl stickers, any shape up to ${STICKER_DEAL.maxInches}" x ${STICKER_DEAL.maxInches}"`,
    quantity: `Exactly ${STICKER_DEAL.quantity}, one design`,
    print: "Full color, cut to shape",
    youAdd: "Artwork",
    how: "order",
    start: "stickers-deal",
  },
  {
    // Gabe, 2026-11-23: "$50 off twelve t-shirts ... off the full price",
    // "no setup". Prices and how they were set: lib/tee-deal.ts.
    id: "tees-12-1color",
    title: "12 Tees, 1-Color Front",
    price: teeDealTotal(teeTwelve),
    regularPrice: teeTwelve.regularPrice,
    item: "Gildan Basic Tee in a light color: white, off-white, Ash, Natural or Sand",
    quantity: `Exactly 12, ${teeSizes}`,
    print: "Screen printed, 1 color, one front print. No setup fee",
    youAdd: "Artwork, tee color and sizes",
    how: "order",
    start: "tees-12-1c",
  },
  {
    // "$100 off twenty-four t-shirts", 1 color, on "any color tee shirt
    // from the Gildan 500[0] series" (light ones: 1-color art needs no
    // underbase only on a light tee).
    id: "tees-24-1color",
    title: "24 Tees, 1-Color Front",
    price: teeDealTotal(teeOne),
    regularPrice: teeOne.regularPrice,
    item: "Gildan 5000 Heavy Cotton tee in a light color: white, off-white, Ash, Natural or Sand",
    quantity: `Exactly 24, ${teeSizes}`,
    print: "Screen printed, 1 color, one front print. No setup fee",
    youAdd: "Artwork, tee color and sizes",
    how: "order",
    start: "tees-24-1c",
  },
  {
    // "$100 off twenty-four t-shirts", 2 colors (or 1 on a dark tee), any
    // Gildan 5000 color.
    id: "tees-24-2color",
    title: "24 Tees, 2-Color Front",
    price: teeDealTotal(teeTwo),
    regularPrice: teeTwo.regularPrice,
    item: "Gildan 5000 Heavy Cotton tee, any color",
    quantity: `Exactly 24, ${teeSizes}`,
    print: "Screen printed, up to 2 colors, one front print. Dark tees take 1-color art (the white underbase is the 2nd color). No setup fee",
    youAdd: "Artwork, tee color and sizes",
    how: "order",
    start: "tees-24-2c",
  },
  {
    // Gabe, 2026-11-23: Sportsman 12" cuffed beanie, embroidered, "add the
    // beanies times 1.5", "make the embroidery price $8 flat". So: blank
    // $2.80 x 1.5 = $4.20 + $8.00 embroidery = $12.20 each, $146.40
    // regular; less 25% = $9.15 each, $109.80.
    id: "beanies-12",
    title: "12 Embroidered Beanies",
    price: 109.8,
    regularPrice: 146.4,
    item: 'Sportsman SP12 12" cuffed knit beanie, solid colors',
    quantity: "Exactly 12",
    print: "Embroidered front",
    youAdd: "Artwork and beanie color",
    how: "soon",
  },
  {
    // Gabe, 2026-11-23: "Let's make that twelve, baseball hats", priced like
    // the beanies, on "the YP classic flat brim snapback". S&S lists it as
    // YP Classics 6089M: blank $6.50 ($16.25 at the app's 150% list / 2.5)
    // x 1.5 = $9.75 + $8.00 embroidery = $17.75 each, $213.00 regular;
    // less 25% = $13.31 each (to the cent), $159.72. Solid colors only:
    // camo and Multicam cost more.
    id: "hats-12",
    title: "12 Embroidered Baseball Hats",
    price: 159.72,
    regularPrice: 213,
    item: "YP Classics 6089M flat bill snapback, solid colors, one size",
    quantity: "Exactly 12",
    print: "Embroidered front",
    youAdd: "Artwork and hat color",
    how: "soon",
  },
];

/** The deals still running on a shop-clock day (YYYY-MM-DD). */
export function liveDeals(todayIso: string, deals: readonly Deal[] = DEALS): Deal[] {
  return deals.filter((deal) => !deal.endsOn || todayIso <= deal.endsOn);
}

/** Where a deal's button goes. Only paths inside the app. */
export function dealHref(deal: Deal): string {
  return `/?start=${deal.start ?? "hoodie-special"}`;
}

/** "$247.44", the hoodie special's per-piece line, or "Price coming soon". */
export function dealPrice(deal: Deal): string {
  if (deal.priceText) return deal.priceText;
  return deal.price === null ? "Price coming soon" : `$${deal.price.toFixed(2)}`;
}
