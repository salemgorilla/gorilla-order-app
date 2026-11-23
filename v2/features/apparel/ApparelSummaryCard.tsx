"use client";

import { describeInkColors } from "../../lib/apparel-pricing";
import type { ApparelQuote } from "../../lib/apparel";
import { describeAssumedMix } from "../../lib/apparel-blend";
import type { ApparelPricingResult } from "../../lib/apparel-pricing";
import { apparelPricingConfig } from "../../lib/apparel-pricing-config";
import type { ArtworkAnalysis } from "../../lib/artwork";
import { shouldListGarments } from "../../lib/apparel-cart-lines";
import ApparelMoney from "./ApparelMoney";
import type { ApparelLineEach } from "../../lib/apparel-per-line";

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
  /**
   * Every garment in the quote, line one first. One entry on an ordinary
   * order, and the card reads exactly as it always has; several, and the
   * Product/Quantity/Color rows give way to a list, because "Quantity 36"
   * over "Color White" would be describing a cart as one shirt.
   */
  /**
   * Each garment's own per-piece figure — apparelLineEach(). Handed down
   * rather than derived here: one derivation, read by three surfaces, so
   * they cannot disagree.
   */
  apparelEach?: ApparelLineEach[];
  garmentLines?: Array<{
    garmentLabel: string;
    colorName: string;
    quantity: number;
    garmentTotal: number;
    /** "M-12, L-6" — this garment's own sizes, when it has them. */
    sizeBreakdown?: string;
  }>;
  /**
   * A flat-rate offer (lib/hoodie-special.ts). Its price is one figure per
   * piece with printing and setup inside it, so the matrix breakdown —
   * garments, printing, screens, the tier levers, the assumed size mix —
   * describes nothing about it and gives way to the offer's own lines.
   */
  flatRate?: {
    name: string;
    unitPrice: number;
    sides: string;
  };
  /**
   * The run prints a white underbase (apparelPrintSpec). The price already
   * charges it as one more colour and screen; this says so beside the ink,
   * so "1 color" over $50 of screens is not a puzzle. Never set for a
   * flat-rate offer, whose price covers it.
   */
  underbase?: boolean;
};

/**
 * The next quantity price break above the current count, so the card can
 * name the lever ("at 50 shirts the printing rate drops") instead of
 * leaving the customer to email three times hunting for it.
 */
function nextQuantityBreak(quantity: number): number | null {
  const above = apparelPricingConfig.tiers
    .map((tier) => tier.minQuantity)
    .filter((min) => min > quantity);

  return above.length > 0 ? Math.min(...above) : null;
}

