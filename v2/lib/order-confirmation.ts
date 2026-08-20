import { escapeEmailHtml, looksLikeEmailAddress } from "./email";
import { canOfferTracker, getTrackUrl } from "./order-status";

/**
 * "We've got it" — the receipt for every order that Printavo will not email.
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 * Exactly one customer-facing email has ever left this system, and it is not
 * ours: Printavo's payment request, created by createStickerCheckout. That
 * call sits inside a branch requiring isStickers, a successful Printavo push,
 * a priceable cart and a non-kiosk session.
 *
 * Everything outside that branch got NOTHING. A signs or apparel customer
 * ordering from the website at 11pm saw their GS- number on a confirmation
 * screen and then closed the tab, and that was the last either party could do
 * about it: no email, no number, nothing to search an inbox for, and no way
 * to use /track — which needs the number they no longer have. sendQuoteEmail
 * goes to the shop, not to them.
 *
 * The same silence swallowed a sticker order whenever the payment request
 * failed to generate — Printavo unreachable, or a cart priced at $0 that the
 * shop has to quote by hand.
 *
 * ── WHY IT SAYS "QUOTE" AND NOT "ORDER" ──────────────────────────────────
 * It's a quote until money changes hands. Every message this function sends
 * is, by its own send conditions, one nobody has paid for — that is precisely
 * why Printavo has not emailed them. lib/status-email.ts says "order number"
 * for the opposite reason: it only fires on statuses a paid job reaches.
 * The two are meant to disagree.
 *
 * ── WHY IT SAYS SO LITTLE ─────────────────────────────────────────────────
 * Every order that reaches this function is one the shop has not finished
 * pricing, or one whose payment link did not generate. So the email promises
 * exactly two things it can keep: we have your order, and here is its number.
 * It quotes no price and no date. The last customer-facing thing this shop
 * sends should not be the first thing it has to correct.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type OrderConfirmationDecision =
  | { send: false; reason: string }
  | { send: true; subject: string; text: string; html: string };

export function buildOrderConfirmation(input: {
  quoteNumber: string;
  customerEmail: string;
  customerName?: string;
  /**
   * True when createStickerCheckout produced a payment request. Printavo
   * emails that itself, and it already carries the number and the tracker —
   * so ours would be the second message about one order in one minute.
   */
  paymentEmailSent: boolean;
  /**
   * True when the quote actually landed in Printavo. When it did not, the
   * order exists only in the shop's inbox: the number is real and the shop
   * will honour it, but /track cannot find it, so the tracker line is
   * withheld rather than sent as a link that answers "no such order".
   */
  printavoCreated: boolean;
  /**
   * A counter order. Never emailed — the customer is standing at the till
   * with KioskPickupCard in front of them, and the address was typed on a
   * shared machine, often by staff hearing it read out. The same reason the
   * server suppresses the payment request for kiosk sessions.
   */
  kiosk: boolean;
}): OrderConfirmationDecision {
  const quoteNumber = String(input.quoteNumber || "").trim();

  if (!quoteNumber) {
    return { send: false, reason: "No order number." };
  }

  if (input.kiosk) {
    return { send: false, reason: "Kiosk order — the customer is at the counter." };
  }

  if (input.paymentEmailSent) {
    return {
      send: false,
      reason: "Printavo emailed the payment request, which already carries the number.",
    };
  }

  const to = String(input.customerEmail || "").trim();

  if (!looksLikeEmailAddress(to)) {
    return { send: false, reason: "No usable customer address." };
  }

  const name = String(input.customerName || "").trim();
  const greeting = name ? `Hi ${name},` : "Hi,";

  const showTracker = canOfferTracker({
    quoteNumber,
    printavoCreated: input.printavoCreated,
  });

  const subject = `We've got your request — ${quoteNumber}`;

  const text = [
    greeting,
    "",
    "Thanks — your quote request is in. We'll be in touch shortly with your price and a proof before anything goes on a machine.",
    "",
    `Quote number: ${quoteNumber}`,
    // Withheld when Printavo never accepted the quote — canOfferTracker
    // carries the reasoning, and the kiosk card and the confirmation screen
    // ask the same question.
    ...(showTracker ? [`Check on it any time: ${getTrackUrl(quoteNumber)}`] : []),
    "",
    "Keep this email — the quote number is how we both find it.",
    "",
    "Thanks,",
    "Gorilla Salem",
  ].join("\n");

  const html = [
    `<p>${escapeEmailHtml(greeting)}</p>`,
    `<p>Thanks &mdash; your quote request is in. We&rsquo;ll be in touch shortly with your price and a proof before anything goes on a machine.</p>`,
    `<p style="margin-top:20px">Quote number: <strong>${escapeEmailHtml(quoteNumber)}</strong>`,
    showTracker
      ? `<br><a href="${escapeEmailHtml(getTrackUrl(quoteNumber))}">Check on it any time</a></p>`
      : `</p>`,
    `<p style="margin-top:20px">Keep this email &mdash; the quote number is how we both find it.</p>`,
    `<p style="margin-top:20px">Thanks,<br>Gorilla Salem</p>`,
  ].join("\n");

  return { send: true, subject, text, html };
}
