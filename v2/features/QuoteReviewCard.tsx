"use client";

import type { Order } from "../types/order";
import type { ApparelQuote } from "../lib/apparel";
import type { ApparelPricingResult } from "../lib/apparel-pricing";
import type { SsCatalogColor } from "./types";

type Props = {
  isApparelSelected: boolean;
  order: Order;
  apparelQuote: ApparelQuote;
  apparelPricing: ApparelPricingResult;
  selectedGarmentLabel: string;
  selectedSsColor: SsCatalogColor | null;
  isReady: boolean;
};

export default function QuoteReviewCard({
  isApparelSelected,
  order,
  apparelQuote,
  apparelPricing,
  selectedGarmentLabel,
  selectedSsColor,
  isReady,
}: Props) {
  return (
    <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-6 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
            Review Your Quote
          </p>

          <p className="mt-2 text-2xl font-black tracking-[-0.05em] text-[#171717]">
            Check everything before submitting.
          </p>
        </div>

        <span className="rounded-full bg-[#F8F5EE] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#2E5037]">
          {isApparelSelected ? "Apparel" : "Stickers"}
        </span>
      </div>

      <div className="mt-5 space-y-3 text-sm font-bold text-[#6f695e]">
        {isApparelSelected ? (
          <>
            <div className="flex justify-between gap-4">
              <span>Garment</span>
              <span className="text-right text-[#171717]">
                {selectedGarmentLabel}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Color</span>
              <span className="text-right text-[#171717]">
                {selectedSsColor?.colorName || apparelQuote.garmentColor}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Quantity</span>
              <span className="text-right text-[#171717]">
                {apparelQuote.quantity.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Sizes</span>
              <span className="text-right text-[#171717]">
                {apparelQuote.sizeBreakdown || "Not complete"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Print Locations</span>
              <span className="text-right text-[#171717]">
                {apparelQuote.printLocations.join(", ") || "Not selected"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Ink Colors</span>
              <span className="text-right text-[#171717]">
                {apparelQuote.inkColors}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Estimate</span>
              <span className="text-right text-[#2E5037]">
                ${apparelPricing.total.toFixed(2)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between gap-4">
              <span>Sticker</span>
              <span className="text-right text-[#171717]">
                {order.product.size} • {order.product.shape}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Quantity</span>
              <span className="text-right text-[#171717]">
                {order.product.quantity.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Sticker Type</span>
              <span className="text-right text-[#171717]">
                {order.product.material}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Estimate</span>
              <span className="text-right text-[#2E5037]">
                ${order.pricing.total.toFixed(2)}
              </span>
            </div>
          </>
        )}

        <div className="border-t border-[#dfd0b8] pt-3">
          <div className="flex justify-between gap-4">
            <span>Artwork</span>
            <span className="text-right text-[#171717]">
              {order.artwork.file?.name || "Not uploaded"}
            </span>
          </div>

          <div className="mt-3 flex justify-between gap-4">
            <span>Needed By</span>
            <span className="text-right text-[#171717]">
              {order.production.needBy || "Not entered"}
            </span>
          </div>

          <div className="mt-3 flex justify-between gap-4">
            <span>Customer</span>
            <span className="text-right text-[#171717]">
              {order.customer.customerName || "Not entered"}
            </span>
          </div>

          <div className="mt-3 flex justify-between gap-4">
            <span>Email</span>
            <span className="text-right text-[#171717]">
              {order.customer.email || "Not entered"}
            </span>
          </div>
        </div>
      </div>

      {isReady ? (
        <p className="mt-5 rounded-2xl bg-[#eef7ee] p-4 text-sm font-black text-[#2E5037]">
          Everything required is complete. This quote is ready to submit.
        </p>
      ) : (
        <p className="mt-5 rounded-2xl bg-[#fff7e8] p-4 text-sm font-bold leading-6 text-[#6f695e]">
          Complete the required info below before submitting.
        </p>
      )}
    </div>
  );
}
