/**
 * WHAT MAY TAKE A CARD WITH NOBODY LOOKING.
 *
 * ── READ THIS BEFORE CHANGING ANYTHING IN HERE ────────────────────────────
 * An order that passes this file gets a LIVE PAYABLE LINK the moment it is
 * submitted. Nothing between the browser and someone's card is reviewed by a
 * human. AGENTS.md calls that the thing that matters most in this repo, and
 * every rule below exists because of a way it can go wrong.
 *
 * Stickers have always self-checked-out: `isStickerOrder()` in
 * lib/sticker-repricing.ts is their classifier. It is READ from here, never
 * redefined and never widened — widening it would let a signs payload be
 * repriced against the sticker table, which is a different and worse bug.
 * Signs and banners get their own classifier, in this file. Each flow's
 * decision is its own function below; what they share is the ceiling.
 *
 * ── SIGNS AND BANNERS PAY ONLINE — Gabe, 2026-09-07 ───────────────────────
 * "I want signs and banners to have the same action as the stickers button.
 * All 3 should be 'instant price - pay online'."
 *
 * The pricing objection that keeps apparel off this path does not apply:
 * signs and banners are priced to the cent by lib/signs-pricing.ts from the
 * shop's own table, `priceable` says so explicitly, and there is nothing for
 * the shop to work out before the customer can pay.
 *
 * ── SHIPPING, AND WHY AN INCOMPLETE TOTAL IS STILL SAFE ───────────────────
 * A signs order does not carry a shipping price — the delivery step says
 * "shipping quoted separately" and lib/signs-cart.ts never sets one. So a
 * SHIPPED signs order pays for its goods here and settles delivery after.
 * Gabe, same day, asked directly: "Pickup and shipped items will be paid in
 * full before pickup or shipping out." Nothing leaves the shop until it is
 * paid in full, so a second step is shop policy rather than money lost. The
 * confirmation screen says so in as many words, because a customer who pays
 * and then gets a second bill without warning is a dispute.
 *
 * ── THE CEILING, AND THE DEPOSIT — Gabe, 2026-09-07 ───────────────────────
 * Asked whether an unattended card payment should have a ceiling, Gabe chose
 * one. It began as $1,500 on signs alone; by that afternoon it was one line
 * for the whole self-serve app, and above it the payment link was withheld
 * entirely and the shop invoiced by hand.
 *
 * That lasted a few hours, because it had the incentives backwards: the
 * biggest jobs got the least automation and the slowest cash. His rule now:
 *
 *   "All orders over $4999.99 should ask for 50% deposit, and the remaining
 *    balance is due before or upon shipping or pickup."
 *
 * So the ceiling is no longer a refusal — it is the line between paying in
 * full and paying half. It is still a blast radius rather than a pricing
 * rule: a mistyped 50-foot banner cannot take five figures off somebody
 * unattended, because at most half of it can be taken, and the rest is
 * settled by a human before anything leaves the building — which is already
 * the shop's rule for pickup and shipping, so it needs no new process.
 *
 * Stickers came under it at the same time; until then a sticker cart of any
 * size raised a live link for the whole amount. Both gates read the same two
 * constants below, so neither the ceiling nor the fraction can drift between
 * them; a ceiling only one flow honours is a ceiling with a hole in it.
 *
 * What is still a refusal is everything above the ceiling clause in each
 * decision: a total the server did not compute, a total nothing could price,
 * a kiosk session, a quote Printavo never got. A deposit is a smaller ask,
 * not a weaker check — half of a price nobody set is still a price nobody
 * set.
 */

import { isStickerOrder } from "./sticker-repricing";

/**
 * The most an order can be asked to pay IN FULL, unattended.
 *
 * Gabe, 2026-09-07: "All orders over $4999.99 should ask for 50% deposit,
 * and the remaining balance is due before or upon shipping or pickup."
 *
 * Written as the figure he named rather than as $5,000, because the boundary
 * is a real one: an order of exactly $5,000.00 IS over $4,999.99 and takes a
 * deposit. The ceiling this replaced was `> 5000`, which let $5,000.00
 * through at full price — a one-cent band on the wrong side of his rule.
 */
export const FULL_PAYMENT_CEILING = 4999.99;

/** Half, per Gabe. The balance is due before the job leaves the shop. */
export const DEPOSIT_FRACTION = 0.5;

/**
 * True for the signs and banners pipeline, decided POSITIVELY.
 *
 * The original sticker-gate bug was membership by omission: a payload that
 * failed to set a field fell through into the auto-billing set. So this asks
 * for two things that only a real signs payload has — a type naming the
 * pipeline, and the `signType` buildSignsPayloadParts always writes — rather
 * than asking what the order is not. Anything that does not say what it is
 * gets no payment link, which is the failure direction that costs nothing.
 */
