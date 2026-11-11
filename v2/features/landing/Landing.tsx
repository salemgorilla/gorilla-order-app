"use client";

import { QUOTE_RUN, buildOfferings, turnaroundFacts, type Offering } from "../../lib/landing";
import { SHOP } from "../../lib/shop";
import Specimen from "./Specimen";

/**
 * THE FRONT DOOR — everything on the shelf, once, as thumbs.
 *
 * Gabe, 2026-11-11: a new landing page for the app, in the Republic register
 * (cold, dense, grid, spec furniture), that gets an instant quote started,
 * builds trust, and "shows the full line of offerings on one page, as thumbs".
 * It is the existing system, not a new one: Order Desk inks, Space Grotesk and
 * JetBrains Mono, radius 0, hairlines and no shadows (see app/globals.css).
 *
 * ── THE HELD CONSTRAINT ───────────────────────────────────────────────────
 * Every cell on this page is a PRINT TICKET: a hairline frame, a mono code
 * strip across the top, the thing itself, one line of values. Nothing is laid
 * out by whitespace alone; the grid is the structure and it is visible, built
 * from 1px rules between cells rather than a gap between cards.
 *
 * ── NO INVENTED FURNITURE ─────────────────────────────────────────────────
 * A code, a price or a date on this page points at something real: the offer
 * codes are the shop's shorthand, every `from` figure and every time promise
 * is read from the config that bills (lib/landing.ts), and the provenance is
 * lib/shop.ts. There are no photographs on it because the shop has not
 * supplied any: the drawings (./Specimen) are labelled as what they are, and a
 * "real work" gallery is added when the shop supplies photographs, rather than
 * by dressing up a stock image.
 *
 * ── HOW A CLICK BEHAVES ───────────────────────────────────────────────────
 * Choosing a thumb runs the SAME selection the product card runs
 * (`onSelect(productId)` -> selectProduct in app/page.tsx), so the picker
 * below, the step bar and the analytics event all behave exactly as if the
 * customer had clicked the card. This page changes nothing about checkout.
 */

type Props = {
  /** Select a product by its productCategories id, then bring the customer to the form. */
  onSelect: (productId: Offering["productId"]) => void;
  /** Scroll to the picker without choosing anything. */
  onStart: () => void;
};

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gorilla-green)]";

