"use client";

import { useEffect, useState } from "react";

import { DEALS, dealHref, dealPrice, liveDeals, type Deal } from "../lib/deals";
import { shopTodayIso } from "../lib/hoodie-special";

/**
 * The deal cards, every one in the same layout so they scan alike (Gabe,
 * 2026-11-23: "plain to understand and visually understand and read"):
 * name, the one price, then what you get, quantity, print and what you add.
 *
 * Client-side only so an ended deal drops off on the day it ends: the page
 * is static, and a date read at build time would keep showing it until the
 * next deploy.
 */
export default function DealsList() {
  const [deals, setDeals] = useState<readonly Deal[]>(DEALS);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of the shop's clock on mount
    setDeals(liveDeals(shopTodayIso()));
  }, []);

  return (
    <ul className="mt-10 grid gap-6 sm:grid-cols-2">
      {deals.map((deal) => (
        <li
          key={deal.id}
          data-testid={`deal-${deal.id}`}
          className="flex flex-col border border-[var(--rule)] bg-[var(--paper)] p-6"
        >
          <h2 className="text-head font-bold tracking-display text-[var(--ink-black)]">
            {deal.title}
          </h2>
          <p
            className={
              deal.price === null && !deal.priceText
                ? "mt-2 text-value font-bold text-[var(--ink-muted)]"
                : deal.priceText
                ? "mt-2 text-value font-bold text-[var(--gorilla-green)]"
                : "mt-2 flex flex-wrap items-baseline gap-x-3 text-section font-bold tracking-display text-[var(--gorilla-green)]"
            }
          >
            <span data-testid="deal-price">{dealPrice(deal)}</span>
            {/* Both prices (Gabe, 2026-11-23): the regular one struck through. */}
            {deal.price !== null && deal.regularPrice !== null && (
              <span className="text-value font-medium text-[var(--ink-muted)]">
                <span className="sr-only">Regular price </span>
                <s data-testid="deal-regular">${deal.regularPrice.toFixed(2)}</s>
              </span>
            )}
          </p>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-fine">
            <Row label="You get" value={deal.item} />
            <Row label="Quantity" value={deal.quantity} />
            <Row label="Print" value={deal.print} />
            <Row label="You add" value={deal.youAdd} />
            {deal.endsOn && <Row label="Order by" value={formatDay(deal.endsOn)} />}
          </dl>

          {deal.how === "order" ? (
            <a
              href={dealHref(deal)}
              className="mt-6 inline-block self-start border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-5 py-3 text-body font-bold text-[var(--paper)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--gorilla-green-dark)]"
            >
              Start this deal
            </a>
          ) : (
            <p className="mt-6 text-fine font-medium text-[var(--ink-muted)]">
              Ordering opens soon.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
        {label}
      </dt>
      <dd className="text-[var(--ink-black)]">{value}</dd>
    </>
  );
}

function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}
