import { looksLikeEmailAddress } from "./email-address";
import { todayIso, type TurnaroundLane } from "./turnaround";
// The floor the FORM enforces is the rush floor where rush is offered
// (lib/rush.ts) — picking a rush date is allowed and priced, not refused.
// Below even that, the answer is still the phone.
import { isNeedByRefused, needByRefusedError } from "./rush";
import { orderProblemsByStep, type FieldProblem } from "./steps";
import { Order, StickerItem } from "../types/order";

/**
 * The email rule, once, for all three flows.
 *
 * ── WHAT THE OLD RULE LET THROUGH ─────────────────────────────────────────
 * All three flows checked `!email.trim()` and nothing else, so the single
 * character "x" was a valid email address as far as this app was concerned.
 * So were "dana@", "@example.com", "no at sign" and — the one a real customer
 * actually types — "dana@gmailcom".
 *
 * Nothing downstream caught it, because everything downstream assumed this
 * layer had. The address became the Printavo contact, the recipient of a live
 * payment link, and the second half of the /track lookup, and the customer
 * got a green confirmation screen for an order nobody could ever reach them
 * about. For stickers that means an unpayable invoice; for signs and apparel
 * it means a quote request the shop cannot answer.
 *
 * Three copies of an insufficient rule is how it survived this long, so there
 * is now one copy, and it is the same predicate lib/email.ts uses before it
 * hands an address to a mail provider. The two layers cannot disagree.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function getEmailError(email: string) {
  if (!email.trim()) return "Enter your email.";

  if (!looksLikeEmailAddress(email)) {
    // Names the fix rather than just the failure: "invalid" tells someone
    // staring at an address that looks fine to them precisely nothing.
    return "Check your email address — it needs an @ and a domain, like name@example.com.";
  }

  return null;
}

/** The subset of FieldKey that belongs to one design rather than the order. */
export type ItemFieldKey = "artwork" | "width" | "height" | "quantity";

export type ItemFieldErrors = Partial<Record<ItemFieldKey, string>>;

/**
 * Per-design failures.
 *
 * Split out from the order-level rules so the cart can mark the card that is
 * actually wrong. With one design this returns exactly what the old
 * single-product checks returned, which is what makes the cart migration a
 * no-op for a single-design order.
 */
export function getItemFieldErrors(item: StickerItem): ItemFieldErrors {
  const errors: ItemFieldErrors = {};

  if (!item.artwork.file) {
    errors.artwork = "Upload your artwork before submitting.";
  }

  // A blank width or height is not harmless. getAreaSqIn falls back to parsing
  // the legacy preset label when dimensions are 0, and that label defaults to
  // 3" — so clearing a box silently repriced the design as a 3" square and,
  // for stickers, auto-generated a payment link at that price. Blocking submit
  // is the fix; the fallback stays for old quotes that still carry presets.
  if (!(item.widthInches > 0)) {
    errors.width = "Enter a width.";
  }

  if (!(item.heightInches > 0)) {
    errors.height = "Enter a height.";
  }

  if (!(item.quantity > 0)) {
    errors.quantity = "Enter how many you need.";
  }

  return errors;
}

/**
 * Every input any flow can mark as invalid.
 *
 * One union across stickers, signs and apparel rather than three: only one
 * builder is mounted at a time, so the keys cannot collide, and the page can
 * hold a single errors object instead of switching shape per flow.
 */
export type FieldKey =
  | "artwork"
  | "needBy"
  | "customerName"
  | "customerEmail"
  | "width"
  | "height"
  | "quantity"
  | "printLocations"
  | "specialOrderNotes";

/** Field key -> the short message shown under that field. */
export type FieldErrors = Partial<Record<FieldKey, string>>;

/**
 * Per-field messages for the sticker flow.
 *
 * Deliberately shorter than the summary strings below: these sit directly
 * under a labelled box, so repeating the label in the message is noise.
 * Sentence case, never mono — mono is spec furniture, not prose.
 */
export function getOrderFieldErrors(
  order: Order,
  /** Injectable so tests do not depend on the day they run. */
  today: string = todayIso()
): FieldErrors {
  const errors: FieldErrors = {};

  // Walks the cart and reports the FIRST design with a problem.
  //
  // FieldErrors is one flat map because only one builder is mounted at a
  // time, and that still holds — what changed is that a flow can now have
  // several designs. Reporting the earliest failure keeps submit's "jump to
  // the first thing wrong" behaviour honest in reading order. Per-design
  // marks need a per-item error map; see getItemFieldErrors below, which is
  // what the cart UI uses to mark the right card.
  const firstBroken = order.items.find(
    (item) => Object.keys(getItemFieldErrors(item)).length > 0
  );

  if (firstBroken) {
    Object.assign(errors, getItemFieldErrors(firstBroken));
  }

  if (!order.production.needBy) {
    errors.needBy = "Enter the date you need this in hand.";
  } else if (isNeedByRefused(order.production.needBy, "fast", today)) {
    // Stickers ride the fast lane (lib/turnaround.ts) — and of the three
    // flows this is the one where the floor really matters: stickers
    // auto-bill, so an impossible in-hand date could be PAID for before
    // anyone at the shop reads it.
    errors.needBy = needByRefusedError("fast", today);
  }

  if (!order.customer.customerName.trim()) {
    errors.customerName = "Enter your name.";
  }

  const emailError = getEmailError(order.customer.email);
  if (emailError) {
    errors.customerEmail = emailError;
  }

  // Phone is optional (matches the apparel flow) — collected but not required.

  return errors;
}

