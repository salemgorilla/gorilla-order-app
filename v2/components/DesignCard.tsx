"use client";

type Props = {
  index: number;
  total: number;
  onRemove: () => void;
  children: React.ReactNode;
};

/**
 * Order Desk — one design in the sticker cart.
 *
 * A framed, numbered wrapper so three designs read as three tickets rather
 * than one very long form. With a single design the frame disappears
 * entirely: a cart of one is just an order, and heading it "Design 1 of 1"
 * with a remove button that refuses to work is furniture pointing at nothing.
 */
export default function DesignCard({
  index,
  total,
  onRemove,
  children,
}: Props) {
  if (total <= 1) {
    return <>{children}</>;
  }

  return (
    <section
      aria-label={`Design ${index + 1} of ${total}`}
      className="border border-[var(--rule)] bg-[var(--paper)] p-4 sm:p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-3">
        <p className="spec text-spec uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          Design {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </p>

        {/* RUSH RED is the removal ink — this is destructive and the palette
            reserves that colour for exactly this kind of thing. Never the only
            signal, so the word "Remove" carries it too. */}
        <button
          type="button"
          onClick={onRemove}
          className={[
            "min-h-[44px] cursor-pointer border border-[var(--rule)] px-4 py-2",
            "text-fine font-bold text-[var(--rush-red)]",
            "transition-colors duration-[120ms] ease-linear",
            "hover:border-[var(--rush-red)] hover:bg-[var(--surface-rush)]",
            "active:translate-x-[2px] active:translate-y-[2px]",
          ].join(" ")}
        >
          Remove
        </button>
      </div>

      {children}
    </section>
  );
}
