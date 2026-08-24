import StickerShape from "./StickerShape";

type Props = {
  artworkPreview: string | null;
  material: string;
  finish: string;
  size: string;
  shape: string;
  artScale: number;
  artMargin: number;
  magentaCutLine: boolean;
  artBleed?: boolean;
  /** Real dimensions, so a non-square sticker previews at its true shape. */
  widthInches?: number;
  heightInches?: number;
};

export default function StickerPreview({
  artworkPreview,
  material,
  finish,
  size,
  shape,
  artScale,
  artMargin,
  magentaCutLine,
  artBleed = false,
  widthInches = 0,
  heightInches = 0,
}: Props) {
  const proofType = shape === "Die Cut" ? "Contour Cut Proof" : `${shape} Proof`;

  // The proof stage is a fixed 288px. Four nested padded boxes used to squeeze
  // the column to 172px on a 375px phone, so the proof overflowed and the whole
  // page scrolled sideways. The outer wrapper here was pure redundant nesting —
  // it carried the same background as the card inside it — so it is gone, and
  // the remaining padding steps down on mobile. No die-cut geometry is touched.
  return (
    <div className="mt-8">
      <div className="border border-[var(--rule)] bg-[var(--shirt-blank)] p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">
              {proofType}
            </p>
            <p className="mt-1 text-fine font-bold text-[var(--ink-muted)]">
              Preview only — final proof reviewed by Gorilla Salem
            </p>
          </div>

          <div className=" bg-white px-3 py-2 text-spec font-bold text-[var(--gorilla-green)]">
            {size}
          </div>
        </div>

        <div className="grid min-h-80 place-items-center border border-[var(--rule)] bg-[var(--paper)] p-1 sm:p-6">
          <StickerShape
            shape={shape}
            material={material}
            finish={finish}
            artworkPreview={artworkPreview}
            artScale={artScale}
            artMargin={artMargin}
            magentaCutLine={magentaCutLine}
            artBleed={artBleed}
            widthInches={widthInches}
            heightInches={heightInches}
          />
        </div>

        {magentaCutLine && (
          <div className="mt-4 flex items-center justify-center gap-2 text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <span
              className="inline-block h-3 w-3"
              style={{ backgroundColor: "var(--cut-line)" }}
            />
            Magenta line = your cut edge
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className=" bg-white p-3">
            <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Shape
            </p>
            <p className="mt-1 text-fine font-bold text-[var(--ink-black)]">{shape}</p>
          </div>

          <div className=" bg-white p-3">
            <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Material
            </p>
            <p className="mt-1 text-fine font-bold text-[var(--ink-black)]">{material}</p>
          </div>

          <div className=" bg-white p-3">
            <p className="text-spec font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Finish
            </p>
            <p className="mt-1 text-fine font-bold text-[var(--ink-black)]">{finish}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
