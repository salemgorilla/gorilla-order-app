/**
 * The die-cut contour, in one place.
 *
 * Two renderers draw this edge: the on-screen preview (SVG filter, in
 * components/preview/StickerShape.tsx) and the proof attached to the quote
 * email (canvas, in lib/sticker-proof.ts). They MUST agree — the whole point
 * of the emailed proof is that it shows the customer the same cut they
 * approved on screen. Sharing the constants is what keeps them from drifting.
 *
 * THE TECHNIQUE: blur the alpha, then threshold it back to a hard edge.
 *
 * A Gaussian is isotropic, so the contour lands the same distance out in every
 * direction. Thresholding BELOW the midpoint is what grows the shape: for a
 * straight edge the new outline sits at sigma * probit(1 - t) from the old one.
 * The blur also rounds the contour, which is the point rather than a side
 * effect — a cutting head cannot turn a sharp interior corner, it sweeps
 * through, and that sweep is what makes the edge read as a real cut.
 *
 * feMorphology/dilate was tried first and rejected: its structuring element is
 * a RECTANGLE, so it grows sqrt(2) further on the diagonals and scallops the
 * contour. Measured on a 10px border, morphology varied 4.5px around the
 * outline; this varies 1.0px, which is the measurement floor.
 */

/** Must match --cut-line in globals.css and isMagentaPixel() in lib/artwork.ts. */
export const MAGENTA = "#ff00ff";

/**
 * Light grey rather than the literal white of the vinyl. The proof stage
 * behind it is white paper, and a white-on-white edge cannot be seen, so the
 * customer could not tell where their sticker gets cut. Light enough to still
 * read as white stock.
 */
export const STICKER_EDGE = "#e6e4de";

/**
 * Threshold alpha for the vinyl edge. Below 0.5, so the shape grows.
 *
 * The magenta cut rim uses a LOWER threshold against the SAME blur rather than
 * a bigger blur. This matters: offset scales with probit(1 - t) while rounding
 * is set by sigma, so sharing the sigma makes the two rims genuinely parallel.
 * Blurring twice made the magenta round harder than the grey it was tracing,
 * and the rim came out visibly wobbly instead of following the cut.
 */
export const EDGE_THRESHOLD = 0.1;
export const CUT_RIM_THRESHOLD = 0.02;

/**
 * The grey cut edge sits BETWEEN the white body and the magenta rim.
 *
 * A die-cut sticker is white vinyl cut to the contour, so everything inside
 * the cut is white — including any transparent area of the artwork. Rendering
 * the body as transparent made an uploaded PNG preview as see-through, which
 * is not what gets made. The body is now filled white at EDGE_THRESHOLD and
 * the grey shows as a rim just outside it.
 */
export const CUT_EDGE_THRESHOLD = 0.05;

/** probit(1 - t) for each threshold. Converts a border width into a sigma. */
export const EDGE_PROBIT = 1.2816;
export const CUT_EDGE_PROBIT = 1.6449;
export const CUT_RIM_PROBIT = 2.0537;

/**
 * The stock the artwork is printed on.
 *
 * Every material the shop runs is OPAQUE — white vinyl, chrome, holographic.
 * Nothing is see-through, so a transparent area of the customer's file is not
 * a hole: it is bare stock. Chrome and holographic get a flat representative
 * tint here rather than the gradient the shaped card uses, because this value
 * is flooded into a filter and a gradient cannot be.
 */
export function getStickerBodyColor(material: string) {
  const name = String(material || "").trim();
  if (name === "Holographic") return "#f1e9f7";
  if (name === "Chrome") return "#e9eaec";
  return "#ffffff";
}

/**
 * Curvature correction. A convex outline spreads slightly less than the
 * straight-edge maths predicts; without this a 10px border measured 9.2px.
 */
export const EDGE_GAIN = 1.08;

/** Steep enough to read as hard, shallow enough to keep anti-aliasing. */
export const EDGE_THRESHOLD_SLOPE = 40;
export const EDGE_THRESHOLD_INTERCEPT =
  0.5 - EDGE_THRESHOLD_SLOPE * EDGE_THRESHOLD;

/**
 * The rim needs a STEEPER slope to look equally hard.
 *
 * Edge hardness is spatial, not alpha-based: how fast alpha crosses the
 * threshold per pixel. For a Gaussian that rate is phi(z)/sigma, and the rim
 * sits further out in the tail where alpha changes far more slowly with
 * distance. Reusing slope 40 out there spread the transition over many pixels
 * and the cut line rendered as a soft glow instead of a line.
 *
 *   phi(1.2816) = 0.1755   (vinyl edge)
 *   phi(2.0537) = 0.0484   (cut rim)
 *
 * so the rim needs 0.1755 / 0.0484 = 3.63x the slope to match.
 */
export const CUT_RIM_SLOPE = Math.round(EDGE_THRESHOLD_SLOPE * 3.63);
export const CUT_RIM_INTERCEPT = 0.5 - CUT_RIM_SLOPE * CUT_RIM_THRESHOLD;

/** Same scaling for the grey edge: phi(1.2816)/phi(1.6449) = 1.70. */
export const CUT_EDGE_SLOPE = Math.round(EDGE_THRESHOLD_SLOPE * 1.7);
export const CUT_EDGE_INTERCEPT = 0.5 - CUT_EDGE_SLOPE * CUT_EDGE_THRESHOLD;

/** Blur sigma that puts the contour `borderPx` outside the artwork. */
export function contourSigma(borderPx: number) {
  return Math.max(0.4, (borderPx * EDGE_GAIN) / EDGE_PROBIT);
}

/**
 * The canvas equivalent of the SVG feFuncA threshold.
 *
 * Applies the same linear ramp to the alpha channel and paints every surviving
 * pixel the given colour, turning a blurred silhouette into a hard-edged band.
 * Mutates the ImageData in place.
 */
export function thresholdAlphaToColor(
  imageData: ImageData,
  color: { r: number; g: number; b: number },
  slope: number = EDGE_THRESHOLD_SLOPE,
  intercept: number = EDGE_THRESHOLD_INTERCEPT
) {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    const ramped = slope * alpha + intercept;

    data[i] = color.r;
    data[i + 1] = color.g;
    data[i + 2] = color.b;
    data[i + 3] = Math.max(0, Math.min(1, ramped)) * 255;
  }

  return imageData;
}

/** "#e6e4de" -> {r,g,b}. */
export function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
