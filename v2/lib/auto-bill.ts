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
 * lib/sticker-repricing.ts is their gate and is deliberately NOT touched from
 * here — widening it would let a signs payload be repriced against the
 * sticker table, which is a different and worse bug. Signs and banners get
 * their own gate, in this file, and the two never share a code path.
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
 * ── THE CEILING — Gabe, 2026-09-07 ────────────────────────────────────────
 * Asked whether an unattended card payment should have a ceiling, Gabe chose
 * one at $1,500. Above it the quote still goes through, the shop still gets
 * its email and Printavo still gets the record — only the payment link is
 * withheld, and the shop invoices by hand. It is a blast radius, not a
 * pricing rule: a mistyped 50-foot banner cannot take four figures off
 * somebody before anyone has looked at it.
 */

/** Above this, a signs order is invoiced by hand. Gabe, 2026-09-07. */
export const SIGNS_AUTO_BILL_CEILING = 1500;

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
    return { bill: false, reason: "not a signs order" };
  }

  if (input.kioskSession) {
    return { bill: false, reason: "kiosk order — payment is taken at the counter" };
  }

  if (!input.printavoCreated) {
    return { bill: false, reason: "no Printavo quote to bill against" };
  }

  if (!input.repriced) {
    return {
      bill: false,
      reason:
        "the server could not reprice this payload from its design specs, so the only total available is the browser's",
    };
  }

  if (input.unpriceable) {
    return { bill: false, reason: "the engine could not price it — quote this one by hand" };
  }

  if (!(input.serverTotal > 0)) {
    return { bill: false, reason: `server total is ${input.serverTotal}` };
  }

  if (input.serverTotal > SIGNS_AUTO_BILL_CEILING) {
    return {
      bill: false,
      reason: `$${input.serverTotal.toFixed(2)} is over the $${SIGNS_AUTO_BILL_CEILING} auto-bill ceiling — invoice this one by hand`,
    };
  }

  return { bill: true, reason: "priced by the server, under the ceiling" };
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
  /** True when this is a sticker order that will self-check-out. */
  stickers: boolean;
  /** repriceStickers().unpriceable — a sticker design with no usable size. */
  stickersUnpriceable: boolean;
}): string | null {
  if (input.signs && isSignsOrder(input.order)) {
    return input.signs.bill
      ? "Charged automatically — the customer gets a payment link as soon as this reaches Printavo."
      : `NOT charged — ${input.signs.reason}. Invoice this one by hand.`;
  }

  // Stickers get a line only when they are the EXCEPTION. They bill on every
  // ordinary order, so saying so each time is noise; saying nothing when one
  // silently did not is how a job gets printed for free.
  if (input.stickers && input.stickersUnpriceable) {
    return "NOT charged — a design has no usable size, so nothing was priced. Invoice this one by hand.";
  }

  return null;
}
