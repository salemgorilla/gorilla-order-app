import type { FieldErrors, FieldKey } from "./validation";

/**
 * Order Desk — the step model.
 *
 * The form used to be one continuous scroll: product, config, delivery,
 * upload, date, customer, preview, summary, add-ons, review, all stacked.
 * Two UX reviews independently found the same thing — a customer could not
 * tell how far along they were or how much was left.
 *
 * The fix is real steps, not a progress ornament on the same scroll. This
 * file is the single description of what those steps are and which one every
 * validated field belongs to, so the step bar, the panel headings and the
 * failed-submit jump can never disagree about where a problem lives.
 */

export type StepId = "product" | "details" | "artwork" | "contact" | "review";

export type OrderStep = {
  id: StepId;
  /**
   * Step-bar label. One word wherever possible: the bar renders five across
   * on a 360px phone, and a wrapped two-word label is what breaks it.
   * Sentence case — the accessibility floor governs labels, and these are
   * labels, not section eyebrows.
   */
  label: string;
  /** Panel heading. Flows that need their own wording override this. */
  title: string;
  /** One line under the heading saying what this step is for. */
  blurb: string;
  /**
   * The last step. Terminal steps never mark themselves complete: "done"
   * would be a claim that the order was placed, and the only thing that can
   * make that true is a successful submit — which leaves this screen entirely.
   */
  terminal?: boolean;
};

export const ORDER_STEPS: readonly OrderStep[] = [
  {
    id: "product",
    label: "Product",
    title: "What do you want to quote?",
    blurb: "Pick what you're ordering. Everything after this follows from it.",
  },
  {
    id: "details",
    label: "Details",
    title: "Choose your details",
    blurb: "Size, quantity, how you want it made, and when you need it.",
  },
  {
    id: "artwork",
    label: "Artwork",
    title: "Upload your artwork",
    blurb:
      "Send the file you want printed. We review every file by hand before production.",
  },
  {
    id: "contact",
    label: "Contact",
    title: "How do we reach you?",
    blurb: "Where the quote goes, and who to ask if we have a question.",
  },
  {
    id: "review",
    label: "Review",
    title: "Review and send",
    blurb: "Check it over, add anything else you need, then send it to the shop.",
    terminal: true,
  },
] as const;

export const STEP_COUNT = ORDER_STEPS.length;

/**
 * Which step every validated field lives in.
 *
 * `Record`, not `Partial<Record>` — deliberately, and this is the point of the
 * file. `FieldKey` in lib/validation.ts is the one union of everything any
 * flow can mark invalid. Requiring an entry for all of them means adding a
 * field without deciding which step owns it fails the build, instead of
 * shipping a field that submit can mark red but never navigate to.
 *
 * Keep this in step order for readability; `getFirstStepWithError` reads
 * ORDER_STEPS rather than these keys, so the order here carries no meaning.
 */
export const FIELD_STEP: Record<FieldKey, StepId> = {
  // Details — the builder plus the needed-in-hand date.
  width: "details",
  height: "details",
  quantity: "details",
  printLocations: "details",
  specialOrderNotes: "details",
  garmentLines: "details",
  needBy: "details",

  // Artwork — the upload box.
  artwork: "artwork",

  // Contact — the customer form.
  customerName: "contact",
  customerEmail: "contact",
};

/**
 * A problem, tagged with where in the form it lives.
 *
 * `field` is the usual case and resolves through FIELD_STEP. `step` is for
 * problems that have no FieldKey of their own — template wording, say, which
 * is per-template and would otherwise have to join the FieldKey union for
 * every template anyone adds.
 */
export type FieldProblem = {
  message: string;
  field?: FieldKey;
  step?: StepId;
};

/**
 * The problem list, in the order the form asks the questions.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * All three flows built this list by hand, and all three chose a different
 * order for the same checklist panel:
 *
 *   stickers  artwork, size, quantity, date, name, email
 *   signs     name, email, date, then the designs
 *   apparel   name, email, artwork, date, notes, quantity, locations, sizes
 *
 * The form asks in one order — details, artwork, contact — so every one of
 * those sent a customer reading top to bottom backwards through their own
 * quote. It is the same class of thing as the apparel messages that once said
 * "Customer name is required." while the other two said "Enter your name.":
 * one panel behaving differently depending on which product was picked.
 *
 * Sorting by FIELD_STEP means the three cannot disagree again, and the list
 * agrees with "jump to the first problem" by construction rather than by
 * three people remembering. The sort is stable, so the order WITHIN a step is
 * whatever the caller pushed — which is reading order down the form, and for
 * signs, design 1 before design 2.
 */
export function orderProblemsByStep(problems: FieldProblem[]): string[] {
  const stepOf = (problem: FieldProblem): StepId =>
    problem.step ?? (problem.field ? FIELD_STEP[problem.field] : "details");

  return problems
    .map((problem, index) => ({ problem, index }))
    .sort((a, b) => {
      const byStep =
        getStepIndex(stepOf(a.problem)) - getStepIndex(stepOf(b.problem));

      return byStep !== 0 ? byStep : a.index - b.index;
    })
    .map(({ problem }) => problem.message);
}

export function getStepIndex(id: StepId): number {
  const index = ORDER_STEPS.findIndex((step) => step.id === id);

  // Not reachable through the UI — StepId is closed — but a -1 here would
  // quietly render "Step 0 of 5" rather than fail, so clamp it.
  return index === -1 ? 0 : index;
}

export function getStep(id: StepId): OrderStep {
  return ORDER_STEPS[getStepIndex(id)];
}

/** Every step currently holding at least one failing field. */
export function getStepsWithErrors(errors: FieldErrors): Set<StepId> {
  const stepIds = new Set<StepId>();

  for (const key of Object.keys(errors) as FieldKey[]) {
    // getOrderFieldErrors only ever sets keys it means, but a `Partial`
    // carrying an explicit undefined would otherwise count as a failure.
    if (errors[key]) {
      stepIds.add(FIELD_STEP[key]);
    }
  }

  return stepIds;
}

/**
 * The earliest step holding something the customer still has to fix.
 *
 * Walks ORDER_STEPS rather than the error object, so the answer is the first
 * problem in *reading order* — which is what a failed submit has to jump to.
 * Object key order would be whatever the validator happened to assign first.
 */
export function getFirstStepWithError(errors: FieldErrors): StepId | null {
  const stepsWithErrors = getStepsWithErrors(errors);

  return ORDER_STEPS.find((step) => stepsWithErrors.has(step.id))?.id ?? null;
}

/**
 * Does this step own any validated field at all?
 *
 * Product and Review own none, so "no errors" is not evidence a customer
 * finished them — it is only evidence there was nothing there to get wrong.
 */
export function stepHasFields(id: StepId): boolean {
  return Object.values(FIELD_STEP).includes(id);
}