export function isSignsOrder(order: Record<string, unknown>) {
  const product = (order.product || {}) as Record<string, unknown>;
  const type = String(product.type || "").toLowerCase();

  // Never both. A payload claiming to be stickers is the sticker gate's
  // business and must not be repriced or billed by this one.
  if (type.includes("sticker")) {
    return false;
  }

  const namesThePipeline = type.includes("sign") || type.includes("banner");

  return namesThePipeline && Boolean(product.signType);
}

export type AutoBillDecision = {
  /** Whether to raise a payment request without a human looking first. */
  bill: boolean;
  /**
   * True when what is raised is a DEPOSIT rather than the whole amount —
   * over FULL_PAYMENT_CEILING. Always false when `bill` is false; there is
   * no such thing as a deposit on an order nobody was asked to pay.
   */
  deposit: boolean;
  /**
   * Why — logged by the route on every submission that does NOT bill, so a
   * sign that quietly stopped self-checking-out can be diagnosed from the
   * log rather than by re-reading this file.
   */
  reason: string;
};

/**
 * The signs auto-bill decision, as one pure function.
 *
 * Every clause is a way the money path has gone wrong, or could:
 *
 *   repriced      The SERVER recomputed this total from the design specs.
 *                 repriceSigns() PASSES A PAYLOAD THROUGH UNTOUCHED when it
 *                 carries no `spec` to rebuild from — fine while the shop
 *                 invoices by hand and reads the figure, fatal the moment a
 *                 link is raised, because the amount billed would be one the
 *                 browser supplied. A payload we could not re-derive does not
 *                 bill. This is the single most important line in the file.
 *   unpriceable   The engine could not price it (a material and product that
 *                 do not go together). Same rule as stickers: nothing bills
 *                 at a price nobody set.
 *   total > 0     A zero or negative total is a bug, not a free order.
 *   ceiling       Gabe's blast radius, above.
 *   kiosk         The customer is at the counter and pays on the shop's
 *                 terminal. Emailing a live link to an address typed on a
 *                 shared machine is how a stranger gets someone's order.
 *   printavo      There is nothing to bill against if the quote never landed.
 */
export function decideSignsAutoBill(input: {
  order: Record<string, unknown>;
  /** repriceSigns().repriced — did the server actually recompute the money? */
  repriced: boolean;
  /** repriceSigns().unpriceable */
  unpriceable: boolean;
  /** The SERVER's total, never the browser's. */
  serverTotal: number;
  kioskSession: boolean;
  printavoCreated: boolean;
}): AutoBillDecision {
  if (!isSignsOrder(input.order)) {
    return { bill: false, deposit: false, reason: "not a signs order" };
  }

  if (input.kioskSession) {
    return { bill: false, deposit: false, reason: "kiosk order — payment is taken at the counter" };
  }

  if (!input.printavoCreated) {
    return { bill: false, deposit: false, reason: "no Printavo quote to bill against" };
  }

  if (!input.repriced) {
    return {
      bill: false,
      deposit: false,
      reason:
        "the server could not reprice this payload from its design specs, so the only total available is the browser's",
    };
  }

  if (input.unpriceable) {
    return { bill: false, deposit: false, reason: "the engine could not price it — quote this one by hand" };
  }

  if (!(input.serverTotal > 0)) {
    return { bill: false, deposit: false, reason: `server total is ${input.serverTotal}` };
  }

  /**
   * OVER THE CEILING IS A DEPOSIT, NOT A REFUSAL.
   *
   * It used to withhold the link entirely and leave the shop to invoice by
   * hand — which meant the largest orders were the ones that got the least
   * automation and the slowest cash. Gabe's rule turns that around: the
   * customer still pays online, they pay half, and the balance is settled
   * before the job leaves the shop (which is already the rule for delivery,
   * so it needs no new process).
   */
  if (input.serverTotal > FULL_PAYMENT_CEILING) {
    return { bill: true, deposit: true, reason: overCeiling(input.serverTotal) };
  }

  return {
    bill: true,
    deposit: false,
    reason: "priced by the server, under the ceiling",
  };
}

/** The one wording for the one rule, so the log and the email read alike. */
function overCeiling(serverTotal: number) {
  return (
    `$${serverTotal.toFixed(2)} is over the $${FULL_PAYMENT_CEILING} full-payment ceiling — ` +
    `${Math.round(DEPOSIT_FRACTION * 100)}% deposit requested`
  );
}

