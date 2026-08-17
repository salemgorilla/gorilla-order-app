"use client";

import type { Order } from "../types/order";
import { getStickerTotals } from "../lib/tax";
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
  // Shared with the summary, the confirmation screen and the sticky bar.
  const stickerTotals = getStickerTotals(order.pricing);

  return (
    <div className=" border border-[var(--rule)] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            Review Your Quote
          </p>

          <p className="mt-2 text-head font-bold tracking-display text-[var(--ink-black)]">
            Check everything before submitting.
          </p>
        </div>

        <span className=" bg-[var(--shirt-blank)] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--gorilla-green)]">
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
                {order.items[0].size} • {order.items[0].shape}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Quantity</span>
              <span className="text-right text-[var(--ink-black)]">
                {order.items[0].quantity.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Sticker Type</span>
              <span className="text-right text-[var(--ink-black)]">
                {order.items[0].material}
              </span>
            </div>

            {/* Tax-inclusive, from the one derivation in lib/tax. This card
                and the confirmation screen both showed the pre-tax figure
                while the Order Summary below showed the taxed one — three
                surfaces, two numbers, on the screen before a payable link. */}
            <div className="flex justify-between gap-4">
              <span>{stickerTotals.estimatedTax > 0 ? "Estimated total" : "Estimate"}</span>
              <span className="text-right text-[var(--gorilla-green)]">
                ${stickerTotals.estimatedTotal.toFixed(2)}
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

          {/* Read-only. Sits with the other confirmations so the extra items
              are visible before the customer commits, not just after. */}
          {(order.addOns.length > 0 || order.addOnsNote.trim()) && (
            <div className="mt-3 flex justify-between gap-4">
              <span>Also asking about</span>
              <span className="text-right text-[var(--ink-black)]">
                {[
                  ...order.addOns.map((a) => a.label),
                  ...(order.addOnsNote.trim() ? [order.addOnsNote.trim()] : []),
                ].join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>

      {isReady ? (
        <p className="mt-5 bg-[var(--surface-ok)] p-4 text-sm font-bold text-[var(--gorilla-green)]">
          Everything required is complete. This quote is ready to submit.
        </p>
      ) : (
        <p className="mt-5 bg-[var(--surface-warn)] p-4 text-sm font-bold leading-6 text-[var(--ink-muted)]">
          Complete the required info below before submitting.
        </p>
      )}
    </div>
  );
}
