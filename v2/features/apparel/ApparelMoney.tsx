"use client";

/**
 * THE TWO FIGURES A GARMENT ORDER IS ABOUT.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Gabe, 2026-09-09: "For the apparel section, when the final cost and
 * breakdown of the quote, the price per item does not appear. I think that
 * should be very noticeable and highlighted."
 *
 * He is right twice over. On the REVIEW card — the screen headed "Check
 * everything before submitting", the last thing a customer reads before
 * pressing send — the per-piece figure was not there at all. And everywhere
 * it did appear it was furniture: `text-fine` muted, under a total four
 * times its size, in the same weight as "Needed By".
 *
 * That is backwards for this product. A team order is negotiated per shirt.
 * "What's it each?" is the question every customer asks and every shop
 * answers, and it is the number they carry to the next quote. The total is
 * what they pay; the each is what they DECIDE on.
 *
 * ── PEERS, NOT A HEADLINE AND A CAPTION ───────────────────────────────────
 * Both figures are the same size on purpose. Printing the each LARGER than
 * the total would be the mirror of the bug — a customer who reads $16.02 and
 * remembers $16.02 on a $384.52 order has been misled by a type scale. They
 * sit side by side, same step, same weight, each under its own label, and
 * the reader takes whichever one they came for.
 *
 * ── A CART GETS ONE FIGURE PER GARMENT ───────────────────────────────────
 * Gabe, 2026-09-09: "If there are two different items in the print run, they
 * each need the cost per item shown separately."
 *
 * The quote's `unitPrice` is total ÷ pieces — a weighted average. On 24 tees
 * and 12 hoodies it is $16.12, and every tee costs $10.43 while every hoodie
 * costs $27.50: a figure describing NEITHER garment, which a customer will
 * quote back at the shop. The sticker cart and the signs cart were both
 * fixed for this exact shape already.
 *
 * So when the garments differ, the blended each is not shown at all — each
 * garment states its own, from lib/apparel-per-line.ts. When they do not
 * differ (one garment, or two whose blanks cost the same) the single figure
 * is the honest one and the list would be noise.
 *
 * ── "EACH", NOT "PRICE" ───────────────────────────────────────────────────
 * Two constraints meet here. Apparel is an ESTIMATE, never a price — the
 * smoke test asserts the review card contains no "Price" — and "each" is
 * already the shop's own word on the sticker bar and the signs summary. So
 * the label is the one the rest of the app uses, and it happens to be the
 * one that stays true when the cart holds hoodies as well as tees.
 */

import {
  apparelEachVaries,
  type ApparelLineEach,
} from "../../lib/apparel-per-line";

type Props = {
  /** The whole run's estimate, tax-exempt for apparel. */
  total: number;
  /** total ÷ pieces, from the engine — never recomputed here. */
  unitPrice: number;
  /** Pieces across every garment on the quote. */
  quantity: number;
  /**
   * One entry per garment, from apparelLineEach(). Given, the block prints
   * a figure per garment instead of the blended one — see the header. Omit
   * it (or pass one line) and nothing changes.
   */
  lines?: ApparelLineEach[];
  /**
   * What the figures stand on: the customer's own sizes, or the assumed
   * mix. Rendered under the figures because the handoff's rule is that the
   * assumption lives on the same screen as the number.
   */
  basisNote?: string | null;
  /** Tighter, frameless — for a card that already has its own border. */
  compact?: boolean;
};

/**
 * "$7,027.00" — the separator the estimate bar already uses on the running
 * figure, for the same reason: at this size a four-figure total without one
 * is read wrong at a glance. Cents keep two places whatever the locale
 * does, because they are money and not a measurement.
 */
function money(amount: number): string {
  const [dollars, cents] = amount.toFixed(2).split(".");

  return `$${Number(dollars).toLocaleString("en-US")}.${cents}`;
}

export default function ApparelMoney({
  total,
  unitPrice,
  quantity,
  lines = [],
  basisNote,
  compact = false,
}: Props) {
  // Only when the garments actually cost different amounts — two lines of
  // the same blank would print one figure twice.
  const perGarment = apparelEachVaries(lines);

  return (
    <div
      className={
        compact
          ? "border-t-2 border-[var(--gorilla-green)] pt-4"
          : "border-2 border-[var(--gorilla-green)] bg-[var(--surface-ok)] p-4"
      }
    >
      {/* A CONTAINER query, not a viewport one. This block sits in a
          full-width review card on one screen and a third-width column on
          the confirmation, at the same viewport — so `sm:` would be true in
          both and the two figures would keep their side-by-side alignment
          in a column too narrow for it. Measured: the total right-aligned
          itself into the middle of a 280px card. */}
      <div className="@container">
        {/* Bottom-aligned when both sides are one figure, so the two sit on
            a line. TOP-aligned once the left side is a LIST — otherwise the
            total floats down beside the last garment and reads as that
            garment's total rather than the order's. */}
        <div
          className={`flex flex-col gap-3 @sm:flex-row @sm:justify-between @sm:gap-x-6 ${
            perGarment ? "@sm:items-start" : "@sm:items-end"
          }`}
        >
          <div>
            <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
              Estimated each
            </p>

            {perGarment ? (
              /**
               * One row per garment. The blended figure is NOT printed
               * anywhere here: on a mixed cart it describes no garment in
               * the order, and printing it beside the real ones would be
               * offering the customer a number to misquote.
               */
              <ul className="mt-1 space-y-2">
                {lines.map((line) => (
                  <li key={line.id}>
                    <p className="text-lede font-bold tracking-display text-[var(--gorilla-green-dark)]">
                      {money(line.unitPrice)}
                    </p>
                    <p className="text-fine font-medium text-[var(--ink-muted)]">
                      {line.quantity.toLocaleString()} ×{" "}
                      <span className="font-bold text-[var(--ink-black)]">
                        {line.garmentLabel}
                      </span>
                      {line.colorName ? ` / ${line.colorName}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              /* The figure Gabe asked to see. text-head is 1.75rem — the
                 same step as the total beside it, and 2.3x the muted
                 caption this replaced. */
              <p className="mt-1 text-head font-bold tracking-display text-[var(--gorilla-green-dark)]">
                {money(unitPrice)}
              </p>
            )}
          </div>

          <div className="@sm:text-right">
            <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
              {/* The divisor, said out loud. An "each" with no count beside
                  it is a figure the reader has to take on trust. */}
              {quantity.toLocaleString()} {quantity === 1 ? "piece" : "pieces"} · total
            </p>
            <p className="mt-1 text-head font-bold tracking-display text-[var(--ink-black)]">
              {money(total)}
            </p>
          </div>
        </div>
      </div>

      {basisNote && (
        <p className="mt-3 text-fine font-medium leading-5 text-[var(--ink-muted)]">
          {basisNote}
        </p>
      )}
    </div>
  );
}
