/**
 * The strip that says a Black Friday deal is on (lib/deals.ts): its name, its
 * terms, why the quote does not fit it yet when it does not, and a way back
 * to a regular quote. Shared by the sticker deal and the tee deals; the 50
 * Hoodie Special keeps its own (features/apparel/HoodieSpecial.tsx).
 */
export function DealActive({
  name,
  terms,
  problem,
  onLeave,
  testId,
}: {
  name: string;
  terms: string;
  /** Why the quote is not on the deal yet, or null when it fits. */
  problem: string | null;
  onLeave: () => void;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-3 border-2 border-[var(--gorilla-green)] bg-[var(--surface-ok)] p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow text-[var(--gorilla-green)]">Black Friday deal · {name}</p>
          <p className="mt-1 text-fine font-medium leading-5 text-[var(--ink-black)]">{terms}</p>
        </div>

        <button
          type="button"
          data-testid={`${testId}-leave`}
          onClick={onLeave}
          className="min-h-[44px] shrink-0 cursor-pointer border border-[var(--rule)] bg-white px-4 text-fine font-bold text-[var(--ink-black)] transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
        >
          Switch to a regular quote
        </button>
      </div>

      {problem && (
        <p
          role="status"
          data-testid={`${testId}-problem`}
          className="border border-[var(--ink-warn)] bg-[var(--surface-warn)] px-3 py-2 text-fine font-medium leading-5 text-[var(--ink-warn)]"
        >
          {problem}
        </p>
      )}
    </div>
  );
}
