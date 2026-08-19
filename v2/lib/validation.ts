import { looksLikeEmailAddress } from "./email-address";
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
  | "sizeBreakdown"
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
export function getOrderFieldErrors(order: Order): FieldErrors {
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
  const errors: string[] = [];

  if (fields.artwork) {
    errors.push("Upload your artwork.");
  }

  if (fields.width || fields.height) {
    errors.push("Enter the width and height of your sticker.");
  }

  if (fields.quantity) {
    errors.push(fields.quantity);
  }

  if (fields.needBy) {
    errors.push(fields.needBy);
  }

  if (fields.customerName) {
    errors.push(fields.customerName);
  }

  if (fields.customerEmail) {
    errors.push(fields.customerEmail);
  }

  return errors;
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
export function getSignsFieldErrors(
  signsQuote: {
    /** null when the customer is uploading their own art rather than using a template. */
    templateId: string | null;
    quantity: number;
    size: string;
    customWidthInches: number;
    customHeightInches: number;
  },
  order: {
    customer: { customerName: string; email: string };
    artwork: { file: unknown };
    production: { needBy: string };
  },
  /** The sentinel meaning "the customer typed their own size". */
  customSizeValue: string
): FieldErrors {
  const errors: FieldErrors = {};

  if (!order.customer.customerName.trim()) {
    errors.customerName = "Enter your name.";
  }

  const emailError = getEmailError(order.customer.email);
  if (emailError) {
    errors.customerEmail = emailError;
  }

  // A template IS the artwork. Choosing one replaces the upload rather than
  // adding to it, so requiring a file as well would make a finished design
  // unsubmittable.
  if (!signsQuote.templateId && !order.artwork.file) {
    errors.artwork = "Upload your artwork, or start from one of our templates.";
  }

  if (!order.production.needBy.trim()) {
    errors.needBy = "Enter the date you need this in hand.";
  }

  // Stickers and apparel both check this; signs did not, and a sign quote is
  // the one of the three with no per-design cart to catch it elsewhere.
  //
  // This rule used to be unreachable, and the comment here said so and
  // treated it as fine: "NumberField snaps to a minimum of 1 on blur, so a
  // customer typing in the box cannot get a zero past this today — clearing
  // the field and moving on springs it back." That spring-back WAS the bug.
  // Clearing "How many" silently sold the customer one sign, with no error,
  // because the field corrected 0 up to 1 before this rule ever saw it.
  // NumberField now leaves a cleared box cleared (see resolveBlurValue in
  // lib/units.ts), so this fires for the ordinary typing customer — which is
  // who it was always for.
  //
  // A sign priced at zero is not a cheap sign, it is a quote the shop has to
  // notice is wrong before making it, and nothing downstream was going to say
  // so.
  if (!(signsQuote.quantity > 0)) {
    errors.quantity = "Enter how many you need.";
  }

  // Only a custom size is typed — every other size resolves from the product's
  // own table, so a blank width there is not a missing answer.
  if (signsQuote.size === customSizeValue) {
    if (!(signsQuote.customWidthInches > 0)) {
      errors.width = "Enter a width.";
    }

    if (!(signsQuote.customHeightInches > 0)) {
      errors.height = "Enter a height.";
    }
  }

  return errors;
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
  sizeQuantityTotal: number
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

  // The reconciliation error is gone: quantity IS the grid total, so the two
  // cannot disagree. All that remains is asking for at least one shirt.
  if (sizeQuantityTotal < 1) {
    errors.sizeBreakdown = "Add at least one size.";
  }

  return errors;
}
