import type { Metadata } from "next";

import { toPublicQuote, isValidQuoteToken } from "../../../../lib/quote-link";
import { viewLink } from "../../../../lib/quote-link-service";
import { liveDeps } from "../../../../lib/quote-link-runtime";
import { isQuoteLinkStoreConfigured } from "../../../../lib/quote-link-blob";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Thank you - Gorilla Printing",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ThanksPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link =
    isValidQuoteToken(token) && isQuoteLinkStoreConfigured()
      ? await viewLink(liveDeps(), token)
      : null;

  if (!link) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <p className="text-body">This link isn&apos;t working. Please contact Gorilla Printing.</p>
      </main>
    );
  }

  const quote = toPublicQuote(link);
  const paid = quote.status === "paid";

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="border border-[var(--rule)] bg-[var(--paper)] p-6">
        <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
          Order #{quote.orderNumber}
        </p>
        <h1 className="mt-2 text-head font-bold tracking-display">
          {paid ? "Payment received. Thank you!" : "Almost done."}
        </h1>
        <p className="mt-3 text-body text-[var(--ink-muted)]">
          {paid
            ? "We'll get your order into production. Your receipt is on its way from our card processor."
            : quote.status === "payment_started"
            ? "We're confirming your payment. Refresh this page in a minute. If you closed the payment page without paying, go back to your quote."
            : "We'll be in touch about payment."}
        </p>
        <a
          href={`/q/${token}`}
          className="mt-5 inline-flex min-h-[44px] items-center border border-[var(--ink-black)] px-4 font-bold"
        >
          Back to your quote
        </a>
      </div>
    </main>
  );
}
