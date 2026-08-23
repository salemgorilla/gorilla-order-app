/**
 * Telling the shop when the browser's price and the server's disagreed.
 *
 * ── WHY THIS NEEDS SAYING OUT LOUD ────────────────────────────────────────
 * repriceStickers exists because the browser is not allowed to set a price:
 * order.pricing arrives from the client, this route hands stickers to Printavo
 * which raises a payment link, and nobody reviews it. So the server recomputes
 * from lib/pricing.ts and charges its own figure. That part works.
 *
 * What happened to the DISAGREEMENT is the gap. It was written to
 * console.error and nowhere else — a line in a serverless function log, in an
 * app whose own comments note that a console.error in a function log is a
 * thing nobody watches. The shop reads the quote email for every order, and
 * that email said nothing.
 *
 * A mismatch has exactly three causes and the shop wants to know about all of
 * them:
 *
 *   1. a page left open through a price change, so the customer was quoted
 *      from a stale bundle and will ask why the invoice differs;
 *   2. somebody editing the total before submitting;
 *   3. a real disagreement between the browser's pricing and the server's,
 *      which is a bug in one of them and would otherwise go unnoticed.
 *
 * ── THE DIRECTION IS NOT A DETAIL ─────────────────────────────────────────
 * Server higher than browser means the submission asked to pay LESS than the
 * job is worth. That is the direction that costs money, and it is the one an
 * attacker produces. Server lower means the customer saw a bigger number than
 * they will be charged — awkward, not expensive. Same event, different jobs
 * for whoever reads it, so it does not get one flat sentence.
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * Short on purpose, and the direction lives in the detail rather than here.
 *
 * ── WHY IT WAS SHORTENED ──────────────────────────────────────────────────
 * The shop email's label cell used to be `white-space: nowrap`, so a long
 * label set the column width for the whole section. On a phone that left the
 * value about sixty pixels to wrap in, and this warning came out one syllable
 * per line — taller than the rest of the email and unreadable. Found by
 * rendering the HTML at 390px, which is how the shop reads it; the plain-text
 * version looked fine throughout, which is exactly why nothing caught it.
 *
 * ── WHAT CHANGED SINCE ────────────────────────────────────────────────────
 * The email no longer works that way. Labels wrap and the NUMBERS are what is
 * protected — see tests/email-money-wrapping.test.ts — because shortening
 * strings turned out to be treating the symptom, and the same defect shipped
 * twice more after this one.
 *
 * So this label stays short because a short label is better, not because
 * anything breaks if it grows.
 */
const LABEL = "Price check";

export type RepricingNote = {
  label: string;
  detail: string;
  /** True when the browser submitted LESS than the server computed. */
  underpriced: boolean;
};

function money(value: number) {
  return `$${(Math.round(value * 100) / 100).toFixed(2)}`;
}

export function describeRepricing(input: {
  mismatch: boolean;
  clientTotal: number;
  serverTotal: number;
}): RepricingNote | null {
  // The overwhelmingly common case, and it must stay silent. A line on every
  // order is a line nobody reads by the second week.
  if (!input.mismatch) return null;

  const client = Number(input.clientTotal) || 0;
  const server = Number(input.serverTotal) || 0;

  // Guard against being called with mismatch:true and identical figures —
  // there would be nothing to say, and saying it anyway trains the reader to
  // skip the line.
  if (Math.abs(server - client) < 0.005) return null;

  if (server > client) {
    return {
      label: LABEL,
      detail:
        `Submitted ${money(client)}, LOWER than the ${money(server)} charged. ` +
        `Printavo has ${money(server)}. Usually a stale page, sometimes an ` +
        `edited total — check the invoice.`,
      underpriced: true,
    };
  }

  return {
    label: LABEL,
    detail:
      `Showed ${money(client)}, higher than the ${money(server)} charged. ` +
      `Printavo has ${money(server)}. The customer may query it.`,
    underpriced: false,
  };
}
