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
 * is the exception he named: "hoodie deal is different from this.")
 *
 * Every word and figure here is shown to customers as written. A deal with
 * `price: null` has no number from Gabe yet: its card says the price is
 * coming and offers no button. Add a deal: copy a row. Retire one: delete
 * its row, or give it an `endsOn` and it hides itself after that day on the
 * shop's clock.
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
export const DEAL_STARTS = ["hoodie-special", "stickers-deal", "tees-24-1c", "tees-24-2c"] as const;
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

const [teeOne, teeTwo] = TEE_DEALS;
const teeSizes = `sizes ${TEE_DEAL_SIZES[0]} to ${TEE_DEAL_SIZES[TEE_DEAL_SIZES.length - 1]}`;

export const DEALS: readonly Deal[] = [
  {
    id: "hoodie-special",
    title: "50 Hoodie Special",
    price: null,
    regularPrice: null,
    priceText: "$27 each front · $33 each front and back",
    item: "Cutter & Buck Clique Stockholm Pullover Hoodie, 8 colors",
    quantity: "50 or more, one price XS to 5XL",
    print: "Screen printed, up to 2 colors a side, front or front and back",
    youAdd: "Artwork, hoodie color and sizes",
    endsOn: "2026-12-01",
    how: "order",
    start: "hoodie-special",
  },
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
    id: "tees-24-1color",
    title: "24 Tees, 1-Color Front",
    price: teeDealTotal(teeOne),
    // The app's regular estimate, same spec: $166.72 tees + $108.00 print
    // + $25.00 for one screen.
    regularPrice: 299.72,
    item: "Gildan Basic Tee in a light color: white, off-white, Ash, Natural or Sand",
    quantity: `Exactly 24, ${teeSizes}`,
    print: "Screen printed, 1 color, one front print",
    youAdd: "Artwork, tee color and sizes",
    how: "order",
    start: "tees-24-1c",
  },
  {
    id: "tees-24-2color",
    title: "24 Tees, 2-Color Front",
    price: teeDealTotal(teeTwo),
    // The app's regular estimate, same spec on a dark tee (1 ink plus the
    // underbase): $170.24 tees + $159.60 print + $50.00 for two screens.
    regularPrice: 379.84,
    item: "Gildan Basic Tee, any color",
    quantity: `Exactly 24, ${teeSizes}`,
    print: "Screen printed, up to 2 colors, one front print. Dark tees take 1-color art (the white underbase is the 2nd color)",
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
  {
    id: "dtf-tees-12",
    title: "12 Full-Color DTF Tees",
    price: null,
    regularPrice: null,
    item: "Tee style to be announced",
    quantity: "Exactly 12",
    print: "Full color DTF transfer, one front print, no color limit",
    youAdd: "Artwork, tee color and sizes",
    how: "soon",
  },
  {
    id: "totes-12",
    title: "12 Tote Bags",
    price: null,
    regularPrice: null,
    item: "Canvas tote, style to be announced",
    quantity: "Exactly 12",
    print: "Screen printed, 1 color, one side",
    youAdd: "Artwork and tote color",
    how: "soon",
  },
  {
    id: "totes-24",
    title: "24 Tote Bags",
    price: null,
    regularPrice: null,
    item: "Canvas tote, style to be announced",
    quantity: "Exactly 24",
    print: "Screen printed, 1 color, one side",
    youAdd: "Artwork and tote color",
    how: "soon",
  },
  {
    id: "banner-bundle",
    title: "Banner Bundle",
    price: null,
    regularPrice: null,
    item: "13 oz vinyl, hemmed with grommets; sizes to be announced",
    quantity: "Set number of banners, to be announced",
    print: "Full color, one side",
    youAdd: "Artwork",
    how: "soon",
  },
  {
    id: "car-magnets",
    title: "Car Door Magnets",
    price: null,
    regularPrice: null,
    item: "Vehicle magnets, size to be announced",
    quantity: "Exactly 2 (one pair)",
    print: "Full color",
    youAdd: "Artwork",
    how: "soon",
  },
  {
    id: "a-frame",
    title: "A-Frame Sidewalk Sign",
    price: null,
    regularPrice: null,
    item: "A-frame sign with printed panels, size to be announced",
    quantity: "Exactly 1",
    print: "Full color panels, sides to be announced",
    youAdd: "Artwork",
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
