import { useId } from "react";
import type { CSSProperties } from "react";

import {
  contourSigma,
  CUT_RIM_INTERCEPT,
  CUT_RIM_SLOPE,
  EDGE_THRESHOLD_INTERCEPT,
  EDGE_THRESHOLD_SLOPE,
  MAGENTA,
  STICKER_EDGE,
} from "../../lib/die-cut";

type Props = {
  shape: string;
  material?: string;
  finish?: string;
  artworkPreview: string | null;
  artScale?: number; // 20–150: how large the art is within the sticker
  /** Real dimensions, so a non-square sticker previews at its true shape. */
  widthInches?: number;
  heightInches?: number;
  artMargin?: number; // 0–100: die-cut border width / shape margin
  magentaCutLine?: boolean; // show the customer's magenta cut edge
};

function getShapeRounding(shape: string) {
  // Circle and Oval are the same rule: 50% radius on the card. On a square
  // card that draws a circle; on a 2x6 card it draws the oval it actually is.
  if (shape === "Circle" || shape === "Oval") return "rounded-full";

  // Square Corners means square corners. This used to be "Square" returning
  // rounded-xl, which drew a rounded square — visually almost the same as the
  // Rounded Square option next to it, so the two were near-indistinguishable.
  if (shape === "Square Corners") return "";

  return "rounded-[2rem]"; // Rounded Corners
}

