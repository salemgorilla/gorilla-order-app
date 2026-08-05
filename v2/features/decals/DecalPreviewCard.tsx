"use client";

import StickerPreview from "../../components/preview/StickerPreview";
import {
  getStickerGeometry,
  inchLabel,
  parseSizeInches,
} from "../../components/preview/StickerShape";
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

  // Real inches, derived from the same geometry the preview renders with.
  // The preview card maps CARD_PX to the LONGEST side, so the inch scale is
  // set by that dimension. On a custom size the preset label is "Custom size"
  // and parses to 0, which would have shown every measurement as 0.00".
  const longestInches = Math.max(
    Number(product.widthInches) || 0,
    Number(product.heightInches) || 0,
    0
  );

  const geometry = getStickerGeometry({
    shape: product.shape,
    artScale: product.artScale,
    artMargin: product.artMargin,
    sizeInches: longestInches || parseSizeInches(product.size),
  });
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
        widthInches={product.widthInches}
        heightInches={product.heightInches}
      />

      <div className="mt-4 bg-[var(--shirt-blank)] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Adjust Art Placement
        </p>

        <label className="mt-3 block">
          <span className="flex items-center justify-between text-sm font-bold text-[var(--ink-black)]">
            <span>Art Size</span>
            {/* Inches, not percent — "80%" means nothing on a 3" sticker. */}
            <span className="spec text-[var(--gorilla-green)]">
              {geometry.artInches > 0
                ? inchLabel(geometry.artInches)
                : `${product.artScale}%`}
            </span>
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
            <span className="spec text-[var(--gorilla-green)]">
              {inchLabel(geometry.borderInches)}
            </span>
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
