import type { CSSProperties } from "react";

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
  if (shape === "Circle") return "rounded-full";
  if (shape === "Square") return "rounded-xl";
  return "rounded-[2rem]"; // Rounded Square
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
    input.shape === "Circle" ? 0.707 : input.shape === "Rounded Square" ? 0.88 : 0.96;
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

// Must match --cut-line in globals.css and isMagentaPixel() in lib/artwork.ts.
// Literal rather than var() because this is interpolated into a drop-shadow()
// filter chain built as a string.
const MAGENTA = "#ff00ff";

/**
 * The die-cut edge. Light grey rather than the literal white of the vinyl,
 * because the proof stage behind it is white paper and a white-on-white edge
 * cannot be seen. Reads as white stock, but the cut line is visible.
 */
const STICKER_EDGE = "#e6e4de";

const OUTLINE_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

// A white contour that hugs the artwork's actual outline — the die-cut look.
// Chained drop-shadows read the image's alpha channel and build up a solid
// white halo around the non-transparent pixels in every direction. When the
// customer marks a magenta cut line, a thin magenta rim is added just outside
// the white so the cut edge is visible.
function stickerOutline(borderPx: number, magentaCutLine = false) {
  const lift = "drop-shadow(0 10px 12px rgba(0,0,0,0.30))";
  const layers: string[] = [];

  if (borderPx > 0) {
    layers.push(
      ...OUTLINE_DIRS.map(
        // Light grey, not pure white. The border IS white vinyl, but the proof
        // stage behind it is white paper — a #ffffff edge on a white stage is
        // invisible, so the customer cannot see where their sticker will be
        // cut. This is light enough to still read as white stock while giving
        // the cut edge a visible boundary.
        ([x, y]) =>
          `drop-shadow(${x * borderPx}px ${y * borderPx}px 0 ${STICKER_EDGE})`
      )
    );
  }

  if (magentaCutLine) {
    const edge = borderPx + 2;
    layers.push(
      ...OUTLINE_DIRS.map(
        ([x, y]) => `drop-shadow(${x * edge}px ${y * edge}px 0 ${MAGENTA})`
      )
    );
  }

  return `${layers.join(" ")} ${lift}`.trim();
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
    const outline = stickerOutline(borderPx, magentaCutLine);

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
    shape === "Circle" ? 0.707 : shape === "Rounded Square" ? 0.88 : 0.96;
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
