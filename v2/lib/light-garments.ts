/**
 * WHICH GARMENT COLOURS PRINT WITHOUT A WHITE UNDERBASE.
 *
 * Gabe, 2026-11-23: "I think the only ones that aren't dark and would be
 * considered light is ash. White, natural," and "If there's an off-white,
 * that would be considered light." and "Sand is light". (Earlier the same
 * day: "Make Sport Grey dark".) So light means white, off-white, Ash,
 * Natural and Sand. Every other
 * colour is dark and gets the underbase, which counts as a colour (Gabe,
 * 2026-11-21, "Under base counts as a colors").
 *
 * This is the ONE rule. The price and the minimum (via
 * anyGarmentNeedsUnderbase / apparelPrintSpec), the builder tile and the
 * summary all read isLightGarment(), so they cannot disagree.
 *
 * By NAME, because that is what every surface carries (the S&S catalogue,
 * the fallback colour list, the extra garment lines). A word match covers
 * the catalogue's variants and any future style:
 *   white      White, Solid White Blend, PFD White
 *   off-white  Off White, Ivory, Cream (Heather Soft Cream)
 *   natural    Natural, Heather Natural, Heather Prism Natural
 *   ash        Ash (also "Ash Grey" on styles that name it so)
 *   sand       Sand, Heather Sand Dune
 * plus the one off-white whose name says neither: Heather French Vanilla.
 */
const LIGHT_WORDS = /\b(white|off[- ]?white|ivory|cream|natural|ash|sand)\b/;

/** Off-whites whose names carry none of the words above. */
export const OFF_WHITE_NAMES: readonly string[] = ["Heather French Vanilla"];

const normalize = (name: string) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");

const OFF_WHITE = new Set(OFF_WHITE_NAMES.map(normalize));

/**
 * Does this garment colour print without a white underbase? Read by the
 * body colour of a two-tone name ("White/Black" is light, "Black/White"
 * dark).
 */
export function isLightGarment(colorName: string): boolean {
  const body = normalize((colorName || "").split("/")[0]);
  if (!body) return false;
  return LIGHT_WORDS.test(body) || OFF_WHITE.has(body);
}
