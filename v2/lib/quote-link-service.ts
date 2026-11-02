import {
  applyApproval,
  applyUnlock,
  checkApproval,
  createQuoteToken,
  depositFraction,
  isLocked,
  paymentGate,
  priceQuoteLink,
  validateSizes,
  type PriceBreakdown,
  type QuoteLink,
  type QuoteLinkSize,
  type QuoteLinkSpec,
} from "./quote-link";
import type { QuoteLinkStore } from "./quote-link-store";
import type { LinkableQuote, PaymentRequestResult } from "./printavo";

/**
 * The quote link's actions, with every outside dependency passed in.
 *
 * Routes are thin shells over this. Printavo, the clock and the mailer arrive
 * as `deps` so the rules below - the ones that touch a customer's money - run
 * in tests without a network, and so a route cannot reach around them.
 */

export type Deps = {
  store: QuoteLinkStore;
  findQuote: (visualId: string) => Promise<LinkableQuote>;
  requestPayment: (input: {
    quoteId: string;
    fraction?: number;
  }) => Promise<PaymentRequestResult>;
  outstanding: (quoteId: string) => Promise<number | null>;
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

function summary(origin: string, link: QuoteLink, extra: string[] = []): string[] {
  const price = priceQuoteLink(link, link.sizes);

  return [
    `Order #${link.printavo.visualId}`,
    `Customer: ${link.customer.name} <${link.customer.email}>`,
    `Total: ${money(price.total)} (${price.pieces} pieces)`,
    ...extra,
    `Open: ${origin}/admin/quote-links`,
  ];
}

/* ── shop side ──────────────────────────────────────────────────────────── */

export type CreateInput = {
  printavoQuote: string;
  spec: QuoteLinkSpec;
  catalogSizes: QuoteLinkSize[];
  minimumPieces: number;
  depositPercent: number | null;
  turnaroundNote: string;
  expiresAt?: string;
};

export async function createLink(
  deps: Deps,
  input: CreateInput
): Promise<ServiceResult<{ link: QuoteLink; token: string }>> {
  if (!input.catalogSizes.length) return fail(400, "No sizes were found for that style and colour.");
  if (!(input.minimumPieces >= 1 && input.minimumPieces <= 10000)) {
    return fail(400, "Minimum pieces must be between 1 and 10,000.");
  }
  if (input.depositPercent !== null && !(input.depositPercent > 0 && input.depositPercent < 100)) {
    return fail(400, "Deposit must be between 1 and 99 percent, or empty for full payment.");
  }
  if (!input.spec.printLocations.length) return fail(400, "Add at least one print location.");

  const quote = await deps.findQuote(input.printavoQuote);
  if (!quote.found) return fail(404, quote.error);
  if (!quote.customerEmail) {
    return fail(400, "That Printavo quote has no customer email. Add one in Printavo first.");
  }

  const id = createQuoteToken().replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 20);
  const now = (deps.now?.() ?? new Date()).toISOString();

  const base: QuoteLink = {
    id,
    tokenVersion: 0,
    status: "sent",
    createdAt: now,
    expiresAt: input.expiresAt,
    printavo: {
      quoteId: quote.id,
      visualId: quote.visualId,
      sizes: quote.sizes,
      total: quote.total,
    },
    customer: { name: quote.customerName, email: quote.customerEmail },
    spec: input.spec,
    catalogSizes: input.catalogSizes,
    minimumPieces: input.minimumPieces,
    depositPercent: input.depositPercent,
    turnaroundNote: input.turnaroundNote,
    sizes: {},
    paymentReleased: false,
  };

  // Start from the sizes on the Printavo quote, and refuse to guess about any
  // that this style and colour do not come in.
  const check = validateSizes(base, quote.sizes);
  if (!check.ok) {
    return fail(400, `The sizes on Printavo don't fit this garment: ${check.error}`);
  }

  const link: QuoteLink = { ...base, sizes: check.sizes };
  const token = await deps.store.issueToken(link);
  await deps.store.logEvent(id, "link_created", { quote: quote.visualId });

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

export async function unlockLink(deps: Deps, id: string): Promise<ServiceResult> {
  const link = await deps.store.getById(id);
  if (!link) return fail(404, "No such quote link.");
  if (link.status === "paid") return fail(409, "This quote is paid and cannot be unlocked.");
  if (link.status === "payment_requested") {
    return fail(409, "A payment request is already out for this quote. Void it in Printavo first.");
  }

  await deps.store.save(applyUnlock(link));
  await deps.store.logEvent(id, "unlocked");

  return { ok: true };
}

/** The shop has updated Printavo to match the approved sizes. */
export async function releasePayment(deps: Deps, id: string): Promise<ServiceResult> {
  const link = await deps.store.getById(id);
  if (!link) return fail(404, "No such quote link.");
  if (link.status !== "approved") return fail(409, "Only an approved quote can be released.");

  await deps.store.save({ ...link, paymentReleased: true });
  await deps.store.logEvent(id, "payment_released");

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

  return refreshPaid(deps, link);
}

/**
 * Has Printavo seen the payment? There is no webhook from Printavo, so the
 * page asks when it is opened. `null` (could not ask) leaves the status alone.
 */
async function refreshPaid(deps: Deps, link: QuoteLink): Promise<QuoteLink> {
  if (link.status !== "payment_requested" || !link.payment) return link;

  const owed = await deps.outstanding(link.printavo.quoteId);
  // Deposits leave a balance, so "paid" here means the REQUEST was settled,
  // which Printavo reports as the outstanding amount dropping by that much.
  const settled =
    owed !== null && owed <= Math.max(0, link.payment.baseOutstanding - link.payment.amount) + 0.005;

  if (!settled) return link;

  const paid: QuoteLink = {
    ...link,
    status: "paid",
    payment: { ...link.payment, paidAt: (deps.now?.() ?? new Date()).toISOString() },
  };
  await deps.store.save(paid);
  await deps.store.logEvent(link.id, "paid", { amount: link.payment.amount });
  await deps.notifyShop(`Quote #${link.printavo.visualId} paid`, summary(deps.origin, paid, [
    `Paid: ${money(link.payment.amount)}`,
  ]));

  return paid;
}

export async function updateSizes(
  deps: Deps,
  token: string,
  raw: unknown
): Promise<ServiceResult<{ link: QuoteLink; warnings: string[] }>> {
  const link = await deps.store.getByToken(token);
  if (!link) return fail(404, "This link is no longer valid.");
  if (isLocked(link)) return fail(409, "This quote is approved, so the sizes are locked.");

  const check = validateSizes(link, raw);
  if (!check.ok) return fail(400, check.error);

  const next: QuoteLink = { ...link, sizes: check.sizes };
  await deps.store.save(next);
  await deps.store.logEvent(link.id, "size_changed", { sizes: check.sizes });

  return { ok: true, link: next, warnings: check.warnings };
}

export async function approveLink(
  deps: Deps,
  token: string,
  input: { name: unknown; email: unknown; agreed: unknown; ip: string; sizes?: unknown }
): Promise<ServiceResult<{ link: QuoteLink }>> {
  let link = await deps.store.getByToken(token);
  if (!link) return fail(404, "This link is no longer valid.");

  // Approve what is on screen, not what was last saved. If the browser sends
  // its sizes they are validated and saved first, so a debounce still in
  // flight cannot leave the approved sizes behind the page.
  if (input.sizes !== undefined) {
    const check = validateSizes(link, input.sizes);
    if (!check.ok) return fail(400, check.error);
    link = { ...link, sizes: check.sizes };
  }

  const verdict = checkApproval(link, input);
  if (!verdict.ok) return fail(verdict.error.startsWith("This quote is already") ? 409 : 400, verdict.error);

  const approved = applyApproval(link, {
    name: verdict.name,
    email: verdict.email,
    ip: input.ip,
  }, deps.now?.());

  await deps.store.save(approved);
  await deps.store.logEvent(link.id, "approved", {
    total: approved.approvedSnapshot?.total,
    pieces: approved.approvedSnapshot?.pieces,
  });

  const gate = paymentGate(approved);
  await deps.notifyShop(`Quote #${link.printavo.visualId} approved`, summary(deps.origin, approved, [
    `Approved by: ${verdict.name} <${verdict.email}>`,
    gate.state === "held"
      ? "SIZES CHANGED from the Printavo quote - update Printavo, then Release payment."
      : "Sizes match Printavo. The customer can request their payment link.",
  ]));

  return { ok: true, link: approved };
}

/**
 * Ask Printavo to send the customer their payment link.
 *
 * Printavo is asked for a FRACTION of its own amountOutstanding (deposit), or
 * the whole of it - never a figure this app computed.
 */
export async function startPayment(
  deps: Deps,
  token: string
): Promise<ServiceResult<{ amount: number; emailedTo: string }>> {
  const link = await deps.store.getByToken(token);
  if (!link) return fail(404, "This link is no longer valid.");

  const gate = paymentGate(link);
  if (gate.state === "not-approved") return fail(409, "Approve the quote first.");
  if (gate.state === "held") return fail(409, gate.reason);
  if (gate.state === "requested") return fail(409, "A payment link has already been emailed to you.");
  if (gate.state === "paid") return fail(409, "This quote is already paid.");

  const baseOutstanding = await deps.outstanding(link.printavo.quoteId);
  if (baseOutstanding === null) {
    return fail(503, "We couldn't reach our billing system. Please try again in a minute.");
  }

  const result = await deps.requestPayment({
    quoteId: link.printavo.quoteId,
    fraction: depositFraction(link),
  });

  if (!result.sent || !result.amount) {
    await deps.store.logEvent(link.id, "payment_failed", { error: result.error });
    await deps.notifyShop(`Quote #${link.printavo.visualId} payment request FAILED`, summary(deps.origin, link, [
      `Error: ${result.error ?? "unknown"}`,
    ]));
    return fail(502, "We couldn't send your payment link. The shop has been told.");
  }

  const next: QuoteLink = {
    ...link,
    status: "payment_requested",
    payment: {
      requestId: result.paymentRequestId ?? "",
      amount: result.amount,
      baseOutstanding,
      requestedAt: (deps.now?.() ?? new Date()).toISOString(),
    },
  };
  await deps.store.save(next);
  await deps.store.logEvent(link.id, "payment_started", { amount: result.amount });

  return { ok: true, amount: result.amount, emailedTo: link.customer.email };
}

export type { PriceBreakdown };
