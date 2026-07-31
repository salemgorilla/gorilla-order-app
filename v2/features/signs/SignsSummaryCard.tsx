"use client";

import { getSignProduct, getSignSizeLabel, type SignsQuote } from "../../lib/signs";
import type { Production } from "../../types/order";

type Props = {
  signsQuote: SignsQuote;
  production: Production;
};

export default function SignsSummaryCard({ signsQuote, production }: Props) {
  const product = getSignProduct(signsQuote.productId);

  const rows: [string, string][] = [
    ["Product", product.label],
    ["Quantity", signsQuote.quantity.toLocaleString()],
    ["Size", getSignSizeLabel(signsQuote)],
    ["Material", signsQuote.material],
    ["Finishing", signsQuote.finishing],
    ["Sides", signsQuote.doubleSided ? "Double-sided" : "Single-sided"],
    [
      "Delivery",
      production.deliveryMethod === "Ship" ? "Ship" : "Local Pickup",
    ],
  ];

  return (
    <div className="rounded-[2rem] border border-[#dfd0b8] bg-white p-6 shadow-xl">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#b7352d]">
        Signs Summary
      </p>

      <div className="mt-5 space-y-3 text-sm font-bold text-[#6f695e]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <span>{label}</span>
            <span className="text-right text-[#171717]">{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-[#fff7e8] p-4">
        <p className="text-sm font-black text-[#171717]">
          Priced by hand — no online estimate yet.
        </p>
        <p className="mt-2 text-sm font-bold leading-6 text-[#6f695e]">
          Sign pricing depends on size, material, and finishing, so Gorilla
          Salem prices each job directly. Send this request and we&apos;ll reply
          with your price.
        </p>
      </div>
    </div>
  );
}
