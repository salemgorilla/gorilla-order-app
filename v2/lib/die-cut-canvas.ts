import {
  contourSigma,
  CUT_EDGE_INTERCEPT,
  CUT_EDGE_SLOPE,
  CUT_RIM_INTERCEPT,
  CUT_RIM_SLOPE,
  EDGE_THRESHOLD_INTERCEPT,
  EDGE_THRESHOLD_SLOPE,
  hexToRgb,
  MAGENTA,
  STICKER_EDGE,
} from "./die-cut";

/**
 * The die-cut sticker, composited on a canvas.
 *
 * WHY CANVAS AND NOT THE SVG FILTER IT REPLACES:
 *
 * The contour itself (blur the alpha, threshold it back to a hard edge) works
 * fine as an SVG filter. What an SVG filter CANNOT do is fill an interior
 * hole. Dilation only grows outward from the artwork's silhouette, so a blur
 * can never reach across a gap wider than itself — a ring previewed with a
 * see-through middle, verified by sampling the centre pixel: alpha 0 before
 * and after adding an opaque body layer.
 *
 * That was wrong about the actual product. A cutting head follows the OUTER
 * contour only; it does not cut out the middle of a donut unless asked. The
 * middle is vinyl, and every material the shop runs is opaque. So the body is
 * not "the artwork grown a bit" — it is EVERYTHING INSIDE THE OUTER CONTOUR.
 *
 * Getting that means flood-filling inward from outside the contour, which is a
 * connectivity question rather than a convolution, and canvas can answer it.
 *
 * Both the on-screen preview and the emailed proof now come through here, so
 * the proof cannot drift from the thing the customer approved.
 */

type Mask = Uint8Array;

/** Blur the art's alpha, then threshold it back to a hard edge. */
function contourMask(
  art: HTMLCanvasElement,
  borderPx: number,
  slope: number,
  intercept: number
): Mask | null {
  const scratch = document.createElement("canvas");
  scratch.width = art.width;
  scratch.height = art.height;

  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  // Canvas blur(Npx) is a Gaussian with standard deviation N — the same
  // quantity the SVG filter used as stdDeviation, so the contour is unchanged.
  ctx.filter = `blur(${contourSigma(borderPx)}px)`;
  ctx.drawImage(art, 0, 0);
  ctx.filter = "none";

  const pixels = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
  const mask = new Uint8Array(scratch.width * scratch.height);

  // THE ONE COPY OF THE RAMP. die-cut.ts used to also export a
  // thresholdAlphaToColor() that applied the same slope/intercept to an
  // ImageData — exported, documented, and called by nothing since the SVG
  // filter it mirrored was replaced. Two spellings of one rule, one of them
  // invisible, is how the contour drifts; removed rather than kept "for
  // reference".

  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const ramped = slope * (pixels[i + 3] / 255) + intercept;
    mask[p] = ramped >= 0.5 ? 1 : 0;
  }

  return mask;
}

/**
 * Everything the outer contour encloses, interior holes included.
 *
 * Flood-fills from the border through pixels the contour does not cover. What
 * the fill never reaches is either the contour itself or enclosed by it — and
 * enclosed means vinyl. Iterative, not recursive: a 900x900 region would blow
 * the call stack.
 */
export function fillEnclosed(mask: Mask, width: number, height: number): Mask {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];

  const push = (index: number) => {
    if (mask[index] === 0 && outside[index] === 0) {
      outside[index] = 1;
      stack.push(index);
    }
  };

  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }

  while (stack.length) {
    const index = stack.pop() as number;
    const x = index % width;
    const y = (index - x) / width;

    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  const filled = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    filled[i] = outside[i] === 1 ? 0 : 1;
  }

  return filled;
}

/** Paint a mask in one flat colour onto its own canvas. */
function paintMask(
  mask: Mask,
  width: number,
  height: number,
  color: string
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { r, g, b } = hexToRgb(color);
  const image = ctx.createImageData(width, height);

  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    image.data[i] = r;
    image.data[i + 1] = g;
    image.data[i + 2] = b;
    image.data[i + 3] = mask[p] === 1 ? 255 : 0;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Composite art onto opaque stock, cut to a die-cut contour.
 *
 * `art` must already carry padding around the artwork, or the contour has no
 * room to grow and gets clipped by its own canvas.
 */
export function composeDieCut({
  art,
  borderPx,
  bodyColor,
  magentaCutLine = false,
}: {
  art: HTMLCanvasElement;
  borderPx: number;
  bodyColor: string;
  magentaCutLine?: boolean;
}): HTMLCanvasElement | null {
  const { width, height } = art;

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  const draw = (mask: Mask | null, color: string) => {
    if (!mask) return;
    const layer = paintMask(fillEnclosed(mask, width, height), width, height, color);
    if (layer) ctx.drawImage(layer, 0, 0);
  };

  // Outermost first: magenta cut rim, grey cut edge, then the stock itself.
  // Each is filled, so none of them shows a hole the layer above would.
  if (magentaCutLine) {
    draw(
      contourMask(art, borderPx, CUT_RIM_SLOPE, CUT_RIM_INTERCEPT),
      MAGENTA
    );
  }

  if (borderPx > 0) {
    draw(
      contourMask(art, borderPx, CUT_EDGE_SLOPE, CUT_EDGE_INTERCEPT),
      STICKER_EDGE
    );
  }

  draw(
    contourMask(art, borderPx, EDGE_THRESHOLD_SLOPE, EDGE_THRESHOLD_INTERCEPT),
    bodyColor
  );

  ctx.drawImage(art, 0, 0);

  return out;
}
