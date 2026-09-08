"use client";

/**
 * Order Desk — the size grid, ONE control, wherever sizes are asked for.
 *
 * ── WHY THIS IS A COMPONENT AND NOT TWO COPIES ────────────────────────────
 * Gabe, 2026-09-08: "When I added another garment in the apparel button,
 * there was no way to enter the size breakdown. Can you make sure that each
 * step is consistent."
 *
 * The first garment had this grid; added garments had a "How many" box. Two
 * ways to answer the same question on one screen — and the shape a fix
 * usually takes (build a second grid beside the first) is how they drift
 * apart again on the next change. So the grid moved here and BOTH callers
 * mount it: the configurator for garment 01, ApparelCartLines for every
 * garment after it. There is no second implementation to keep in step.
 *
 * ── WHAT THE CALLER STILL OWNS ────────────────────────────────────────────
 * The rows come from the selected COLOUR's size run, and the counts live in
 * the caller's state — see lib/size-quantities.ts for why a colour change
 * has to prune them. This component draws and edits; it decides nothing
 * about which sizes exist or what the total means.
 *
 * `compact` is the only difference between the two placements, and it is
 * spacing alone: a garment line is already inside a bordered card, so the
 * grid drops its own frame rather than nesting one box in another. Every
 * control, every label and every rule is identical in both.
 */

type SizeRow = {
  sizeName: string;
  isAvailable: boolean;
};

type Props = {
  /** Rows to draw, in the colour's own order. */
  sizes: SizeRow[];
  /** The counts, `{ M: 12 }`. Sizes absent from it are zero. */
  quantities: Record<string, number>;
  /** −/+ by one. */
  onStep: (sizeName: string, change: number) => void;
  /** A typed figure. */
  onSet: (sizeName: string, value: number) => void;
  /** Clears every count. Omit to hide the reset. */
  onReset?: () => void;
  /**
   * Prefix for each input's accessible name — "2XL quantity" collides
   * across garments once there are several grids on one page, and a
   * screen-reader user would have no way to tell which garment they are in.
   */
  labelPrefix?: string;
  /**
   * Frameless, tighter spacing — for a garment line, which is already
   * inside a bordered card. Spacing ONLY: every control, label and rule is
   * identical in both placements, and the columns are the same too (a
   * denser column count clipped the + button).
   */
  compact?: boolean;
  /** Heading and blurb. Omitted in compact mode, where the card says it. */
  title?: string;
  description?: string;
};

export default function SizeBreakdownGrid({
  sizes,
  quantities,
  onStep,
  onSet,
  onReset,
  labelPrefix,
  compact = false,
  title,
  description,
}: Props) {
  const total = Object.values(quantities).reduce(
    (sum, quantity) => sum + (quantity > 0 ? quantity : 0),
    0
  );

  const breakdown = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([size, quantity]) => `${size}-${quantity}`)
    .join(", ");

  const label = (sizeName: string) =>
    `${labelPrefix ? `${labelPrefix} ` : ""}${sizeName} quantity`;

  return (
    <div
      className={
        compact ? "" : "border border-[var(--rule)] bg-[var(--shirt-blank)] p-5"
      }
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {title && <p className="eyebrow">{title}</p>}

          {description && (
            <p className="mt-1 text-fine font-medium text-[var(--ink-muted)]">
              {description}
            </p>
          )}
        </div>

        {/* Just the total. "12 / 12" was reconciliation feedback for a
            second number that no longer exists — the grid IS the count.
            Green only once it counts something: a filled green "0 shirts"
            reads as a completed step, and this one is optional. */}
        <span
          // shrink-0/nowrap: in the flex row beside the description the
          // badge was being squeezed until "12 shirts" wrapped onto two
          // lines. Measured in Chromium at 1300px and 768px — it reads fine
          // in the DOM text either way, which is why it survived this long.
          className={`shrink-0 whitespace-nowrap px-4 py-2 text-center text-fine font-bold ${
            total > 0
              ? "bg-[var(--gorilla-green)] text-white"
              : "border border-[var(--rule)] bg-white text-[var(--ink-muted)]"
          }`}
        >
          {total} {total === 1 ? "shirt" : "shirts"}
        </span>
      </div>

      {/* Two columns at every width the grid appears at. A three-up compact
          variant fitted more sizes on screen and clipped the + button off
          the right of each cell — the control the whole grid exists for.
          Caught in Chromium, not in the markup. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {sizes.map(({ sizeName, isAvailable }) => {
          const quantity = quantities[sizeName] || 0;

          return (
            <div
              key={sizeName}
              className={`border bg-white p-4 ${
                isAvailable
                  ? "border-[var(--rule)]"
                  : "border-[var(--rule)] opacity-50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-value font-bold text-[var(--ink-black)]">
                    {sizeName}
                  </p>

                  <p className="mt-1 text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
                    {isAvailable ? "Available" : "Out of stock"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onStep(sizeName, -1)}
                    disabled={quantity === 0}
                    aria-label={`Remove one ${sizeName}`}
                    className="grid h-10 w-10 place-items-center bg-[var(--shirt-blank)] text-lede font-bold text-[var(--gorilla-green)] transition hover:bg-[var(--surface-ok)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    −
                  </button>

                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={quantity}
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => onSet(sizeName, Number(event.target.value))}
                    aria-label={label(sizeName)}
                    className="h-10 w-16 bg-[var(--shirt-blank)] px-2 text-center text-value font-bold text-[var(--ink-black)] outline-none focus:ring-2 focus:ring-[var(--gorilla-green)]"
                  />

                  <button
                    type="button"
                    onClick={() => onStep(sizeName, 1)}
                    // Adding is capped only by stock. It used to also stop at
                    // a separately chosen quantity — with the count derived
                    // from this grid, that test is always false and would
                    // freeze every + button.
                    disabled={!isAvailable}
                    aria-label={`Add one ${sizeName}`}
                    className="grid h-10 w-10 place-items-center bg-[var(--gorilla-green)] text-lede font-bold text-white transition hover:bg-[var(--gorilla-green-dark)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`bg-white p-4 ${compact ? "mt-3" : "mt-4"}`}>
        <p className="text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)]">
          Current Breakdown
        </p>

        <p className="mt-2 text-fine font-bold text-[var(--ink-black)]">
          {breakdown || "No sizes selected yet"}
        </p>

        {total > 0 && (
          <p className="mt-2 text-fine font-bold leading-6 text-[var(--gorilla-green)]">
            Priced from your sizes.
          </p>
        )}

        {total > 0 && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="mt-3 bg-[var(--shirt-blank)] px-4 py-2 text-spec font-bold uppercase tracking-eyebrow text-[var(--ink-muted)] transition hover:bg-[var(--shirt-blank)]"
          >
            Reset Sizes
          </button>
        )}
      </div>
    </div>
  );
}
