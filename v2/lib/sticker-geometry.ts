/**
 * Where the blade is, per shape.
 *
 * ── WHY THIS IS A LIB MODULE AND NOT PART OF THE COMPONENT ────────────────
 * These numbers had FOUR copies: getStickerGeometry, the shaped render branch
 * beside it, and the proof renderer in lib/sticker-proof.ts — which the shop
 * actually cuts from. Four copies of one fact, and the one most likely to be
 * missed in an edit is the proof, because it is the only one nobody looks at
 * on screen.
 *
 * Living in lib rather than inside a "use client" component means the canvas
 * proof can read the same source as the preview, and means the thresholds can
 * be tested in node — which matters here, because the entire feature is the
 * claim that these numbers are right.
 */

/**
 * How much of the card's tight axis the art may occupy at 100%.
 *
 * Art is sized against an inscribed square. A square inscribed in a circle is
 * only ~70.7% of the diameter, so a circle needs a far tighter safe area than
 * a square — sizing by plain percentage is what used to run art off the round
 * shapes, and what "square corners picking out of a round sticker" was.
 *
 * NOT tunable from the slider work. These are what keep square art off the
 * corners at ordinary sizes.
 */
export function getSafeAreaFactor(shape: string) {
  // Oval shares the circle's factor: a rectangle inscribed in an ellipse is
  // the same proportion of its bounding box as one inscribed in a circle.
  if (shape === "Circle" || shape === "Oval") return 0.707;
  if (shape === "Rounded Corners") return 0.88;
  return 0.96;
}

/** The slider's hard ceiling once the customer has opted into bleed. */
export const ART_SCALE_CEILING = 150;

/**
 * The scale at which art exactly reaches the cut edge, per shape.
 *
 * The slider ran 40–150 for every shape, but the point where art meets the
 * blade is shape-dependent: 141% on a circle, 113% on rounded corners, 104%
 * on square. So a customer on square corners could drag 46 points past the
 * cut — and the preview clipped the overflow, showing a proof that looked
 * fine over artwork the plotter would slice.
 *
 * Derived from getSafeAreaFactor so the cap and the geometry cannot disagree.
 * A lookup table would be a second copy of the same fact.
 *
 * Floor, not round: 113 rather than 114 on rounded corners. The error has a
 * safe direction and stopping a point early is it.
 */
export function getBleedThreshold(shape: string) {
  // Die Cut has no fixed outline to overflow — the contour is generated FROM
  // the art, so there is no edge to cross and nothing to cap.
  if (shape === "Die Cut") return ART_SCALE_CEILING;

  return Math.floor(100 / getSafeAreaFactor(shape));
}

/**
 * The largest art scale this shape allows right now.
 *
 * Call this on every shape change, and whenever bleed is switched off.
 * Someone sets a circle to 141%, switches to Square Corners, and is silently
 * 37 points past that shape's cut edge holding a value the slider cannot even
 * represent.
 */
export function clampArtScaleToShape(
  shape: string,
  artScale: number,
  allowBleed: boolean
) {
  const ceiling = allowBleed ? ART_SCALE_CEILING : getBleedThreshold(shape);
  return Math.min(artScale, ceiling);
}
