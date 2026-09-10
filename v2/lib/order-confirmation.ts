import { escapeEmailHtml, looksLikeEmailAddress } from "./email";
import { canOfferTracker, getTrackUrl } from "./order-status";
import { formatBytes } from "./upload-limits";

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
 * ── THE ONE THING IT SAYS THAT IS NOT ABOUT THE ORDER ────────────────────
 * The newsletter confirmation, when they left the box ticked. It is here
 * rather than in a separate email for the reason the rest of this file
 * exists: a second message about one order in one minute is how a shop
 * teaches people to stop reading its email. It is also the only written
 * record the CUSTOMER gets of a consent the shop has been recording since
 * the box shipped pre-ticked — which is the wrong way round, since the
 * record exists to protect them.
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
  /**
   * "Order these again" — the customer's own spec as a link (lib/reorder.ts).
   * Stickers are the repeat product, and today a repeat order means
   * rebuilding the whole quote from memory. Absent on flows and carts the
   * link cannot describe; the email simply omits the line.
   */
  reorderUrl?: string | null;
  /**
   * Files that did not travel with the quote. When present, this email is
   * the recovery channel: it names the file, gives the one action, and says
   * nothing else is missing — because on 25 Aug a customer walked away from
   * a clean-looking confirmation while his artwork sat on his phone, and
   * the only note about it went to the shop.
   */
  droppedArtwork?: { name: string; size: number }[];
  /**
   * Did they leave the newsletter box ticked?
   *
   * Gabe, 2026-09-09: "Have the email say they have joined our newsletter
   * and also add that we assure you we will not sell your info or spam you
   * with marketing messages."
   *
   * Until now the only party told about the sign-up was the shop. The
   * customer ticked a box — pre-ticked, at that — and got no written record
   * of what they had agreed to, which is the wrong way round: the consent
   * record exists to protect them, and they were the one person who could
   * not see it.
   */
  newsletterOptIn?: boolean;
  /**
   * Their way out, already signed — unsubscribeUrl() from
   * lib/unsubscribe-token.ts. Null when the deployment has no
   * NEWSLETTER_SECRET, in which case no link can exist yet.
   *
   * It belongs in THIS email because this is the email that tells them they
   * joined. Saying "you can unsubscribe from any email" in a message with
   * no way to unsubscribe is the sentence being untrue of the very first
   * email it appears in.
   */
  unsubscribeUrl?: string | null;
}): OrderConfirmationDecision {
  const quoteNumber = String(input.quoteNumber || "").trim();
  const reorder = String(input.reorderUrl || "").trim();
  const dropped = input.droppedArtwork ?? [];

  if (!quoteNumber) {
    return { send: false, reason: "No order number." };
  }

  if (input.kiosk) {
    // The dropped-artwork notice still reaches a kiosk customer: the
    // confirmation SCREEN carries it, and that is the surface they are
    // standing in front of.
    return { send: false, reason: "Kiosk order — the customer is at the counter." };
  }

  if (input.paymentEmailSent && dropped.length === 0) {
    // Printavo's payment email says nothing about a missing file, so when
    // one was dropped this stops being a duplicate and starts being the
    // only written record the customer gets.
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

  const subject =
    dropped.length > 0
      ? `We've got your request — ${quoteNumber} — one file still needed`
      : `We've got your request — ${quoteNumber}`;

  // Names the file, gives the fix in one action, and says nothing else is
  // missing — so the customer knows exactly which file, knows what to do,
  // and does not resubmit the whole order.
  const droppedLines = dropped.map(
    (file) =>
      `We couldn't accept ${file.name} — it's ${formatBytes(
        file.size
      )}, more than the form can carry. Reply to this email with the file and we'll add it to your quote. Nothing else is missing.`
  );

  /**
   * Two sentences, and the second one is the point.
   *
   * "You've joined" is the receipt. The assurance is what makes it worth
   * sending: this shop asks for an email, a phone number and a company on
   * every quote, and a customer who ticked a pre-ticked box has no idea
   * what happens to any of it. Saying it in writing, unprompted, at the
   * moment they hand it over, is the difference between a promise and an
   * assumption — and it is a promise the shop can keep, because there is no
   * mechanism in this app that shares a customer with anyone but Printavo.
   *
   * Only when they actually opted in. A customer who UNTICKED the box being
   * told what our newsletter is like would read as not having been listened
   * to, which is the one thing an opt-out has to get right.
   */
  const optOut = String(input.unsubscribeUrl || "").trim();

  const newsletterLines = input.newsletterOptIn
    ? [
        "You've also joined our newsletter — shop news, seasonal offers and new products.",
        "We will not sell your information, and we won't spam you with marketing messages. You can unsubscribe from any email.",
        // Given here, not merely promised. A one-tap link in the message
        // that announces the sign-up is the difference between an opt-out
        // somebody has and one they would have to go looking for.
        ...(optOut ? [`Changed your mind already? ${optOut}`] : []),
      ]
    : [];

  const text = [
    greeting,
    "",
    "Thanks — your quote request is in. We'll be in touch shortly with your price and a proof before anything goes on a machine.",
    ...(droppedLines.length ? ["", ...droppedLines] : []),
    "",
    `Quote number: ${quoteNumber}`,
    // Withheld when Printavo never accepted the quote — canOfferTracker
    // carries the reasoning, and the kiosk card and the confirmation screen
    // ask the same question.
    ...(showTracker ? [`Check on it any time: ${getTrackUrl(quoteNumber)}`] : []),
    // The link rebuilds the builder from this order's spec — it never
    // carries a price (today's engine prices it) and never submits.
    ...(reorder ? ["", `Need these again? ${reorder}`] : []),
    "",
    "Keep this email — the quote number is how we both find it.",
    // AFTER the order, before the sign-off. The order is what they came
    // for; the newsletter is a thing they agreed to on the way past, and
    // putting it above the quote number would rank it as the more
    // important of the two.
    ...(newsletterLines.length ? ["", ...newsletterLines] : []),
    "",
    "Thanks,",
    "Gorilla Salem",
  ].join("\n");

  const html = [
    `<p>${escapeEmailHtml(greeting)}</p>`,
    `<p>Thanks &mdash; your quote request is in. We&rsquo;ll be in touch shortly with your price and a proof before anything goes on a machine.</p>`,
    ...droppedLines.map(
      (line) => `<p style="margin-top:20px"><strong>${escapeEmailHtml(line)}</strong></p>`
    ),
    `<p style="margin-top:20px">Quote number: <strong>${escapeEmailHtml(quoteNumber)}</strong>`,
    showTracker
      ? `<br><a href="${escapeEmailHtml(getTrackUrl(quoteNumber))}">Check on it any time</a></p>`
      : `</p>`,
    ...(reorder
      ? [
          `<p style="margin-top:20px"><a href="${escapeEmailHtml(reorder)}">Need these again?</a> &mdash; we&rsquo;ll set the builder back up the way you had it.</p>`,
        ]
      : []),
    `<p style="margin-top:20px">Keep this email &mdash; the quote number is how we both find it.</p>`,
    ...(newsletterLines.length
      ? [
          `<p style="margin-top:20px">${escapeEmailHtml(newsletterLines[0])}<br>`,
          `<span style="color:#6b6b6b">${escapeEmailHtml(newsletterLines[1])}</span>`,
          optOut
            ? `<br><a style="color:#6b6b6b" href="${escapeEmailHtml(optOut)}">Unsubscribe</a></p>`
            : `</p>`,
        ]
      : []),
    `<p style="margin-top:20px">Thanks,<br>Gorilla Salem</p>`,
  ].join("\n");

  return { send: true, subject, text, html };
}
