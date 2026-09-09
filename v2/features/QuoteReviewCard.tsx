"use client";

import { describeInkColors } from "../lib/apparel-pricing";
import type { Order } from "../types/order";
import { getSignsTotals, getStickerTotals } from "../lib/tax";
import type { ApparelQuote } from "../lib/apparel";
import type { ApparelPricingResult } from "../lib/apparel-pricing";
import type { SsCatalogColor } from "./types";
import {
  getSignProduct,
  getSignSizeLabel,
  type SignsQuote,
} from "../lib/signs";
import {
  SKU_FAMILY,
  apparelLineSku,
  apparelSku,
  decalSku,
  signSku,
} from "../lib/sku";
import { shouldListGarments } from "../lib/apparel-cart-lines";
import ApparelMoney from "./apparel/ApparelMoney";
import type { ApparelLineEach } from "../lib/apparel-per-line";

type Props = {
  isApparelSelected: boolean;
  /**
   * The request flow asks three questions — garment, rough count, notes —
   * so its review shows those three answers and nothing invented. The full
   * row set below belongs to the configurator, which actually asks them.
   */
  isApparelRequest: boolean;
  isSignsSelected: boolean;
  order: Order;
  apparelQuote: ApparelQuote;
  apparelPricing: ApparelPricingResult;
  signsQuote: SignsQuote;
  signsTotal: number | null;
  /**
   * Setup, finishing add-ons and rush — the fee part of `signsTotal`, which
   * is untaxed (lib/tax.ts). Passed separately because this card gets a bare
   * total rather than the pricing object, and REQUIRED because without it
   * this surface would tax fees while the summary card did not: the "four
   * surfaces, two numbers" failure getQuoteTotals exists to prevent.
   */
  signsFeeTotal: number;
  selectedGarmentLabel: string;
  selectedSsColor: SsCatalogColor | null;
  /** Every garment in the apparel quote; see ApparelSummaryCard. */
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
    catalogStyle?: string;
    /** "M-12, L-6" — this garment's own sizes, when it has them. */
    sizeBreakdown?: string;
  }>;
  /**
   * The S&S style of the configured garment — what a one-garment apparel
   * order files under on the invoice (lib/sku.ts). Undefined until the
   * catalog has answered, and the code says so rather than inventing one.
   */
  catalogStyle?: string;
  isReady: boolean;
};

/**
 * A spec row: the same label/value pair as every other row on this card,
 * with the value in mono because it is a code, not a word. Every code here
 * is the item number the Printavo invoice will carry for that line —
 * tests/sku-agreement.test.ts holds the two equal — so a customer can lay
 * this screen beside the invoice and match them line for line.
 */
function CodeRow({ code }: { code: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span>Invoice line</span>
      <span className="spec text-right text-spec font-bold text-[var(--ink-black)]">
        {code}
      </span>
    </div>
  );
}

