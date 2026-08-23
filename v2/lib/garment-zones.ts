/**
 * Where the print actually sits on a garment photograph.
 *
 * WHY THIS FILE EXISTS AT ALL:
 *
 * `ApparelPreview` shows the garment and the artwork side by side rather than
 * composited, and the comment at the top of that component explains why: the
 * component it replaced pinned artwork to constants tuned for a hand-drawn
 * shirt, then rendered a real S&S photograph underneath. The photo is
 * object-contain, so where the chest lands depends on that photo's aspect and
 * crop — the customer was shown their art at an arbitrary spot and told it was
 * a proof.
 *
 * The fix is not better constants. It is constants that someone has CHECKED
 * against the photograph they apply to. That is what this file holds, and the
 * `verified` flag is what separates a checked number from a guess.
 *
 * HOW A ZONE IS MEASURED:
 *
 * Open the style's real `frontImage` / `backImage` (the URLs in
 * `GorillaCatalogColor`, which is what the app feeds the preview), and read
 * the print area off it as FRACTIONS OF THE WHOLE PHOTOGRAPH, origin top-left.
 * Fractions and not pixels, because S&S serves the same style at more than one
 * resolution and the compositor fits the photo into whatever box it is given.
 *
 * Then set `verified: true` — and only then. Until it flips, nothing about
 * this style changes on screen: `getVerifiedGarmentZone()` returns null and
 * the preview falls back to the side-by-side view it has always shown. That is
 * the whole safety property of this file. An unverified zone is invisible; a
 * wrong zone that someone marked verified is the original bug, back again.
 *
 * If S&S recrops a style's photography, its zone goes stale SILENTLY — there
 * is no drift detection here and the fractions cannot know the photo changed.
 * Worth a spot check when apparel photography looks different, not a one-time
 * job.
 */

/** The two locations the apparel flow sells. Mirrors `apparelCatalog.printLocations`. */
export type GarmentPlacement = "Front" | "Back";

export type GarmentZone = {
  /** Left edge of the print area, as a fraction of the photo's width. */
  x: number;
  /** Top edge of the print area, as a fraction of the photo's height. */
  y: number;
  /** Print area width, as a fraction of the photo's width. */
  width: number;
  /**
   * The tallest the art may run, as a fraction of the photo's height.
   *
   * Art is drawn at the zone's width with its height derived from its own
   * aspect ratio — never stretched to fill a box. A very tall design would
   * therefore run off the hem, so it is scaled down to this instead. This is a
   * ceiling, not a target: most art never reaches it.
   */
  maxHeight: number;
  /**
   * Has a human opened this style's photo and read these numbers off it?
   *
   * false — including on a zone that looks plausible — means the numbers are
   * placeholders and MUST NOT reach a customer.
   */
  verified: boolean;
  /** How it was measured, for whoever checks it next. */
  note?: string;
};

/**
 * Keyed by S&S **styleID** — `GorillaCatalogProduct.catalogStyle`, the same id
 * `apparelCatalogItems[].style` carries. Not the manufacturer model number:
 * "2000" and "3001CVC" are not keys here, `39` and `7584` are. See the comment
 * in `lib/apparel-catalog.ts`.
 *
 * PLACEHOLDER COORDINATES BELOW. Every entry is `verified: false`, so every
 * entry is inert. The numbers are a rough front-chest rectangle copied across
 * all six entries as a starting point for measurement — they are NOT six
 * independent guesses, and no one should read them as approximately right.
 */
export const garmentZones: Record<
  string,
  Partial<Record<GarmentPlacement, GarmentZone>>
> = {
  // Gildan 2000 Ultra Cotton — "Starter Tee". The pre-selected default style,
  // so this is the zone most customers would ever see. Measure it first.
  "39": {
    Front: {
      x: 0.32,
      y: 0.27,
      width: 0.36,
      maxHeight: 0.3,
      verified: false,
      note: "Placeholder. Not measured against the style photo.",
    },
    Back: {
      x: 0.32,
      y: 0.25,
      width: 0.36,
      maxHeight: 0.34,
      verified: false,
      note: "Placeholder. Not measured against the style photo.",
    },
  },

  // Bella+Canvas 3001CVC — "Premium Soft Tee".
  "7584": {
    Front: {
      x: 0.32,
      y: 0.27,
      width: 0.36,
      maxHeight: 0.3,
      verified: false,
      note: "Placeholder. Not measured against the style photo.",
    },
    Back: {
      x: 0.32,
      y: 0.25,
      width: 0.36,
      maxHeight: 0.34,
      verified: false,
      note: "Placeholder. Not measured against the style photo.",
    },
  },

  // Gildan 18500 Heavy Blend — "Classic Hoodie". A pouch pocket and drawcords
  // sit inside a tee's front print area, so this one will not end up looking
  // like the tees above.
  "395": {
    Front: {
      x: 0.32,
      y: 0.27,
      width: 0.36,
      maxHeight: 0.3,
      verified: false,
      note: "Placeholder. Not measured against the style photo.",
    },
    Back: {
      x: 0.32,
      y: 0.25,
      width: 0.36,
      maxHeight: 0.34,
      verified: false,
      note: "Placeholder. Not measured against the style photo.",
    },
  },
};

/**
 * The zone for this style and placement, or null if nobody has checked it.
 *
 * null is the normal answer and the safe one — an unknown style, a style whose
 * zone is still a placeholder, or a placement nobody measured. Callers treat
 * null as "show the side-by-side view", which is the behaviour the apparel
 * preview has always had.
 */
export function getVerifiedGarmentZone(
  catalogStyle: string | null | undefined,
  placement: GarmentPlacement
): GarmentZone | null {
  const style = catalogStyle?.trim();
  if (!style) return null;

  const zone = garmentZones[style]?.[placement];
  if (!zone || !zone.verified) return null;

  return zone;
}

/**
 * Which single placement a composite should show.
 *
 * Front wins when both are selected. One garment, one picture — a customer who
 * ticks Front and Back pictures the front, and showing two composites side by
 * side rebuilds the exact ambiguity the side-by-side view already covers. The
 * print locations are still listed in full as text underneath.
 */
export function pickGarmentPlacement(
  printLocations: string[]
): GarmentPlacement | null {
  if (printLocations.includes("Front")) return "Front";
  if (printLocations.includes("Back")) return "Back";

  return null;
}
