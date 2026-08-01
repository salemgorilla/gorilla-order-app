"use client";

import type { Order } from "../types/order";
import type { ApparelQuote } from "../lib/apparel";
import type { ApparelPricingResult } from "../lib/apparel-pricing";
import type { SsCatalogColor } from "./types";
import {
  getSignProduct,
  getSignSizeLabel,
  type SignsQuote,
} from "../lib/signs";

type Props = {
  isApparelSelected: boolean;
  isSignsSelected: boolean;
  order: Order;
  apparelQuote: ApparelQuote;
  apparelPricing: ApparelPricingResult;
  signsQuote: SignsQuote;
  signsTotal: number | null;
  selectedGarmentLabel: string;
  selectedSsColor: SsCatalogColor | null;
  isReady: boolean;
};

export default function QuoteReviewCard({
  isApparelSelected,
  isSignsSelected,
  order,
  apparelQuote,
  apparelPricing,
  signsQuote,
  signsTotal,
  selectedGarmentLabel,
  selectedSsColor,
  isReady,
}: Props) {
  return (
    <div className="rounded-[2rem] border border-[var(--rule)] bg-white p-6 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
            Review Your Quote
          </p>

          <p className="mt-2 text-2xl font-black tracking-[-0.05em] text-[var(--ink-black)]">
            Check everything before submitting.
          </p>
        </div>

        <span className="rounded-full bg-[var(--shirt-blank)] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--gorilla-green)]">
          {isApparelSelected ? "Apparel" : isSignsSelected ? "Signs" : "Stickers"}
        </span>
      </div>

      <div className="mt-5 space-y-3 text-sm font-bold text-[var(--ink-muted)]">
        {isSignsSelected ? (
          <>
            {(
              [
                ["Product", getSignProduct(signsQuote.productId).label],
                ["Quantity", signsQuote.quantity.toLocaleString()],
                ["Size", getSignSizeLabel(signsQuote)],
                ["Material", signsQuote.material],
                ["Finishing", signsQuote.finishing],
                [
                  "Sides",
                  signsQuote.doubleSided ? "Double-sided" : "Single-sided",
                ],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <span>{label}</span>
                <span className="text-right text-[var(--ink-black)]">{value}</span>
              </div>
            ))}

            <div className="flex justify-between gap-4">
              <span>Estimate</span>
              <span className="text-right text-[var(--gorilla-green)]">
                {signsTotal !== null
                  ? `$${signsTotal.toFixed(2)}`
                  : "Quoted by hand"}
              </span>
            </div>
          </>
        ) : isApparelSelected ? (
          <>
            <div className="flex justify-between gap-4">
              <span>Garment</span>
              <span className="text-right text-[var(--ink-black)]">
                {selectedGarmentLabel}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Color</span>
              <span className="text-right text-[var(--ink-black)]">
                {selectedSsColor?.colorName || apparelQuote.garmentColor}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Quantity</span>
              <span className="text-right text-[var(--ink-black)]">
                {apparelQuote.quantity.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Sizes</span>
              <span className="text-right text-[var(--ink-black)]">
                {apparelQuote.sizeBreakdown || "Not complete"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Print Locations</span>
              <span className="text-right text-[var(--ink-black)]">
                {apparelQuote.printLocations.join(", ") || "Not selected"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Ink Colors</span>
              <span className="text-right text-[var(--ink-black)]">
                {apparelQuote.inkColors}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Estimate</span>
              <span className="text-right text-[var(--gorilla-green)]">
                ${apparelPricing.total.toFixed(2)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between gap-4">
              <span>Sticker</span>
              <span className="text-right text-[var(--ink-black)]">
                {order.product.size} • {order.product.shape}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Quantity</span>
              <span className="text-right text-[var(--ink-black)]">
                {order.product.quantity.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Sticker Type</span>
              <span className="text-right text-[var(--ink-black)]">
                {order.product.material}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Estimate</span>
              <span className="text-right text-[var(--gorilla-green)]">
                ${order.pricing.total.toFixed(2)}
              </span>
            </div>
          </>
        )}

        <div className="border-t border-[var(--rule)] pt-3">
          <div className="flex justify-between gap-4">
            <span>Artwork</span>
            <span className="text-right text-[var(--ink-black)]">
              {order.artwork.file?.name || "Not uploaded"}
            </span>
          </div>

          <div className="mt-3 flex justify-between gap-4">
            <span>Needed By</span>
            <span className="text-right text-[var(--ink-black)]">
              {order.production.needBy || "Not entered"}
            </span>
          </div>

          <div className="mt-3 flex justify-between gap-4">
            <span>Customer</span>
            <span className="text-right text-[var(--ink-black)]">
              {order.customer.customerName || "Not entered"}
            </span>
          </div>

          <div className="mt-3 flex justify-between gap-4">
            <span>Email</span>
            <span className="text-right text-[var(--ink-black)]">
              {order.customer.email || "Not entered"}
            </span>
          </div>
        </div>
      </div>

      {isReady ? (
        <p className="mt-5 rounded-2xl bg-[var(--surface-ok)] p-4 text-sm font-black text-[var(--gorilla-green)]">
          Everything required is complete. This quote is ready to submit.
        </p>
      ) : (
        <p className="mt-5 rounded-2xl bg-[var(--surface-warn)] p-4 text-sm font-bold leading-6 text-[var(--ink-muted)]">
          Complete the required info below before submitting.
        </p>
      )}
    </div>
  );
}
