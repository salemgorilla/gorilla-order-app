import { escapeEmailHtml } from "./email";
import { getTrackUrl, toCustomerStatus, type OrderStage } from "./order-status";

/**
 * The "your order moved" email.
 *
 * ── WHICH CHANGES ARE WORTH AN EMAIL ──────────────────────────────────────
 * Not all of them, and this is the decision worth arguing about rather than
 * the template. A shop that emails on every status change teaches its
 * customers to ignore its emails, and the one that matters — come and collect
 * this — arrives in a thread they have stopped opening.
 *
 * The test is whether the message changes what the CUSTOMER should do:
 *
 *   ready  yes  their order is waiting for them. The whole point.
 *   done   yes  shipped, or picked up: closes the loop, and a "picked up"
 *               they did not make is how a collection error gets caught.
 *   hold   yes  we need something from them before anything else happens.
 *
 *   received  no  they just placed it. They know.
 *   artwork   no  internal progress. Nothing for them to do.
 *   printing  no  the same.
 *   unknown   no  we could not read the status, so we have nothing to say —
 *                 and an email that says "in progress" is worse than silence.
 *
 * Change this set deliberately. It is a promise about how often the shop
 * writes to people.
 * ──────────────────────────────────────────────────────────────────────────
 */
const NOTIFIABLE_STAGES: ReadonlySet<OrderStage> = new Set([
  "ready",
  "done",
  "hold",
]);

export type StatusEmailDecision =
  | { send: false; reason: string }
  | { send: true; subject: string; text: string; html: string };

/**
 * Should this status be emailed, and what does the message say?
 *
 * One function rather than two so the decision and the wording cannot get out
 * of step — a subject line for a status we decided not to send is a bug
 * waiting for somebody to call it separately.
 */
export function buildStatusEmail(input: {
  quoteNumber: string;
  /** The raw Printavo status. Translated here, not by the caller. */
  printavoStatus: string;
  customerName?: string;
}): StatusEmailDecision {
  const quoteNumber = String(input.quoteNumber || "").trim();

  if (!quoteNumber) {
    return { send: false, reason: "No order number." };
  }

  const status = toCustomerStatus(input.printavoStatus);

  if (status.unrecognised) {
    // Deliberately silent. toCustomerStatus already falls back to a safe
    // "In progress" for the tracker, where the customer ASKED. Pushing that
    // same non-answer into their inbox unprompted is noise with a Gorilla
    // Salem name on it.
    return { send: false, reason: `Status not recognised: "${input.printavoStatus}".` };
  }

  if (!NOTIFIABLE_STAGES.has(status.stage)) {
    return { send: false, reason: `Stage "${status.stage}" is not one we email about.` };
  }

  const name = String(input.customerName || "").trim();
  const greeting = name ? `Hi ${name},` : "Hi,";
  const trackUrl = getTrackUrl(quoteNumber);

  const subject = `${status.label} — order ${quoteNumber}`;

  const text = [
    greeting,
    "",
    `${status.label}.`,
    "",
    status.detail,
    "",
    `Order number: ${quoteNumber}`,
    // The tracker prefills the number from this link; it asks for the email
    // separately, and deliberately cannot be given one in a URL.
    `Check it any time: ${trackUrl}`,
    "",
    "Thanks,",
    "Gorilla Salem",
  ].join("\n");

  const html = [
    `<p>${escapeEmailHtml(greeting)}</p>`,
    `<p style="font-size:18px;font-weight:700;margin:16px 0 8px">${escapeEmailHtml(status.label)}.</p>`,
    `<p>${escapeEmailHtml(status.detail)}</p>`,
    `<p style="margin-top:20px">Order number: <strong>${escapeEmailHtml(quoteNumber)}</strong><br>`,
    `<a href="${escapeEmailHtml(trackUrl)}">Check it any time</a></p>`,
    `<p style="margin-top:20px">Thanks,<br>Gorilla Salem</p>`,
  ].join("\n");

  return { send: true, subject, text, html };
}
