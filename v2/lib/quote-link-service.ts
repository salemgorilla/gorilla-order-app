import {
  applyApproval,
  applyUnlock,
  checkApproval,
  createLinkId,
  createOrderNumber,
  isLocked,
  paymentGate,
  priceQuoteLink,
  toCents,
  validateSizes,
  type QuoteLink,
  type QuoteLinkSize,
  type QuoteLinkSpec,
} from "./quote-link";
import type { QuoteLinkStore } from "./quote-link-store";
import type { CheckoutSession, CheckoutSessionInput } from "./stripe";
import type { PaidOrderInput } from "./printavo";
import { apparelSku, SKU } from "./sku";
import { addBusinessDays, todayIso } from "./turnaround";

/**
 * The quote link's actions, with every outside dependency passed in.
 *
 * Routes are thin shells over this. Stripe, Printavo, the clock and the
 * mailer arrive as `deps` so the rules below - the ones that touch a
 * customer's money - run in tests without a network, and so a route cannot
 * reach around them.
 *
 * THE MONEY PATH, IN ORDER (Gabe, 2026-11-02):
 *   approve      price recomputed on the server and frozen in a snapshot
 *   checkout     one Stripe Checkout session for exactly the snapshot's
 *                amount due (deposit or full)
 *   webhook      Stripe says paid -> amount checked against the session ->
 *                marked paid -> THEN, and only then, the order goes to
 *                Printavo, once
 */

