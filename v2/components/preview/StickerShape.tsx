import type { CSSProperties } from "react";

import DieCutCanvas from "./DieCutCanvas";

import { getStickerBodyColor, MAGENTA } from "../../lib/die-cut";
// Re-exported so existing importers keep working; lib/sticker-geometry is the
// single source, shared with the canvas proof the shop cuts from.
import {
  ART_SCALE_CEILING,
  clampArtScaleToShape,
  getBleedThreshold,
  getSafeAreaFactor,
  getStickerCard,
} from "../../lib/sticker-geometry";

export {
  ART_SCALE_CEILING,
  clampArtScaleToShape,
  getBleedThreshold,
  getSafeAreaFactor,
};

type Props = {
  shape: string;
  material?: string;
  finish?: string;
  artworkPreview: string | null;
  artScale?: number; // 20â€“150: how large the art is within the sticker
  /** Real dimensions, so a non-square sticker previews at its true shape. */
  widthInches?: number;
  heightInches?: number;
  artMargin?: number; // 0â€“100: die-cut border width / shape margin
  magentaCutLine?: boolean; // show the customer's magenta cut edge
  /**
   * The customer has opted into letting art run past the cut edge.
   *
   * Changes what the preview is ALLOWED TO HIDE. Off, the card clips and the
   * slider cannot reach the edge anyway. On, overflow stays visible, the cut
   * line is drawn over the art, and everything outside it is dimmed — so the
   * bleed is a thing the customer chose and can see, not a thing the card
   * quietly cropped out of the proof.
   */
  artBleed?: boolean;
};

