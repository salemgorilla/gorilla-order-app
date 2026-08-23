/**
 * Order Desk — chip button.
 *
 * The single selection affordance for the whole app. OptionSelector chips
 * are most of the form, so this component is where the house rules for
 * selection actually live:
 *
 *   radius 0 · 1px hairline frame · ink inversion on hover (120ms linear)
 *   active = 2px translate · 44px minimum touch target · focus never removed
 *
 * Colour is never the only signal for the selected state — the selected chip
 * also carries a heavier border, so it survives greyscale and colour-blindness.
 */

type ChipProps = {
  label: string;
  selected: boolean;
  onSelect: () => void;
  /** Spec furniture (quantities, sizes, codes) renders in JetBrains Mono. */
  spec?: boolean;
};

export default function Chip({ label, selected, onSelect, spec }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "min-h-[44px] w-full cursor-pointer p-4 text-left font-semibold",
        "transition-colors duration-[120ms] ease-linear",
        "active:translate-x-[2px] active:translate-y-[2px]",
        spec ? "spec text-lg" : "",
        selected
          ? "border-2 border-[var(--gorilla-green)] bg-[var(--gorilla-green)] text-white"
          : [
              "border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-black)]",
              // Ink inversion — the house hover move. Not a tint.
              "hover:border-[var(--ink-black)] hover:bg-[var(--ink-black)] hover:text-[var(--paper)]",
            ].join(" "),
      ].join(" ")}
    >
      {label}
    </button>
  );
}
