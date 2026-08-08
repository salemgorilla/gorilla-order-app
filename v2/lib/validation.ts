import { Order } from "../types/order";

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

  if (!order.artwork.file) {
    errors.artwork = "Upload your artwork before submitting.";
  }

  // A blank width or height is not harmless. getAreaSqIn falls back to parsing
  // the legacy preset label when dimensions are 0, and that label defaults to
  // 3" — so clearing a box silently repriced the order as a 3" square and, for
  // stickers, auto-generated a payment link at that price. Blocking submit is
  // the fix; the fallback itself stays for old quotes that still carry presets.
  if (!(order.product.widthInches > 0)) {
    errors.width = "Enter a width.";
  }

  if (!(order.product.heightInches > 0)) {
    errors.height = "Enter a height.";
  }

  if (!(order.product.quantity > 0)) {
    errors.quantity = "Enter how many you need.";
  }

  if (!order.production.needBy) {
    errors.needBy = "Enter the date you need this order in hand.";
  }

  if (!order.customer.customerName.trim()) {
    errors.customerName = "Enter your name.";
  }

  if (!order.customer.email.trim()) {
    errors.customerEmail = "Enter your email.";
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
