import { useState } from "react";

import Chip from "./ui/Chip";
import { STICKER_SETUP_FEE } from "../lib/pricing";

type Props = {
  quantities: number[];
  selected: number;
  onSelect: (quantity: number) => void;
};

export default function QuantitySelector({
  quantities,
  selected,
  onSelect,
}: Props) {
  // A quantity off the break table means the customer typed their own.
  const isCustom = !quantities.includes(selected);
  const [showCustom, setShowCustom] = useState(isCustom);

  return (
    <div>
      <h3 className="mb-3 text-lede font-bold">Quantity</h3>

      <div className="grid grid-cols-2 gap-3">
        {quantities.map((quantity) => (
          <Chip
            key={quantity}
            // Quantities are real values, so they get the mono spec treatment.
            spec
            label={quantity.toLocaleString()}
            selected={!showCustom && selected === quantity}
            onSelect={() => {
              setShowCustom(false);
              onSelect(quantity);
            }}
          />
        ))}

        <Chip
          label="Another amount"
          selected={showCustom}
          onSelect={() => setShowCustom(true)}
        />
      </div>

      {showCustom && (
        <div className="mt-3 border border-[var(--rule)] bg-[var(--shirt-blank)] p-4">
          <label
            htmlFor="custom-quantity"
            className="block text-sm font-bold text-[var(--ink-black)]"
          >
            How many do you need?
          </label>

          <input
            id="custom-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={selected || ""}
            onChange={(event) => {
              const next = Math.max(1, Math.floor(Number(event.target.value) || 0));
              onSelect(next);
            }}
            className="spec mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] p-3 text-lede text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
          />

          <p className="mt-2 text-fine leading-5 text-[var(--ink-muted)]">
            Any amount is priced exactly — no rounding to a price break. The
            ${STICKER_SETUP_FEE} setup is split across your order, so the more
            you order the less each one costs.
          </p>
        </div>
      )}
    </div>
  );
}
