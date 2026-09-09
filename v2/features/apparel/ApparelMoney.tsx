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
 * ── "EACH", NOT "PRICE" ───────────────────────────────────────────────────
 * Two constraints meet here. Apparel is an ESTIMATE, never a price — the
 * smoke test asserts the review card contains no "Price" — and "each" is
 * already the shop's own word on the sticker bar and the signs summary. So
 * the label is the one the rest of the app uses, and it happens to be the
 * one that stays true when the cart holds hoodies as well as tees.
 */

type Props = {
  /** The whole run's estimate, tax-exempt for apparel. */
  total: number;
  /** total ÷ pieces, from the engine — never recomputed here. */
  unitPrice: number;
  /** Pieces across every garment on the quote. */
  quantity: number;
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
  basisNote,
  compact = false,
}: Props) {
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
        <div className="flex flex-col gap-3 @sm:flex-row @sm:items-end @sm:justify-between @sm:gap-x-6">
          <div>
            <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
              Estimated each
            </p>
            {/* The figure Gabe asked to see. text-head is 1.75rem — the
                same step as the total beside it, and 2.3x the muted caption
                this replaced. */}
            <p className="mt-1 text-head font-bold tracking-display text-[var(--gorilla-green-dark)]">
              {money(unitPrice)}
            </p>
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
