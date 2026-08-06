"use client";

import { useState } from "react";

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
   */
  snap: (value: number) => number;
  onChange: (value: number) => void;
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
}: Props) {
  // While focused the field shows exactly what was typed, so a half-finished
  // "1." or "0.7" is not rewritten under the cursor.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className={className}>
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
          value={draft ?? (value || "")}
          onChange={(event) => {
            setDraft(event.target.value);
            // Live, unsnapped — so the price tracks what they are typing.
            onChange(Number(event.target.value) || 0);
          }}
          onBlur={() => {
            const snapped = snap(Number(draft ?? value) || 0);
            onChange(snapped);
            setDraft(null);
          }}
          className={`spec min-h-[44px] w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-lede text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)] ${
            unit ? "pr-10" : ""
          }`}
        />

        {unit && (
          <span className="spec pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fine text-[var(--ink-muted)]">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
