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
 * PLACEHOLDERS, all of them — a plausible chest area, not a measured one.
 * Verify against the real photo before flipping any `verified`.
 */
const UNVERIFIED_CHEST: GarmentZone = {
  verified: false,
  centerX: 0.5,
  top: 0.28,
  width: 0.34,
  maxHeight: 0.32,
};

export const garmentZones: Record<string, StyleZones> = {
  // Starter Tee — Gildan 2000 Ultra Cotton
  "39": {
    front: { ...UNVERIFIED_CHEST },
    back: { ...UNVERIFIED_CHEST },
  },
  // Premium Soft Tee — Bella+Canvas 3001CVC
  "7584": {
    front: { ...UNVERIFIED_CHEST },
    back: { ...UNVERIFIED_CHEST },
  },
  // Classic Hoodie — Gildan 18500. The pocket and drawcords eat into the
  // chest, so expect the verified zone to sit higher and smaller than a tee's.
  "395": {
    front: { ...UNVERIFIED_CHEST },
    back: { ...UNVERIFIED_CHEST },
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
