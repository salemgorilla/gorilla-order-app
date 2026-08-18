"use client";

import { useState } from "react";

import { resolveBlurValue } from "../../lib/units";

type Props = {
  id: string;
  label: string;
  value: number;
  min: number;
  /**
   * Accepts "any" as well as a number. Sizes use "any" — a numeric step makes
   * the browser mark anything off that grid as invalid, and sizes are no
   * longer restricted to an increment.
   */
  step: number | "any";
  /** Suffix shown after the value, e.g. "in". */
  unit?: string;
  className?: string;
  /**
   * Applied when the field loses focus, not on every keystroke. Snapping mid-typing
   * fights the customer — typing "1.75" would rewrite to "1" the moment they
   * pressed 1. The price still updates live from the raw value; the snap
   * corrects it once they move on.
   *
   * NOT applied to an empty field — a snapper with a floor would turn
   * "I cleared this" into "I want one". See resolveBlurValue.
   */
  snap: (value: number) => number;
  onChange: (value: number) => void;
  /**
   * Short message shown under the field, which also switches it to the
   * invalid treatment. Undefined leaves the field exactly as it was, so the
   * call sites that never pass it are unaffected.
   */
  error?: string | null;
};

/**
 * Order Desk — one labelled number input.
 *
 * Sentence-case label, mono value, 44px minimum target. The `step` attribute
 * alone is not enforcement: it only governs the arrow keys and native
 * validation, and a customer can type any value straight into the box. `snap`
 * is what actually holds the rule.
 */
export default function NumberField({
  id,
  label,
  value,
  min,
  step,
  unit,
  className = "",
  snap,
  onChange,
  error = null,
}: Props) {
  // While focused the field shows exactly what was typed, so a half-finished
  // "1." or "0.7" is not rewritten under the cursor.
  const [draft, setDraft] = useState<string | null>(null);

  const errorId = `${id}-error`;

  return (
    // data-invalid is what submit scrolls to, so it sits on the wrapper — the
    // label has to come into view with the box, not just the box.
    <div className={className} data-invalid={error ? "true" : undefined}>
      <label
        htmlFor={id}
        className="block text-fine font-bold text-[var(--ink-black)]"
      >
        {label}
      </label>

      <div className="relative mt-1">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={draft ?? (value || "")}
          onChange={(event) => {
            setDraft(event.target.value);
            // Live, unsnapped — so the price tracks what they are typing.
            onChange(Number(event.target.value) || 0);
          }}
          onBlur={() => {
            /**
             * A cleared box stays cleared — see resolveBlurValue in lib/units.
             * Snapping an empty field wrote 1 into state, because snapQuantity
             * has a floor, and that silently turned "I am about to retype
             * this" into an order for one. The rule is extracted so it can be
             * tested; this callback could not be.
             */
            onChange(resolveBlurValue(draft ?? String(value || ""), snap));
            setDraft(null);
          }}
          // The border classes are branched rather than appended, because
          // `border` and `border-2` are the same property and which one wins
          // is decided by stylesheet order, not by the order they appear in
          // this string.
          className={`spec min-h-[44px] w-full bg-[var(--paper)] p-3 text-lede text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear ${
            error
              ? "border-2 border-[var(--rush-red)]"
              : "border border-[var(--rule)] hover:border-[var(--ink-black)]"
          } ${unit ? "pr-10" : ""}`}
        />

        {unit && (
          <span className="spec pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fine text-[var(--ink-muted)]">
            {unit}
          </span>
        )}
      </div>

      {error && (
        <p id={errorId} className="mt-1 text-fine font-bold text-[var(--rush-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
