import type { CSSProperties } from "react";

type Props = {
  shape: string;
  material?: string;
  finish?: string;
  artworkPreview: string | null;
  artScale?: number; // 20–100: how large the art is within the sticker
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

const MAGENTA = "#e6007e";

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
        ([x, y]) => `drop-shadow(${x * borderPx}px ${y * borderPx}px 0 #ffffff)`
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
        <p className="text-5xl font-black tracking-[-0.08em]">GS</p>
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em]">
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
}: Props) {
  const isGloss = finish === "Gloss";
  const isClear = material === "Clear Vinyl";
  const isDieCut = shape === "Die Cut";

  const scale = clamp(artScale, 20, 100);
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
      <div className="relative mx-auto grid h-72 w-72 place-items-center">
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
  const CARD_PX = 256; // h-64 / w-64
  const safeAreaFactor =
    shape === "Circle" ? 0.707 : shape === "Rounded Square" ? 0.88 : 0.96;
  const marginPx = (margin / 100) * 34;
  const artSizePx = Math.max(
    24,
    (CARD_PX - marginPx * 2) * safeAreaFactor * (scale / 100)
  );

  return (
    <div className="relative mx-auto grid h-72 w-72 place-items-center">
      <div className={`absolute inset-3 ${rounded} bg-black/20 blur-xl`} />

      <div
        className={`relative grid h-64 w-64 place-items-center overflow-hidden ${rounded} ${materialClasses} shadow-2xl ring-8 ring-white`}
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
