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
    <main className="min-h-screen bg-[var(--shirt-blank)]">
      <Header />

      <div className="mx-auto grid min-h-[80vh] max-w-5xl place-items-center px-4 py-10 sm:px-8 sm:py-16">
        <div className="w-full border border-[var(--rule)] bg-white p-6 sm:p-10">
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center bg-[var(--gorilla-green)] text-4xl text-white">
              ✓
            </div>

            <p className="mt-8 text-sm font-black uppercase tracking-[0.2em] text-[var(--rush-red)]">
              Quote Received
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] text-[var(--ink-black)] sm:text-5xl">
              Your request was sent to Gorilla Salem.
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[var(--ink-muted)]">
              We received your quote request. Gorilla Salem will review your artwork,
              timeline, and details before production.
            </p>
          </div>

          <div className="mt-8 bg-[var(--shirt-blank)] p-6 text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--ink-muted)]">
              Quote Number
            </p>

            <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--gorilla-green)] sm:text-4xl">
              {quoteConfirmation?.quoteNumber || "Pending"}
            </p>

            <p className="mt-2 text-sm font-bold text-[var(--ink-muted)]">
              Submitted{" "}
              {quoteConfirmation?.receivedAt
                ? new Date(quoteConfirmation.receivedAt).toLocaleString()
                : "just now"}
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className=" border border-[var(--rule)] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--rush-red)]">
                Customer
              </p>

              <p className="mt-2 text-lg font-black text-[var(--ink-black)]">
                {order.customer.customerName}
              </p>

              <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                {order.customer.email}
              </p>

              {order.customer.company && (
                <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                  {order.customer.company}
                </p>
              )}
            </div>

            <div className=" border border-[var(--rule)] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--rush-red)]">
                {isApparelSubmitted
                  ? "Apparel Details"
                  : isSignsSubmitted
                  ? "Signs Details"
                  : "Sticker Details"}
              </p>

              {isSignsSubmitted ? (
                <>
                  <p className="mt-2 text-lg font-black text-[var(--ink-black)]">
                    {signsQuote.quantity.toLocaleString()}{" "}
                    {getSignProduct(signsQuote.productId).label}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                    {getSignSizeLabel(signsQuote)} • {signsQuote.material}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                    {signsQuote.finishing} •{" "}
                    {signsQuote.doubleSided ? "Double-sided" : "Single-sided"}
                  </p>
                </>
              ) : isApparelSubmitted ? (
                <>
                  <p className="mt-2 text-lg font-black text-[var(--ink-black)]">
                    {apparelQuote.quantity.toLocaleString()}{" "}
                    {selectedGarmentLabel}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                    {selectedSsColor?.colorName || apparelQuote.garmentColor} •{" "}
                    {apparelQuote.inkColors}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                    {apparelQuote.printLocations.join(", ")}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-lg font-black text-[var(--ink-black)]">
                    {order.product.quantity.toLocaleString()} stickers
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                    {order.product.size} • {order.product.shape}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                    {order.product.material}
                  </p>
                </>
              )}
            </div>

            <div className=" border border-[var(--rule)] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--rush-red)]">
                Estimate
              </p>

              {isSignsSubmitted ? (
                signsTotal !== null ? (
                  <>
                    <p className="mt-2 text-3xl font-black text-[var(--ink-black)]">
                      ${signsTotal.toFixed(2)}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                      Estimate — confirmed before production
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-2xl font-black text-[var(--ink-black)]">
                      Quoted by hand
                    </p>
                    <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                      Gorilla Salem will reply with your price
                    </p>
                  </>
                )
              ) : isApparelSubmitted ? (
                <>
                  <p className="mt-2 text-3xl font-black text-[var(--ink-black)]">
                    ${apparelPricing.total.toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                    ${apparelPricing.unitPrice.toFixed(2)} each estimated
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                    Final pricing reviewed by Gorilla Salem
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-black text-[var(--ink-black)]">
                    ${order.pricing.total.toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                    ${unitPrice.toFixed(2)} each
                  </p>
                </>
              )}

              <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                Needed: {order.production.needBy || "Not entered"}
              </p>
            </div>
          </div>

          <div className="mt-6 bg-[var(--surface-warn)] p-5">
            <p className="text-sm font-bold leading-6 text-[var(--ink-muted)]">
              This is an estimate, not a final invoice. Gorilla Salem will
              confirm pricing, timeline, and artwork readiness before
              production starts.
            </p>

            <p className="mt-3 text-sm font-bold leading-6 text-[var(--ink-muted)]">
              Use Copy Quote Details as a backup, or click Open Gmail Draft to
              open a pre-filled Gmail compose window addressed to Gorilla Salem.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={onCopy}
              className=" border border-[var(--gorilla-green)] bg-white px-6 py-4 font-black text-[var(--gorilla-green)] transition hover:bg-[var(--shirt-blank)]"
            >
              Copy Quote Details
            </button>

            <a
              href={emailHref}
              target="_blank"
              rel="noopener noreferrer"
              className=" bg-[var(--rush-red)] px-6 py-4 text-center font-black text-white transition hover:bg-[var(--rush-red-dark)]"
            >
              Open Gmail Draft
            </a>

            <button
              type="button"
              onClick={onStartNew}
              className=" bg-[var(--gorilla-green)] px-6 py-4 font-black text-white transition hover:bg-[var(--gorilla-green-dark)]"
            >
              Start New Quote
            </button>
          </div>

          {copyStatus === "copied" && (
            <p className="mt-3 text-center text-sm font-black text-[var(--gorilla-green)]">
              Quote details copied to your clipboard.
            </p>
          )}
          {copyStatus === "error" && (
            <p className="mt-3 text-center text-sm font-bold text-[var(--rush-red)]">
              Couldn&apos;t copy automatically — use Open Gmail Draft instead.
            </p>
          )}

          <button
            type="button"
            onClick={onBackToBuilder}
            className="mt-4 w-full bg-[var(--shirt-blank)] px-8 py-4 font-black text-[var(--ink-muted)] transition hover:bg-[var(--shirt-blank)]"
          >
            Back to Builder
          </button>
        </div>
      </div>
    </main>
  );
}
