type Props = {
  /** What is being priced, e.g. "100 Die Cut stickers". */
  label: string;
  total: number;
  /** False when the shop has to price this by hand. */
  priceable?: boolean;
  /** Secondary spec line — per-unit price, delivery, etc. */
  detail?: string;
};

/**
 * Order Desk — the estimate stub.
 *
 * The running total, as a ticket stub pinned to the top of the page.
 *
 * It exists because the price was measured at y=6967 on a 375px phone: 8.58
 * screens down, 76.7% of the way through the document, visible for 668px and
 * gone again 1,778px before the submit button. The number the customer came
 * for was the one thing they never saw while choosing.
 *
 * `sticky top-0`, not a fixed bottom dock: it takes no viewport at rest, it
 * cannot cover the submit button or sit over a field error with the keyboard
 * up, and it needs no padding compensation in another file.
 *
 * Display only. It receives a number and renders it — no pricing logic lives
 * here, and none should.
 */
export default function EstimateBar({
  label,
  total,
  priceable = true,
  detail,
}: Props) {
  // Display-only split of the existing formatted total so the cents can sit
  // smaller. NOT a pricing change — the value is already computed upstream.
  const [dollars, cents] = total.toFixed(2).split(".");

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-6 border-y-2 border-[var(--ink-black)] bg-[var(--surface-ok)] px-4 py-2 sm:-mx-8 sm:px-8 lg:top-4">
      {priceable ? (
        <p
          className="spec flex items-baseline gap-1 tracking-display text-[var(--gorilla-green-dark)]"
          aria-live="polite"
          aria-atomic="true"
        >
          {/* One clean announcement for screen readers; the split is visual. */}
          <span className="sr-only">
            {label}: ${total.toFixed(2)}
          </span>
          <span aria-hidden className="text-price font-bold">
            ${Number(dollars).toLocaleString()}
          </span>
          <span aria-hidden className="text-lede font-bold">
            .{cents}
          </span>
        </p>
      ) : (
        // An answer, not an apology. Same slot, same weight.
        <p
          className="text-head font-bold tracking-display text-[var(--ink-black)]"
          aria-live="polite"
          aria-atomic="true"
        >
          Priced by hand
        </p>
      )}

      <p className="spec truncate text-spec text-[var(--ink-muted)]">
        {label}
        {detail ? ` · ${detail}` : ""}
      </p>
    </div>
  );
}
