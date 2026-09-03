import Chip from "./ui/Chip";

type Props = {
  needBy: string;
  deadlineType: string;
  onNeedByChange: (value: string) => void;
  onDeadlineTypeChange: (value: string) => void;
  /** Short message shown under the date, once submit has been attempted. */
  error?: string;
  /**
   * The earliest date this flow may promise (lib/turnaround.ts) — stickers
   * and banners next business day, apparel and signs 14 business days. The
   * picker refuses earlier dates; the validator backs it up for anything
   * typed past the picker.
   */
  minDate: string;
  /** The flow's turnaround promise plus the rush out, under the field. */
  turnaroundNote: string;
  /**
   * The rush offer, on flows that sell it (lib/rush.ts): what an earlier
   * date costs and how early it can go. Null where rush is not offered.
   */
  rushOffer?: string | null;
  /** Named once a rush date IS picked — the fee, on the same screen. */
  rushChosen?: string | null;
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
  error,
  minDate,
  turnaroundNote,
  rushOffer,
  rushChosen,
}: Props) {
  return (
    <div className="border border-[var(--rule)] bg-[var(--paper)] p-6">
      <h3 className="text-lede font-bold">When do you need these in hand?</h3>

      <p className="mt-2 text-fine text-[var(--ink-muted)]">
        This helps us confirm turnaround before production.
      </p>

      {/* Wrapped so data-invalid — what submit scrolls to — covers the label
          and the message, not just the box. */}
      <div className="mt-5" data-invalid={error ? "true" : undefined}>
        <label
          htmlFor="need-by-date"
          className="block text-fine font-semibold text-[var(--ink-black)]"
        >
          Date needed in hand{" "}
          <span className="font-normal text-[var(--rush-red)]">(required)</span>
        </label>

        <input
          id="need-by-date"
          type="date"
          required
          min={minDate}
          value={needBy}
          onChange={(event) => onNeedByChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "need-by-date-error" : undefined}
          className={`spec mt-1 w-full bg-[var(--paper)] px-4 py-3 font-bold transition-colors duration-[120ms] ease-linear ${
            error
              ? "border-2 border-[var(--rush-red)]"
              : "border border-[var(--rule)] hover:border-[var(--ink-black)]"
          }`}
        />

        {/* The floor blocks silently in the picker, so the WHY has to be
            said out loud — a customer scrolling for tomorrow and not finding
            it needs the promise and the out, not a mute calendar. */}
        <p className="mt-2 text-fine font-medium leading-5 text-[var(--ink-muted)]">
          {turnaroundNote}
        </p>

        {/* The offer replaces "call us" with a date the customer can just
            pick. Kurt Sletten's job left over that sentence. Once a rush
            date IS picked the offer gives way to the fee, stated here
            rather than discovered on the estimate. */}
        {rushChosen ? (
          <p className="mt-2 border border-[var(--rule)] border-l-4 border-l-[var(--gorilla-green)] bg-[var(--surface-ok)] p-3 text-fine font-bold leading-5 text-[var(--gorilla-green-dark)]">
            {rushChosen}
          </p>
        ) : (
          rushOffer && (
            <p className="mt-2 text-fine font-medium leading-5 text-[var(--ink-muted)]">
              {rushOffer}
            </p>
          )
        )}

        {error && (
          <p
            id="need-by-date-error"
            className="mt-1 text-fine font-bold text-[var(--rush-red)]"
          >
            {error}
          </p>
        )}
      </div>

      {/* Two unlabelled chips under a required date read as if one of them
          might BE the answer to the date — pick "Flexible" and maybe you can
          leave it blank. You cannot: the date is required either way, and
          this pair only says how hard to hold it. Saying so removes the
          ambiguity, and the group gets a real accessible name at the same
          time — these are buttons, so no fieldset legend names them. */}
      <p
        id="deadline-type-label"
        className="mt-5 text-fine font-semibold text-[var(--ink-black)]"
      >
        How firm is that date?
      </p>

      <p className="mt-1 text-fine text-[var(--ink-muted)]">
        We need the date either way — this just tells us how much room we have
        to schedule it.
      </p>

      <div
        role="group"
        aria-labelledby="deadline-type-label"
        className="mt-3 grid grid-cols-2 gap-3"
      >
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

      {/* Suppressed once the field is marked: the amber notice and the red
          error say the same sentence, and printing both makes the customer
          read the same instruction twice to find out it was one problem. */}
      {!needBy && !error && (
        <p className="mt-4 border border-[var(--rule)] border-l-4 border-l-[var(--ink-warn)] bg-[var(--surface-warn)] p-3 text-fine font-bold text-[var(--ink-warn)]">
          Required before submitting: enter the date you need this in hand.
        </p>
      )}

      {needBy && deadlineType === "Firm" && (
        <p className="mt-4 border border-[var(--rule)] border-l-4 border-l-[var(--ink-warn)] bg-[var(--surface-warn)] p-3 text-fine font-bold text-[var(--ink-warn)]">
          Firm deadline noted. We&rsquo;ll review production availability before
          final approval.
        </p>
      )}

      {needBy && deadlineType === "Flexible" && (
        <p className="mt-4 border border-[var(--rule)] border-l-4 border-l-[var(--gorilla-green)] bg-[var(--surface-ok)] p-3 text-fine font-bold text-[var(--gorilla-green-dark)]">
          Flexible timing noted. This gives us more room to schedule production.
        </p>
      )}
    </div>
  );
}
