"use client";

import { useEffect, useState } from "react";

import { DEALS, dealHref, liveDeals, type Deal } from "../lib/deals";
import { shopTodayIso } from "../lib/hoodie-special";
import { SHOP } from "../lib/shop";

const HOW: Record<Deal["how"], { button: string; note: string }> = {
  order: { button: "Start this deal", note: "Priced for you as you build it." },
  estimate: {
    button: "Start a tee quote",
    note: "Your estimate shows our regular price. We take the deal off when we confirm it with you.",
  },
  ask: { button: "Email us to claim it", note: "We'll reply with a proof and an invoice." },
  soon: { button: "", note: "Details are on the way. Check back soon." },
};

/**
 * The deal cards. Client-side only so an ended deal drops off on the day it
 * ends: the page is static, and a date read at build time would keep
 * showing it until the next deploy.
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
          <p className="mt-2 text-value font-bold text-[var(--gorilla-green)]">{deal.price}</p>
          <ul className="mt-4 space-y-1 text-fine text-[var(--ink-muted)]">
            {deal.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {deal.endsOn && (
              <li className="spec">Order by {formatDay(deal.endsOn)}</li>
            )}
          </ul>
          <p className="mt-4 text-fine font-medium text-[var(--ink-muted)]">{HOW[deal.how].note}</p>
          {deal.how !== "soon" && (
          <a
            href={dealHref(deal, SHOP.email)}
            className="mt-5 inline-block self-start border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] px-5 py-3 text-body font-bold text-[var(--paper)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--gorilla-green-dark)]"
          >
            {HOW[deal.how].button}
          </a>
          )}
        </li>
      ))}
    </ul>
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
