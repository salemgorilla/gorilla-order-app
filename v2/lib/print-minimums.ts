import { locationColorCounts } from "./apparel-pricing";

/**
 * MINIMUM PIECES — set by how many ink colours the design prints.
 *
 * Gabe, 2026-11-21: "I prefer minimum to be based on amount of colors being
 * printed, when making screen printed garments." "12 items can get 1 color
 * printing max." "2 color is 24, 3 color and up is 48." And for embroidery:
 * "6 is minimum."
 *
 * Before this the apparel flow had no minimum at all (the matrix has a
 * 1-piece row), while the shop was quoting 12, 24 or 48 by hand depending
 * on who asked. One table, read by every surface, so the screen, the
 * validation and the copy cannot disagree.
 *
 * ── PER DESIGN ────────────────────────────────────────────────────────────
 * A quote in this app is ONE design printed on one or more garments (see
 * lib/apparel-cart.ts), so the minimum is read against the COMBINED count
 * across every garment line: 12 tees and 12 hoodies with the same 2-colour
 * print is 24 pieces and meets the 2-colour minimum. That is also how Gabe
 * explained it to a customer on 17 Nov ("the 48 minimum is per design").
 *
 * ── WHICH COLOUR COUNT ────────────────────────────────────────────────────
 * The design's MOST colours on any one placement: a 2-colour front with a
 * 1-colour back is a 2-colour design (24). The white underbase a dark
 * garment needs COUNTS as a colour — Gabe, 2026-11-21: "Under base counts
 * as a colors." So a 1-colour print on a black shirt is 2 colours (24). It
 * is the same count the pricing engine charges screens for
 * (locationColorCounts), so the minimum and the price read one number.
 */
export const SCREEN_PRINT_MINIMUMS = [
  { colors: 1, minimum: 12 },
  { colors: 2, minimum: 24 },
  /** "3 color and up is 48" — also "5+ / Full color / Not sure". */
  { colors: 3, minimum: 48 },
] as const;

/** Gabe, 2026-11-21: "For embroidery, 6 is minimum." */
export const EMBROIDERY_MINIMUM = 6;

/** The minimum for a screen-printed design with this many colours. */
export function screenPrintMinimum(colors: number): number {
  const n = Math.max(1, Math.floor(colors) || 1);
  let minimum: number = SCREEN_PRINT_MINIMUMS[0].minimum;

  for (const row of SCREEN_PRINT_MINIMUMS) {
    if (n >= row.colors) minimum = row.minimum;
  }

  return minimum;
}

/**
 * The design's colour count for the minimum: the most colours on any one
 * placement, the white underbase included.
 */
export function designColorCount(spec: {
  printLocations: string[];
  inkColors: string;
  inkColorsByLocation?: Record<string, string>;
  hasUnderbase?: boolean;
}): number {
  return Math.max(
    ...locationColorCounts({
      printLocations: spec.printLocations,
      inkColors: spec.inkColors,
      inkColorsByLocation: spec.inkColorsByLocation,
      hasUnderbase: Boolean(spec.hasUnderbase),
    })
  );
}

const colorWords = (colors: number) =>
  colors >= 3 ? "3 or more colors" : colors === 2 ? "2 colors" : "1 color";

/**
 * The customer-facing sentence when a design is under its minimum, or null
 * when it meets it. Names the shortfall, says when the underbase is what
 * moved it, and offers fewer ink colours when the count they already have
 * would meet that minimum. With an underbase the fewest a design can print
 * is 2 (1 ink + the underbase), so 12 is never offered then.
 */
export function screenPrintMinimumMessage(
  pieces: number,
  colors: number,
  options: { underbase?: boolean } = {}
): string | null {
  const minimum = screenPrintMinimum(colors);
  const have = Math.max(0, Math.floor(pieces) || 0);
  if (have >= minimum) return null;

  const short = minimum - have;
  const underbase = Boolean(options.underbase);
  const lead = underbase
    ? `On a dark garment the white underbase counts as a color, so this design prints ${colorWords(colors)} and starts at ${minimum} pieces.`
    : minimum === SCREEN_PRINT_MINIMUMS[0].minimum
      ? `Screen printing starts at ${minimum} pieces.`
      : `A design with ${colorWords(colors)} starts at ${minimum} pieces.`;

  // The biggest colour count their current number already qualifies for,
  // never below what this garment can print (2 with an underbase).
  const floor = underbase ? 2 : 1;
  const fits = [...SCREEN_PRINT_MINIMUMS]
    .reverse()
    .find((row) => row.colors >= floor && row.colors < Math.min(colors, 3) && have >= row.minimum);
  const inks = fits ? fits.colors - (underbase ? 1 : 0) : 0;
  const alternative = fits
    ? underbase
      ? `, or print it in ${inks} ink color${inks === 1 ? "" : "s"} (${fits.minimum} minimum)`
      : `, or print it in ${colorWords(fits.colors)} (${fits.minimum} minimum)`
    : "";

  return `${lead} You have ${have}, so add ${short} more${alternative}.`;
}
