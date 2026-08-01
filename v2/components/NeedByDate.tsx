type Props = {
  needBy: string;
  deadlineType: string;
  onNeedByChange: (value: string) => void;
  onDeadlineTypeChange: (value: string) => void;
};

export default function NeedByDate({
  needBy,
  deadlineType,
  onNeedByChange,
  onDeadlineTypeChange,
}: Props) {
  return (
    <div className=" border border-[var(--rule)] bg-[#fffdf7] p-6">
      <h3 className="text-xl font-black">When do you need these in hand?</h3>

      <p className="mt-2 text-sm text-[var(--ink-muted)]">
        This helps us confirm turnaround before production.
      </p>

      <input
        type="date"
        value={needBy}
        onChange={(event) => onNeedByChange(event.target.value)}
        className="mt-5 w-full border border-[var(--rule)] px-4 py-3 font-bold"
      />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onDeadlineTypeChange("Flexible")}
          className={` border p-4 font-bold ${
            deadlineType === "Flexible"
              ? "border-[var(--gorilla-green)] bg-[var(--gorilla-green)] text-white"
              : "bg-white"
          }`}
        >
          Flexible
        </button>

        <button
          type="button"
          onClick={() => onDeadlineTypeChange("Firm")}
          className={` border p-4 font-bold ${
            deadlineType === "Firm"
              ? "border-[var(--gorilla-green)] bg-[var(--gorilla-green)] text-white"
              : "bg-white"
          }`}
        >
          Firm Deadline
        </button>
      </div>

      {!needBy && (
        <p className="mt-4 bg-[var(--surface-warn)] p-3 text-sm font-bold text-[var(--ink-warn)]">
          Required before submitting: enter the date you need this order in hand.
        </p>
      )}

      {needBy && deadlineType === "Firm" && (
        <p className="mt-4 bg-[var(--surface-warn)] p-3 text-sm font-bold text-[var(--ink-warn)]">
          Firm deadline noted. We’ll review production availability before final approval.
        </p>
      )}

      {needBy && deadlineType === "Flexible" && (
        <p className="mt-4 bg-[#e8f3ec] p-3 text-sm font-bold text-[var(--gorilla-green)]">
          Flexible timing noted. This gives us more room to schedule production.
        </p>
      )}
    </div>
  );
}