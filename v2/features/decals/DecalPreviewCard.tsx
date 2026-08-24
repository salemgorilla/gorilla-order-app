"use client";

import StickerPreview from "../../components/preview/StickerPreview";
import {
  ART_SCALE_CEILING,
  clampArtScaleToShape,
  getBleedThreshold,
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

  /**
   * Where the blade actually is for THIS shape, and how far the slider goes.
   *
   * Die Cut has no fixed outline to cross — the contour is generated from the
   * art — so getBleedThreshold hands back the full ceiling and the bleed
   * checkbox is not offered at all.
   */
  const bleedThreshold = getBleedThreshold(product.shape);
  const artScaleMax = product.artBleed ? ART_SCALE_CEILING : bleedThreshold;

  /**
   * One sentence, three states, all of them naming the shape's real number.
   *
   * Inches stay the headline figure above — "80%" means nothing on a 3"
   * sticker and 2.4" means something. This line is about the EDGE, which is
   * the one thing a percentage genuinely describes.
   */
  const artScaleHelp = isDieCut
    ? "The cut follows your artwork's outline, so there is no edge to run past."
    : product.artScale > bleedThreshold
    ? "Art past the dashed line will be cut off."
    : product.artScale === bleedThreshold
    ? "Art meets the cut edge."
    : `Fills the sticker at ${bleedThreshold}%.`;

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

        <div className=" bg-[var(--gorilla-green)] px-4 py-2 text-fine font-bold text-white">
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
        artBleed={product.artBleed}
        widthInches={product.widthInches}
        heightInches={product.heightInches}
      />

      <div className="mt-4 bg-[var(--shirt-blank)] p-4">
        <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
          Adjust Art Placement
        </p>

        <label className="mt-3 block">
          <span className="flex items-center justify-between text-fine font-bold text-[var(--ink-black)]">
            <span>Art Size</span>
            {/* Inches, not percent — "80%" means nothing on a 3" sticker. */}
            <span className="spec text-[var(--gorilla-green)]">
              {geometry.artInches > 0
                ? inchLabel(geometry.artInches)
                : `${product.artScale}%`}
            </span>
          </span>
          {/* The ceiling is the shape's own bleed threshold, not a flat 150.
              Art is sized against an inscribed-square safe area, so the scale
              at which it reaches the blade differs per shape — 141% on a
              circle, 113% on rounded corners, 104% on square. A flat 150 let
              a customer on square corners drag 46 points past the cut while
              the card clipped the evidence. Derived from the safe-area factor
              so the cap and the geometry cannot disagree. */}
          <input
            type="range"
            min={40}
            // step 1, not 5. The old ceiling of 150 happened to sit on the
            // 40+5n grid, so nobody noticed the constraint. The real
            // thresholds do not: 141, 113 and 104 are all unreachable from 40
            // in steps of 5, so the slider would stop 1–4 points short of the
            // cut on every shape and "Art meets the cut edge" could never be
            // shown. Caught by dragging it, not by reading it.
            step={1}
            max={artScaleMax}
            value={product.artScale}
            onChange={(event) =>
              onUpdateProduct({ artScale: Number(event.target.value) })
            }
            className="mt-1 w-full accent-[var(--gorilla-green)]"
          />
          <span className="mt-1 block text-fine leading-5 text-[var(--ink-muted)]">
            {/* The old copy said "past 100% the art bleeds", which was true on
                no shape at all — a circle bleeds at 141%, square corners at
                104%. A customer either worried at 105% on a circle for no
                reason, or trusted it and sailed past the real edge. */}
            {artScaleHelp}
          </span>
        </label>

        {!isDieCut && (
          <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={product.artBleed}
              onChange={(event) => {
                const artBleed = event.target.checked;

                // Turning it OFF has to pull an out-of-range scale back with
                // it, or the slider would sit past its own maximum showing a
                // value it cannot represent.
                onUpdateProduct({
                  artBleed,
                  artScale: clampArtScaleToShape(
                    product.shape,
                    product.artScale,
                    artBleed
                  ),
                });
              }}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--gorilla-green)]"
            />
            <span className="text-fine leading-5 text-[var(--ink-black)]">
              <span className="font-bold">Let the art run past the cut edge</span>
              <span className="mt-0.5 block text-[var(--ink-muted)]">
                For art that should bleed off the sticker. The preview will show
                you exactly what gets cut off.
              </span>
            </span>
          </label>
        )}

        <label className="mt-3 block">
          <span className="flex items-center justify-between text-fine font-bold text-[var(--ink-black)]">
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

        <p className="mt-2 text-spec font-bold leading-5 text-[var(--ink-muted)]">
          {isDieCut
            ? "Die-cut follows your artwork's outline. Cut Border sets the white edge around it."
            : "Art auto-centers on the sticker. Margin sets the space to the edge."}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
        <div className=" bg-[var(--shirt-blank)] p-4">
          <p className="text-spec font-bold uppercase text-[var(--ink-muted)]">
            Size
          </p>
          <p className="mt-1 font-bold">{product.size}</p>
        </div>

        <div className=" bg-[var(--shirt-blank)] p-4">
          <p className="text-spec font-bold uppercase text-[var(--ink-muted)]">
            Shape
          </p>
          <p className="mt-1 font-bold">{product.shape}</p>
        </div>

        <div className=" bg-[var(--shirt-blank)] p-4">
          <p className="text-spec font-bold uppercase text-[var(--ink-muted)]">
            Each
          </p>
          <p className="mt-1 font-bold">${unitPrice.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-3 bg-[var(--shirt-blank)] p-4 text-center">
        <p className="text-spec font-bold uppercase text-[var(--ink-muted)]">
          Needed In Hand
        </p>

        <p className="mt-1 font-bold">
          {production.needBy || "Not entered yet"}
        </p>

        <p className="mt-1 text-fine font-bold text-[var(--ink-muted)]">
          {production.deadlineType} deadline
        </p>
      </div>
    </div>
  );
}
