/**
 * Knock a flat background out of uploaded artwork, in the browser.
 *
 * ── WHY THIS IS OPT-IN AND WHY IT IS SO CONSERVATIVE ──────────────────────
 * A die cut follows the artwork's alpha channel. A file exported onto solid
 * white has no alpha, so it cuts as a rectangle — see lib/artwork.ts. This
 * gives the customer a way out of that without leaving the page.
 *
 * It is NOT prepress. It is a flood fill from the image border, which is the
 * one background operation that can be trusted to leave the design alone:
 * it only removes background CONNECTED to the edge, so white inside a letter
 * or inside a ring survives — and that white is vinyl on the real sticker,
 * which is exactly right.
 *
 * It refuses rather than guesses. A border that is not close to one flat
 * colour (a photo, a gradient, a printed edge-to-edge design) returns null and
 * the customer is told we cannot do it, instead of being handed art with a
 * bite taken out of it.
 *
 * The shop is always told this ran, and always gets the original file too.
 * Automated matting is a head start for prepress, never a substitute for it.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Colour distance below which a pixel counts as background outright. */
const HARD_TOLERANCE = 42;

/**
 * How many pixels in from the cut we treat as the blended edge.
 *
 * Anti-aliasing spreads a shape's boundary over a pixel or two, and only the
 * outermost of those touches a removed pixel — grading just that one leaves
 * the rest of the ramp fully opaque and still carrying background colour.
 */
const EDGE_BAND_PX = 2;

/**
 * Below this contrast between the artwork and its background, the alpha
 * recovered from a colour ratio is numerically meaningless. Leave those pixels
 * alone rather than compute confetti from a near-zero denominator.
 */
const MIN_SEPARATION = 24;

/**
 * How much of the border must match the background colour before we will
 * touch the file. Below this the background is not flat and we decline.
 */
const MIN_BORDER_UNIFORMITY = 0.82;

/**
 * Longest edge we process. Bounds memory on a phone photo, and the result is
 * a reference for the shop and a picture for the proof — neither needs the
 * full 6000px. The customer's ORIGINAL file is always sent as well.
 */
const MAX_EDGE_PX = 2400;

export type BackgroundRemovalResult = {
  /** The knocked-out artwork, as a PNG file ready to upload. */
  file: File;
  /** Object URL for previewing it. The caller owns revoking this. */
  previewUrl: string;
  /** Share of the image made transparent, 0-1. */
  removedShare: number;
  /** The colour that was removed, for the "we removed this" note. */
  backgroundColor: string;
};

export type BackgroundRemovalFailure = {
  reason:
    | "not-an-image"
    | "background-not-flat"
    | "nothing-to-remove"
    | "removed-everything"
    | "failed";
};

/**
 * Past this share removed, nothing recognisable is left and we refuse.
 *
 * ── THE FAILURE THIS EXISTS FOR ───────────────────────────────────────────
 * The fill spreads through anything within HARD_TOLERANCE of the border
 * colour. When the DESIGN is also within that tolerance, it spreads straight
 * through the design and out the other side, and the file comes back
 * completely transparent. Verified in Chromium on three constructed files:
 *
 *   #f0f0f0 logo on #ffffff ... 100% removed, nothing left
 *   cream logo on ivory ....... 100% removed, nothing left
 *   a solid white image ....... 100% removed, nothing left
 *
 * "Cream off ivory" is the exact case the header of this file offers as
 * proof the matting is scale-free. The matting is; the FILL that runs first
 * is not, and it eats the design before the matting sees it.
 *
 * There was a guard for removing NOTHING and none for removing EVERYTHING,
 * so the customer ticked the box, saw a blank preview, and that blank PNG
 * became the artwork the shop received. `removedShare` was computed,
 * returned and typed for exactly this, and read by nobody.
 *
 * 99.5% rather than something tighter because a legitimate design can be
 * very sparse — a hairline signature or a thin outline ring is a few percent
 * of its canvas. Under half a percent of a 2400px image is not artwork
 * anybody could print.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const MAX_REMOVED_SHARE = 0.995;

/**
 * Did the fill erase the artwork rather than its background?
 *
 * A predicate rather than an inline comparison so the threshold can be
 * tested without a DOM — removeBackground itself needs a canvas, which is
 * how this went unnoticed.
 */
