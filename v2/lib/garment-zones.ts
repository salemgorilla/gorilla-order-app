/**
 * Where the print area sits in each S&S product photograph.
 *
 * ── WHY THIS TABLE EXISTS ─────────────────────────────────────────────────
 * ApparelPreview shows the garment photo and the artwork side by side, on
 * purpose: the component it replaced pinned art to coordinates tuned to a
 * DRAWN shirt, so customers were shown their design at an arbitrary spot on
 * a real photo and told it was a proof. The fix for that is not better
 * guessing — it is knowing, per photograph, where the chest actually sits.
 *
 * That knowledge is this table, and it is earned one photo at a time:
 * somebody opens the style's real frontImage/backImage, eyeballs the print
 * area as a fraction of that photo, corrects the numbers, and flips
 * `verified`. Until then getVerifiedGarmentZone() returns null and the
 * preview keeps its honest side-by-side view — the fallback needs no flag,
 * because the absence of a verified zone IS the flag.
 *
 * ── COORDINATES ───────────────────────────────────────────────────────────
 * Fractions of the PHOTOGRAPH itself (0..1), not of any on-screen box:
 *
 *   centerX    horizontal centre of the print area
 *   top        top edge of the print area
 *   width      print-area width; artwork is drawn at this width and its
 *              height follows the ART's own aspect ratio — never stretched
 *   maxHeight  clamp: art taller than this (as drawn) scales DOWN to fit,
 *              still keeping its aspect
 *
 * Fractions survive the photo being displayed at any size. They do NOT
 * survive S&S recropping the photo — if a style's photography changes, its
 * zone goes stale silently. Spot-check when styles are updated.
 *
 * Keyed by S&S styleID (`GorillaCatalogProduct.catalogStyle`), the same id
 * lib/apparel-catalog.ts documents.
 */

export type GarmentZone = {
  /**
   * A human has checked these numbers against the style's actual photo and
   * spot-checked the composite on screen. Placeholder coordinates ship
   * verified:false and are never rendered.
   */
  verified: boolean;
  centerX: number;
  top: number;
  width: number;
  maxHeight: number;
};

export type GarmentPlacement = "Front" | "Back";

type StyleZones = Partial<Record<"front" | "back", GarmentZone>>;

/**
 * MEASURED 2026-11-21 against the live S&S photos (1000x1250 each), with the
 * calibration page's own test art (one 3:1, one 3:4) composited through the
 * same geometry as lib/garment-composite.ts. Where the numbers came from:
 *
 *   - Front top sits about 2.5-4" below the front collar, back top about 3"
 *     below the back collar (hoodie: just under the point of the hood).
 *   - Width is about 11.5-12" of chest, scaled from the body width in the
 *     photo (tees ~0.44-0.53 of photo width, hoodie ~0.65).
 *   - maxHeight caps tall art near 14" on tees. On the hoodie front it also
 *     keeps the box above the pouch pocket, whose top edge sits at ~0.525.
 *
 * ONE ZONE PER STYLE, MANY PHOTO SHOOTS. S&S does not frame every colour of
 * a style the same way. Gildan 2000 has at least two framings (Black, Navy,
 * Red, Royal sit lower and smaller in the frame than Heather Navy, Sport
 * Grey, White: front collar at ~0.178 vs ~0.14), and B+C 3001CVC's Heather
 * Red sits lower than its Black, White and Heather Navy. Each number below
 * is the compromise that lands a shop-correct print on every colour that was
 * checked, rather than the exact spot on any single one. Colours checked:
 *
 *   39    front: Black, Navy, Red, Royal, Heather Navy, Sport Grey, White
 *         back:  Black, Red, Heather Navy, Sport Grey, White
 *   7584  front: Solid Black Blend, Solid White Blend, Heather Navy, Heather Red
 *         back:  Solid Black Blend, Heather Navy, Heather Red
 *   395   front and back: Black, Sport Grey, Red
 */
export const garmentZones: Record<string, StyleZones> = {
  // Basic Tee — Gildan 2000 Ultra Cotton
  "39": {
    front: {
      verified: true,
      centerX: 0.5,
      top: 0.225,
      width: 0.28,
      maxHeight: 0.26,
    },
    back: {
      verified: true,
      centerX: 0.5,
      top: 0.165,
      width: 0.28,
      maxHeight: 0.27,
    },
  },
  // Premium Soft Tee — Bella+Canvas 3001CVC. Slimmer body in the photos than
  // the Gildan, so the box is a touch narrower.
  "7584": {
    front: {
      verified: true,
      centerX: 0.5,
      top: 0.205,
      width: 0.27,
      maxHeight: 0.25,
    },
    back: {
      verified: true,
      centerX: 0.5,
      top: 0.135,
      width: 0.27,
      maxHeight: 0.26,
    },
  },
  // Classic Hoodie — Gildan 18500. Front: starts below the hood opening and
  // ends above the pouch pocket; the drawcords hang over the top of the art,
  // as they do on a real print. Back: the old placeholder already sat just
  // under the hood point at a 12.5" width, so it is kept as measured.
  "395": {
    front: {
      verified: true,
      centerX: 0.5,
      top: 0.22,
      width: 0.31,
      maxHeight: 0.26,
    },
    back: {
      verified: true,
      centerX: 0.5,
      top: 0.28,
      width: 0.34,
      maxHeight: 0.32,
    },
  },
};

/**
 * The zone the compositor may trust, or null.
 *
 * Null for an unknown style, an unknown placement, and — the important one —
 * a zone nobody has verified. The caller falls back to the side-by-side
 * view on null; nothing customer-facing changes until a human has looked at
 * the photo.
 *
 * `zones` is injectable for tests; production callers use the module table.
 */
export function getVerifiedGarmentZone(
  catalogStyle: string | null | undefined,
  placement: GarmentPlacement,
  zones: Record<string, StyleZones> = garmentZones
): GarmentZone | null {
  if (!catalogStyle) return null;

  const zone = zones[catalogStyle]?.[placement === "Back" ? "back" : "front"];

  if (!zone || !zone.verified) return null;

  return zone;
}
