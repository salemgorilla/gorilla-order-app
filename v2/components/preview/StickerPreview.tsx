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
}: Props) {
  const proofType = shape === "Die Cut" ? "Contour Cut Proof" : `${shape} Proof`;

  return (
    <div className="mt-8 bg-gradient-to-br from-white to-[#f1e5cf] p-5">
      <div className=" border border-[var(--rule)] bg-[var(--shirt-blank)] p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
              {proofType}
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
              Preview only — final proof reviewed by Gorilla Salem
            </p>
          </div>

          <div className=" bg-white px-3 py-2 text-xs font-black text-[var(--gorilla-green)]">
            {size}
          </div>
        </div>

        <div className="grid min-h-80 place-items-center border border-white bg-[radial-gradient(circle_at_top,_#ffffff,_#efe4d4)] p-6">
          <StickerShape
            shape={shape}
            material={material}
            finish={finish}
            artworkPreview={artworkPreview}
            artScale={artScale}
            artMargin={artMargin}
            magentaCutLine={magentaCutLine}
          />
        </div>

        {magentaCutLine && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <span
              className="inline-block h-3 w-3"
              style={{ backgroundColor: "#e6007e" }}
            />
            Magenta line = your cut edge
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className=" bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Shape
            </p>
            <p className="mt-1 text-sm font-black text-[var(--ink-black)]">{shape}</p>
          </div>

          <div className=" bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Material
            </p>
            <p className="mt-1 text-sm font-black text-[var(--ink-black)]">{material}</p>
          </div>

          <div className=" bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Finish
            </p>
            <p className="mt-1 text-sm font-black text-[var(--ink-black)]">{finish}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