export function isTotalErasure(removedPixels: number, totalPixels: number) {
  if (!(totalPixels > 0)) return false;
  return removedPixels / totalPixels > MAX_REMOVED_SHARE;
}

function distance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * The background colour, taken as the most common quantised colour on the
 * image border — plus how much of the border agrees with it.
 *
 * The border is the only place we can look. A design's own dominant colour is
 * irrelevant; what matters is what surrounds it.
 */
function readBorder(data: Uint8ClampedArray, width: number, height: number) {
  const counts = new Map<string, { count: number; r: number; g: number; b: number }>();
  const samples: [number, number, number][] = [];

  const take = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    // A pixel that is already transparent tells us nothing about the colour
    // of a background we would be removing.
    if (data[i + 3] < 40) return;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    samples.push([r, g, b]);

    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, r, g, b });
  };

  for (let x = 0; x < width; x += 1) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    take(0, y);
    take(width - 1, y);
  }

  if (!samples.length) return null;

  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  if (!best) return null;

  const agreeing = samples.filter(
    ([r, g, b]) => distance(r, g, b, best.r, best.g, best.b) <= HARD_TOLERANCE
  ).length;

  return {
    r: best.r,
    g: best.g,
    b: best.b,
    uniformity: agreeing / samples.length,
  };
}

/**
 * Remove the background, or explain why we won't.
 *
 * Returns a result on success and a failure reason otherwise — never a
 * silently mangled image.
 */
