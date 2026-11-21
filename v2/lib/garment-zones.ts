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

/**
 * A print location as the quote stores it ("Front", "Left Chest", …) — the
 * ids in lib/print-placements.ts, which also says which photo (front or
 * back) each one is measured on.
 */
export type GarmentPlacement = string;

type StyleZones = Partial<Record<GarmentPlacement, GarmentZone>>;

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
 *
 * The other placements (left chest, center chest, oversize front, sleeve,
 * collar back, upper back) were added 2026-11-21 from Gabe's placement
 * chart and the Stahls' guide, sized in inches off each photo's body width
 * and placed off its collar, then checked on the same colours with a square
 * test logo. Sleeve boxes sit on the wearer's LEFT sleeve, which is the
 * right-hand side of a front photo, as the left chest is.
 */
export const garmentZones: Record<string, StyleZones> = {
  // Basic Tee — Gildan 2000 Ultra Cotton
  "39": {
    "Left Chest": { verified: true, centerX: 0.607, top: 0.240, width: 0.095, maxHeight: 0.076 },
    "Center Chest": { verified: true, centerX: 0.500, top: 0.225, width: 0.190, maxHeight: 0.135 },
    Front: { verified: true, centerX: 0.500, top: 0.225, width: 0.280, maxHeight: 0.260 },
    "Oversize Front": { verified: true, centerX: 0.500, top: 0.215, width: 0.335, maxHeight: 0.285 },
    Sleeve: { verified: true, centerX: 0.835, top: 0.260, width: 0.065, maxHeight: 0.050 },
    "Collar Back": { verified: true, centerX: 0.500, top: 0.115, width: 0.060, maxHeight: 0.048 },
    "Upper Back": { verified: true, centerX: 0.500, top: 0.140, width: 0.285, maxHeight: 0.076 },
    Back: { verified: true, centerX: 0.500, top: 0.165, width: 0.280, maxHeight: 0.270 },
  },
  // Premium Soft Tee — Bella+Canvas 3001CVC. Slimmer body in the photos than
  // the Gildan, so every box is a touch narrower.
  "7584": {
    "Left Chest": { verified: true, centerX: 0.603, top: 0.215, width: 0.092, maxHeight: 0.074 },
    "Center Chest": { verified: true, centerX: 0.500, top: 0.205, width: 0.184, maxHeight: 0.130 },
    Front: { verified: true, centerX: 0.500, top: 0.205, width: 0.270, maxHeight: 0.250 },
    "Oversize Front": { verified: true, centerX: 0.500, top: 0.195, width: 0.322, maxHeight: 0.276 },
    Sleeve: { verified: true, centerX: 0.840, top: 0.260, width: 0.063, maxHeight: 0.050 },
    "Collar Back": { verified: true, centerX: 0.500, top: 0.090, width: 0.058, maxHeight: 0.046 },
    "Upper Back": { verified: true, centerX: 0.500, top: 0.115, width: 0.276, maxHeight: 0.074 },
    Back: { verified: true, centerX: 0.500, top: 0.135, width: 0.270, maxHeight: 0.260 },
  },
  // Classic Hoodie — Gildan 18500. Front placements start below the hood
  // opening and end above the pouch pocket; the drawcords hang over the top
  // of the art, as they do on a real print. Back placements sit just under
  // the point of the hood. No oversize front (it would run over the pocket)
  // and no collar back (the hood covers it) — see lib/print-placements.ts.
  // The sleeve is printed down the arm, so its box is tall and narrow.
  "395": {
    "Left Chest": { verified: true, centerX: 0.635, top: 0.225, width: 0.108, maxHeight: 0.086 },
    "Center Chest": { verified: true, centerX: 0.500, top: 0.220, width: 0.216, maxHeight: 0.130 },
    Front: { verified: true, centerX: 0.500, top: 0.220, width: 0.310, maxHeight: 0.260 },
    Sleeve: { verified: true, centerX: 0.850, top: 0.360, width: 0.054, maxHeight: 0.250 },
    "Upper Back": { verified: true, centerX: 0.500, top: 0.280, width: 0.324, maxHeight: 0.086 },
    Back: { verified: true, centerX: 0.500, top: 0.280, width: 0.340, maxHeight: 0.320 },
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

  const zone = zones[catalogStyle]?.[placement];

  if (!zone || !zone.verified) return null;

  return zone;
}
