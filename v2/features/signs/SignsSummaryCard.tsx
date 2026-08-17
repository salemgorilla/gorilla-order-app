"use client";

import { getSignProduct, getSignSizeLabel, type SignsQuote } from "../../lib/signs";
import { SALES_TAX, getSignsTotals } from "../../lib/tax";
import type { SignsPricingResult } from "../../lib/signs-pricing";
import type { Production } from "../../types/order";

type Props = {
  signsQuote: SignsQuote;
  production: Production;
  pricing: SignsPricingResult;
};

export default function SignsSummaryCard({
  signsQuote,
  production,
  pricing,
}: Props) {
  // One derivation, shared with the sticky estimate bar. See lib/tax.
  const signsTotals = getSignsTotals(pricing);

  const product = getSignProduct(signsQuote.productId);

  const rows: [string, string][] = [
    ["Product", product.label],
    ["Quantity", signsQuote.quantity.toLocaleString()],
    ["Size", getSignSizeLabel(signsQuote)],
    ["Material", signsQuote.material],
    ["Finishing", signsQuote.finishing],
    ...(product.allowDoubleSided
      ? ([
          ["Sides", signsQuote.doubleSided ? "Double-sided" : "Single-sided"],
        ] as [string, string][])
      : []),
    [
      "Delivery",
      production.deliveryMethod === "Ship" ? "Ship" : "Local Pickup",
    ],
  ];

  return (
    <div className=" border border-[var(--rule)] bg-white p-6">
      <p className="eyebrow">
        Signs Summary
      </p>

      <div className="mt-5 space-y-3 text-sm font-bold text-[var(--ink-muted)]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <span>{label}</span>
            <span className="text-right text-[var(--ink-black)]">{value}</span>
          </div>
        ))}
      </div>

      {pricing.priceable ? (
        <>
          <div className="mt-5 bg-[var(--surface-ok)] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--gorilla-green)]">
              Estimated Pricing
            </p>

            <div className="mt-4 space-y-2 text-sm font-bold text-[var(--ink-muted)]">
              {pricing.lines
                .filter((l) => l.amount !== 0)
                .map((l) => (
                  <div key={l.label} className="flex justify-between gap-4">
                    <span>{l.label}</span>
                    {/* Credits are negative, so the sign goes before the
                        dollar: -$36.00, not $-36.00. */}
                    <span className="text-right text-[var(--ink-black)]">
                      {l.amount < 0 ? "-" : ""}$
                      {Math.abs(l.amount).toFixed(2)}
                    </span>
                  </div>
                ))}

              <div className="border-t border-[var(--rule)] pt-3">
                {/* Signs are taxable, like stickers — clothing is the only
                    exempt flow. This card showed a pre-tax total, so a signs
                    customer met 6.25% for the first time on the invoice, the
                    same gap the sticker review screen had. Signs carry no
                    shipping component, so the whole total is the base. */}
                {signsTotals.estimatedTax > 0 && (
                  <div className="mb-1 flex justify-between gap-4">
                    <span>Estimated {SALES_TAX.label}</span>
                    <span className="text-right text-[var(--ink-black)]">
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

                {signsQuote.quantity > 1 && (
                  <div className="mt-1 flex justify-between gap-4">
                    <span>Estimated Each</span>
                    <span className="text-right text-[var(--ink-black)]">
                      ${pricing.unitPrice.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {(pricing.suggestions?.length ?? 0) > 0 && (
            <div className="mt-3 bg-[var(--shirt-blank)] p-4">
              {pricing.suggestions?.map((s) => (
                <p
                  key={s}
                  className="text-sm font-bold leading-6 text-[var(--ink-black)]"
                >
                  {s}
                </p>
              ))}
            </div>
          )}

          <div className="mt-5 bg-[var(--surface-warn)] p-4">
            <p className="text-sm font-bold leading-6 text-[var(--ink-muted)]">
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
          <p className="text-sm font-bold text-[var(--ink-black)]">
            Priced by hand
          </p>
          <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-muted)]">
            {pricing.reason ||
              "Gorilla Salem will price this and reply with your quote."}
          </p>
        </div>
      )}
    </div>
  );
}
