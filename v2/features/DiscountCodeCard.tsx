"use client";

import { useState } from "react";

import { describeDiscount, normalizeDiscountCode, type Discount } from "../lib/discount";

type Props = {
  applied: Discount | null;
  /** How much the applied code is saving right now, for the confirmation line. */
  saving: number;
  /** Resolves to null on success, or a message to show. */
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => void;
};

/**
 * "Have a discount code?" — on the review step, stickers only.
 *
 * Gabe, 2026-09-15. One box, one button. The browser asks the server
 * whether the code is good (/api/discount-code) and applies what it is
 * told; submit looks the code up AGAIN on the server, so this card can
 * never make a price, only show one. Codes are never in the page.
 */
export default function DiscountCodeCard({ applied, saving, onApply, onRemove }: Props) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply() {
    const code = normalizeDiscountCode(draft);
    if (!code) {
      setError("Enter a code first.");
      return;
    }
    setBusy(true);
    setError(null);
    const problem = await onApply(code);
    setBusy(false);
    if (problem) setError(problem);
    else setDraft("");
  }

  return (
    <div className="border border-[var(--rule)] bg-white p-6" data-invalid={error ? "true" : undefined}>
      <p className="eyebrow">Discount code</p>

      {applied ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-ok)] p-4">
          <p className="text-fine font-bold text-[var(--gorilla-green)]">
            <span className="spec">{applied.code}</span> applied — {describeDiscount(applied)}
            {saving > 0 ? ` — you save $${saving.toFixed(2)}` : ""}
          </p>
          <button
            type="button"
            onClick={onRemove}
            className="text-fine font-bold text-[var(--ink-black)] underline underline-offset-2 transition-colors duration-[120ms] ease-linear hover:text-[var(--gorilla-green)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gorilla-green)]"
          >
            Remove
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="discount-code" className="mt-3 block text-fine font-bold text-[var(--ink-black)]">
            Have a code?{" "}
            <span className="font-normal text-[var(--ink-muted)]">(optional)</span>
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="discount-code"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={32}
              value={draft}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "discount-code-error" : undefined}
              onChange={(event) => {
                setDraft(event.target.value.toUpperCase());
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void apply();
                }
              }}
              className={`spec min-h-[44px] w-full bg-[var(--paper)] p-3 text-lede text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear ${
                error
                  ? "border-2 border-[var(--rush-red)]"
                  : "border border-[var(--rule)] hover:border-[var(--ink-black)]"
              }`}
            />
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy}
              className="min-h-[44px] shrink-0 border border-[var(--ink-black)] bg-white px-4 text-fine font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:bg-[var(--ink-black)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gorilla-green)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "CHECKING" : "Apply"}
            </button>
          </div>
          {error && (
            <p id="discount-code-error" role="alert" className="mt-1 text-fine font-bold text-[var(--rush-red)]">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
