import Chip from "./ui/Chip";

type Props = {
  needBy: string;
  deadlineType: string;
  onNeedByChange: (value: string) => void;
  onDeadlineTypeChange: (value: string) => void;
};

/**
 * Order Desk — turnaround capture.
 *
 * Customer-facing, so sentence-case labels and text-plus-border on every
 * state. The date drives whether the shop can actually hit the job, so it
 * carries a real label rather than relying on the native control's chrome.
 */
export default function NeedByDate({
  needBy,
  deadlineType,
  onNeedByChange,
  onDeadlineTypeChange,
}: Props) {
  // A date in the past is never valid input.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="border border-[var(--rule)] bg-[var(--paper)] p-6">
      <h3 className="text-lede font-bold">When do you need these in hand?</h3>

      <p className="mt-2 text-sm text-[var(--ink-muted)]">
        This helps us confirm turnaround before production.
      </p>

      <label
        htmlFor="need-by-date"
        className="mt-5 block text-sm font-bold text-[var(--ink-black)]"
      >
        Date needed in hand{" "}
        <span className="font-normal text-[var(--rush-red)]">(required)</span>
      </label>

      <input
        id="need-by-date"
        type="date"
        required
        min={today}
        value={needBy}
        onChange={(event) => onNeedByChange(event.target.value)}
        className="spec mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] px-4 py-3 font-bold transition-colors duration-[120ms] ease-linear hover:border-[var(--ink-black)]"
      />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Chip
          label="Flexible"
          selected={deadlineType === "Flexible"}
          onSelect={() => onDeadlineTypeChange("Flexible")}
        />
        <Chip
          label="Firm deadline"
          selected={deadlineType === "Firm"}
          onSelect={() => onDeadlineTypeChange("Firm")}
        />
      </div>

      {!needBy && (
        <p className="mt-4 border border-[var(--rule)] border-l-4 border-l-[var(--ink-warn)] bg-[var(--surface-warn)] p-3 text-sm font-bold text-[var(--ink-warn)]">
          Required before submitting: enter the date you need this order in hand.
        </p>
      )}

      {needBy && deadlineType === "Firm" && (
        <p className="mt-4 border border-[var(--rule)] border-l-4 border-l-[var(--ink-warn)] bg-[var(--surface-warn)] p-3 text-sm font-bold text-[var(--ink-warn)]">
          Firm deadline noted. We&rsquo;ll review production availability before
          final approval.
        </p>
      )}

      {needBy && deadlineType === "Flexible" && (
        <p className="mt-4 border border-[var(--rule)] border-l-4 border-l-[var(--gorilla-green)] bg-[var(--surface-ok)] p-3 text-sm font-bold text-[var(--gorilla-green-dark)]">
          Flexible timing noted. This gives us more room to schedule production.
        </p>
      )}
    </div>
  );
}