function Cell({ offering, onSelect }: { offering: Offering; onSelect: Props["onSelect"] }) {
  return (
    <li className="bg-[var(--paper)]">
      <button
        type="button"
        onClick={() => onSelect(offering.productId)}
        data-offering={offering.code}
        className={`group flex h-full min-h-[44px] w-full cursor-pointer flex-col text-left transition-colors duration-[120ms] ease-linear hover:bg-[var(--ink-black)] hover:text-[var(--paper)] ${focus}`}
      >
        {/* The code strip: a ticket's header row. */}
        <span className="spec flex items-center justify-between border-b border-[var(--rule-faint)] px-3 py-1.5 text-spec uppercase tracking-eyebrow text-[var(--ink-muted)] group-hover:border-[var(--ink-muted)] group-hover:text-[var(--paper)]">
          <span>{offering.code}</span>
          <span>{offering.how === "price" ? "Instant price" : "Hand quote"}</span>
        </span>

        <span className="block aspect-[3/2] w-full px-4 pt-3 text-[var(--ink-black)] group-hover:text-[var(--paper)]">
          <Specimen kind={offering.specimen} />
        </span>

        <span className="mt-auto block px-3 pb-3 pt-2">
          <span className="block text-body font-bold leading-tight">{offering.name}</span>
          <span className="spec mt-1 block text-spec leading-snug text-[var(--ink-muted)] group-hover:text-[var(--paper)]">
            {offering.spec}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * EMPTY SLOTS, SO THE LAST ROW CLOSES.
 *
 * The grid is the rule colour showing through 1px gaps, which means a last row
 * with fewer cells than columns would show a solid block of rule colour where
 * the missing cells should be. The column count changes with the viewport and
 * the offering count changes with the shop, so the empty slots are worked out
 * for each breakpoint and shown or hidden to match. The class names are
 * written out in full because Tailwind finds classes by reading the source.
 */
const COLUMNS = { base: 2, sm: 3, lg: 4, xl: 5 } as const;

function emptySlots(count: number): string[] {
  const need = (cols: number) => (cols - (count % cols)) % cols;
  const most = Math.max(...Object.values(COLUMNS).map(need));

  return Array.from({ length: most }, (_, i) => {
    const show = (cols: number) => i < need(cols);

    return [
      show(COLUMNS.base) ? "block" : "hidden",
      show(COLUMNS.sm) ? "sm:block" : "sm:hidden",
      show(COLUMNS.lg) ? "lg:block" : "lg:hidden",
      show(COLUMNS.xl) ? "xl:block" : "xl:hidden",
    ].join(" ");
  });
}

export default function Landing({ onSelect, onStart }: Props) {
  const offerings = buildOfferings();
  const times = turnaroundFacts();

  return (
    <div className="mb-10 flex flex-col gap-10">
      {/* ── THE LINE ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="line-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <h2
            id="line-heading"
            className="text-head font-bold tracking-display text-[var(--ink-black)]"
          >
            Everything we make
          </h2>
          <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
            {offerings.length} items &middot; choose one to start
          </p>
        </div>

        {/* The rules ARE the grid: the container is the rule colour and the
            cells sit on it 1px apart, so a hairline is drawn once between
            neighbours and never doubled, at any column count. */}
        <ul className="grid grid-cols-2 gap-px border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {offerings.map((offering) => (
            <Cell key={offering.code} offering={offering} onSelect={onSelect} />
          ))}
          {emptySlots(offerings.length).map((visibility, i) => (
            <li key={`empty-${i}`} aria-hidden="true" className={`bg-[var(--paper)] ${visibility}`} />
          ))}
        </ul>

        <p className="spec mt-3 text-spec text-[var(--ink-muted)]">
          Priced online means the number you see is the number on the invoice.
          Hand quote means we reply with a price, usually the next business day.
        </p>
      </section>

      {/* ── HOW A QUOTE RUNS ─────────────────────────────────────────────── */}
      <section aria-labelledby="run-heading">
        <h2
          id="run-heading"
          className="mb-3 text-head font-bold tracking-display text-[var(--ink-black)]"
        >
          How a quote runs
        </h2>

        <ol className="grid grid-cols-1 gap-px border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2 lg:grid-cols-5">
          {QUOTE_RUN.map((row) => (
            <li key={row.n} className="bg-[var(--paper)] p-4">
              <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
                {row.n} / {String(QUOTE_RUN.length).padStart(2, "0")}
              </p>
              <p className="mt-2 text-body font-bold">{row.step}</p>
              <p className="mt-1 text-fine font-medium leading-5 text-[var(--ink-muted)]">
                {row.artefact}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── THE TERMS ────────────────────────────────────────────────────── */}
      <section aria-labelledby="terms-heading">
        <h2
          id="terms-heading"
          className="mb-3 text-head font-bold tracking-display text-[var(--ink-black)]"
        >
          Time and payment
        </h2>

        <div className="grid grid-cols-1 gap-px border border-[var(--rule)] bg-[var(--rule)] md:grid-cols-3">
          {times.map((row) => (
            <div key={row.products} className="bg-[var(--paper)] p-4">
              <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
                Turnaround
              </p>
              <p className="mt-2 text-body font-bold first-letter:uppercase">{row.products}</p>
              <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">{row.promise}</p>
            </div>
          ))}
          <div className="bg-[var(--paper)] p-4">
            <p className="spec text-spec uppercase tracking-eyebrow text-[var(--ink-muted)]">
              Payment
            </p>
            <p className="mt-2 text-body font-bold">Card, or bank transfer</p>
            <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
              Every price is the price. Pay by bank transfer and we refund the
              3% in it once it clears.
            </p>
          </div>
        </div>
      </section>

      {/* ── PROVENANCE + THE WAY IN ──────────────────────────────────────── */}
      <section
        aria-label="The shop"
        className="flex flex-col items-start justify-between gap-4 border border-[var(--rule)] bg-[var(--ink-black)] p-5 text-[var(--paper)] sm:flex-row sm:items-center"
      >
        <p className="spec text-spec uppercase leading-relaxed tracking-eyebrow">
          {SHOP.name} &middot; est. {SHOP.established} &middot; {SHOP.street},{" "}
          {SHOP.city} {SHOP.stateCode}
          <br />
          Proof before print, every order
        </p>

        <button
          type="button"
          onClick={onStart}
          className={`min-h-[44px] cursor-pointer border border-[var(--paper)] bg-[var(--paper)] px-6 py-3 text-body font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--ink-black)] hover:text-[var(--paper)] active:translate-x-[2px] active:translate-y-[2px] ${focus}`}
        >
          Start a quote
        </button>
      </section>
    </div>
  );
}
