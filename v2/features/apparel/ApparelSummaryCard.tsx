"use client";

import type { ApparelQuote } from "../../lib/apparel";
import type { ApparelPricingResult } from "../../lib/apparel-pricing";
import type { ArtworkAnalysis } from "../../lib/artwork";
import type { SsCatalogSize } from "../types";

type Props = {
  apparelQuote: ApparelQuote;
  selectedSsSize: SsCatalogSize | null;
  apparelPricing: ApparelPricingResult;
  artworkAnalysis: ArtworkAnalysis | null;
};

export default function ApparelSummaryCard({
  apparelQuote,
  selectedSsSize,
  apparelPricing,
  artworkAnalysis,
}: Props) {
  return (
    <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-6 shadow-xl">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
        Apparel Summary
      </p>

      <div className="mt-5 space-y-3 text-sm font-bold text-[#6f695e]">
        <div className="flex justify-between gap-4">
          <span>Product</span>
          <span className="text-right text-[#171717]">{apparelQuote.garmentType}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Quantity</span>
          <span className="text-right text-[#171717]">{apparelQuote.quantity}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Color</span>
          <span className="text-right text-[#171717]">{apparelQuote.garmentColor}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Locations</span>
          <span className="text-right text-[#171717]">{apparelQuote.printLocations.join(", ")}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Ink</span>
          <span className="text-right text-[#171717]">{apparelQuote.inkColors}</span>
        </div>

        {selectedSsSize && (
          <div className="flex justify-between gap-4">
            <span>Garment Price</span>
            <span className="text-right text-[#171717]">
              ${selectedSsSize.markedUpPrice.toFixed(2)}
            </span>
          </div>
        )}

        {selectedSsSize && (
          <div className="flex justify-between gap-4">
            <span>SKU</span>
            <span className="text-right text-[#171717]">
              {selectedSsSize.sku}
            </span>
          </div>
        )}

        <div className="flex justify-between gap-4">
          <span>Estimated Each</span>
          <span className="text-right text-[#171717]">
            ${apparelPricing.unitPrice.toFixed(2)}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span>Estimated Total</span>
          <span className="text-right text-[#2E5037]">
            ${apparelPricing.total.toFixed(2)}
          </span>
        </div>

        {artworkAnalysis?.estimatedColorCount && (
          <div className="flex justify-between gap-4">
            <span>Auto Count</span>
            <span className="text-right text-[#171717]">
              {artworkAnalysis.estimatedColorCount}
              {apparelQuote.garmentColor === "White"
                ? ""
                : " + underbase"}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-2xl bg-[#F8F5EE] p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f695e]">
          Size Breakdown
        </p>
        <p className="mt-2 text-sm font-bold text-[#171717]">
          {apparelQuote.sizeBreakdown || "Not entered yet"}
        </p>
      </div>

      <div className="mt-5 rounded-2xl bg-[#eef7ee] p-4">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2E5037]">
          Estimated Apparel Pricing
        </p>

        <div className="mt-4 space-y-2 text-sm font-bold text-[#6f695e]">
          <div className="flex justify-between gap-4">
            <span>Garments</span>
            <span className="text-right text-[#171717]">
              ${apparelPricing.garmentTotal.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span>Printing</span>
            <span className="text-right text-[#171717]">
              ${apparelPricing.printTotal.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span>Setup / Screens</span>
            <span className="text-right text-[#171717]">
              ${apparelPricing.setupTotal.toFixed(2)}
            </span>
          </div>

          <div className="border-t border-[#cfe4cf] pt-3">
            <div className="flex justify-between gap-4">
              <span className="text-[#171717]">Estimated Total</span>
              <span className="text-right text-xl font-black text-[#2E5037]">
                ${apparelPricing.total.toFixed(2)}
              </span>
            </div>

            <div className="mt-1 flex justify-between gap-4">
              <span>Estimated Each</span>
              <span className="text-right text-[#171717]">
                ${apparelPricing.unitPrice.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-[#fff7e8] p-4">
        <p className="text-sm font-bold leading-6 text-[#6f695e]">
          Apparel pricing is an estimate. Gorilla Salem will review
          garment availability, artwork, print method, and timeline
          before confirming the final price.
        </p>
      </div>
    </div>
  );
}