/**
 * The same failures as a summary list, for the checklist panel and the
 * submit message.
 *
 * Derived from the field map rather than re-running the rules, so the list
 * and the per-field marks can never disagree about what is missing. Width and
 * height collapse back into one sentence here because the summary reads as
 * prose; beside two adjacent boxes they need their own short messages.
 */
export function getOrderValidationErrors(order: Order) {
  const fields = getOrderFieldErrors(order);
  const problems: FieldProblem[] = [];

  if (fields.artwork) {
    problems.push({ field: "artwork", message: "Upload your artwork." });
  }

  if (fields.width || fields.height) {
    problems.push({
      field: "width",
      message: "Enter the width and height of your sticker.",
    });
  }

  if (fields.quantity) {
    problems.push({ field: "quantity", message: fields.quantity });
  }

  if (fields.needBy) {
    problems.push({ field: "needBy", message: fields.needBy });
  }

  if (fields.customerName) {
    problems.push({ field: "customerName", message: fields.customerName });
  }

  if (fields.customerEmail) {
    problems.push({ field: "customerEmail", message: fields.customerEmail });
  }

  // Sorted by the step that owns each field, so this list and the form ask in
  // the same order. See orderProblemsByStep.
  return orderProblemsByStep(problems);
}

export function isOrderReady(order: Order) {
  return getOrderValidationErrors(order).length === 0;
}

/**
 * Sign and banner failures.
 *
 * Lived inside app/page.tsx as a closure over component state, which meant the
 * one flow that quotes large-format work had rules nothing could test. That is
 * how the quantity check came to be missing in the first place: stickers and
 * apparel both had one, signs did not, and there was no suite to notice the
 * gap. Pure function, same shape as the sticker rules above, so it can be.
 *
 * Takes only what it reads. `order` supplies the customer, the artwork file
 * and the date; `signsQuote` supplies everything about the sign itself.
 */
export type SignsDesignInput = {
  /** null when the customer is uploading their own art rather than using a template. */
  templateId: string | null;
  quantity: number;
  customWidthInches: number;
  customHeightInches: number;
  artwork: { file: unknown };
  /**
   * False only for products whose size is fixed by the shop — yard signs are
   * made at one size and show no width or height field.
   */
  needsTypedSize: boolean;
};

/**
 * One design's own failures.
 *
 * Split out when signs grew a design list, for the same reason
 * getItemFieldErrors exists for stickers: the flat map below can only name
 * ONE artwork problem, and with three designs on screen the customer needs to
 * know WHICH one is missing a file.
 */
export function getSignsDesignFieldErrors(
  design: SignsDesignInput
): ItemFieldErrors {
  const errors: ItemFieldErrors = {};

  // A template IS the artwork. Choosing one replaces the upload rather than
  // adding to it, so requiring a file as well would make a finished design
  // unsubmittable.
  if (!design.templateId && !design.artwork.file) {
    errors.artwork = "Upload your artwork, or start from one of our templates.";
  }

  if (!(design.quantity > 0)) {
    errors.quantity = "Enter how many you need.";
  }

  // Every size is typed now except the yard sign, which is frozen at
  // 18" x 24" and shows no width or height field at all.
  if (design.needsTypedSize) {
    if (!(design.customWidthInches > 0)) {
      errors.width = "Enter a width.";
    }

    if (!(design.customHeightInches > 0)) {
      errors.height = "Enter a height.";
    }
  }

  return errors;
}

