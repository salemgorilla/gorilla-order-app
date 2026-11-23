import type { ApparelCartQuote } from "./apparel-cart";

/**
 * THE 50 HOODIE SPECIAL — a flat-rate offer inside the apparel flow.
 *
 * Gabe, 2026-11-23: "Can we add a button in the apparel section, for the 50
 * hoody special? It should be a flat fee, nothing will change the end price
 * as it's a fixed rate. They can upload art, add sizes and as long as it's 2
 * colors or under, there should be 2 pricing outcomes."
 *
 * The offer itself is the one he has been running since 17 Nov (his own
 * art email, the 19 Nov blast and the pitches): 50 printed hoodies, $27
 * each front print, $33 each front and back, one price XS to 5XL, up to 2
 * ink colours per side, setup included, order by December 1st.
 *
 * ── WHY THIS IS NOT THE MATRIX ─────────────────────────────────────────────
 * The regular apparel engine (lib/apparel-cart.ts) prices garments from S&S,
 * printing from the matrix, screens at $25 a colour, plus underbase and rush.
 * Every one of those is something the special promises NOT to charge. Running
 * the special through that engine and then overriding its answer would leave
 * two prices in one quote; this file is the special's whole price instead,
 * and it returns the same ApparelCartQuote shape so every surface that reads
 * an apparel quote (summary, review, shop email, Printavo rows) keeps
 * working without learning a new one.
 *
 * Nothing about the regular flow changes: its minimums, colour order and
 * placements are untouched, and this file is only read when the customer has
 * pressed the special's button.
 *
 * ── THE NUMBERS ARE GABE'S ─────────────────────────────────────────────────
 * Change them here and nowhere else. tests/hoodie-special.test.ts pins them.
 */
export const HOODIE_SPECIAL = {
  /** Stored on the quote and shown to the shop. */
  id: "hoodie-50" as const,
  name: "50 Hoodie Special",
  /** Per piece, front print only. */
  frontPrice: 27,
  /** Per piece, front and back. */
  frontAndBackPrice: 33,
  /**
   * The fewest pieces the special takes. "50 printed hoodies" — read as a
   * floor, not an exact pack: a customer who needs 60 pays the same flat
   * rate per piece rather than being pushed onto a dearer regular quote.
   * The shop confirms every apparel estimate before invoicing, so a very
   * large special order is still Gabe's to accept.
   */
  minPieces: 50,
  /** Up to this many ink colours on EACH printed side. */
  maxInksPerSide: 2,
  /**
   * The last day the button is offered, in the shop's own time zone.
   * "Order by December 1st". From Dec 2 the button is gone and the apparel
   * section is exactly what it was before the special.
   */
  lastDay: "2026-12-01",
  /**
   * The blank the special is quoted on: the app's Classic Hoodie (Gildan
   * 18500, S&S style 395). Used for the garment photo, the placement sizes
   * and the shop's supplier block — never for price.
   */
  catalogStyle: "395",
  garmentLabel: "Classic Hoodie",
  /**
   * The eight colours on the special's art, named as S&S names them on the
   * Gildan 18500 so the shop orders the right blank. Black, Navy and Sport
   * Grey first (Gabe, 2026-11-21: most-ordered first). Hex values are
   * garment colours for the swatch, not UI tokens.
   */
  colors: [
    { name: "Black", hex: "#111111" },
    { name: "Navy", hex: "#0c1c47" },
    { name: "Sport Grey", hex: "#9a9fa3" },
    { name: "Charcoal", hex: "#4a4a4f" },
    { name: "Ash", hex: "#d9d9d9" },
    { name: "White", hex: "#f4f4f2" },
    { name: "Royal", hex: "#1f4fa0" },
    { name: "Red", hex: "#c62f2f" },
  ],
  /** One price across every size. */
  sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
  /**
   * Where the front and back prints can go on a pullover hoodie — the
   * chart's own placements (lib/print-placements.ts), so the sizes shown
   * are the shop's. The price does not depend on which.
   */
  frontPlacements: ["Front", "Center Chest", "Left Chest"],
  backPlacements: ["Back", "Upper Back"],
};

export type HoodieSpecialSides = "front" | "frontAndBack";

/** Today's date in Salem, as YYYY-MM-DD. The offer ends on the shop's clock. */
export function shopTodayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Is the special still on offer? Through the whole of its last day. */
export function isHoodieSpecialOpen(today: string = shopTodayIso()): boolean {
  return today <= HOODIE_SPECIAL.lastDay;
}

/** Which of the two prices a set of print locations gets. */
export function hoodieSpecialSides(printLocations: string[]): HoodieSpecialSides {
  return printLocations.some((location) =>
    HOODIE_SPECIAL.backPlacements.includes(location)
  )
    ? "frontAndBack"
    : "front";
}

export function hoodieSpecialUnitPrice(printLocations: string[]): number {
  return hoodieSpecialSides(printLocations) === "frontAndBack"
    ? HOODIE_SPECIAL.frontAndBackPrice
    : HOODIE_SPECIAL.frontPrice;
}

