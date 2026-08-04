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
    <div className=" border border-[var(--rule)] bg-white p-5 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">
            Digital Proof
          </p>

          <h3 className="mt-2 text-head font-bold tracking-display">
            Live Preview
          </h3>
        </div>

        <div className=" bg-[var(--gorilla-green)] px-4 py-2 text-sm font-bold text-white">
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
        magentaCutLine={product.magentaCutLine}
      />

      <div className="mt-4 bg-[var(--shirt-blank)] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Adjust Art Placement
        </p>

        <label className="mt-3 block">
          <span className="flex items-center justify-between text-sm font-bold text-[var(--ink-black)]">
            <span>Art Size</span>
            <span className="text-[var(--gorilla-green)]">{product.artScale}%</span>
          </span>
          {/* Ceiling is 150, not 100. The shaped preview sizes art against an
              inscribed-square safe area — 70.7% of the diameter on a circle —
              so a 100% cap physically could not reach the cut edge. ~141%
              fills a circle exactly; the rest is bleed, which the shape clips
              via overflow-hidden. The safe area itself is deliberately left
              alone: it is what stops square art clipping at the corners. */}
          <input
            type="range"
            min={40}
            max={150}
            step={5}
            value={product.artScale}
            onChange={(event) =>
              onUpdateProduct({ artScale: Number(event.target.value) })
            }
            className="mt-1 w-full accent-[var(--gorilla-green)]"
          />
          <span className="mt-1 block text-fine leading-5 text-[var(--ink-muted)]">
            Past 100% the art runs to the cut edge and bleeds — normal for
            round art that should fill the sticker.
          </span>
        </label>

        <label className="mt-3 block">
          <span className="flex items-center justify-between text-sm font-bold text-[var(--ink-black)]">
            <span>{isDieCut ? "Cut Border" : "Margin"}</span>
            <span className="text-[var(--gorilla-green)]">{product.artMargin}%</span>
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
            className="mt-1 w-full accent-[var(--gorilla-green)]"
          />
        </label>

        <p className="mt-2 text-xs font-bold leading-5 text-[var(--ink-muted)]">
          {isDieCut
            ? "Die-cut follows your artwork's outline. Cut Border sets the white edge around it."
            : "Art auto-centers on the sticker. Margin sets the space to the edge."}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
        <div className=" bg-[var(--shirt-blank)] p-4">
          <p className="text-xs font-bold uppercase text-[var(--ink-muted)]">
            Size
          </p>
          <p className="mt-1 font-bold">{product.size}</p>
        </div>

        <div className=" bg-[var(--shirt-blank)] p-4">
          <p className="text-xs font-bold uppercase text-[var(--ink-muted)]">
            Shape
          </p>
          <p className="mt-1 font-bold">{product.shape}</p>
        </div>

        <div className=" bg-[var(--shirt-blank)] p-4">
          <p className="text-xs font-bold uppercase text-[var(--ink-muted)]">
            Each
          </p>
          <p className="mt-1 font-bold">${unitPrice.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-3 bg-[var(--shirt-blank)] p-4 text-center">
        <p className="text-xs font-bold uppercase text-[var(--ink-muted)]">
          Needed In Hand
        </p>

        <p className="mt-1 font-bold">
          {production.needBy || "Not entered yet"}
        </p>

        <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
          {production.deadlineType} deadline
        </p>
      </div>
    </div>
  );
}
