import type { Metadata } from "next";

import Header from "../../components/Header";
import DealsList from "../../components/DealsList";
import { DEAL_PAYMENT_TERMS } from "../../lib/deal-payment";

export const metadata: Metadata = {
  title: "Deals — Gorilla Labs | Gorilla Salem",
  description: "Gorilla Salem's current print deals.",
};

/**
 * The deals page (Gabe, 2026-11-23). What it lists lives in lib/deals.ts;
 * this page only lays it out, in whatever seasonal colours are on.
 */
export default function DealsPage() {
  return (
    <main className="min-h-screen bg-[var(--shirt-blank)]">
      <Header />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8 sm:py-14">
        <p className="eyebrow">Black Friday</p>
        <h1 className="mt-2 text-hero font-bold tracking-display text-[var(--ink-black)]">
          Deals
        </h1>
        <p className="mt-3 max-w-2xl text-lede text-[var(--ink-muted)]">
          Printed on Canal Street, at a better price for a little while.
        </p>
        {/* Gabe, 2026-11-23: say up top that these are all fixed. */}
        <p className="mt-4 max-w-2xl border-l-4 border-[var(--gorilla-green)] pl-4 text-body font-bold text-[var(--ink-black)]">
          Every deal is a set quantity at a set price. Just add your art and sizes.{" "}
          {DEAL_PAYMENT_TERMS}
        </p>
        <DealsList />
      </div>
    </main>
  );
}
