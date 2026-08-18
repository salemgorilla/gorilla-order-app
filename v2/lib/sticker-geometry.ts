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

/**
 * The sticker's drawing area at its real proportions.
 *
 * ── THE FOURTH COPY OF THIS FACT DRIFTED ──────────────────────────────────
 * These lines existed in the shaped render branch of StickerShape and again
 * in lib/sticker-proof.ts, and the die-cut preview had NO copy — it drew a
 * flat square. A 4" x 1" die cut previewed with its art four times taller
 * than the emailed proof drew it, which is the picture the shop cuts from.
 * The customer approved one thing and the shop received another, and the two
 * renderers agreeing was the entire point of sharing the compositor.
 *
 * So the geometry lives here now, with the safe-area factors, for the same
 * reason: it is a fact about the product, both renderers need it, and it can
 * be tested in node.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * `longestPx` is the box the LONG side fills — 256 on the preview card, 720
 * on the proof stage. The short side follows from the aspect ratio, so both
 * come out as the same rectangle at different magnifications.
 *
 * Falls back to a square when no dimensions are set, which is what a preset
 * size or an unfinished form has, and is what those used to render as.
 */
export function getStickerCard(
  widthInches: number,
  heightInches: number,
  longestPx: number
) {
  const w = Number(widthInches) || 0;
  const h = Number(heightInches) || 0;
  const longest = Math.max(w, h);

  if (!(longest > 0)) return { cardW: longestPx, cardH: longestPx };

  return {
    cardW: longestPx * (w / longest),
    cardH: longestPx * (h / longest),
  };
}

/**
 * How large the art is drawn inside that card, fitted to the TIGHT axis.
 *
 * Both axes are offered and the smaller wins, so a square logo on a 4" x 1"
 * sticker is limited by the 1". Sizing against one axis, or against a square,
 * is what let the die-cut preview overstate the art.
 *
 * `safeAreaFactor` is 1 for a die cut — its contour is generated FROM the
 * art, so there is no fixed outline to hold the art away from.
 */
export function getArtDrawSize(input: {
  cardW: number;
  cardH: number;
  artWidth: number;
  artHeight: number;
  scalePercent: number;
  safeAreaFactor?: number;
}) {
  const safe = input.safeAreaFactor ?? 1;

  // Clamped HERE, so every caller gets the slider's real range whether or not
  // it remembered to clamp. The proof used to do this itself and the preview
  // did it upstream — two copies of the same bound, one of which was about to
  // be dropped when this was extracted.
  const scale =
    Math.min(Math.max(input.scalePercent, 20), ART_SCALE_CEILING) / 100;

  const boxW = input.cardW * safe * scale;
  const boxH = input.cardH * safe * scale;

  const fit = Math.min(boxW / input.artWidth, boxH / input.artHeight);

  return { drawW: input.artWidth * fit, drawH: input.artHeight * fit };
}
