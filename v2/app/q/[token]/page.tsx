import type { Metadata } from "next";

import { toPublicQuote } from "../../../lib/quote-link";
import { viewLink } from "../../../lib/quote-link-service";
import { liveDeps } from "../../../lib/quote-link-runtime";
import { isQuoteLinkStoreConfigured } from "../../../lib/quote-link-blob";
import { isValidQuoteToken } from "../../../lib/quote-link";
import QuoteClient from "./QuoteClient";

export const dynamic = "force-dynamic";

// A private page: keep it out of search, and keep the token out of Referer.
export const metadata: Metadata = {
  title: "Your quote - Gorilla Printing",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function DeadLink() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="border border-[var(--rule)] bg-[var(--paper)] p-6">
        <h1 className="text-head font-bold tracking-display">This link isn&apos;t working</h1>
        <p className="mt-3 text-body text-[var(--ink-muted)]">
          It may have been replaced by a newer one. Call or email Gorilla Printing and
          we&apos;ll send you a fresh link.
        </p>
      </div>
    </main>
  );
}

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isValidQuoteToken(token) || !isQuoteLinkStoreConfigured()) return <DeadLink />;

  const link = await viewLink(liveDeps(), token);
  if (!link) return <DeadLink />;

  return <QuoteClient token={token} initial={toPublicQuote(link)} />;
}
