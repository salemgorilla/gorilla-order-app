"use client";

import { getSignProduct, getSignSizeLabel, type SignsQuote } from "../../lib/signs";
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
    <div className="rounded-[2rem] border border-[var(--rule)] bg-white p-6 shadow-xl">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--rush-red)]">
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
          <div className="mt-5 rounded-2xl bg-[var(--surface-ok)] p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--gorilla-green)]">
              Estimated Pricing
            </p>

            <div className="mt-4 space-y-2 text-sm font-bold text-[var(--ink-muted)]">
              {pricing.lines
                .filter((l) => l.amount !== 0)
                .map((l) => (
                  <div key={l.label} className="flex justify-between gap-4">
                    <span>{l.label}</span>
                    <span className="text-right text-[var(--ink-black)]">
                      ${l.amount.toFixed(2)}
                    </span>
                  </div>
                ))}

              <div className="border-t border-[var(--rule)] pt-3">
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ink-black)]">
                    {pricing.hasQuotedExtras
                      ? "Estimated From"
                      : "Estimated Total"}
                  </span>
                  <span className="text-right text-xl font-black text-[var(--gorilla-green)]">
                    {pricing.hasQuotedExtras ? "from " : ""}$
                    {pricing.total.toFixed(2)}
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
            <div className="mt-3 rounded-2xl bg-[var(--shirt-blank)] p-4">
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

          <div className="mt-5 rounded-2xl bg-[var(--surface-warn)] p-4">
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
        <div className="mt-5 rounded-2xl bg-[var(--surface-warn)] p-4">
          <p className="text-sm font-black text-[var(--ink-black)]">
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