export function getSignsFieldErrors(
  designs: SignsDesignInput[],
  order: {
    customer: { customerName: string; email: string };
    production: { needBy: string };
  },
  /**
   * Required, not defaulted: this validator serves both halves of the
   * banners/signs hard split, and they sit in different turnaround lanes —
   * banners next-business-day with stickers, yard and rigid signs on
   * apparel's 14-business-day floor. A default would silently pick one
   * family's promise for the other.
   */
  lane: TurnaroundLane,
  today: string = todayIso()
): FieldErrors {
  const errors: FieldErrors = {};

  if (!order.customer.customerName.trim()) {
    errors.customerName = "Enter your name.";
  }

  const emailError = getEmailError(order.customer.email);
  if (emailError) {
    errors.customerEmail = emailError;
  }

  if (!order.production.needBy.trim()) {
    errors.needBy = "Enter the date you need this in hand.";
  } else if (isNeedByRefused(order.production.needBy, lane, today)) {
    errors.needBy = needByRefusedError(lane, today);
  }

  /**
   * Walks the designs and reports the FIRST with a problem, exactly as
   * getOrderFieldErrors does for the sticker cart.
   *
   * FieldErrors is one flat map because only one builder is mounted at a
   * time, and that still holds — what changed is that signs can now have
   * several designs. Reporting the earliest failure keeps submit's "jump to
   * the first thing wrong" behaviour honest in reading order; the per-design
   * marks come from getSignsDesignFieldErrors above.
   *
   * The quantity rule in particular used to be unreachable, and its comment
   * said so and treated it as fine: "NumberField snaps to a minimum of 1 on
   * blur, so a customer typing in the box cannot get a zero past this today."
   * That spring-back WAS the bug — clearing "How many" silently sold the
   * customer one sign. NumberField now leaves a cleared box cleared, so this
   * fires for the ordinary typing customer, which is who it was always for.
   */
  for (const design of designs) {
    const designErrors = getSignsDesignFieldErrors(design);

    for (const [key, message] of Object.entries(designErrors) as Array<
      [keyof ItemFieldErrors, string]
    >) {
      if (!errors[key]) {
        errors[key] = message;
      }
    }
  }

  return errors;
}

/**
 * The signs problem list, as sentences.
 *
 * ── WHY THIS IS NOT IN THE COMPONENT ──────────────────────────────────────
 * It was, and AGENTS.md says why that is a mistake: "the rules nothing could
 * test were the ones with gaps." This one proved it. Template wording errors
 * were named by design — "Design 2: Enter the address" — while artwork,
 * quantity and size were read off the flat FieldErrors map, which reports the
 * first design with a problem and drops which one it was.
 *
 * So a three-design quote missing a file on design 2 said "Upload your
 * artwork." and nothing more. The customer looked at design 1, found a file
 * on it, and had nowhere to go — the exact dead end the step mapping exists
 * to prevent, arrived at from a different direction.
 *
 * Order-level problems stay unqualified: there is one name, one address and
 * one date however many designs the quote holds.
 */
export function getSignsValidationSummary(
  designs: Array<SignsDesignInput & { templateTextErrors?: Record<string, string> }>,
  order: {
    customer: { customerName: string; email: string };
    production: { needBy: string };
  },
  lane: TurnaroundLane,
  today: string = todayIso()
): string[] {
  const fields = getSignsFieldErrors(designs, order, lane, today);
  const problems: FieldProblem[] = [];

  // Order-level: one name, one address, one date, however many designs.
  if (fields.customerName) {
    problems.push({ field: "customerName", message: fields.customerName });
  }
  if (fields.customerEmail) {
    problems.push({ field: "customerEmail", message: fields.customerEmail });
  }
  if (fields.needBy) {
    problems.push({ field: "needBy", message: fields.needBy });
  }

  const many = designs.length > 1;

  designs.forEach((design, index) => {
    const own = getSignsDesignFieldErrors(design);
    const prefix = many ? `Design ${index + 1}: ` : "";

    if (own.artwork) {
      problems.push({
        field: "artwork",
        message: `${prefix}Upload your artwork.`,
      });
    }

    if (own.quantity) {
      problems.push({ field: "quantity", message: `${prefix}${own.quantity}` });
    }

    // One sentence for two boxes: the summary reads as prose, the fields get
    // their own short messages.
    if (own.width || own.height) {
      problems.push({
        field: "width",
        message: `${prefix}Enter the width and height.`,
      });
    }

    for (const message of Object.values(design.templateTextErrors || {})) {
      // No FieldKey of their own — template fields are per-template and would
      // have to join the union for every template anyone adds. They live on
      // the details step regardless.
      problems.push({ step: "details", message: `${prefix}${message}` });
    }
  });

  return orderProblemsByStep(problems);
}

/**
 * Apparel failures.
 *
 * Extracted from app/page.tsx for the same reason as the sign rules above: as
 * a closure over component state, nothing could test them. Apparel is the
 * flow with the most conditional structure of the three — a special order
 * skips half the rules — which makes it the one least safe to leave untested.
 *
 * `sizeQuantityTotal` is passed in rather than derived here. It is the sum of
 * the size grid, and the component already computes it and syncs `quantity` to
 * it; recomputing it from the breakdown string in a second place is exactly
 * the kind of duplicate arithmetic that drifts.
 */
