type Props = {
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
};

/**
 * Order Desk — primary commit action.
 *
 * Disabled is 40% opacity + not-allowed + no hover (never a grey fill, which
 * reads as a different button rather than the same button switched off).
 * Loading carries a mono label, not a spinner.
 */
export default function SubmitButton({
  onSubmit,
  disabled = false,
  isLoading = false,
}: Props) {
  const inactive = disabled || isLoading;

  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={inactive}
      className={[
        "w-full border-2 border-[var(--rush-red)] bg-[var(--rush-red)] py-5",
        "text-lede font-bold text-white",
        "transition-colors duration-[120ms] ease-linear",
        inactive
          ? "cursor-not-allowed opacity-40"
          : // Ink inversion, same as every other affordance in the app.
            "cursor-pointer hover:bg-[var(--paper)] hover:text-[var(--rush-red)] active:translate-x-[2px] active:translate-y-[2px]",
      ].join(" ")}
    >
      {isLoading ? (
        <span className="spec">REQUESTING QUOTE…</span>
      ) : (
        "Request Quote →"
      )}
    </button>
  );
}
