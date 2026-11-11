"use client";

import { QUOTE_RUN, buildOfferings, buildPanels, turnaroundFacts, type Offering, type Panel } from "../../lib/landing";
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
 * Every cell below the panels is a PRINT TICKET: a hairline frame, a mono code
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

/**
 * ONE PANEL — a tall slab with the label set across its foot.
 *
 * "Something like this but with various products" (Gabe, 2026-11-11): five
 * full-height panels edge to edge, one per product family, a big centred label
 * on each. With a photograph (lib/landing-photos.ts) the picture fills the
 * panel; without one, the family's emblem sits on a flat field — never a stock
 * image. The label sits on a SOLID ink band rather than a fade (flat is ink;
 * a gradient is the effect this system does not use), and on hover the band
 * inverts, the same move as every tile below it.
 */
function PanelButton({ panel, onSelect }: { panel: Panel; onSelect: Props["onSelect"] }) {
  return (
    <li className="basis-[72%] shrink-0 snap-start sm:basis-0 sm:flex-1 sm:shrink">
      <button
        type="button"
        onClick={() => onSelect(panel.productId)}
        data-panel={panel.productId}
        className={`group relative flex aspect-[3/5] min-h-[380px] w-full cursor-pointer flex-col overflow-clip bg-[var(--ink-black)] text-left text-[var(--paper)] ${focus}`}
      >
        {panel.photo ? (
          // A photograph from the shop. Plain <img>: the files are committed,
          // sized for the panel, and next/image would add a loader for nothing.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={panel.photo.src}
            alt={panel.photo.alt}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-start justify-center bg-[var(--shirt-blank)] p-8 pt-10 text-[var(--ink-black)] [--knock:var(--shirt-blank)] sm:p-6 sm:pt-10 lg:p-10 lg:pt-12"
          >
            <span className="block aspect-square w-full max-w-[260px]">
              <Specimen kind={panel.emblem} />
            </span>
          </span>
        )}

        <span className="relative mt-auto block bg-[var(--ink-black)] px-3 pb-5 pt-6 text-center transition-colors duration-[120ms] ease-linear group-hover:bg-[var(--paper)] group-hover:text-[var(--ink-black)]">
          <span className="block text-[clamp(1.6rem,2.6vw,2.5rem)] font-bold uppercase leading-[1.02] tracking-display">
            {panel.lines[0]}
            <br />
            {panel.lines[1]}
          </span>
          <span className="spec mt-3 block text-spec leading-snug text-[var(--rule-faint)] group-hover:text-[var(--ink-muted)]">
            {panel.spec}
          </span>
        </span>
      </button>
    </li>
  );
}

function Cell({ offering, onSelect }: { offering: Offering; onSelect: Props["onSelect"] }) {
  return (
    <li className="bg-[var(--paper)]">
      <button
        type="button"
        onClick={() => onSelect(offering.productId)}
        data-offering={offering.code}
        // --knock is the colour the marks' cut-outs are drawn in. It is the
        // cell colour, and it flips with the cell on hover, so the knocked
        // details stay knocked out on the inverted tile (see ./Specimen).
        className={`group flex h-full min-h-[44px] w-full cursor-pointer flex-col text-left transition-colors duration-[120ms] ease-linear [--knock:var(--paper)] hover:bg-[var(--ink-black)] hover:text-[var(--paper)] hover:[--knock:var(--ink-black)] ${focus}`}
      >
        {/* The code strip: a ticket's header row. */}
        <span className="spec flex items-center justify-between border-b border-[var(--rule-faint)] px-3 py-1.5 text-spec uppercase tracking-eyebrow text-[var(--ink-muted)] group-hover:border-[var(--ink-muted)] group-hover:text-[var(--paper)]">
          <span>{offering.code}</span>
          <span>{offering.how === "price" ? "Instant price" : "Hand quote"}</span>
        </span>

        <span className="mx-auto block aspect-square w-full max-w-[150px] p-3 sm:max-w-[220px] sm:p-5 text-[var(--ink-black)] group-hover:text-[var(--paper)]">
          <Specimen kind={offering.specimen} />
        </span>

        <span className="mt-auto block min-h-[6.75rem] sm:min-h-[5.25rem] border-t border-[var(--rule-faint)] px-3 pb-3 pt-2 group-hover:border-[var(--ink-muted)]">
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
  const panels = buildPanels();
  const times = turnaroundFacts();

  return (
    <div className="mb-10 flex flex-col gap-10">
      {/* ── THE FIVE FAMILIES, AS PANELS ─────────────────────────────────── */}
      {/* Pulled out to the container's edges so the row reads as one slab. On a
          phone it scrolls sideways, a panel and a bit at a time, so the next one
          is visibly there. */}
      <section aria-label="What we print" className="-mx-4 sm:-mx-8">
        <ul className="flex snap-x snap-mandatory gap-px overflow-x-auto bg-[var(--rule)] sm:overflow-visible">
          {panels.map((panel) => (
            <PanelButton key={panel.productId} panel={panel} onSelect={onSelect} />
          ))}
        </ul>
      </section>

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
            {`${offerings.length} items`} &middot; choose one to start
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
