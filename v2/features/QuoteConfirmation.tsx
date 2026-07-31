"use client";

import Header from "../components/Header";
import type { Order } from "../types/order";
import type { ApparelQuote } from "../lib/apparel";
import type { ApparelPricingResult } from "../lib/apparel-pricing";
import type { QuoteConfirmation, SsCatalogColor } from "./types";
import {
  getSignProduct,
  getSignSizeLabel,
  type SignsQuote,
} from "../lib/signs";

type Props = {
  quoteConfirmation: QuoteConfirmation | null;
  order: Order;
  isApparelSubmitted: boolean;
  isSignsSubmitted: boolean;
  signsQuote: SignsQuote;
  /** Null when the signs job could not be priced online. */
  signsTotal: number | null;
  apparelQuote: ApparelQuote;
  selectedGarmentLabel: string;
  selectedSsColor: SsCatalogColor | null;
  apparelPricing: ApparelPricingResult;
  unitPrice: number;
  copyStatus: "idle" | "copied" | "error";
  emailHref: string;
  onCopy: () => void;
  onStartNew: () => void;
  onBackToBuilder: () => void;
};

export default function QuoteConfirmationScreen({
  quoteConfirmation,
  order,
  isApparelSubmitted,
  isSignsSubmitted,
  signsQuote,
  signsTotal,
  apparelQuote,
  selectedGarmentLabel,
  selectedSsColor,
  apparelPricing,
  unitPrice,
  copyStatus,
  emailHref,
  onCopy,
  onStartNew,
  onBackToBuilder,
}: Props) {
  return (
    <main className="min-h-screen bg-[#F8F5EE]">
      <Header />

      <div className="mx-auto grid min-h-[80vh] max-w-5xl place-items-center px-4 py-10 sm:px-8 sm:py-16">
        <div className="w-full rounded-[2rem] border border-[#dfd0b8] bg-white p-6 shadow-xl sm:p-10">
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#2E5037] text-4xl text-white">
              ✓
            </div>

            <p className="mt-8 text-sm font-black uppercase tracking-[0.2em] text-[#b7352d]">
              Quote Received
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] text-[#171717] sm:text-5xl">
              Your request was sent to Gorilla Salem.
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#6f695e]">
              We received your quote request. Gorilla Salem will review your artwork,
              timeline, and details before production.
            </p>
          </div>

          <div className="mt-8 rounded-[2rem] bg-[#F8F5EE] p-6 text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6f695e]">
              Quote Number
            </p>

            <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-[#2E5037] sm:text-4xl">
              {quoteConfirmation?.quoteNumber || "Pending"}
            </p>

            <p className="mt-2 text-sm font-bold text-[#6f695e]">
              Submitted{" "}
              {quoteConfirmation?.receivedAt
                ? new Date(quoteConfirmation.receivedAt).toLocaleString()
                : "just now"}
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-[#dfd0b8] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b7352d]">
                Customer
              </p>

              <p className="mt-2 text-lg font-black text-[#171717]">
                {order.customer.customerName}
              </p>

              <p className="mt-1 text-sm font-bold text-[#6f695e]">
                {order.customer.email}
              </p>

              {order.customer.company && (
                <p className="mt-1 text-sm font-bold text-[#6f695e]">
                  {order.customer.company}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-[#dfd0b8] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b7352d]">
                {isApparelSubmitted
                  ? "Apparel Details"
                  : isSignsSubmitted
                  ? "Signs Details"
                  : "Sticker Details"}
              </p>

              {isSignsSubmitted ? (
                <>
                  <p className="mt-2 text-lg font-black text-[#171717]">
                    {signsQuote.quantity.toLocaleString()}{" "}
                    {getSignProduct(signsQuote.productId).label}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    {getSignSizeLabel(signsQuote)} • {signsQuote.material}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    {signsQuote.finishing} •{" "}
                    {signsQuote.doubleSided ? "Double-sided" : "Single-sided"}
                  </p>
                </>
              ) : isApparelSubmitted ? (
                <>
                  <p className="mt-2 text-lg font-black text-[#171717]">
                    {apparelQuote.quantity.toLocaleString()}{" "}
                    {selectedGarmentLabel}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    {selectedSsColor?.colorName || apparelQuote.garmentColor} •{" "}
                    {apparelQuote.inkColors}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    {apparelQuote.printLocations.join(", ")}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-lg font-black text-[#171717]">
                    {order.product.quantity.toLocaleString()} stickers
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    {order.product.size} • {order.product.shape}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    {order.product.material}
                  </p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[#dfd0b8] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b7352d]">
                Estimate
              </p>

              {isSignsSubmitted ? (
                signsTotal !== null ? (
                  <>
                    <p className="mt-2 text-3xl font-black text-[#171717]">
                      ${signsTotal.toFixed(2)}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#6f695e]">
                      Estimate — confirmed before production
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-2xl font-black text-[#171717]">
                      Quoted by hand
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#6f695e]">
                      Gorilla Salem will reply with your price
                    </p>
                  </>
                )
              ) : isApparelSubmitted ? (
                <>
                  <p className="mt-2 text-3xl font-black text-[#171717]">
                    ${apparelPricing.total.toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    ${apparelPricing.unitPrice.toFixed(2)} each estimated
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    Final pricing reviewed by Gorilla Salem
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-black text-[#171717]">
                    ${order.pricing.total.toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#6f695e]">
                    ${unitPrice.toFixed(2)} each
                  </p>
                </>
              )}

              <p className="mt-1 text-sm font-bold text-[#6f695e]">
                Needed: {order.production.needBy || "Not entered"}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-[#fff7e8] p-5">
            <p className="text-sm font-bold leading-6 text-[#6f695e]">
              This is an estimate, not a final invoice. Gorilla Salem will
              confirm pricing, timeline, and artwork readiness before
              production starts.
            </p>

            <p className="mt-3 text-sm font-bold leading-6 text-[#6f695e]">
              Use Copy Quote Details as a backup, or click Open Gmail Draft to
              open a pre-filled Gmail compose window addressed to Gorilla Salem.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onCopy}
              className="rounded-2xl border border-[#2E5037] bg-white px-6 py-4 font-black text-[#2E5037] transition hover:bg-[#F8F5EE]"
            >
              Copy Quote Details
            </button>

            <a
              href={emailHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl bg-[#b7352d] px-6 py-4 text-center font-black text-white transition hover:bg-[#982c25]"
            >
              Open Gmail Draft
            </a>

            <button
              type="button"
              onClick={onStartNew}
              className="rounded-2xl bg-[#2E5037] px-6 py-4 font-black text-white transition hover:bg-[#24402c]"
            >
              Start New Quote
            </button>
          </div>

          {copyStatus === "copied" && (
            <p className="mt-3 text-center text-sm font-black text-[#2E5037]">
              Quote details copied to your clipboard.
            </p>
          )}
          {copyStatus === "error" && (
            <p className="mt-3 text-center text-sm font-bold text-[#b7352d]">
              Couldn&apos;t copy automatically — use Open Gmail Draft instead.
            </p>
          )}

          <button
            type="button"
            onClick={onBackToBuilder}
            className="mt-4 w-full rounded-2xl bg-[#F8F5EE] px-8 py-4 font-black text-[#6f695e] transition hover:bg-[#efe4d4]"
          >
            Back to Builder
          </button>
        </div>
      </div>
    </main>
  );
}