export default function ApparelSummaryCard({
  apparelQuote,
  apparelPricing,
  apparelEstimateBasis,
  artworkAnalysis,
  apparelEach = [],
  garmentLines = [],
  flatRate,
  underbase = false,
}: Props) {
  // See shouldListGarments: not simply "more than one line" — a quote
  // whose only priced garment is an ADDED one has to list it, or the card
  // describes the configured garment nobody ordered.
  const isCart = shouldListGarments(garmentLines, apparelQuote.quantity);

  // The run: every garment on a cart, the configurator's count otherwise.
  // Also the divisor behind the per-piece figure in ApparelMoney below.
  const runQuantity = isCart
    ? garmentLines.reduce((sum, line) => sum + line.quantity, 0)
    : apparelQuote.quantity;

  return (
    <div className=" border border-[var(--rule)] bg-white p-6">
      <p className="eyebrow">
        Apparel Summary
      </p>

      <div className="mt-5 space-y-3 text-fine font-medium text-[var(--ink-muted)]">
        {isCart ? (
          <div>
            <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
              Garments ·{" "}
              {garmentLines.reduce((sum, line) => sum + line.quantity, 0)} pieces
            </p>
            <ul className="mt-2 space-y-1">
              {garmentLines.map((line, index) => (
                <li
                  key={`${line.garmentLabel}-${line.colorName}-${index}`}
                  className="flex justify-between gap-4"
                >
                  <span className="text-[var(--ink-black)]">
                    <span className="spec font-bold">{line.quantity}</span> ×{" "}
                    {line.garmentLabel} / {line.colorName}
                    {/* This garment's own sizes. The Size Breakdown panel
                        below is the FIRST garment's and is hidden on a
                        cart, where every garment has its own. */}
                    {(line.sizeBreakdown || "").trim() && (
                      <span className="block text-fine font-medium text-[var(--ink-muted)]">
                        {line.sizeBreakdown}
                      </span>
                    )}
                  </span>
                  <span className="spec text-right font-bold text-[var(--ink-black)]">
                    ${line.garmentTotal.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
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
          </>
        )}
        <div className="flex justify-between gap-4">
          <span>Locations</span>
          <span className="text-right font-bold text-[var(--ink-black)]">{apparelQuote.printLocations.join(", ")}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Ink</span>
          <span className="text-right font-bold text-[var(--ink-black)]">{describeInkColors(apparelQuote)}
            {underbase && !flatRate ? " + white underbase" : ""}
          </span>
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

        {/* The special covers the underbase, so "+ underbase" here would
            read as a charge the customer is not paying. */}
        {artworkAnalysis?.estimatedColorCount && !flatRate && (
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

      {/* One garment: one panel. On a cart each garment carries its own
          sizes in the list above, and a single panel here would show the
          first garment's under a heading that reads as the whole order's. */}
      {!isCart && (
        <div className="mt-5 bg-[var(--shirt-blank)] p-4">
          <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
            Size Breakdown
          </p>
          <p className="mt-2 text-fine font-bold text-[var(--ink-black)]">
            {apparelQuote.sizeBreakdown || "Not entered yet"}
          </p>
        </div>
      )}

      {/* A special order has no price to panel. The engine still returns a
          figure, but it is printing and screens over a garment the catalogue
          could not price — on the day this was caught, "$169.00" with
          Garments at $0.00, for a job the payload marks quoteRequired and
          the shop email files as SPECIAL ORDER - NEEDS A HAND QUOTE. Signs
          already show "Priced by hand" here; apparel was the sibling that
          did not. */}
      {flatRate ? (
        <div
          data-testid="hoodie-special-summary"
          className="mt-5 bg-[var(--surface-ok)] p-4"
        >
          <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--gorilla-green)]">
            {flatRate.name}
          </p>

          <div className="mt-4 space-y-2 text-fine font-medium text-[var(--ink-muted)]">
            <div className="flex justify-between gap-4">
              <span>
                {runQuantity} hoodies × ${flatRate.unitPrice.toFixed(2)}{" "}
                ({flatRate.sides})
              </span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                ${apparelPricing.total.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Printing and setup</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                Included
              </span>
            </div>

            <p className="mt-3 border-t border-[var(--rule-faint)] pt-3 text-fine font-bold leading-5 text-[var(--gorilla-green)]">
              Flat rate. Size, color and ink count don&rsquo;t change it.
            </p>
          </div>
        </div>
      ) : apparelQuote.specialOrder ? (
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

          {/* The two figures the order is about, as peers — see
              ApparelMoney. The each used to be a muted row a third the size
              of the total, on the product customers negotiate per piece. */}
          <div className="pt-1">
            <ApparelMoney
              compact
              total={apparelPricing.total}
              unitPrice={apparelPricing.unitPrice}
              lines={apparelEach}
              quantity={runQuantity}
            />
          </div>

          {/* The assumption lives ON THE SAME SCREEN as the number, and the
              asterisk promises the specific thing that removes it — not
              "this is an estimate", which every customer ignores. Once real
              sizes exist the assumption is gone and the line says so. */}
          {/* Was "First garment priced from your sizes; added garments use an
              assumed size mix" on every cart. True only while added garments
              had no size grid — #134 gave them one, and a note that states a
              rule the code no longer follows is worse than no note. */}
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
            {apparelPricing.printTierQuantity > runQuantity ? (
              // Never-pay-more (lib/apparel-pricing.ts): said here so a
              // customer at 23 shirts is not told the rate drops at 24
              // when they are already getting it.
              <>
                Printing is charged at the {apparelPricing.printTierQuantity}
                -piece rate, because that costs less than{" "}
                {runQuantity} at the smaller-run rate — you never
                pay more than you would for more shirts.
              </>
            ) : (
              <>
                What moves this number: ink colors, print locations, and run
                size
                {nextQuantityBreak(apparelQuote.quantity) !== null
                  ? ` — at ${nextQuantityBreak(apparelQuote.quantity)} shirts the printing rate drops.`
                  : "."}
              </>
            )}
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