/**
 * The stickers auto-bill decision, as one pure function.
 *
 * Stickers have self-checked-out since the app went live, and until 7 Sep
 * the decision was a boolean in the route: not a kiosk, priceable, a sticker
 * order, Printavo answered. It had no ceiling — a 10,000-sticker cart raised
 * a live link for whatever it came to — and the shop email could not say
 * why one had not billed. Lifted here so it reads the SAME ceiling as signs
 * and feeds the SAME email line, and so every refusal carries a reason.
 *
 * WHAT IS DELIBERATELY NOT HERE: isStickerOrder() itself. It lives in
 * lib/sticker-repricing.ts because it also decides what gets repriced
 * against the sticker table, and it is only READ from this file — never
 * widened. There is also no `repriced` clause, unlike signs: repriceStickers
 * never passes a sticker order through, so a sticker total is always the
 * server's own figure.
 *
 *   unpriceable   repriceStickers() put $0 on at least one design — no
 *                 usable size — so the total is the setup fee alone. Nothing
 *                 bills at a price nobody set.
 *   total > 0     A zero or negative total is a bug, not a free order.
 *   ceiling       Gabe's blast radius, shared with signs.
 *   kiosk         Payment is taken at the counter; a link emailed to an
 *                 address typed on a shared machine reaches a stranger.
 *   printavo      Nothing to bill against if the quote never landed.
 */
export function decideStickersAutoBill(input: {
  order: Record<string, unknown>;
  /** repriceStickers().unpriceable — a design with no usable size. */
  unpriceable: boolean;
  /** The SERVER's total, never the browser's. */
  serverTotal: number;
  kioskSession: boolean;
  printavoCreated: boolean;
}): AutoBillDecision {
  if (!isStickerOrder(input.order)) {
    return { bill: false, deposit: false, reason: "not a sticker order" };
  }

  if (input.kioskSession) {
    return { bill: false, deposit: false, reason: "kiosk order — payment is taken at the counter" };
  }

  if (!input.printavoCreated) {
    return { bill: false, deposit: false, reason: "no Printavo quote to bill against" };
  }

  if (input.unpriceable) {
    return {
      bill: false,
      deposit: false,
      reason: "a design has no usable size, so nothing was priced",
    };
  }

  if (!(input.serverTotal > 0)) {
    return { bill: false, deposit: false, reason: `server total is ${input.serverTotal}` };
  }

  // Same rule as signs — see the note there. Half now, the rest before it
  // ships or is collected.
  if (input.serverTotal > FULL_PAYMENT_CEILING) {
    return { bill: true, deposit: true, reason: overCeiling(input.serverTotal) };
  }

  return {
    bill: true,
    deposit: false,
    reason: "priced by the server, under the ceiling",
  };
}

/**
 * What the SHOP's copy of the quote should say about payment.
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 * The shop email is sent BEFORE Printavo is called and before any payment
 * link is raised (app/api/quote/route.ts), so it cannot report what happened.
 * While stickers were the only self-billing flow that was tolerable: they
 * always bill, so "sticker order" and "will be paid" meant the same thing.
 *
 * Signs broke that. A $1,800 banner order is over the ceiling, so no link
 * goes out — and the shop's email looked exactly like the $200 one that did
 * bill. The shop would be waiting on a payment nobody had been asked for.
 *
 * So the email says which bucket the order is in, and says it from the SAME
 * decision the route bills from rather than a second copy that can drift.
 * Returns null when there is nothing worth saying — an apparel estimate has
 * always been invoiced and a line on every one of those is noise, not news.
 */
export function shopPaymentNote(input: {
  order: Record<string, unknown>;
  /** The signs decision, for a signs order. Ignored for other flows. */
  signs: AutoBillDecision | null;
  /** The stickers decision, for a sticker order. Ignored for other flows. */
  stickers: AutoBillDecision | null;
}): string | null {
  if (input.signs && isSignsOrder(input.order)) return paymentNote(input.signs);

  // Stickers get a line only when they are the EXCEPTION. They bill on every
  // ordinary order, so saying so each time is noise; saying nothing when one
  // silently did not is how a job gets printed for free. Since the ceiling
  // covers stickers, "over the ceiling" is one of those exceptions, and the
  // reason is the same decision's, so the email and the link cannot disagree.
  // Stickers get a line only when they are the EXCEPTION — they bill on
  // every ordinary order, so saying so each time is noise. A deposit IS an
  // exception: the shop has to collect the rest.
  if (input.stickers && isStickerOrder(input.order)) {
    return input.stickers.bill && !input.stickers.deposit
      ? null
      : paymentNote(input.stickers);
  }

  return null;
}

/** One decision, one sentence, whichever flow asked. */
function paymentNote(decision: AutoBillDecision): string {
  if (decision.deposit) {
    // The reason already names the deposit; this adds the instruction, so
    // the sentence reads once rather than saying "50% deposit" twice.
    return `${decision.reason}. Collect the balance before it ships or is collected.`;
  }

  return decision.bill
    ? "Charged automatically — the customer gets a payment link as soon as this reaches Printavo."
    : `NOT charged — ${decision.reason}. Invoice this one by hand.`;
}
