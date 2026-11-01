/**
 * THE DATE THE CUSTOMER NEEDS IT, AS A SHORT LABEL.
 *
 * Gabe, 2026-10-29: the date was not visible in the email that arrives when a
 * quote is submitted. It had always been in the PLAIN-TEXT body (a TIMELINE
 * section) and was never in the HTML body, which is the one Gmail shows; the
 * subject line and the Printavo job list never carried it at all. This is the
 * one place the label is built, so the subject, the email's top block and the
 * Printavo nickname cannot word it three ways.
 *
 * `production.needBy` is a YYYY-MM-DD string from <input type="date">. It is
 * parsed by hand, never through `new Date(string)`: a date-only string is read
 * as UTC midnight, which prints as the PREVIOUS day anywhere west of Greenwich,
 * and this shop is in Massachusetts. A label one day early on a deadline is
 * worse than no label.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-12-02" -> "Dec 2". Null for anything that is not a real calendar date. */
export function formatNeedBy(needBy: unknown): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(needBy ?? "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Round-trip through UTC to reject 2026-02-31 without depending on the
  // machine's timezone.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    check.getUTCFullYear() !== year ||
    // An overflowing day (Feb 31, day 0) rolls into a neighbouring month, so
    // the month alone is enough to catch it.
    check.getUTCMonth() !== month - 1
  ) {
    return null;
  }

  return `${MONTHS[month - 1]} ${day}`;
}

/**
 * "NEED BY Dec 2" or "NEED BY Dec 2 (FIRM)"; null when there is no usable date.
 *
 * Firm is marked and flexible is not: the whole point of the second answer is
 * to tell the shop which dates can move, and a label that says "flexible" on
 * most orders would be noise on the ones that matter.
 */
export function needByLabel(production: unknown): string | null {
  const p = (production ?? {}) as Record<string, unknown>;
  const date = formatNeedBy(p.needBy);
  if (!date) return null;

  return `NEED BY ${date}${String(p.deadlineType ?? "").trim() === "Firm" ? " (FIRM)" : ""}`;
}
