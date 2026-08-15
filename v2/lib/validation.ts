import { Order, StickerItem } from "../types/order";

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

  if (!order.customer.email.trim()) {
    errors.customerEmail = "Enter your email.";
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
  // NumberField snaps to a minimum of 1 on blur, so a customer typing in the
  // box cannot get a zero past this today — clearing the field and moving on
  // springs it back. This guards the paths that do not go through that box.
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
