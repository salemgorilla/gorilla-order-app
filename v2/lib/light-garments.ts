/**
 * WHICH GARMENT COLOURS PRINT WITHOUT A WHITE UNDERBASE.
 *
 * Gabe, 2026-11-23, asked whether Ash and Natural should get the underbase:
 * "It should price like white." So white AND the light colours print with
 * no underbase, and only darker colours get one (the underbase counts as a
 * colour: Gabe, 2026-11-21, "Under base counts as a colors").
 *
 * This is the ONE list. The price (lib/apparel-pricing via apparelPrintSpec),
 * the minimum (lib/print-minimums), the builder tile and the summary all
 * read isLightGarment(), so they cannot disagree.
 *
 * By NAME, because that is what every surface carries (the S&S catalogue,
 * the fallback colour list, the extra garment lines). Names come from the
 * live catalogue (tests/fixtures/ss-color-names-2026-11-21.json) plus the
 * fallback list in lib/apparel.ts.
 *
 * A colour NOT on the list gets the underbase. That errs high on an
 * unfamiliar light colour rather than low on a dark one, which is the safe
 * direction on a flow the shop confirms before invoicing. Neon and safety
 * colours are left off on purpose; add a name here to move it.
 */
export const LIGHT_GARMENT_COLORS: readonly string[] = [
  // Whites (any name with the word "white" also counts, see below)
  "White",
  "Solid White Blend",
  "PFD White",
  // Light greys
  "Ash",
  "Ice Grey",
  // Not "Sport Grey": Gabe, 23 Nov, "Make Sport Grey dark".
  "Athletic Heather",
  "Heather Gray",
  "Heather Cement",
  "Heather Cool Grey",
  "Heather Silver",
  "Heather Stone",
  "Heather Dust",
  // Naturals and creams
  "Natural",
  "Heather Natural",
  "Heather Prism Natural",
  "Cornsilk",
  "Sand",
  "Heather Sand Dune",
  "Heather Oatmeal",
  "Heather French Vanilla",
  "Heather Soft Cream",
  // Pastels
  "Light Blue",
  "Sky",
  "Heather Baby Blue",
  "Heather Ice Blue",
  "Heather Prism Ice Blue",
  "Light Pink",
  "Heather Pink",
  "Heather Peach",
  "Heather Prism Peach",
  "Heather Prism Lilac",
  "Mint Green",
  "Heather Mint",
  "Heather Prism Mint",
  "Pistachio",
  "Daisy",
  "Heather Yellow",
];

const normalize = (name: string) =>
  (name || "").trim().toLowerCase().replace(/\bgray\b/g, "grey").replace(/\s+/g, " ");

const LIGHT = new Set(LIGHT_GARMENT_COLORS.map(normalize));

/**
 * Does this garment colour print without a white underbase? White (any
 * name with the word "white" in it, read by the body colour of a two-tone
 * name such as "White/Black") and the light colours above.
 */
export function isLightGarment(colorName: string): boolean {
  const body = normalize((colorName || "").split("/")[0]);
  if (!body) return false;
  return /\bwhite\b/.test(body) || LIGHT.has(body);
}