function getShapeRounding(shape: string) {
  // Circle and Oval are the same rule: 50% radius on the card. On a square
  // card that draws a circle; on a 2x6 card it draws the oval it actually is.
  if (shape === "Circle" || shape === "Oval") return "rounded-full";

  // Square Corners means square corners. This used to be "Square" returning
  // rounded-xl, which drew a rounded square â€” visually almost the same as the
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
    // Opaque, despite the name. The shop only prints opaque stock â€” white,
    // chrome and holographic â€” so this legacy material must not render
    // see-through either. Kept only for quotes placed before it was retired.
    return "bg-white";
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

/** 2.96 -> `2.96"`, 0.16 -> `0.16"`. Two decimals reads as a real measurement. */
export function inchLabel(inches: number) {
  return `${inches.toFixed(2)}"`;
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

  const safeAreaFactor = getSafeAreaFactor(input.shape);
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

function Placeholder({ rounded }: { rounded: string }) {
  return (
    <div
      // `rounded` stays â€” it carries the real die-cut shape, not UI chrome.
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
  artBleed = false,
  widthInches = 0,
  heightInches = 0,
}: Props) {
  const isGloss = finish === "Gloss";
  const isClear = material === "Clear Vinyl";
  const isDieCut = shape === "Die Cut";

  // Ceiling 150, matching the slider. The shaped branch sizes art against an
  // inscribed-square safe area (0.707 on a circle), so a ceiling of 100 could
  // only ever reach ~63% of the diameter and round art could never fill the
  // sticker. Past ~141% the art meets the cut edge and bleeds, which the card
  // clips via overflow-hidden. The safe-area factors are NOT touched â€” they
  // are what keeps square art off the corners at normal sizes.
  const scale = clamp(artScale, 20, 150);
  const margin = clamp(artMargin, 0, 100);

  // A square art box, `scale`% of the available area, that always centers its
  // contents. object-contain preserves aspect ratio and centers within it.
  const artBoxStyle: CSSProperties = {
    width: `${scale}%`,
    height: `${scale}%`,
  };

  /**
   * The card takes the sticker's real proportions, for EVERY shape.
   *
   * These three lines used to sit below the die-cut early return, so only
   * shaped stickers got them — the comment there says the point out loud:
   * "so a 2x6 renders as a tall rectangle rather than lying to the customer
   * with a square." A die cut was handed a flat 256 square and did exactly
   * that. On a 4" x 1" sticker the preview drew the art four times taller
   * than the shop can cut, while the emailed proof — which does honour the
   * dimensions — drew it correctly. The customer approved one picture and
   * the shop received a different one.
   */
  const { cardW, cardH } = getStickerCard(widthInches, heightInches, CARD_PX);

  // ---------- DIE CUT: contour hugs the art, opaque stock inside it ----------
  if (isDieCut) {
    /**
     * Against CARD_PX, which is always the LONGEST side — the same reference
     * getStickerGeometry uses when it converts this to the inch figure beside
     * the slider (it is passed longestInches). Keep the two together or the
     * border drawn stops matching the border quoted.
     */
    const borderPx = Math.round((margin / 100) * 16);

    return (
      // max-w-full is a backstop, not the fix: it guarantees the stage can never
    // push the page wider than the viewport even if padding changes upstream.
    // The 256px card inside stays 256px, so artSizePx and CARD_PX are unaffected.
    <div className="relative mx-auto grid h-72 w-72 max-w-full place-items-center">
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
          {artworkPreview ? (
            <DieCutCanvas
              artworkUrl={artworkPreview}
              borderPx={borderPx}
              bodyColor={getStickerBodyColor(material)}
              magentaCutLine={magentaCutLine}
              scale={scale}
              cardW={cardW}
              cardH={cardH}
            />
          ) : (
            <div className="flex items-center justify-center" style={artBoxStyle}>
              <div className="aspect-square w-full">
                <Placeholder rounded="rounded-[36%]" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- CIRCLE / SQUARE / ROUNDED: art centered on a vinyl card --------
  const rounded = getShapeRounding(shape);
  const materialClasses = getMaterialClasses(material);

  // The art is sized in real pixels against the card so it can never spill past
  // the cut edge. A square inscribed in a circle is only ~70.7% of the
  // diameter, so a circle needs a much tighter safe area than a square â€”
  // sizing by plain percentage is what made art run off the round shapes.
  //
  // These are the same lines getStickerGeometry() uses. They stay here rather
  // than calling it because this branch needs the PIXELS while the sliders
  // need the INCHES; if either changes, change both. cardW/cardH are now
  // computed once above, for die cuts too.

  // Art is sized against the TIGHT axis so it can never overflow the narrow
  // side of a rectangle â€” the same reason the safe-area factor exists.
  const fitPx = Math.min(cardW, cardH);

  const safeAreaFactor = getSafeAreaFactor(shape);
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
          anyway â€” the card carries its own ring. */}
      <div
        // Dimensions come from the sticker's real proportions, not a fixed
        // square. h-64/w-64 is gone â€” cardW/cardH default to 256 when no
        // dimensions are set, so preset sizes render exactly as before.
        style={{ width: cardW, height: cardH }}
        // overflow-hidden is what made this preview untrustworthy: art past
        // the cut was cropped by the card, so the proof showed a sticker that
        // fit over artwork the plotter would slice through. With bleed on,
        // overflow reads AS overflow. With it off nothing changes — the slider
        // cannot reach the edge in the first place.
        //
        // NOT the `overflow: clip` in globals.css. Different element, and
        // changing that one kills the sticky estimate bar.
        //
        // shadow-2xl / ring-8 ring-white dropped: DESIGN-FIXES flags them as
        // off-system stage chrome, and the ring in particular drew a white
        // band exactly where bleeding art now has to be visible.
        className={`relative grid place-items-center ${
          artBleed ? "overflow-visible" : "overflow-hidden"
        } ${rounded} ${materialClasses}`}
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
            on the shape itself â€” not on whatever padding happened to be left. */}
        {/* THE ART, drawn once or twice depending on whether bleed is on.

            Off: one layer, and the card clips it. Exactly as before.

            On: the same art twice. The lower copy is unclipped and dimmed, so
            the parts heading past the blade are visible and visibly doomed.
            The upper copy is clipped to the card and full strength, so what
            actually survives reads at full strength.

            Two copies of the SAME element rather than a scrim over one: a
            scrim has to re-describe the cut outline, and a second description
            of the shape is a second thing that can disagree with it. Here the
            clip IS the shape — they cannot drift. */}
        {artBleed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[9] flex items-center justify-center opacity-25"
          >
            <div
              className="flex items-center justify-center"
              style={{ width: artSizePx, height: artSizePx }}
            >
              {artworkPreview ? (
                <img
                  src={artworkPreview}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="aspect-square w-full">
                  <Placeholder rounded={rounded} />
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className={`absolute inset-0 z-10 flex items-center justify-center ${
            // Only in bleed mode does this layer need its own clip — the card
            // has stopped clipping so that the layer above can overflow.
            artBleed ? `overflow-hidden ${rounded}` : ""
          }`}
        >
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

        {/* The cut edge, drawn ON TOP of the art so the customer can see
            exactly where the blade goes. z-30 puts it above the art layer
            (z-10) and above the customer's own magenta line (z-20) — when
            both are showing, the one that decides what survives wins.

            Same --cut-line magenta ArtworkGuidance teaches customers to use.
            This is a NEW USE of that token, never a redefinition: the hex has
            to stay #FF00FF or isMagentaPixel stops detecting it. */}
        {artBleed && (
          <div
            className={`pointer-events-none absolute inset-0 z-30 border-2 border-dashed ${rounded}`}
            style={{ borderColor: MAGENTA }}
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