/**
 * The apparel problem list, as sentences.
 *
 * Lived in app/page.tsx until signs proved why that is a bad place for it:
 * a list nothing can test is a list with a gap in it, and apparel was the
 * last flow still assembling one there. It is also the flow with the most
 * conditional structure, so it had the most to get wrong.
 *
 * Ordered by FIELD_STEP like the other two, so all three checklists ask in
 * the same sequence the form does.
 */
export function getApparelValidationSummary(
  apparelQuote: Parameters<typeof getApparelFieldErrors>[0],
  order: Parameters<typeof getApparelFieldErrors>[1],
  sizeQuantityTotal: number,
  today: string = todayIso()
): string[] {
  const fields = getApparelFieldErrors(apparelQuote, order, sizeQuantityTotal, today);
  const problems: FieldProblem[] = [];

  // Pushed straight from the field map, as stickers and signs already do.
  // These used to be re-worded here into passive spec voice ("Customer name
  // is required.") while the other two flows said "Enter your name." — one
  // checklist panel speaking differently depending on which product the
  // customer happened to pick.
  if (fields.customerName) {
    problems.push({ field: "customerName", message: fields.customerName });
  }
  if (fields.customerEmail) {
    problems.push({ field: "customerEmail", message: fields.customerEmail });
  }
  if (fields.artwork) {
    problems.push({ field: "artwork", message: "Upload your artwork." });
  }
  if (fields.needBy) {
    problems.push({ field: "needBy", message: fields.needBy });
  }
  if (fields.specialOrderNotes) {
    problems.push({
      field: "specialOrderNotes",
      message: "Tell us what you need for your special order.",
    });
  }
  if (fields.quantity) {
    problems.push({ field: "quantity", message: fields.quantity });
  }
  if (fields.printLocations) {
    problems.push({ field: "printLocations", message: fields.printLocations });
  }
  // No sizeBreakdown rule any more: sizes are optional at estimate time —
  // the blend covers them and the quantity rule above owns the count.

  return orderProblemsByStep(problems);
}

export function getApparelFieldErrors(
  apparelQuote: {
    specialOrder: boolean;
    specialOrderNotes: string;
    quantity: number;
    printLocations: string[];
  },
  order: {
    customer: { customerName: string; email: string };
    artwork: { file: unknown };
    production: { needBy: string };
  },
  /** Total across the size grid. Quantity IS this sum, so the two cannot disagree. */
  sizeQuantityTotal: number,
  today: string = todayIso()
): FieldErrors {
  const errors: FieldErrors = {};

  if (!order.customer.customerName.trim()) {
    errors.customerName = "Enter your name.";
  }

  const emailError = getEmailError(order.customer.email);
  if (emailError) {
    errors.customerEmail = emailError;
  }

  if (!order.production.needBy.trim()) {
    errors.needBy = "Enter the date you need this in hand.";
  } else if (isNeedByRefused(order.production.needBy, "slow", today)) {
    // Apparel always rides the slow lane: blanks ordered in, screens
    // burned. The rule applies to special orders too — a hand quote can
    // still not beat the calendar.
    errors.needBy = needByRefusedError("slow", today);
  }

  // A special order is priced by hand, so the strict menu rules (print
  // locations, matching size breakdown) don't apply — we just need to know
  // what they want.
  if (apparelQuote.specialOrder) {
    if (!apparelQuote.specialOrderNotes.trim()) {
      errors.specialOrderNotes = "Tell us what you need.";
    }

    if (!(apparelQuote.quantity > 0)) {
      errors.quantity = "Enter roughly how many you need.";
    }

    // Artwork is deliberately NOT required here. This is the apparel request
    // flow, and a customer asking what 40 hoodies cost usually has no
    // print-ready file yet — demanding one turns the shop's highest-value
    // enquiry into an upload problem and loses the lead outright. The shop
    // collects artwork in the reply; the quote email already renders "No file
    // uploaded" without complaint.
    return errors;
  }

  if (!order.artwork.file) {
    errors.artwork = "Upload your artwork before submitting.";
  }

  if (apparelQuote.printLocations.length === 0) {
    errors.printLocations = "Choose at least one print location.";
  }

  /**
   * Sizes are OPTIONAL at estimate time now — the blend (lib/apparel-
   * blend.ts) prices an assumed mix, states it on screen, and every real
   * apparel quote in the four-week readout submitted without sizes anyway.
   * What is required is a count: the rough quantity, or the grid total once
   * sizes exist (the grid wins — apparelQuote.quantity is already whichever
   * applies, see the memo in page.tsx). Apparel is hand-confirmed before
   * anything is charged, so the shop chases sizes exactly as it always has.
   */
  if (!(apparelQuote.quantity > 0)) {
    errors.quantity = "Enter roughly how many you need.";
  }

  return errors;
}