export type Deps = {
  store: QuoteLinkStore;
  stripe: {
    configured: boolean;
    createSession: (input: CheckoutSessionInput) => Promise<CheckoutSession>;
    expireSession: (sessionId: string) => Promise<void>;
  };
  printavo: {
    find: (orderNumber: string) => Promise<{ searched: boolean; found: boolean; id?: string; visualId?: string }>;
    create: (input: PaidOrderInput) => Promise<{ created: boolean; id?: string; visualId?: string; error?: string }>;
  };
  notifyShop: (subject: string, lines: string[]) => Promise<void>;
  origin: string;
  now?: () => Date;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ServiceResult<T = {}> =
  | ({ ok: true } & T)
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const money = (n: number) => `$${n.toFixed(2)}`;
const nowOf = (deps: Deps) => deps.now?.() ?? new Date();

/** A Checkout session lives 24h; reuse one only well inside that. */
const SESSION_REUSE_MS = 20 * 60 * 60 * 1000;
/** A Printavo create stuck in "creating" this long is treated as failed. */
const CREATING_STALE_MS = 10 * 60 * 1000;

function summary(deps: Deps, link: QuoteLink, extra: string[] = []): string[] {
  const price = link.approvedSnapshot ?? priceQuoteLink(link, link.sizes);

  return [
    `Order ${link.orderNumber}`,
    `Customer: ${link.customer.name} <${link.customer.email}>`,
    `${link.spec.styleLabel} ${link.spec.colorName}: ${price.pieces} pieces`,
    `Total: ${money(price.total)}`,
    ...extra,
    `Open: ${deps.origin}/admin/quote-links`,
  ];
}

/* ── shop side ──────────────────────────────────────────────────────────── */

export type CreateInput = {
  customer: { name: string; email: string; phone?: string };
  spec: QuoteLinkSpec;
  catalogSizes: QuoteLinkSize[];
  sizes: Record<string, number>;
  minimumPieces: number;
  depositPercent: number | null;
  turnaroundNote: string;
  expiresAt?: string;
};

export async function createLink(
  deps: Deps,
  input: CreateInput
): Promise<ServiceResult<{ link: QuoteLink; token: string }>> {
  const name = input.customer.name.trim();
  const email = input.customer.email.trim();

  if (name.length < 2) return fail(400, "Enter the customer's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "Enter the customer's email.");
  if (!input.catalogSizes.length) return fail(400, "No sizes were found for that style and colour.");
  if (!(input.minimumPieces >= 1 && input.minimumPieces <= 10000)) {
    return fail(400, "Minimum pieces must be between 1 and 10,000.");
  }
  if (input.depositPercent !== null && !(input.depositPercent > 0 && input.depositPercent < 100)) {
    return fail(400, "Deposit must be between 1 and 99 percent, or empty.");
  }
  if (!input.spec.printLocations.length) return fail(400, "Add at least one print location.");

  const base: QuoteLink = {
    id: createLinkId(),
    orderNumber: createOrderNumber(),
    tokenVersion: 0,
    status: "sent",
    createdAt: nowOf(deps).toISOString(),
    expiresAt: input.expiresAt,
    customer: { name, email, phone: input.customer.phone?.trim() || undefined },
    spec: input.spec,
    catalogSizes: input.catalogSizes,
    minimumPieces: input.minimumPieces,
    depositPercent: input.depositPercent,
    turnaroundNote: input.turnaroundNote,
    sizes: {},
  };

  const check = validateSizes(base, input.sizes);
  if (!check.ok) return fail(400, check.error);

  const link: QuoteLink = { ...base, sizes: check.sizes };
  const token = await deps.store.issueToken(link);
  await deps.store.logEvent(link.id, "link_created", { orderNumber: link.orderNumber });

  return { ok: true, link: { ...link, tokenVersion: 1 }, token };
}

export async function regenerateLink(
  deps: Deps,
  id: string,
  previousToken?: string
): Promise<ServiceResult<{ token: string }>> {
  const link = await deps.store.getById(id);
  if (!link) return fail(404, "No such quote link.");

  const token = await deps.store.issueToken(link, previousToken);
  await deps.store.logEvent(id, "link_regenerated");

  return { ok: true, token };
}

/**
 * Shop unlock: the customer may edit again.
 *
 * An open Checkout session is EXPIRED first. Otherwise the old price stays
 * payable after the sizes change, and the webhook would be asked to accept a
 * payment for a quote that no longer exists. If Stripe will not confirm the
 * expiry, nothing is unlocked.
 */
export async function unlockLink(deps: Deps, id: string): Promise<ServiceResult> {
  const link = await deps.store.getById(id);
  if (!link) return fail(404, "No such quote link.");
  if (link.status === "paid") return fail(409, "This quote is paid and cannot be unlocked.");

  if (link.payment?.sessionId) {
    try {
      await deps.stripe.expireSession(link.payment.sessionId);
    } catch (error) {
      return fail(502, `Could not close the open payment page: ${String(error)}. Nothing was unlocked.`);
    }
  }

  await deps.store.save(applyUnlock(link));
  await deps.store.logEvent(id, "unlocked");

  return { ok: true };
}

/* ── customer side ──────────────────────────────────────────────────────── */

export async function viewLink(deps: Deps, token: string): Promise<QuoteLink | null> {
  const link = await deps.store.getByToken(token);
  if (!link) return null;

  if (link.status === "sent") {
    const viewed: QuoteLink = { ...link, status: "viewed" };
    await deps.store.save(viewed);
    await deps.store.logEvent(link.id, "viewed");
    return viewed;
  }

  return link;
}

export async function updateSizes(
  deps: Deps,
  token: string,
  raw: unknown
): Promise<ServiceResult<{ link: QuoteLink }>> {
  const link = await deps.store.getByToken(token);
  if (!link) return fail(404, "This link is no longer valid.");
  if (isLocked(link)) return fail(409, "This quote is approved, so the sizes are locked.");

  const check = validateSizes(link, raw);
  if (!check.ok) return fail(400, check.error);

  const next: QuoteLink = { ...link, sizes: check.sizes };
  await deps.store.save(next);
  await deps.store.logEvent(link.id, "size_changed", { sizes: check.sizes });

  return { ok: true, link: next };
}

export async function approveLink(
  deps: Deps,
  token: string,
  input: { name: unknown; email: unknown; agreed: unknown; ip: string; sizes?: unknown }
): Promise<ServiceResult<{ link: QuoteLink }>> {
  let link = await deps.store.getByToken(token);
  if (!link) return fail(404, "This link is no longer valid.");

  // Approve what is on screen, not what was last saved: a debounce still in
  // flight cannot leave the approved sizes behind the page.
  if (input.sizes !== undefined && !isLocked(link)) {
    const check = validateSizes(link, input.sizes);
    if (!check.ok) return fail(400, check.error);
    link = { ...link, sizes: check.sizes };
  }

  const verdict = checkApproval(link, input);
  if (!verdict.ok) {
    return fail(verdict.error.startsWith("This quote is already") ? 409 : 400, verdict.error);
  }

  const approved = applyApproval(
    link,
    { name: verdict.name, email: verdict.email, ip: input.ip },
    nowOf(deps)
  );

  await deps.store.save(approved);
  await deps.store.logEvent(link.id, "approved", {
    total: approved.approvedSnapshot?.total,
    pieces: approved.approvedSnapshot?.pieces,
  });
  await deps.notifyShop(`${link.orderNumber} approved`, summary(deps, approved, [
    `Approved by: ${verdict.name} <${verdict.email}>`,
    "Waiting for card payment.",
  ]));

  return { ok: true, link: approved };
}

/**
 * Open (or reopen) the Stripe Checkout page for the approved amount.
 *
 * The amount comes from the approval snapshot, never the request. An open
 * session for the same amount is handed back rather than a second one
 * created, so two clicks cannot become two payable pages.
 */
export async function startPayment(
  deps: Deps,
  token: string
): Promise<ServiceResult<{ url: string }>> {
  if (!deps.stripe.configured) {
    return fail(503, "Online payment isn't set up yet. Please call the shop to pay.");
  }

  const link = await deps.store.getByToken(token);
  if (!link) return fail(404, "This link is no longer valid.");

  const gate = paymentGate(link);
  if (gate.state === "not-approved") return fail(409, "Approve the quote first.");
  if (gate.state === "paid") return fail(409, "This quote is already paid.");

  const amountCents = toCents(gate.amountDue);
  if (amountCents < 50) return fail(400, "There is nothing to pay on this quote.");

  const now = nowOf(deps);
  const open = link.payment;
  if (
    open &&
    open.amountCents === amountCents &&
    now.getTime() - Date.parse(open.startedAt) < SESSION_REUSE_MS
  ) {
    return { ok: true, url: open.sessionUrl };
  }

  const snapshot = link.approvedSnapshot!;
  const kind = snapshot.deposit ? "deposit" : "full";

  let session: CheckoutSession;
  try {
    session = await deps.stripe.createSession({
      amountCents,
      description: `${link.orderNumber} - ${snapshot.pieces} x ${link.spec.styleLabel} ${link.spec.colorName}${
        kind === "deposit" ? ` (${snapshot.deposit!.percent}% deposit)` : ""
      }`,
      customerEmail: link.approval?.email || link.customer.email,
      successUrl: `${deps.origin}/q/${token}/thanks`,
      cancelUrl: `${deps.origin}/q/${token}`,
      metadata: { linkId: link.id, orderNumber: link.orderNumber, tokenVersion: String(link.tokenVersion) },
      // Keyed on the approval, so the SAME approval can never mint two
      // sessions even if two requests race past the reuse check above.
      // The previous session id is part of the key: once the reuse window
      // has passed, Stripe must open a NEW page rather than replay the old,
      // nearly-expired one from its 24h idempotency cache.
      idempotencyKey: `quote-link-${link.id}-${link.approval?.approvedAt}-${amountCents}-${open?.sessionId ?? "first"}`,
    });
  } catch (error) {
    await deps.store.logEvent(link.id, "payment_failed", { stage: "session", error: String(error) });
    return fail(502, "We couldn't open the payment page. Please try again in a minute.");
  }

  const next: QuoteLink = {
    ...link,
    status: "payment_started",
    payment: {
      sessionId: session.id,
      sessionUrl: session.url,
      amountCents,
      kind,
      startedAt: now.toISOString(),
    },
  };
  await deps.store.save(next);
  await deps.store.logEvent(link.id, "payment_started", { amountCents, kind });

  return { ok: true, url: session.url };
}

/* ── Stripe webhook ─────────────────────────────────────────────────────── */

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

/**
 * One verified Stripe event. Safe to receive any number of times.
 *
 * Returns a result for logging; the route answers 200 to Stripe whenever the
 * event was understood, even if Printavo failed, because the money part
 * succeeded and a 5xx would make Stripe resend a payment we already recorded.
 */
export async function handleStripeEvent(
  deps: Deps,
  event: StripeEvent
): Promise<{ handled: boolean; note: string }> {
  const object = event.data?.object ?? {};
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const linkId = metadata.linkId;

  if (!linkId) return { handled: false, note: "not a quote-link event" };

  const link = await deps.store.getById(linkId);
  if (!link) return { handled: false, note: `no link ${linkId}` };

  if (event.type === "payment_intent.payment_failed") {
    const reason =
      ((object.last_payment_error as Record<string, unknown> | undefined)?.message as string) ?? "unknown";
    await deps.store.logEvent(link.id, "payment_failed", { reason });
    await deps.notifyShop(`${link.orderNumber} card payment FAILED`, summary(deps, link, [`Reason: ${reason}`]));
    return { handled: true, note: "payment failed recorded" };
  }

  if (event.type !== "checkout.session.completed") {
    return { handled: false, note: `ignored ${event.type}` };
  }

  if (object.payment_status !== "paid") {
    return { handled: false, note: "session completed but not paid yet" };
  }

  // Already recorded: this is a retry. Make sure Printavo caught up, then stop.
  if (link.status === "paid") {
    await pushToPrintavo(deps, link.id);
    return { handled: true, note: "already paid" };
  }

  const amountTotal = Number(object.amount_total);
  const expected = link.payment;

  if (!expected || object.id !== expected.sessionId || amountTotal !== expected.amountCents) {
    // Paid, but not for the session or amount this quote is waiting on. Never
    // mark that paid and never file it: a human looks at it.
    await deps.store.logEvent(link.id, "payment_mismatch", {
      session: String(object.id),
      amountTotal,
      expected: expected ? { session: expected.sessionId, amountCents: expected.amountCents } : null,
    });
    await deps.notifyShop(`${link.orderNumber} PAYMENT NEEDS A LOOK`, summary(deps, link, [
      `Stripe took ${money(amountTotal / 100)} on a payment page this quote was not waiting on.`,
      "Nothing was marked paid and nothing was sent to Printavo. Check Stripe and refund or match it by hand.",
    ]));
    return { handled: true, note: "mismatch held for the shop" };
  }

  const paid: QuoteLink = {
    ...link,
    status: "paid",
    payment: {
      ...expected,
      paymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : undefined,
      amountPaid: amountTotal / 100,
      paidAt: nowOf(deps).toISOString(),
    },
  };
  await deps.store.save(paid);
  await deps.store.logEvent(link.id, "paid", { amountCents: amountTotal, kind: expected.kind });

  const pushed = await pushToPrintavo(deps, link.id);
  const snapshot = paid.approvedSnapshot!;

  await deps.notifyShop(`${link.orderNumber} PAID ${money(amountTotal / 100)}`, summary(deps, paid, [
    expected.kind === "deposit"
      ? `Deposit paid: ${money(amountTotal / 100)}. Balance to collect before pickup: ${money(snapshot.total - amountTotal / 100)}.`
      : `Paid in full: ${money(amountTotal / 100)}.`,
    pushed.ok
      ? `Printavo order ${pushed.visualId ?? ""} created. Record the card payment on it in Printavo.`
      : `Printavo order NOT created: ${pushed.error}. Use Retry Printavo on the admin page.`,
  ]));

  return { handled: true, note: "paid" };
}

/**
 * File a paid quote in Printavo, at most once.
 *
 * Three guards, because a webhook can arrive twice, at the same moment:
 *  1. The link already records a created order -> done.
 *  2. A recent "creating" marker -> another delivery is doing it right now.
 *  3. Printavo's own search for the GQ- number -> it exists from an attempt
 *     whose save did not land. If Printavo cannot be searched, nothing is
 *     created: a duplicate order is worse than a late one, and the shop is
 *     told either way.
 */
export async function pushToPrintavo(
  deps: Deps,
  id: string
): Promise<{ ok: true; visualId?: string } | { ok: false; error: string }> {
  const link = await deps.store.getById(id);
  if (!link) return { ok: false, error: "No such quote link." };
  if (link.status !== "paid" || !link.approvedSnapshot || !link.payment) {
    return { ok: false, error: "Only a paid quote goes to Printavo." };
  }

  const now = nowOf(deps);
  const handoff = link.printavo;

  if (handoff?.state === "created") return { ok: true, visualId: handoff.visualId };
  if (handoff?.state === "creating" && now.getTime() - Date.parse(handoff.at) < CREATING_STALE_MS) {
    return { ok: false, error: "Already being created." };
  }

  const existing = await deps.printavo.find(link.orderNumber);
  if (existing.found) {
    await deps.store.save({
      ...link,
      printavo: { state: "created", at: now.toISOString(), id: existing.id, visualId: existing.visualId },
    });
    return { ok: true, visualId: existing.visualId };
  }
  if (!existing.searched) {
    await deps.store.save({
      ...link,
      printavo: { state: "failed", at: now.toISOString(), error: "Printavo could not be searched, so nothing was created." },
    });
    return { ok: false, error: "Printavo could not be searched, so nothing was created." };
  }

  await deps.store.save({ ...link, printavo: { state: "creating", at: now.toISOString() } });

  const s = link.approvedSnapshot;
  const paidNote = [
    `PAID ONLINE BY CARD (Stripe) via quote link ${link.orderNumber}.`,
    `Charged ${money(link.payment.amountPaid ?? 0)} on ${(link.payment.paidAt ?? "").slice(0, 10)}` +
      (link.payment.kind === "deposit"
        ? ` as a ${s.deposit?.percent}% deposit. Balance due before pickup: ${money(s.total - (link.payment.amountPaid ?? 0))}.`
        : " in full."),
    `Stripe payment: ${link.payment.paymentIntentId ?? link.payment.sessionId}.`,
    `Approved by ${link.approval?.name} <${link.approval?.email}> at ${link.approval?.approvedAt}.`,
    `Print: ${link.spec.method}, ${link.spec.printLocations.join(" + ")}, ${link.spec.inkColors}${link.spec.hasUnderbase ? ", white underbase" : ""}.`,
  ].join("\n");

  const result = await deps.printavo.create({
    orderNumber: link.orderNumber,
    customer: link.customer,
    customerDueDate: addBusinessDays(todayIso(now), 10),
    garmentDescription: `${link.spec.styleLabel} - ${link.spec.colorName}`,
    garmentSku: apparelSku(link.spec.catalogStyle),
    garmentUnitPrice: s.garmentUnitPrice,
    sizes: s.approvedSizes,
    feeLines: [
      { description: `Printing (${link.spec.printLocations.join(" + ")}, ${link.spec.inkColors})`, itemNumber: SKU.APPAREL_PRINT, amount: s.decorationTotal },
      { description: "Screens / setup", itemNumber: SKU.APPAREL_SETUP, amount: s.setupTotal },
      ...(s.rushTotal > 0 ? [{ description: "Rush scheduling", itemNumber: SKU.RUSH, amount: s.rushTotal }] : []),
      { description: "Card processing fee (3%)", itemNumber: SKU.CARD_FEE, amount: s.cardFee },
    ].filter((line) => line.amount > 0),
    paymentNote: paidNote,
    tags: ["QuoteLink", "PaidOnline"],
  });

  const latest = (await deps.store.getById(id)) ?? link;

  if (!result.created) {
    await deps.store.save({
      ...latest,
      printavo: { state: "failed", at: nowOf(deps).toISOString(), error: result.error },
    });
    await deps.store.logEvent(id, "printavo_failed", { error: result.error });
    return { ok: false, error: result.error ?? "Unknown Printavo error." };
  }

  await deps.store.save({
    ...latest,
    printavo: { state: "created", at: nowOf(deps).toISOString(), id: result.id, visualId: result.visualId },
  });
  await deps.store.logEvent(id, "printavo_created", { visualId: result.visualId });

  return { ok: true, visualId: result.visualId };
}