function getMaterialClasses(material: string) {
  if (material === "Holographic") {
    return "bg-gradient-to-br from-pink-200 via-yellow-100 to-blue-200";
  }
  if (material === "Chrome") {
    return "bg-gradient-to-br from-zinc-100 via-white to-zinc-400";
  }
  if (material === "Clear Vinyl") {
    return "bg-white/35";
  }
  return "bg-white";
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** The card is 256px and represents the sticker's ordered size. */
export const CARD_PX = 256;

/** '3"' -> 3. Returns 0 when the size can't be read. */
export function parseSizeInches(size: string) {
  const match = String(size || "").match(/([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

/**
 * Art and border dimensions in REAL INCHES.
 *
 * Exported so the sliders can label themselves in inches using exactly the
 * geometry the preview renders with. Duplicating these constants in the UI
 * would let the number a customer reads drift from the sticker they get.
 */
export function getStickerGeometry(input: {
  shape: string;
  artScale: number;
  artMargin: number;
  sizeInches: number;
}) {
  const scale = clamp(input.artScale, 20, 150);
  const margin = clamp(input.artMargin, 0, 100);
  const pxPerInch = input.sizeInches > 0 ? CARD_PX / input.sizeInches : 0;

  if (input.shape === "Die Cut") {
    // The contour hugs the art, so the meaningful figure is the border width.
    const borderPx = Math.round((margin / 100) * 16);
    return {
      artInches: 0,
      borderInches: pxPerInch ? borderPx / pxPerInch : 0,
    };
  }

  const safeAreaFactor =
    // Oval shares the circle's factor: a rectangle inscribed in an ellipse is
    // the same proportion of its bounding box as one inscribed in a circle.
    input.shape === "Circle" || input.shape === "Oval"
      ? 0.707
      : input.shape === "Rounded Corners"
      ? 0.88
      : 0.96;
  const marginPx = (margin / 100) * 34;
  const artSizePx = Math.max(
    24,
    (CARD_PX - marginPx * 2) * safeAreaFactor * (scale / 100)
  );

  return {
    artInches: pxPerInch ? artSizePx / pxPerInch : 0,
    borderInches: pxPerInch ? marginPx / pxPerInch : 0,
  };
}

/** 2.96 -> "2.96\"", 0.16 -> "0.16\"". Two decimals reads as a real measurement. */
export function inchLabel(inches: number) {
  return `${inches.toFixed(2)}"`;
}


/**
 * The die-cut contour, as an SVG filter.
 *
 * WHY NOT CHAINED drop-shadow(), WHICH THIS REPLACES:
 *
 * The old version stacked eight drop-shadows, one per compass direction, to
 * fake a halo around the art. Two things made that look chewed up:
 *
 *   1. CSS filter chains COMPOUND. `filter: drop-shadow(a) drop-shadow(b)`
 *      does not union two shadows — b is computed from the output of a, which
 *      already contains a's shadow. Eight of them meant the eighth was
 *      outlining the seventh's silhouette, drifting up to 8x the intended
 *      offset in some directions and not at all in others.
 *   2. Eight directions is an eight-point star, not a circle. Diagonals sit
 *      borderPx * sqrt(2) out while the axes sit at borderPx, so even without
 *      the compounding the contour scalloped in and out.
 *
 * WHAT THIS DOES INSTEAD — blur, then threshold, applied once:
 *
 *   blur      — a Gaussian is isotropic, so it spreads the alpha equally in
 *               every direction. This is the whole trick. feMorphology was
 *               tried here first and rejected: its structuring element is a
 *               RECTANGLE, so it grows sqrt(2) further on the diagonals and
 *               reproduces the same eight-point star, measured at 4.5px of
 *               variation on a 10px border. Blur measures 1px, which is the
 *               measurement floor.
 *   threshold — feFuncA with a steep slope snaps the blurred alpha back to a
 *               hard edge. Cutting BELOW the midpoint is what grows the shape:
 *               for a straight edge the contour lands at sigma * probit(1 - t)
 *               from the original outline. The slope is steep but finite, so
 *               about one pixel of anti-aliasing survives — crisp, not jagged.
 *
 * The blur also rounds the contour, which is the point rather than a side
 * effect: a cutting head cannot turn a sharp interior corner, it sweeps
 * through. That sweep is what makes the edge read as a real cut instead of a
 * traced outline.
 *
 * Constants below were measured, not guessed — rasterised through a canvas and
 * checked for contour uniformity and edge hardness.
 */

// Constants live in lib/die-cut.ts because the emailed proof draws this same
// contour on a canvas. If the two ever disagree, the proof stops being proof.

function ContourFilter({
  id,
  borderPx,
  magentaCutLine,
}: {
  id: string;
  borderPx: number;
  magentaCutLine: boolean;
}) {
  /**
   * Both rims come off ONE blur, differing only in threshold.
   *
   * Offset scales with probit(1 - t) while rounding is set by sigma, so
   * sharing the sigma is what makes the magenta rim parallel to the vinyl
   * edge. Blurring twice made the outer rim round harder than the edge it was
   * tracing and it came out visibly wobbly.
   */
  const band = (
    key: string,
    slope: number,
    intercept: number,
    color: string,
    result: string
  ) => (
    <>
      <feComponentTransfer in="contour-soft" result={`${key}-mask`}>
        <feFuncA type="linear" slope={slope} intercept={intercept} />
      </feComponentTransfer>
      <feFlood floodColor={color} result={`${key}-ink`} />
      <feComposite
        in={`${key}-ink`}
        in2={`${key}-mask`}
        operator="in"
        result={result}
      />
    </>
  );

  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <filter
          id={id}
          // Room for the contour plus the lift shadow, or the filter region
          // clips the very edge it exists to draw.
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          // Without this the flood colors are interpolated in linearRGB and
          // the grey comes out noticeably lighter than STICKER_EDGE.
          colorInterpolationFilters="sRGB"
        >
          {/* One blur feeds both rims. */}
          <feGaussianBlur
            in="SourceAlpha"
            stdDeviation={contourSigma(borderPx)}
            result="contour-soft"
          />

          {magentaCutLine &&
            band("cut", CUT_RIM_SLOPE, CUT_RIM_INTERCEPT, MAGENTA, "cutBand")}
          {borderPx > 0 &&
            band(
              "vinyl",
              EDGE_THRESHOLD_SLOPE,
              EDGE_THRESHOLD_INTERCEPT,
              STICKER_EDGE,
              "vinylBand"
            )}

          <feMerge>
            {/* Painted outermost first: magenta rim, then vinyl, then art. */}
            {magentaCutLine && <feMergeNode in="cutBand" />}
            {borderPx > 0 && <feMergeNode in="vinylBand" />}
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

function Placeholder({ rounded }: { rounded: string }) {
  return (
    <div
      // `rounded` stays — it carries the real die-cut shape, not UI chrome.
      className={`grid h-full w-full place-items-center ${rounded} bg-[var(--gorilla-green)] text-center text-white`}
    >
      <div>
        <p className="text-5xl font-bold tracking-[-0.08em]">GS</p>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em]">
          Upload Art
        </p>
      </div>
    </div>
  );
}

export default function StickerShape({
  shape,
  material = "White Vinyl",
  finish = "Gloss",
  artworkPreview,
  artScale = 80,
  artMargin = 40,
  magentaCutLine = false,
  widthInches = 0,
  heightInches = 0,
}: Props) {
  // Filter ids are document-global. Two previews on one page sharing an id
  // would both render whichever contour mounted last.
  const instanceId = useId();

  const isGloss = finish === "Gloss";
  const isClear = material === "Clear Vinyl";
  const isDieCut = shape === "Die Cut";

  // Ceiling 150, matching the slider. The shaped branch sizes art against an
  // inscribed-square safe area (0.707 on a circle), so a ceiling of 100 could
  // only ever reach ~63% of the diameter and round art could never fill the
  // sticker. Past ~141% the art meets the cut edge and bleeds, which the card
  // clips via overflow-hidden. The safe-area factors are NOT touched — they
  // are what keeps square art off the corners at normal sizes.
  const scale = clamp(artScale, 20, 150);
  const margin = clamp(artMargin, 0, 100);

  // A square art box, `scale`% of the available area, that always centers its
  // contents. object-contain preserves aspect ratio and centers within it.
  const artBoxStyle: CSSProperties = {
    width: `${scale}%`,
    height: `${scale}%`,
  };

  // ---------- DIE CUT: contour hugs the art, transparent around it ----------
  if (isDieCut) {
    const borderPx = Math.round((margin / 100) * 16);
    const filterId = `diecut-${instanceId.replace(/[^a-zA-Z0-9-]/g, "")}`;
    // The lift stays a plain CSS shadow, applied after the contour so it falls
    // from the cut edge rather than from the artwork inside it. One shadow
    // does not compound; eight did, which is what wrecked the old edge.
    const outline = `url(#${filterId}) drop-shadow(0 10px 12px rgba(0,0,0,0.30))`;

    return (
      // max-w-full is a backstop, not the fix: it guarantees the stage can never
    // push the page wider than the viewport even if padding changes upstream.
    // The 256px card inside stays 256px, so artSizePx and CARD_PX are unaffected.
    <div className="relative mx-auto grid h-72 w-72 max-w-full place-items-center">
        <ContourFilter
          id={filterId}
          borderPx={borderPx}
          magentaCutLine={magentaCutLine}
        />

        {/* Subtle checkerboard signals the die-cut (transparent) area */}
        <div
          className="absolute inset-0 rounded-[1.25rem] opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(45deg,#d9cbb2 25%,transparent 25%),linear-gradient(-45deg,#d9cbb2 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d9cbb2 75%),linear-gradient(-45deg,transparent 75%,#d9cbb2 75%)",
            backgroundSize: "22px 22px",
            backgroundPosition: "0 0,0 11px,11px -11px,-11px 0",
          }}
        />

        <div className="relative z-10 flex h-64 w-64 items-center justify-center p-3">
          <div className="flex items-center justify-center" style={artBoxStyle}>
            {artworkPreview ? (
              <img
                src={artworkPreview}
                alt="Die-cut contour preview"
                className="max-h-full max-w-full object-contain"
                style={{ filter: outline }}
              />
            ) : (
              <div
                className="aspect-square w-full"
                style={{ filter: outline }}
              >
                <Placeholder rounded="rounded-[36%]" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- CIRCLE / SQUARE / ROUNDED: art centered on a vinyl card --------
  const rounded = getShapeRounding(shape);
  const materialClasses = getMaterialClasses(material);

  // The art is sized in real pixels against the card so it can never spill past
  // the cut edge. A square inscribed in a circle is only ~70.7% of the
  // diameter, so a circle needs a much tighter safe area than a square —
  // sizing by plain percentage is what made art run off the round shapes.
  //
  // These are the same three lines getStickerGeometry() uses. They stay here
  // rather than calling it because this branch needs the PIXELS while the
  // sliders need the INCHES; if either changes, change both.
  // The card takes the sticker's real proportions. The longest side is always
  // CARD_PX, so a 2x6 renders as a tall rectangle (or an oval, if the shape is
  // Circle) rather than lying to the customer with a square.
  const w = Number(widthInches) || 0;
  const h = Number(heightInches) || 0;
  const longest = Math.max(w, h);
  const cardW = longest > 0 ? CARD_PX * (w / longest) : CARD_PX;
  const cardH = longest > 0 ? CARD_PX * (h / longest) : CARD_PX;

  // Art is sized against the TIGHT axis so it can never overflow the narrow
  // side of a rectangle — the same reason the safe-area factor exists.
  const fitPx = Math.min(cardW, cardH);

  const safeAreaFactor =
    shape === "Circle" || shape === "Oval"
      ? 0.707
      : shape === "Rounded Corners"
      ? 0.88
      : 0.96;
  const marginPx = (margin / 100) * 34;
  const artSizePx = Math.max(
    24,
    (fitPx - marginPx * 2) * safeAreaFactor * (scale / 100)
  );

  return (
    // max-w-full is a backstop, not the fix: it guarantees the stage can never
    // push the page wider than the viewport even if padding changes upstream.
    // The 256px card inside stays 256px, so artSizePx and CARD_PX are unaffected.
    <div className="relative mx-auto grid h-72 w-72 max-w-full place-items-center">
      {/* The blurred drop plate is gone: it was sized to the 288px stage, so a
          narrow sticker got a halo far wider than itself. Republic bans blur
          anyway — the card carries its own ring. */}
      <div
        // Dimensions come from the sticker's real proportions, not a fixed
        // square. h-64/w-64 is gone — cardW/cardH default to 256 when no
        // dimensions are set, so preset sizes render exactly as before.
        style={{ width: cardW, height: cardH }}
        className={`relative grid place-items-center overflow-hidden ${rounded} ${materialClasses} shadow-2xl ring-8 ring-white`}
      >
        {isClear && (
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.35)",
              backgroundImage:
                "linear-gradient(45deg, rgba(0,0,0,.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,.08) 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }}
          />
        )}

        {/* An absolute layer the exact size of the card, so the art is centered
            on the shape itself — not on whatever padding happened to be left. */}
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div
            className="flex items-center justify-center"
            style={{ width: artSizePx, height: artSizePx }}
          >
            {artworkPreview ? (
              <img
                src={artworkPreview}
                alt="Artwork preview"
                className="max-h-full max-w-full object-contain drop-shadow-lg"
              />
            ) : (
              <div className="aspect-square w-full">
                <Placeholder rounded={rounded} />
              </div>
            )}
          </div>
        </div>

        {isGloss && (
          <div
            className={`pointer-events-none absolute -left-16 -top-24 h-64 w-40 rotate-45 bg-white/55 blur-sm ${rounded}`}
          />
        )}

        {magentaCutLine && (
          <div
            className={`pointer-events-none absolute inset-0 z-20 border-2 border-dashed ${rounded}`}
            style={{ borderColor: MAGENTA }}
          />
        )}

        <div className="pointer-events-none absolute inset-0 ring-1 ring-black/10" />
      </div>
    </div>
  );
}
