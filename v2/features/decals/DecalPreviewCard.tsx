"use client";

import StickerPreview from "../../components/preview/StickerPreview";
import type { Product, Production } from "../../types/order";

type Props = {
  artworkPreview: string | null;
  product: Product;
  production: Production;
  unitPrice: number;
};

export default function DecalPreviewCard({
  artworkPreview,
  product,
  production,
  unitPrice,
}: Props) {
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
      />

      <div className="mt-6 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
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
