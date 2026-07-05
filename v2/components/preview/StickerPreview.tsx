import StickerShape from "./StickerShape";

type Props = {
  artworkPreview: string | null;
  material: string;
  finish: string;
  size: string;
  shape: string;
};

export default function StickerPreview({
  artworkPreview,
  material,
  finish,
  size,
  shape,
}: Props) {
  const proofType = shape === "Die Cut" ? "Contour Cut Proof" : `${shape} Proof`;

  return (
    <div className="mt-8 rounded-[2rem] bg-gradient-to-br from-white to-[#f1e5cf] p-5">
      <div className="rounded-[1.5rem] border border-[#dfd0b8] bg-[#F8F5EE] p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b7352d]">
              {proofType}
            </p>
            <p className="mt-1 text-sm font-bold text-[#6f695e]">
              Preview only — final proof reviewed by Gorilla Salem
            </p>
          </div>

          <div className="rounded-full bg-white px-3 py-2 text-xs font-black text-[#2E5037] shadow-sm">
            {size}
          </div>
        </div>

        <div className="grid min-h-80 place-items-center rounded-[1.25rem] border border-white bg-[radial-gradient(circle_at_top,_#ffffff,_#efe4d4)] p-6">
          <StickerShape shape={shape} material={material} finish={finish}>
            {artworkPreview ? (
              <img
                src={artworkPreview}
                alt="Uploaded artwork preview"
                className="max-h-full max-w-full object-contain drop-shadow-lg"
              />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-3xl bg-[#2E5037] text-center text-white shadow-inner">
                <div>
                  <p className="text-6xl font-black tracking-[-0.08em]">GS</p>
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.2em]">
                    Upload Art
                  </p>
                </div>
              </div>
            )}
          </StickerShape>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6f695e]">
              Shape
            </p>
            <p className="mt-1 text-sm font-black text-[#171717]">{shape}</p>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6f695e]">
              Material
            </p>
            <p className="mt-1 text-sm font-black text-[#171717]">{material}</p>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6f695e]">
              Finish
            </p>
            <p className="mt-1 text-sm font-black text-[#171717]">{finish}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
