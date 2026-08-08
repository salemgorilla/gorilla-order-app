"use client";

import { ORDER_STEPS, getStepIndex, type StepId } from "../lib/steps";

type Props = {
  currentStepId: StepId;
  onNavigate: (id: StepId) => void;
};

/**
 * Order Desk — step-to-step navigation.
 *
 * "Continue" names where it goes rather than saying "Next", so the customer
 * knows what they are walking into before they leave the step they can see.
 *
 * Neither button validates. Moving forward with a box still empty is allowed
 * on purpose — the step bar will show that step as outstanding, and submit is
 * the one gate, where it can name every missing thing at once instead of
 * stopping the customer five times on the way down.
 */
export default function StepFooter({ currentStepId, onNavigate }: Props) {
  const index = getStepIndex(currentStepId);
  const previous = index > 0 ? ORDER_STEPS[index - 1] : null;
  const next = index < ORDER_STEPS.length - 1 ? ORDER_STEPS[index + 1] : null;

  // The last step's action is the submit button itself; a second forward
  // control beside it would be two things claiming to finish the order.
  if (!previous && !next) {
    return null;
  }

  return (
    <div className="mt-8 flex flex-col gap-3 border-t border-[var(--rule)] pt-6 sm:flex-row-reverse sm:items-center sm:justify-between">
      {next && (
        <button
          type="button"
          onClick={() => onNavigate(next.id)}
          className={[
            "min-h-[44px] w-full cursor-pointer border-2 border-[var(--gorilla-green)]",
            "bg-[var(--gorilla-green)] px-6 py-4 text-lede font-bold text-white",
            "transition-colors duration-[120ms] ease-linear",
            "hover:border-[var(--gorilla-green-dark)] hover:bg-[var(--gorilla-green-dark)]",
            "active:translate-x-[2px] active:translate-y-[2px] sm:w-auto",
          ].join(" ")}
        >
          Continue to {next.label.toLowerCase()}
        </button>
      )}

      {previous && (
        <button
          type="button"
          onClick={() => onNavigate(previous.id)}
          className={[
            "min-h-[44px] w-full cursor-pointer border border-[var(--rule)]",
            "bg-[var(--paper)] px-6 py-4 font-bold text-[var(--ink-black)]",
            "transition-colors duration-[120ms] ease-linear",
            // Ink inversion, same as every other secondary control.
            "hover:border-[var(--ink-black)] hover:bg-[var(--ink-black)] hover:text-[var(--paper)]",
            "active:translate-x-[2px] active:translate-y-[2px] sm:w-auto",
          ].join(" ")}
        >
          Back to {previous.label.toLowerCase()}
        </button>
      )}
    </div>
  );
}