export async function removeBackground(
  file: File
): Promise<BackgroundRemovalResult | BackgroundRemovalFailure> {
  if (typeof document === "undefined") return { reason: "failed" };
  if (!file.type.startsWith("image/")) return { reason: "not-an-image" };

  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    if (!image || !image.width || !image.height) return { reason: "not-an-image" };

    const scale = Math.min(1, MAX_EDGE_PX / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { reason: "failed" };

    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const background = readBorder(data, width, height);
    if (!background) return { reason: "nothing-to-remove" };

    if (background.uniformity < MIN_BORDER_UNIFORMITY) {
      return { reason: "background-not-flat" };
    }

    /**
     * Flood fill inward from the border.
     *
     * Connectivity, not colour matching, is what keeps the design intact: a
     * white background reachable from the edge goes, and the identical white
     * inside a letter "o" stays, because nothing connects it to the outside.
     * Iterative — a 2400px image would blow the call stack recursively.
     */
    const removed = new Uint8Array(width * height);
    const stack: number[] = [];

    const isBackgroundAt = (index: number) => {
      const i = index * 4;
      if (data[i + 3] < 40) return true; // already transparent
      return (
        distance(
          data[i], data[i + 1], data[i + 2],
          background.r, background.g, background.b
        ) <= HARD_TOLERANCE
      );
    };

    const push = (index: number) => {
      if (removed[index] === 1) return;
      if (!isBackgroundAt(index)) return;
      removed[index] = 1;
      stack.push(index);
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

    let removedPixels = 0;
    for (let p = 0; p < removed.length; p += 1) {
      if (removed[p] === 1) removedPixels += 1;
    }

    if (removedPixels === 0) return { reason: "nothing-to-remove" };

    // ...and the other end. Removing everything is not a knockout, it is an
    // erasure, and returning it as a success hands the shop a blank file.
    if (isTotalErasure(removedPixels, width * height)) {
      return { reason: "removed-everything" };
    }

    /**
     * Soften the boundary.
     *
     * Every pixel kept next to a removed one is part-artwork, part-background
     * — that is what anti-aliasing is. Leaving them fully opaque prints a rim
     * of the old background around the design. Alpha is graded across the band
     * between the two tolerances so the edge falls off the way it looked.
     */
    const alpha = new Uint8ClampedArray(width * height);
    for (let p = 0; p < alpha.length; p += 1) {
      alpha[p] = removed[p] === 1 ? 0 : data[p * 4 + 3];
    }

    /**
     * How far each kept pixel is from the removed region, up to EDGE_BAND_PX.
     *
     * 0 means removed. 1..EDGE_BAND_PX is the blended edge. Anything left at
     * -1 is solid artwork and is never touched — the guarantee that matters,
     * because this runs on someone's logo.
     */
    const depth = new Int8Array(width * height).fill(-1);
    let frontier: number[] = [];

    for (let p = 0; p < removed.length; p += 1) {
      if (removed[p] === 1) {
        depth[p] = 0;
        frontier.push(p);
      }
    }

    for (let step = 1; step <= EDGE_BAND_PX; step += 1) {
      const next: number[] = [];
      for (const index of frontier) {
        const x = index % width;
        const y = (index - x) / width;
        const visit = (n: number) => {
          if (depth[n] === -1) {
            depth[n] = step;
            next.push(n);
          }
        };
        if (x > 0) visit(index - 1);
        if (x < width - 1) visit(index + 1);
        if (y > 0) visit(index - width);
        if (y < height - 1) visit(index + width);
      }
      frontier = next;
    }

    /**
     * Recover the true artwork colour and coverage at the edge.
     *
     * An anti-aliased pixel is literally C = a*F + (1-a)*B — part artwork,
     * part background. A FIXED distance threshold cannot judge it: against a
     * strong background a half-covered pixel sits ~160 away in colour, so any
     * constant band either misses it entirely (leaving a coloured rim — the
     * blue halo this replaces) or eats solid artwork on low-contrast files.
     *
     * So the scale comes from the file itself. F is estimated from nearby
     * SOLID artwork, then a = |C-B| / |F-B| and F = (C - (1-a)*B) / a. That is
     * ordinary matting, and it is scale-free: it works the same knocking black
     * off white as it does knocking cream off ivory.
     */
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (depth[p] < 1) continue;

        // Nearest solid artwork, as the estimate of what this pixel is OF.
        let fr = 0, fg = 0, fb = 0, found = 0;
        for (let dy = -2; dy <= 2 && found < 12; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (depth[n] !== -1) continue; // not solid artwork
            const ni = n * 4;
            fr += data[ni];
            fg += data[ni + 1];
            fb += data[ni + 2];
            found += 1;
          }
        }

        if (!found) continue;

        fr /= found;
        fg /= found;
        fb /= found;

        const separation = distance(
          fr, fg, fb,
          background.r, background.g, background.b
        );
        if (separation < MIN_SEPARATION) continue;

        const i = p * 4;
        const coverage = Math.max(
          0,
          Math.min(
            1,
            distance(
              data[i], data[i + 1], data[i + 2],
              background.r, background.g, background.b
            ) / separation
          )
        );

        alpha[p] = Math.min(alpha[p], Math.round(coverage * 255));

        // Below this the pixel is almost all background; dividing by such a
        // small alpha amplifies noise into speckle, and its near-zero opacity
        // hides the colour anyway.
        if (coverage >= 0.15) {
          const unmix = (channel: number, back: number) =>
            Math.max(
              0,
              Math.min(255, Math.round((channel - (1 - coverage) * back) / coverage))
            );

          data[i] = unmix(data[i], background.r);
          data[i + 1] = unmix(data[i + 1], background.g);
          data[i + 2] = unmix(data[i + 2], background.b);
        }
      }
    }

    for (let p = 0; p < alpha.length; p += 1) {
      data[p * 4 + 3] = alpha[p];
    }

    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/png")
    );
    if (!blob) return { reason: "failed" };

    const baseName = file.name.replace(/\.[^.]+$/, "");
    const knockout = new File([blob], `${baseName}-no-background.png`, {
      type: "image/png",
    });

    return {
      file: knockout,
      previewUrl: URL.createObjectURL(blob),
      removedShare: removedPixels / (width * height),
      backgroundColor: `#${[background.r, background.g, background.b]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`,
    };
  } catch {
    return { reason: "failed" };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function isRemovalFailure(
  result: BackgroundRemovalResult | BackgroundRemovalFailure
): result is BackgroundRemovalFailure {
  return "reason" in result;
}
