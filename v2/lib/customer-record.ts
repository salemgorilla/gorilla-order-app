/**
 * What happened to the customer's record in Printavo, said out loud.
 *
 * ── WHY THIS MATTERS AT A COUNTER ─────────────────────────────────────────
 * findOrCreateContactId already works out whether a submission joined an
 * existing Printavo contact or created a new one, and already returns it as
 * `matchedExistingCustomer` / `createdCustomer`. Both reach the browser on
 * every submit. Nothing has ever displayed them.
 *
 * That is fine on the website, where nobody could act on it and telling an
 * anonymous submitter "we already have you" would confirm an address is on
 * file to whoever typed it.
 *
 * At the counter it is the opposite. Matching is EMAIL-ONLY — a returning
 * customer who gives a different address becomes a second record, silently,
 * and the shop's history for that person splits in two. The moment of submit
 * is the only moment anybody can still fix it, because the customer is
 * standing there and can be asked "have you ordered with us before, maybe
 * under another address?"
 *
 * So: staff-facing, kiosk-only, and stated plainly rather than implied.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type CustomerRecordNote = {
  /** Short label for the chip. */
  label: string;
  /** One line saying what it means for the person reading it. */
  detail: string;
  /** True when somebody may want to do something about it. */
  attention: boolean;
};

/**
 * Null when there is nothing trustworthy to say.
 *
 * A quote Printavo never accepted has no customer record to report on, and
 * guessing from stale flags would be worse than silence — the shop would be
 * told "new customer" for an order that never reached Printavo at all.
 */
export function describeCustomerRecord(input: {
  created: boolean;
  skipped?: boolean;
  matchedExistingCustomer?: boolean;
  createdCustomer?: boolean;
}): CustomerRecordNote | null {
  if (!input.created || input.skipped) return null;

  if (input.matchedExistingCustomer) {
    return {
      label: "Returning customer",
      detail:
        "This order joined their existing Printavo record. Their history is in one place.",
      attention: false,
    };
  }

  if (input.createdCustomer) {
    return {
      label: "New customer record",
      detail:
        "No Printavo contact matched this email, so a new one was created. If they have ordered before under a different address, say so now and the two can be merged.",
      // The one worth a second look. A duplicate is cheap to fix today and
      // annoying to untangle in six months.
      attention: true,
    };
  }

  /**
   * Neither flag set, but the quote was created — so it went onto the
   * PRINTAVO_CUSTOMER_ID fallback contact rather than the customer's own.
   * Worth flagging: the order is filed under a catch-all and somebody has to
   * move it, or the customer's history has a hole in it.
   */
  return {
    label: "Filed under the fallback contact",
    detail:
      "Printavo could not match or create a contact for this email, so the quote is on the catch-all record. Move it to the right customer before it ships.",
    attention: true,
  };
}
