"use client";

import {
  getSignProduct,
  getSignSizeLabel,
  type SignsDesign,
  type SignsQuote,
} from "../../lib/signs";
import { SALES_TAX, getSignsTotals } from "../../lib/tax";
import type { SignsCartQuote } from "../../lib/signs-cart";
import type { Production } from "../../types/order";

type Props = {
  signsQuote: SignsQuote;
  production: Production;
  pricing: SignsCartQuote;
};

/** What one design IS, as the shop would read it back. */
function designRows(design: SignsDesign): [string, string][] {
  const product = getSignProduct(design.productId);

  return [
    ["Product", product.label],
    ["Quantity", design.quantity.toLocaleString()],
    ["Size", getSignSizeLabel(design)],
    ["Material", design.material],
    ["Finishing", design.finishing],
    ...(product.allowDoubleSided
      ? ([
          ["Sides", design.doubleSided ? "Double-sided" : "Single-sided"],
        ] as [string, string][])
      : []),
  ];
}

export default function SignsSummaryCard({
  signsQuote,
  production,
  pricing,
}: Props) {
  // One derivation, shared with the sticky estimate bar. See lib/tax.
  const signsTotals = getSignsTotals(pricing);

  const designs = signsQuote.designs;
  const isCart = designs.length > 1;

  const deliveryRow: [string, string] = [
    "Delivery",
    production.deliveryMethod === "Ship" ? "Ship" : "Local Pickup",
  ];

  // One design reads as a flat list, exactly as it always did. Several get a
  // heading each, because "Material: Coroplast" three times in a row with no
  // boundary is unreadable.
  const rows: [string, string][] = isCart
    ? [deliveryRow]
    : [...designRows(designs[0]), deliveryRow];

  return (
    <div className=" border border-[var(--rule)] bg-white p-6">
      <p className="eyebrow">
        Signs Summary
      </p>

      {isCart && (
        <div className="mt-5 space-y-5">
          {designs.map((design, index) => (
            <div
              key={design.id}
              className={
                index === 0
                  ? ""
                  : "border-t border-[var(--rule-faint)] pt-5"
              }
            >
              <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-black)]">
                Design {String(index + 1).padStart(2, "0")}
              </p>

              <div className="mt-3 space-y-3 text-fine font-medium text-[var(--ink-muted)]">
                {designRows(design).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span>{label}</span>
                    <span className="text-right font-bold text-[var(--ink-black)]">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* On a cart these are ORDER-level rows, and they sit directly under the
          last design's block. Without the rule and the label, "Delivery: Local
          Pickup" reads as design 2's delivery — which is a question that has
          no per-design answer. The whole order ships once. */}
      <div
        className={
          isCart
            ? "mt-5 border-t border-[var(--rule)] pt-5"
            : "mt-5"
        }
      >
        {isCart && (
          <p className="spec mb-3 text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
            Whole order
          </p>
        )}

        <div className="space-y-3 text-fine font-medium text-[var(--ink-muted)]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <span>{label}</span>
              <span className="text-right font-bold text-[var(--ink-black)]">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {pricing.priceable ? (
        <>
          <div className="mt-5 bg-[var(--surface-ok)] p-4">
            <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--gorilla-green)]">
              Estimated Pricing
            </p>

            <div className="mt-4 space-y-2 text-fine font-medium text-[var(--ink-muted)]">
              {pricing.lines
                .filter((l) => l.amount !== 0)
                .map((l) => (
                  <div key={l.label} className="flex justify-between gap-4">
                    <span>{l.label}</span>
                    {/* Credits are negative, so the sign goes before the
                        dollar: -$36.00, not $-36.00. */}
                    <span className="text-right font-bold text-[var(--ink-black)]">
                      {l.amount < 0 ? "-" : ""}$
                      {Math.abs(l.amount).toFixed(2)}
                    </span>
                  </div>
                ))}

              <div className="border-t border-[var(--rule)] pt-3">
                {/* Signs are taxable, like stickers — clothing is the only
                    exempt flow. This card showed a pre-tax total, so a signs
                    customer met 6.25% for the first time on the invoice, the
                    same gap the sticker review screen had. The base is the
                    goods: setup, finishing add-ons and rush are fees, and
                    fees are untaxed (Gabe, 2026-09-04). */}
                {signsTotals.estimatedTax > 0 && (
                  <div className="mb-1 flex justify-between gap-4">
                    <span>Estimated {SALES_TAX.label}</span>
                    <span className="text-right font-bold text-[var(--ink-black)]">
                      ${signsTotals.estimatedTax.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ink-black)]">
                    {pricing.hasQuotedExtras
                      ? "Estimated From"
                      : "Estimated Total"}
                  </span>
                  <span className="text-right text-lede font-bold text-[var(--gorilla-green)]">
                    {pricing.hasQuotedExtras ? "from " : ""}$
                    {signsTotals.estimatedTotal.toFixed(2)}
                  </span>
                </div>

                {/* Only when the quote holds ONE design.
                
                    Across a cart it is an average of unlike things: a quote
                    with a $162 banner and a $288 banner reported "$240.00
                    each", which is the price of neither. The sticker summary
                    already keys this on `order.items.length === 1` for the
                    same reason; signs keyed it on the SIGN count, which is a
                    different question. */}
                {pricing.designs.length === 1 && pricing.quantity > 1 && (
                  <div className="mt-1 flex justify-between gap-4">
                    <span>Estimated Each</span>
                    <span className="text-right font-bold text-[var(--ink-black)]">
                      ${pricing.unitPrice.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Yard signs price from a per-unit tier table, and at a tier
                boundary a smaller run used to cost MORE than a larger one —
                five signs were $127.50 while six were $93.00. The engine now
                charges the better of the two. Saying so here is the point:
                a total that quietly does not match the rate card reads as an
                error, and the customer is also owed the fact that they can
                have the extra signs for nothing. */}
            {/* The order minimum, said in words beside the line that
                carries it: a customer at $46 needs to know the $60 is a
                floor, not a mistake, and what would make it go away. */}
            {pricing.minimumApplied ? (
              <p className="mt-4 text-fine leading-5 text-[var(--ink-muted)]">
                {`${getSignProduct(designs[0].productId).family === "banners" ? "Banner" : "Sign"} orders start at $${pricing.minimumApplied}. Yours comes to $${(
                  pricing.total -
                  (pricing.lines.find((l) => l.kind === "minimum")?.amount ?? 0)
                ).toFixed(2)}, so it is priced at the minimum — adding to the order costs nothing until you pass it.`}
              </p>
            ) : null}
            {pricing.designs.map((entry, index) =>
              entry.pricing.pricedAtQuantity ? (
                <p
                  key={entry.id}
                  className="mt-4 text-fine leading-5 text-[var(--ink-muted)]"
                >
                  {isCart ? `Design ${index + 1}: p` : "P"}riced at our{" "}
                  {entry.pricing.pricedAtQuantity}-sign rate, because that
                  costs less than {designs[index].quantity} at the smaller-run
                  price. Ordering {entry.pricing.pricedAtQuantity} costs you
                  the same.
                </p>
              ) : null
            )}
          </div>

          {(pricing.suggestions?.length ?? 0) > 0 && (
            <div className="mt-3 bg-[var(--shirt-blank)] p-4">
              {pricing.suggestions?.map((s) => (
                <p
                  key={s}
                  className="text-fine font-bold leading-6 text-[var(--ink-black)]"
                >
                  {s}
                </p>
              ))}
            </div>
          )}

          <div className="mt-5 bg-[var(--surface-warn)] p-4">
            <p className="text-fine font-medium leading-6 text-[var(--ink-muted)]">
              {pricing.hasQuotedExtras
                ? "Some finishing you picked is quoted by hand, so this total is a starting point. "
                : ""}
              {pricing.note} This is an estimate — Gorilla Salem confirms
              artwork, finishing, and any add-ons before production.
            </p>
          </div>
        </>
      ) : (
        <div className="mt-5 bg-[var(--surface-warn)] p-4">
          <p className="text-fine font-bold text-[var(--ink-black)]">
            Priced by hand
          </p>
          <p className="mt-2 text-fine font-medium leading-6 text-[var(--ink-muted)]">
            {pricing.reason ||
              "Gorilla Salem will price this and reply with your quote."}
          </p>
        </div>
      )}
    </div>
  );
}
