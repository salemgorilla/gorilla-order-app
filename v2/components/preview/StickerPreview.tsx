type Props = {
  artworkPreview: string | null;
  material: string;
  finish: string;
  size: string;
  shape: string;
};

import StickerShape from "./StickerShape";

export default function StickerPreview({
  artworkPreview,
  material,
  finish,
  size,
  shape,
}: Props) {
  const isHolographic = material === "Holographic";
  const isChrome = material === "Chrome";
  const isClear = material === "Clear Vinyl";
  const isGloss = finish === "Gloss";

  return (
    <div className="mt-8 grid h-96 place-items-center rounded-[2rem] bg-gradient-to-br from-white to-[#f1e5cf] p-10">
      <div className="text-center">
        <div
          className={`rounded-[2rem] p-4 ${
            isHolographic
              ? "bg-gradient-to-br from-pink-200 via-yellow-100 to-blue-200"
              : isChrome
                ? "bg-gradient-to-br from-gray-100 via-white to-gray-400"
                : isClear
                  ? "bg-white/40 backdrop-blur-sm"
                  : "bg-white"
          }`}
        >
          <StickerShape shape={shape}>
            {isGloss && (
              <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-br from-white/60 via-transparent to-transparent" />
            )}

            {artworkPreview ? (
              <img
                src={artworkPreview}
                alt="Uploaded artwork preview"
                className="relative z-10 max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="relative z-10 grid h-full w-full place-items-center rounded-3xl bg-[#2E5037] text-6xl font-black text-white">
                GS
              </div>
            )}
          </StickerShape>
        </div>

        <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-[#6f695e]">
          {size} • {shape} • {material} • {finish}
        </p>
      </div>
    </div>
  );
}