export default function QuoteReviewCard({
  isApparelSelected,
  isApparelRequest,
  isSignsSelected,
  order,
  apparelQuote,
  apparelPricing,
  signsQuote,
  signsTotal,
  signsFeeTotal,
  selectedGarmentLabel,
  selectedSsColor,
  apparelEach = [],
  garmentLines = [],
  catalogStyle,
  isReady,
}: Props) {
  /**
   * List every garment, or describe the configured one? See
   * shouldListGarments — "more than one line" is not the same question,
   * and the difference showed as a tee at quantity 0 beside a hoodie
   * estimate.
   */
  const listGarments = shouldListGarments(garmentLines, apparelQuote.quantity);

  /**
   * Pieces across the whole apparel quote — what the per-piece figure is
   * divided by. Summed from the priced lines, because apparelQuote.quantity
   * is the configured garment's count alone and a cart has more.
   */
  const runQuantity =
    garmentLines.reduce((sum, line) => sum + line.quantity, 0) ||
    apparelQuote.quantity;

  // Shared with the summary, the confirmation screen and the sticky bar.
  const stickerTotals = getStickerTotals(order.pricing);
  const signsTotals =
    signsTotal !== null
      ? getSignsTotals({ total: signsTotal, feeTotal: signsFeeTotal })
      : null;

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

        {/* The SKU family this order files under — GORILLA-DECAL, -SIGN or
            -APPAREL — in place of the word for it. Mono, because it is the
            prefix every line below shares on the invoice, and in ink rather
            than green: green means SELECTED or CONFIRMED everywhere else on
            this screen, and a chip is neither. */}
        <span className="spec border border-[var(--rule)] bg-[var(--shirt-blank)] px-4 py-2 text-spec font-bold text-[var(--ink-black)]">
          <span className="sr-only">Files under </span>
          {isApparelSelected
            ? SKU_FAMILY.apparel
            : isSignsSelected
            ? SKU_FAMILY.signs
            : SKU_FAMILY.stickers}
        </span>
      </div>

      <div className="mt-5 space-y-3 text-fine font-medium text-[var(--ink-muted)]">
        {isSignsSelected ? (
          <>
            {signsQuote.designs.map((design, index) => (
              <div
                key={design.id}
                className={
                  index === 0
                    ? "space-y-3"
                    : "space-y-3 border-t border-[var(--rule-faint)] pt-3"
                }
              >
                {signsQuote.designs.length > 1 && (
                  <p className="spec text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-black)]">
                    Design {String(index + 1).padStart(2, "0")}
                  </p>
                )}

                {(
                  [
                    ["Product", getSignProduct(design.productId).label],
                    ["Quantity", design.quantity.toLocaleString()],
                    ["Size", getSignSizeLabel(design)],
                    ["Material", design.material],
                    ["Finishing", design.finishing],
                    [
                      "Sides",
                      design.doubleSided ? "Double-sided" : "Single-sided",
                    ],
                    // Which file is THIS design's, on the screen where the
                    // customer checks before sending. The shared footer row
                    // this replaces showed whichever file was uploaded last.
                    [
                      "Artwork",
                      design.templateId
                        ? "Our template — wording supplied"
                        : design.artwork.file?.name || "Not uploaded",
                    ],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span>{label}</span>
                    <span className="text-right font-bold text-[var(--ink-black)]">
                      {value}
                    </span>
                  </div>
                ))}

                <CodeRow
                  code={signSku(getSignProduct(design.productId).label)}
                />
              </div>
            ))}

            {/* Tax-inclusive, like the sticker row below and for the reason
                its comment gives: this row said $177.00 while the summary
                beside it said $188.06 — two numbers for one quote, on the
                screen where the customer decides to press send. */}
            <div className="flex justify-between gap-4">
              <span>
                {signsTotals !== null && signsTotals.estimatedTax > 0
                  ? "Estimated total"
                  : "Estimate"}
              </span>
              <span className="text-right font-bold text-[var(--gorilla-green)]">
                {signsTotals !== null
                  ? `$${signsTotals.estimatedTotal.toFixed(2)}`
                  : "Quoted by hand"}
              </span>
            </div>
          </>
        ) : isApparelRequest ? (
          <>
            {/* The three questions the request flow actually asked, and the
                notes verbatim. The configurator's rows below — Color, Sizes,
                Print Locations, Ink — are form DEFAULTS in this flow, and on
                the screen that says "check everything" a default reads as a
                recorded answer: a customer who typed "black hats, embroidery"
                was shown Color White · Front · 1 color and left to wonder
                which of the two the shop believed. */}
            <div className="flex justify-between gap-4">
              <span>Garment</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                {apparelQuote.garmentType}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Quantity</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                {apparelQuote.quantity.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="shrink-0">Your request</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                {apparelQuote.specialOrderNotes.trim() || "Not entered"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Estimate</span>
              <span className="text-right font-bold text-[var(--gorilla-green)]">
                Quoted by hand
              </span>
            </div>
          </>
        ) : isApparelSelected ? (
          <>
            {listGarments ? (
              // A cart: every garment, so the customer checks the order they
              // built rather than its first line.
              <div className="flex justify-between gap-4">
                <span>Garments</span>
                <span className="text-right font-bold text-[var(--ink-black)]">
                  {garmentLines.map((line, index) => (
                    <span key={`${line.garmentLabel}-${line.colorName}-${index}`} className="block">
                      {line.quantity} × {line.garmentLabel} / {line.colorName}
                      {/* Each garment's own sizes, beside the garment they
                          belong to. The single "Sizes" row below names only
                          the first garment and is hidden on a cart. */}
                      <span className="block text-fine font-medium text-[var(--ink-muted)]">
                        {(line.sizeBreakdown || "").trim() || "Sizes not entered"}
                      </span>
                      <span className="spec block text-spec font-medium text-[var(--ink-muted)]">
                        {apparelLineSku(line, index)}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between gap-4">
                  <span>Garment</span>
                  <span className="text-right font-bold text-[var(--ink-black)]">
                    {selectedGarmentLabel}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span>Color</span>
                  <span className="text-right font-bold text-[var(--ink-black)]">
                    {selectedSsColor?.colorName || apparelQuote.garmentColor}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span>Quantity</span>
                  <span className="text-right font-bold text-[var(--ink-black)]">
                    {apparelQuote.quantity.toLocaleString()}
                  </span>
                </div>

                {/* Only once the catalog has named the style. Before that
                    the invoice would file under GORILLA-APPAREL-NA, which
                    is a real fallback but not a thing to show a customer as
                    their code. */}
                {catalogStyle && <CodeRow code={apparelSku(catalogStyle)} />}
              </>
            )}

            {/* One garment: one Sizes row. On a cart the sizes sit with
                each garment above — a single row there would show the first
                garment's breakdown under a heading that reads as the whole
                order's. */}
            {listGarments ? null : (
              <div className="flex justify-between gap-4">
                <span>Sizes</span>
                <span className="text-right font-bold text-[var(--ink-black)]">
                  {apparelQuote.sizeBreakdown || "Not complete"}
                </span>
              </div>
            )}

            <div className="flex justify-between gap-4">
              <span>Print Locations</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                {apparelQuote.printLocations.join(", ") || "Not selected"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span>Ink Colors</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                {describeInkColors(apparelQuote)}
              </span>
            </div>

            {/* The payload for a special order says { total: 0,
                quoteRequired: true }; the shop email files it as NEEDS A HAND
                QUOTE. Showing the engine's figure anyway — printing and
                screens over a garment the catalogue could not price — handed
                the customer a number the shop never saw. Signs one branch up
                already say "Quoted by hand". */}
            {apparelQuote.specialOrder ? (
              <div className="flex justify-between gap-4">
                <span>Estimate</span>
                <span className="text-right font-bold text-[var(--gorilla-green)]">
                  Quoted by hand
                </span>
              </div>
            ) : (
              /**
               * BOTH figures, and the per-piece one at last.
               *
               * This card showed a single "Estimate $523.32" row and nothing
               * per shirt — on the screen headed "Check everything before
               * submitting", for the one product customers negotiate per
               * piece. Gabe, 9 Sep: "the price per item does not appear. I
               * think that should be very noticeable and highlighted."
               *
               * The count is summed from the priced LINES, not read off
               * apparelQuote.quantity: on a cart the latter is the FIRST
               * garment's count, which is how the estimate bar once
               * described a 42-piece order as "24 × Basic Tee".
               */
              <ApparelMoney
                compact
                total={apparelPricing.total}
                unitPrice={apparelPricing.unitPrice}
              lines={apparelEach}
                quantity={runQuantity}
              />
            )}
          </>
        ) : (
          <>
            {/* One block per design, exactly as the signs branch above does.
                This used to render order.items[0] alone — so a two-design
                cart reviewed as "Quantity 100" when the run was 200, with
                the second design invisible on the screen whose heading says
                "Check everything before submitting". */}
            {order.items.map((item, index) => (
              <div
                key={item.id}
                className={
                  index === 0
                    ? "space-y-3"
                    : "space-y-3 border-t border-[var(--rule-faint)] pt-3"
                }
              >
                {order.items.length > 1 && (
                  <p className="spec text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-black)]">
                    Design {String(index + 1).padStart(2, "0")}
                  </p>
                )}

                {(
                  [
                    ["Sticker", `${item.size} • ${item.shape}`],
                    ["Quantity", item.quantity.toLocaleString()],
                    ["Sticker Type", item.material],
                    ["Artwork", item.artwork.file?.name || "Not uploaded"],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span>{label}</span>
                    <span className="text-right font-bold text-[var(--ink-black)]">
                      {value}
                    </span>
                  </div>
                ))}

                <CodeRow code={decalSku(index, order.items.length)} />
              </div>
            ))}

            {/* Tax-inclusive, from the one derivation in lib/tax. This card
                and the confirmation screen both showed the pre-tax figure
                while the Order Summary below showed the taxed one — three
                surfaces, two numbers, on the screen before a payable link. */}
            <div className="flex justify-between gap-4">
              <span>{stickerTotals.estimatedTax > 0 ? "Estimated total" : "Estimate"}</span>
              <span className="text-right font-bold text-[var(--gorilla-green)]">
                ${stickerTotals.estimatedTotal.toFixed(2)}
              </span>
            </div>
          </>
        )}

        <div className="border-t border-[var(--rule)] pt-3">
          {/* Apparel only. This row reads order.artwork — the order-level
              slot, which sticker uploads never write (so every sticker cart
              reviewed as "Artwork: Not uploaded" with its files attached)
              and signs overwrite on each upload (so a two-design quote named
              the LAST file as the artwork for both). Those two flows now
              name each design's file in its own rows above; apparel really
              is single-file and keeps the slot. */}
          {isApparelSelected && (
            <div className="mb-3 flex justify-between gap-4">
              <span>Artwork</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
                {order.artwork.file?.name || "Not uploaded"}
              </span>
            </div>
          )}

          <div className="mt-3 flex justify-between gap-4">
            <span>Needed By</span>
            <span className="text-right font-bold text-[var(--ink-black)]">
              {order.production.needBy || "Not entered"}
            </span>
          </div>

          <div className="mt-3 flex justify-between gap-4">
            <span>Customer</span>
            <span className="text-right font-bold text-[var(--ink-black)]">
              {order.customer.customerName || "Not entered"}
            </span>
          </div>

          <div className="mt-3 flex justify-between gap-4">
            <span>Email</span>
            <span className="text-right font-bold text-[var(--ink-black)]">
              {order.customer.email || "Not entered"}
            </span>
          </div>

          {/* Read-only. Sits with the other confirmations so the extra items
              are visible before the customer commits, not just after. */}
          {(order.addOns.length > 0 || order.addOnsNote.trim()) && (
            <div className="mt-3 flex justify-between gap-4">
              <span>Also asking about</span>
              <span className="text-right font-bold text-[var(--ink-black)]">
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
        <p className="mt-5 bg-[var(--surface-ok)] p-4 text-fine font-bold text-[var(--gorilla-green)]">
          Everything required is complete. This quote is ready to submit.
        </p>
      ) : (
        <p className="mt-5 bg-[var(--surface-warn)] p-4 text-fine font-bold leading-6 text-[var(--ink-muted)]">
          Complete the required info below before submitting.
        </p>
      )}
    </div>
  );
}
