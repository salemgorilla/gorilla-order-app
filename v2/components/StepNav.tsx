"use client";

import {
  ORDER_STEPS,
  STEP_COUNT,
  getStepIndex,
  type StepId,
} from "../lib/steps";

type Props = {
  currentStepId: StepId;
  /** Steps the customer has actually landed on. */
  visitedStepIds: readonly StepId[];
  /**
   * Steps holding a failing field *right now*, regardless of whether the
   * marks are being shown. Completion is read from this, so a step stops
   * claiming to be done the moment a customer empties a box in it.
   */
  errorStepIds: ReadonlySet<StepId>;
  /**
   * Whether a submit has been attempted. Problems are only surfaced after
   * one — the same rule the field marks follow. Meeting someone who has
   * typed nothing with a bar of red is describing their own defaults back
   * at them.
   */
  showProblems: boolean;
  onSelect: (id: StepId) => void;
};

type StepState = "done" | "problem" | "todo";

/**
 * Order Desk — the step bar.
 *
 * Five real steps, all reachable at any time. Deliberately NOT a gate: the
 * house position on the submit button is already "pressable, not disabled —
 * a disabled control refuses without saying why", and locking a step behind
 * the one before it is the same dead end one screen earlier. Submit stays the
 * single validation gate; this bar is orientation, not permission.
 *
 * Status never rides on colour alone. Done carries a check, a problem carries
 * an exclamation, the current step carries a 2px ink rule and `aria-current`,
 * and every state names itself for a screen reader.
 */
export default function StepNav({
  currentStepId,
  visitedStepIds,
  errorStepIds,
  showProblems,
  onSelect,
}: Props) {
  const currentIndex = getStepIndex(currentStepId);

  function getState(id: StepId, terminal: boolean | undefined): StepState {
    const hasErrors = errorStepIds.has(id);

    if (showProblems && hasErrors) {
      return "problem";
    }

    // Terminal steps never complete — see the note in lib/steps.ts.
    if (!terminal && visitedStepIds.includes(id) && !hasErrors) {
      return "done";
    }

    return "todo";
  }

  return (
    <nav aria-label="Quote steps" className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="spec text-spec text-[var(--ink-muted)]">
          Step {currentIndex + 1} of {STEP_COUNT}
        </p>

        {/* The first cell of the bar has always been clickable, but a step
            marked "done" does not read as "press me to change your mind". A
            customer who picked the wrong product needs somewhere obvious to
            go, and hunting for it is the moment they close the tab.

            Navigates only — nothing is cleared. A control that silently threw
            away a filled-in form would be a nasty surprise, and the label
            stays honest either way: you are back at the beginning, your
            answers are simply still there. */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={() => onSelect(ORDER_STEPS[0].id)}
            className={[
              "inline-flex min-h-[44px] cursor-pointer items-center",
              "border border-[var(--rule)] bg-[var(--paper)] px-4 py-2",
              "text-fine font-bold text-[var(--ink-black)]",
              "transition-colors duration-[120ms] ease-linear",
              "hover:border-[var(--ink-black)] hover:bg-[var(--ink-black)] hover:text-[var(--paper)]",
              "active:translate-x-[2px] active:translate-y-[2px]",
            ].join(" ")}
          >
            ← Back to the beginning
          </button>
        )}
      </div>

      <ol className="grid grid-cols-5 border border-[var(--rule)] bg-[var(--paper)]">
        {ORDER_STEPS.map((step, index) => {
          const isCurrent = step.id === currentStepId;
          const state = getState(step.id, step.terminal);

          // Reserved slot, always rendered, so a step changing state does not
          // reflow the label under it.
          const glyph =
            state === "done" ? "✓" : state === "problem" ? "!" : "";

          // Said plainly, the way the shop says it. "Needs attention" is the
          // canned support phrasing the brand voice rules out, and it is also
          // vaguer than the thing it is describing.
          const statusLabel =
            state === "done"
              ? "done"
              : state === "problem"
              ? "something's missing"
              : isCurrent
              ? "you're here"
              : "not started yet";

          return (
            <li
              key={step.id}
              className="border-l border-[var(--rule)] first:border-l-0"
            >
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={isCurrent ? "step" : undefined}
                className={[
                  "group flex h-full min-h-[44px] w-full cursor-pointer flex-col",
                  "justify-center gap-1 px-2 py-3 text-left",
                  "transition-colors duration-[120ms] ease-linear",
                  "active:translate-x-[2px] active:translate-y-[2px]",
                  // The current step is the one cell on PAPER; the rest sit
                  // recessed in the blank tint. The first cut had this the
                  // other way round, and a tinted cell among white siblings
                  // reads as recessed — which is the disabled signal, working
                  // against the state it was meant to carry. The 2px ink rule
                  // and the bold label do the rest, so the state still
                  // survives greyscale.
                  isCurrent
                    ? "border-t-2 border-t-[var(--ink-black)] bg-[var(--paper)]"
                    : [
                        "border-t-2 border-t-transparent bg-[var(--shirt-blank)]",
                        // Ink inversion — the house hover move. The current
                        // step is left alone; inverting where you already are
                        // reads as a control that goes somewhere.
                        "hover:bg-[var(--ink-black)]",
                      ].join(" "),
                ].join(" ")}
              >
                <span className="flex items-baseline justify-between gap-1">
                  <span
                    className={[
                      "spec text-spec",
                      isCurrent
                        ? "text-[var(--ink-black)]"
                        : "text-[var(--ink-muted)] group-hover:text-[var(--paper)]",
                    ].join(" ")}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span
                    aria-hidden
                    className={[
                      "spec w-3 shrink-0 text-right text-spec font-bold",
                      // GREEN BRIGHT is the ink-on-black lift; GORILLA GREEN
                      // does not hold up on the inverted fill.
                      state === "done"
                        ? "text-[var(--gorilla-green)] group-hover:text-[var(--green-bright)]"
                        : "",
                      state === "problem"
                        ? "text-[var(--rush-red)] group-hover:text-[var(--paper)]"
                        : "",
                    ].join(" ")}
                  >
                    {glyph}
                  </span>
                </span>

                <span
                  className={[
                    "text-spec leading-tight sm:text-fine",
                    isCurrent ? "font-bold" : "font-semibold",
                    isCurrent
                      ? "text-[var(--ink-black)]"
                      : [
                          state === "problem"
                            ? "text-[var(--rush-red)]"
                            : "text-[var(--ink-muted)]",
                          "group-hover:text-[var(--paper)]",
                        ].join(" "),
                  ].join(" ")}
                >
                  {step.label}
                </span>

                <span className="sr-only">, {statusLabel}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
