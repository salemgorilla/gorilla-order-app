"use client";

import StickerPreview from "../../components/preview/StickerPreview";
import type { Product, Production } from "../../types/order";

type Props = {
  artworkPreview: string | null;
  product: Product;
  production: Production;
  unitPrice: number;
  onUpdateProduct: (updates: Partial<Product>) => void;
};

export default function DecalPreviewCard({
  artworkPreview,
  product,
  production,
  unitPrice,
  onUpdateProduct,
}: Props) {
  const isDieCut = product.shape === "Die Cut";
  return (
    <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-5 shadow-xl sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
            Digital Proof
          </p>

          <h3 className="mt-2 text-3xl font-black tracking-[-0.05em]">
            Live Preview
          </h3>
        </div>

        <div className="rounded-full bg-[#2E5037] px-4 py-2 text-sm font-bold text-white">
          {product.material}
        </div>
      </div>

      <StickerPreview
        artworkPreview={artworkPreview}
        material={product.material}
        finish={product.finish}
        size={product.size}
        shape={product.shape}
        artScale={product.artScale}
        artMargin={product.artMargin}
      />

      <div className="mt-4 rounded-2xl bg-[#F8F5EE] p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f695e]">
          Adjust Art Placement
        </p>

        <label className="mt-3 block">
          <span className="flex items-center justify-between text-sm font-bold text-[#171717]">
            <span>Art Size</span>
            <span className="text-[#2E5037]">{product.artScale}%</span>
          </span>
          <input
            type="range"
            min={40}
            max={100}
            step={5}
            value={product.artScale}
            onChange={(event) =>
              onUpdateProduct({ artScale: Number(event.target.value) })
            }
            className="mt-1 w-full accent-[#2E5037]"
          />
        </label>

        <label className="mt-3 block">
          <span className="flex items-center justify-between text-sm font-bold text-[#171717]">
            <span>{isDieCut ? "Cut Border" : "Margin"}</span>
            <span className="text-[#2E5037]">{product.artMargin}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={product.artMargin}
            onChange={(event) =>
              onUpdateProduct({ artMargin: Number(event.target.value) })
            }
            className="mt-1 w-full accent-[#2E5037]"
          />
        </label>

        <p className="mt-2 text-xs font-bold leading-5 text-[#6f695e]">
          {isDieCut
            ? "Die-cut follows your artwork's outline. Cut Border sets the white edge around it."
            : "Art auto-centers on the sticker. Margin sets the space to the edge."}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
        <div className="rounded-2xl bg-[#F8F5EE] p-4">
          <p className="text-xs font-bold uppercase text-[#6f695e]">
            Size
          </p>
          <p className="mt-1 font-black">{product.size}</p>
        </div>

        <div className="rounded-2xl bg-[#F8F5EE] p-4">
          <p className="text-xs font-bold uppercase text-[#6f695e]">
            Shape
          </p>
          <p className="mt-1 font-black">{product.shape}</p>
        </div>

        <div className="rounded-2xl bg-[#F8F5EE] p-4">
          <p className="text-xs font-bold uppercase text-[#6f695e]">
            Each
          </p>
          <p className="mt-1 font-black">${unitPrice.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-[#F8F5EE] p-4 text-center">
        <p className="text-xs font-bold uppercase text-[#6f695e]">
          Needed In Hand
        </p>

        <p className="mt-1 font-black">
          {production.needBy || "Not entered yet"}
        </p>

        <p className="mt-1 text-sm font-bold text-[#6f695e]">
          {production.deadlineType} deadline
        </p>
      </div>
    </div>
  );
}
