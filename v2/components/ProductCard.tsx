"use client";

import type { ProductCategory } from "../lib/products";

type Props = {
  product: ProductCategory;
  isSelected: boolean;
  onSelect: (product: ProductCategory) => void;
};

/**
 * Order Desk — one product option on step 01. ALL FOUR OF THEM.
 *
 * ── WHY ONE COMPONENT ─────────────────────────────────────────────────────
 * Gabe, 2026-09-07: "Make the 'INSTANT PRICE · PAY ONLINE' consistent colour
 * and placement across all options. Also, make the format similar to keep
 * them looking uniform and consistent."
 *
 * The four cards were two hand-built shapes. Stickers and apparel were a
 * two-up grid with the status line at the BOTTOM, green when the flow takes
 * payment. Banners and signs were full-width bands with the status line
 * TOP-RIGHT beside the SELECTED badge, and ALWAYS muted — so when signs and
 * banners started paying online (#122) their line stayed grey while the
 * identical words on the stickers card were green. Two shapes, two places,
 * two colours, one promise.
 *
 * One component ends that by construction: there is now exactly one place a
 * card is drawn, so the four cannot drift apart again.
 *
 * ── WHAT IS UNIFORM, AND WHAT IS NOT ──────────────────────────────────────
 * Uniform: the frame, the padding, the title row with the SELECTED badge on
 * the right, the description, and the status line last in the card. Green
 * on the status line means "this flow takes a card"; muted means "the shop
 * confirms first". That rule is the same rule as before, applied to every
 * card instead of half of them, and tests/product-segments holds it.
 *
 * Not uniform, on purpose: a card may carry a `note` (banners: delivery is
 * quoted separately). That is content the customer needs before investing
 * five steps, not a format difference.
 */
export default function ProductCard({ product, isSelected, onSelect }: Props) {
  // "request" is selectable — it just has no online price.
  const isActive = product.status !== "coming-soon";

  // The flows that return a number AND take the payment. Read off the
  // fulfilment line rather than the id, because that string is asserted
  // against the SERVER gates in tests/product-fulfilment.test.ts — the
  // functions that actually decide it.
  const takesPayment = /pay online/i.test(product.fulfilment);

  return (
    <button
      type="button"
      disabled={!isActive}
      onClick={() => onSelect(product)}
      aria-pressed={isSelected}
      className={`flex min-h-[44px] flex-col border p-5 text-left transition-colors duration-[120ms] ease-linear ${
        isSelected
          ? "cursor-pointer border-[var(--gorilla-green)] bg-[var(--surface-ok)]"
          : isActive
          ? // The border stepping to ink is the house hover move, and unlike a
            // 1px→2px border it cannot shift the layout.
            "cursor-pointer border-[var(--rule)] bg-white hover:border-[var(--ink-black)] active:translate-x-[2px] active:translate-y-[2px]"
          : "cursor-not-allowed border-[var(--rule)] bg-[var(--shirt-blank)] opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-value font-bold text-[var(--ink-black)]">
          {product.title}
        </p>

        {/* Selection carried by border and fill alone fails SC 1.4.1 and
            leaves a greyscale or colour-blind reader with cards that look
            alike. aria-pressed says it to assistive tech; this says it on
            the screen. */}
        {isSelected && (
          <span className="spec shrink-0 bg-[var(--gorilla-green)] px-2 py-1 text-spec font-bold text-white">
            SELECTED
          </span>
        )}
      </div>

      <p className="mt-3 text-fine font-medium leading-6 text-[var(--ink-muted)]">
        {product.description}
      </p>

      {/* The card's two spec lines, kept together and pinned to the bottom.
          `mt-auto` on the PAIR rather than on one of them, so both sit on the
          same baseline as their neighbours in a row however long a
          description runs.

          Shipping above, in mono, because it is a fact and one of them
          carries a real postage figure — the register the hero's terms chips
          already use. The fulfilment promise below it, in the uppercase
          marker register, because that is the line the eye is looking for. */}
      <div className="mt-auto pt-4">
        <p className="spec text-spec text-[var(--ink-muted)]">
          {product.shipping}
        </p>

        {/* What happens after submit, not how finished the flow is. LAST in
            every card, so the eye finds it in the same place on all four. */}
        <p
          className={`mt-2 text-spec font-bold uppercase tracking-eyebrow ${
            takesPayment
              ? "text-[var(--gorilla-green)]"
              : "text-[var(--ink-muted)]"
          }`}
        >
          {product.status === "coming-soon" ? "Coming soon" : product.fulfilment}
        </p>
      </div>
    </button>
  );
}