/** "1 color" / "2 colors" → 1 / 2. Anything else reads as more than the cap. */
function inkCount(inkColors: string | undefined): number {
  const match = /^(\d+)/.exec(inkColors || "");
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/** The ink options the special offers on each side. */
export const HOODIE_SPECIAL_INK_OPTIONS = ["1 color", "2 colors"];

/** Clamp any ink choice to what the special covers. */
export function clampHoodieSpecialInk(inkColors: string | undefined): string {
  return inkCount(inkColors) <= 1 ? "1 color" : "2 colors";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The special's quote, in the shape every apparel surface already reads.
 *
 * One garment line at the flat per-piece price, and NOTHING else: printing,
 * screens, underbase and rush are all zero because the special includes or
 * waives them. lib/printavo.ts only writes the printing and setup rows when
 * they are above zero, so the invoice is one row, N × $27.00 (or $33.00),
 * and adds up to the screen to the cent with no division anywhere.
 */
export function quoteHoodieSpecial(input: {
  quantity: number;
  colorName: string;
  printLocations: string[];
  sizeBreakdown: string;
}): ApparelCartQuote {
  const quantity = Math.max(0, Math.floor(input.quantity || 0));
  const unit = hoodieSpecialUnitPrice(input.printLocations);
  const total = round2(unit * quantity);
  const locationCount = Math.max(1, input.printLocations.length);

  return {
    lines:
      quantity > 0
        ? [
            {
              id: "line-1",
              garmentLabel: hoodieSpecialLineLabel(input.printLocations),
              colorName: input.colorName,
              catalogStyle: HOODIE_SPECIAL.catalogStyle,
              garmentUnitPrice: unit,
              garmentTotal: total,
              quantity,
              sizeBreakdown: input.sizeBreakdown,
            },
          ]
        : [],
    garmentMarkup: 0,
    quantity,
    garmentTotal: total,
    garmentUnitPrice: quantity > 0 ? unit : 0,
    underbaseFeePerPiece: 0,
    printUnitPrice: 0,
    printTotal: 0,
    setupTotal: 0,
    total,
    unitPrice: quantity > 0 ? unit : 0,
    inkColorCount: 0,
    colorsByLocation: [],
    locationCount,
    printTierQuantity: quantity,
    // Always present and always zero: a rush date does not change the
    // special's price. The date rules themselves still apply.
    rushFee: 0,
  };
}

/** What the garment line is called on the invoice and in the shop email. */
export function hoodieSpecialLineLabel(printLocations: string[]): string {
  return hoodieSpecialSides(printLocations) === "frontAndBack"
    ? `${HOODIE_SPECIAL.name} - ${HOODIE_SPECIAL.garmentLabel}, front and back print`
    : `${HOODIE_SPECIAL.name} - ${HOODIE_SPECIAL.garmentLabel}, front print`;
}

/** The sentence the shop reads to know what the figure stood on. */
export function hoodieSpecialNote(printLocations: string[]): string {
  const unit = hoodieSpecialUnitPrice(printLocations);
  const sides =
    hoodieSpecialSides(printLocations) === "frontAndBack"
      ? "front and back"
      : "front only";

  return `${HOODIE_SPECIAL.name}: flat $${unit.toFixed(
    2
  )} per hoodie (${sides}), any size XS-5XL, up to ${
    HOODIE_SPECIAL.maxInksPerSide
  } ink colors per side, setup included. Final pricing reviewed by Gorilla Salem.`;
}

/**
 * What stops a special from being submitted. Only the special's own rules:
 * the contact, date and artwork rules are the regular apparel ones and run
 * beside these (lib/validation.ts).
 */
export function hoodieSpecialFieldErrors(input: {
  quantity: number;
  sizeQuantityTotal: number;
  colorName: string;
  printLocations: string[];
  inkColors: string;
  inkColorsByLocation?: Record<string, string>;
  today?: string;
}): { quantity?: string; printLocations?: string } {
  const errors: { quantity?: string; printLocations?: string } = {};

  if (!isHoodieSpecialOpen(input.today)) {
    errors.quantity = `The ${HOODIE_SPECIAL.name} ended ${formatLastDay()}. Switch back to the regular hoodie quote to carry on.`;
    return errors;
  }

  if (!(input.sizeQuantityTotal > 0)) {
    errors.quantity = `Enter your sizes. The special starts at ${HOODIE_SPECIAL.minPieces} hoodies.`;
  } else if (input.sizeQuantityTotal < HOODIE_SPECIAL.minPieces) {
    errors.quantity = `The special starts at ${HOODIE_SPECIAL.minPieces} hoodies. You have ${input.sizeQuantityTotal}, so add ${
      HOODIE_SPECIAL.minPieces - input.sizeQuantityTotal
    } more.`;
  }

  const front = input.printLocations.filter((location) =>
    HOODIE_SPECIAL.frontPlacements.includes(location)
  );
  const others = input.printLocations.filter(
    (location) =>
      !HOODIE_SPECIAL.frontPlacements.includes(location) &&
      !HOODIE_SPECIAL.backPlacements.includes(location)
  );
  if (front.length !== 1 || others.length > 0) {
    errors.printLocations = "Choose where the front print goes.";
  } else if (
    !HOODIE_SPECIAL.colors.some((color) => color.name === input.colorName)
  ) {
    // Unreachable from the form (the colour is only ever picked from the
    // special's own list), but a quote must never name a blank the special
    // does not offer. Filed under the print question: there is no colour
    // field key, and this group sits directly under the swatches.
    errors.printLocations = "Pick one of the special's hoodie colors.";
  }

  const overCap = input.printLocations.some(
    (location) =>
      inkCount(input.inkColorsByLocation?.[location] || input.inkColors) >
      HOODIE_SPECIAL.maxInksPerSide
  );
  if (overCap) {
    errors.printLocations = `The special covers up to ${HOODIE_SPECIAL.maxInksPerSide} ink colors per side.`;
  }

  return errors;
}

/** "December 1" — for customer copy. */
export function formatLastDay(): string {
  const [year, month, day] = HOODIE_SPECIAL.lastDay.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
