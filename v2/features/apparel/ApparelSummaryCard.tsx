"use client";

import type { ApparelQuote } from "../../lib/apparel";
import { describeAssumedMix } from "../../lib/apparel-blend";
import type { ApparelPricingResult } from "../../lib/apparel-pricing";
import { apparelPricingConfig } from "../../lib/apparel-pricing-config";
import type { ArtworkAnalysis } from "../../lib/artwork";

type Props = {
  apparelQuote: ApparelQuote;
  apparelPricing: ApparelPricingResult;
  /**
   * What the figure stands on. "assumed": the blended garment price with
   * the stated size mix — shown WITH the assumption, on the same screen,
   * per the handoff. "exact": every size priced from its own SKU.
   */
  apparelEstimateBasis: "assumed" | "exact";
  artworkAnalysis: ArtworkAnalysis | null;
};

/**
 * The next quantity price break above the current count, so the card can
 * name the lever ("at 50 shirts the printing rate drops") instead of
 * leaving the customer to email three times hunting for it.
 */
function nextQuantityBreak(quantity: number): number | null {
  const above = apparelPricingConfig.basePrintPrices
    .map((tier) => tier.minQuantity)
    .filter((min) => min > quantity);

  return above.length > 0 ? Math.min(...above) : null;
}

export default function ApparelSummaryCard({
  apparelQuote,
  apparelPricing,
  apparelEstimateBasis,
  artworkAnalysis,
}: Props) {
  return (
    <div className=" border border-[var(--rule)] bg-white p-6">
      <p className="eyebrow">
        Apparel Summary
      </p>

      <div className="mt-5 space-y-3 text-fine font-medium text-[var(--ink-muted)]">
        <div className="flex justify-between gap-4">
          <span>Product</span>
          <span className="text-right font-bold text-[var(--ink-black)]">{apparelQuote.garmentType}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Quantity</span>
          <span className="text-right font-bold text-[var(--ink-black)]">{apparelQuote.quantity}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Color</span>
          <span className="text-right font-bold text-[var(--ink-black)]">{apparelQuote.garmentColor}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Locations</span>
          <span className="text-right font-bold text-[var(--ink-black)]">{apparelQuote.printLocations.join(", ")}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Ink</span>
          <span className="text-right font-bold text-[var(--ink-black)]">{apparelQuote.inkColors}</span>
        </div>

        {!apparelQuote.specialOrder && (
          <>
            <div className="flex justify-between gap-4">
              <span>Estimated Each</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                ${apparelPricing.unitPrice.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Estimated Total</span>
              <span className="text-right font-bold text-[var(--gorilla-green)]">
                ${apparelPricing.total.toFixed(2)}
              </span>
            </div>
          </>
        )}

        {artworkAnalysis?.estimatedColorCount && (
          <div className="flex justify-between gap-4">
            <span>Auto Count</span>
            <span className="text-right font-bold text-[var(--ink-black)]">
              {artworkAnalysis.estimatedColorCount}
              {apparelQuote.garmentColor === "White"
                ? ""
                : " + underbase"}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 bg-[var(--shirt-blank)] p-4">
        <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
          Size Breakdown
        </p>
        <p className="mt-2 text-fine font-bold text-[var(--ink-black)]">
          {apparelQuote.sizeBreakdown || "Not entered yet"}
        </p>
      </div>

      {/* A special order has no price to panel. The engine still returns a
          figure, but it is printing and screens over a garment the catalogue
          could not price — on the day this was caught, "$169.00" with
          Garments at $0.00, for a job the payload marks quoteRequired and
          the shop email files as SPECIAL ORDER - NEEDS A HAND QUOTE. Signs
          already show "Priced by hand" here; apparel was the sibling that
          did not. */}
      {apparelQuote.specialOrder ? (
        <div className="mt-5 bg-[var(--surface-warn)] p-4">
          <p className="text-fine font-bold text-[var(--ink-black)]">
            Priced by hand
          </p>
          <p className="mt-2 text-fine font-medium leading-6 text-[var(--ink-muted)]">
            Special orders are quoted by Gorilla Salem — we reply with your
            price before anything is agreed.
          </p>
        </div>
      ) : (
      <div className="mt-5 bg-[var(--surface-ok)] p-4">
        <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--gorilla-green)]">
          Estimated Apparel Pricing
        </p>

        <div className="mt-4 space-y-2 text-fine font-medium text-[var(--ink-muted)]">
          <div className="flex justify-between gap-4">
            <span>Garments</span>
            <span className="text-right font-bold text-[var(--ink-black)]">
              ${apparelPricing.garmentTotal.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span>Printing</span>
            <span className="text-right font-bold text-[var(--ink-black)]">
              ${apparelPricing.printTotal.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span>Setup / Screens</span>
            <span className="text-right font-bold text-[var(--ink-black)]">
              ${apparelPricing.setupTotal.toFixed(2)}
            </span>
          </div>

          <div className="border-t border-[var(--rule)] pt-3">
            <div className="flex justify-between gap-4">
              <span className="text-[var(--ink-black)]">Estimated Total</span>
              <span className="text-right text-lede font-bold text-[var(--gorilla-green)]">
                ${apparelPricing.total.toFixed(2)}
              </span>
            </div>

            <div className="mt-1 flex justify-between gap-4">
              <span>Estimated Each</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                ${apparelPricing.unitPrice.toFixed(2)}
              </span>
            </div>
          </div>

          {/* The assumption lives ON THE SAME SCREEN as the number, and the
              asterisk promises the specific thing that removes it — not
              "this is an estimate", which every customer ignores. Once real
              sizes exist the assumption is gone and the line says so. */}
          {apparelEstimateBasis === "exact" ? (
            <p className="mt-3 border-t border-[var(--rule-faint)] pt-3 text-fine font-bold leading-5 text-[var(--gorilla-green)]">
              Priced from your sizes.
            </p>
          ) : (
            <p className="mt-3 border-t border-[var(--rule-faint)] pt-3 text-fine font-medium leading-5 text-[var(--ink-muted)]">
              * {describeAssumedMix()}{" "}
              <span className="font-bold text-[var(--ink-black)]">
                Enter your sizes and this becomes exact.
              </span>
            </p>
          )}

          {/* Stacey's levers: when the figure moves, this is what moved it.
              She cut count, colours and artwork size across three
              submissions hunting for a price the app never showed — name
              the levers so she can find her own. */}
          <p className="mt-2 text-fine font-medium leading-5 text-[var(--ink-muted)]">
            What moves this number: ink colors, print locations, and run
            size
            {nextQuantityBreak(apparelQuote.quantity) !== null
              ? ` — at ${nextQuantityBreak(apparelQuote.quantity)} shirts the printing rate drops.`
              : "."}
          </p>
        </div>
      </div>
      )}

      <div className="mt-5 bg-[var(--surface-warn)] p-4">
        <p className="text-fine font-medium leading-6 text-[var(--ink-muted)]">
          Apparel pricing is an estimate. Gorilla Salem will review
          garment availability, artwork, print method, and timeline
          before confirming the final price.
        </p>
      </div>
    </div>
  );
}
