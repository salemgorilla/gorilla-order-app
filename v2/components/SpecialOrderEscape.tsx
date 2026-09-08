"use client";

/**
 * "I need something not listed here" — ONE control, for every flow that has
 * one.
 *
 * ── WHY SIGNS NEEDED IT, AND WHY IT IS SHARED ─────────────────────────────
 * Apparel has had this since it was a hand-quote flow. Signs did not, and
 * for as long as signs were quoted by hand that cost nothing. #122 changed
 * it: signs and banners started raising live payment links on 7 Sep, and
 * ELEVEN HOURS LATER the first real one arrived from Jake Pardee —
 *
 *   Configured: Rigid Sign, 6" x 7", PVC 1/8", rounded corners. $60.00.
 *   His notes:  "Looking to do a CLEAR ACRYLIC version of this design for
 *                my recording console… Would like to discuss how to make
 *                this happen!"
 *
 * The list has no acrylic. He picked PVC to get through the form, and the
 * app raised a live link for a sign he does not want. The engine priced it
 * perfectly — a correct price for the wrong product, which is exactly the
 * failure `isStickerOrder()` was hardened against.
 *
 * It is one component rather than two because the apparel copy and the
 * signs copy would drift, and because the thing it controls is the money
 * gate: two implementations of "the customer says we cannot describe this"
 * is two chances for one of them to stop reaching lib/auto-bill.ts.
 *
 * ── AN EXPLICIT CONTROL, NEVER A HEURISTIC ON THE NOTES ───────────────────
 * The obvious cheap version is to scan the notes for "acrylic" and words
 * like it. That fails both ways: it withholds a link from a customer who
 * mentions a material in passing, and it charges the one who describes
 * something impossible in words nobody listed. The customer is asked, and
 * their answer is the answer.
 *
 * DEFAULTS OFF. A flow where the escape starts ticked is a flow that stops
 * taking payments, and it would take a while for anyone to notice.
 */

type Props = {
  checked: boolean;
  notes: string;
  /** What this flow cannot describe, in its own words. */
  examples: string;
  /** Placeholder for the notes box — concrete, from a real order. */
  placeholder: string;
  /**
   * Shown when the box is ticked. Signs and stickers say a payment link is
   * withheld; apparel never had one to withhold, so it says something else.
   */
  consequence: string;
  error?: string;
  onChange: (updates: { specialOrder?: boolean; specialOrderNotes?: string }) => void;
  /** Distinguishes the error element when two flows are ever on one page. */
  idPrefix?: string;
};

export default function SpecialOrderEscape({
  checked,
  notes,
  examples,
  placeholder,
  consequence,
  error,
  onChange,
  idPrefix = "special-order",
}: Props) {
  const errorId = `${idPrefix}-notes-error`;

  return (
    <div
      className={`border p-4 transition ${
        checked
          ? "border-[var(--rush-red)] bg-[var(--surface-rush)]"
          : "border-[var(--rule)] bg-[var(--shirt-blank)]"
      }`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange({ specialOrder: event.target.checked })}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--rush-red)]"
        />
        <span>
          <span className="block text-fine font-bold text-[var(--ink-black)]">
            I need something not listed here
          </span>
          <span className="mt-1 block text-fine font-medium leading-5 text-[var(--ink-muted)]">
            {examples} We&apos;ll quote it by hand.
          </span>
        </span>
      </label>

      {checked && (
        <div className="mt-4" data-invalid={error ? "true" : undefined}>
          <label className="block">
            <span className="text-fine font-semibold text-[var(--ink-black)]">
              Tell us what you need
            </span>
            <textarea
              value={notes}
              onChange={(event) =>
                onChange({ specialOrderNotes: event.target.value })
              }
              rows={3}
              placeholder={placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={`mt-2 w-full bg-white px-4 py-3 font-bold text-[var(--ink-black)] outline-none focus:ring-2 focus:ring-[var(--rush-red)] ${
                error
                  ? "border-2 border-[var(--rush-red)]"
                  : "border border-[var(--rule)]"
              }`}
            />
          </label>

          {error && (
            <p
              id={errorId}
              className="mt-1 text-fine font-bold text-[var(--rush-red)]"
            >
              {error}
            </p>
          )}

          <p className="mt-3 bg-white p-3 text-spec font-bold leading-5 text-[var(--ink-muted)]">
            {consequence}
          </p>
        </div>
      )}
    </div>
  );
}
