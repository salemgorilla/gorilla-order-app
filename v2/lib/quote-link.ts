import { quoteApparelCart } from "./apparel-cart";
import { garmentPriceByMarkup, sizePriceAtMarkup } from "./apparel-blend";
import { apparelPricingConfig } from "./apparel-pricing-config";
import { DEPOSIT_FRACTION, FULL_PAYMENT_CEILING } from "./auto-bill";
import type { SsCatalogColor, SsCatalogSize } from "../features/types";

/**
 * THE CUSTOMER QUOTE LINK — pure logic, no I/O.
 *
 * A private page where a customer adjusts sizes on a quote the SHOP built,
 * watches the price move, approves, and pays by card. Everything that decides
 * what a customer sees, may change, or owes lives here so it can be tested
 * without Stripe, Printavo or a blob store.
 *
 * ── ONE PRICE (Gabe, 2026-11-02) ──────────────────────────────────────────
 * "Your own pricing engine is the single source of price, and the customer
 * pays through Stripe on the quote page." So the figure on screen IS the
 * figure charged: quoteApparelCart on a catalogue snapshot taken when the
 * link was made, plus the card fee, computed on the server. The browser never
 * supplies a number, and Printavo plays no part until after payment, when it
 * receives the order as already paid (lib/quote-link-service.ts).
 *
 * ── THE PRINT SPEC IS THE SHOP'S ──────────────────────────────────────────
 * The shop sets garment, colour, locations and inks on the admin page. The
 * customer changes sizes only (garment and art editing are Phase 3).
 */

/**
 * Card processing fee on every quote-link order (Gabe, 2026-11-03: "3% card
 * fee", matching the CC Processing fee line on his hand quotes). Untaxed.
 *
 * No sales tax is added: apparel is not a taxed flow in this app
 * (lib/tax.ts isTaxableFlow) and Gabe did not ask for it here.
 */
export const CARD_FEE_RATE = 0.03;

export type QuoteLinkStatus =
  | "sent"
  | "viewed"
  | "approved"
  | "payment_started"
  | "paid";

export type QuoteLinkSize = {
  sizeName: string;
  /** Customer-facing prices only. Wholesale never enters this record. */
  markedUpPrice: number;
  priceByMarkup?: Record<string, number>;
  available: boolean;
};

export type QuoteLinkSpec = {
  brand: string;
  styleLabel: string; // "BELLA + CANVAS 3001"
  catalogStyle: string;
  colorName: string;
  imageUrl?: string;
  method: string; // "Screen print"
  printLocations: string[];
  inkColors: string;
  inkColorsByLocation?: Record<string, string>;
  hasUnderbase: boolean;
};

export type ApprovalRecord = {
  approvedAt: string;
  name: string;
  email: string;
  ip: string;
};

export type PriceBreakdown = {
  /** The blank markup this run was charged at (1.5 = 150%). */
  garmentMarkup: number;
  pieces: number;
  sizes: Record<string, number>;
  /** Per size, the customer's price for one piece. */
  perSize: Array<{ sizeName: string; quantity: number; unitPrice: number; upcharge: number }>;
  /** The blank per piece the engine charged (garmentTotal = this x pieces). */
  garmentUnitPrice: number;
  garmentTotal: number;
  decorationTotal: number;
  setupTotal: number;
  rushTotal: number;
  /** Goods and setup, before the card fee. */
  subtotal: number;
  cardFee: number;
  tax: number;
  total: number;
  /** Per-piece, all in. */
  perPiece: number;
  /** What is charged now: the total, or a deposit of it. */
  amountDue: number;
  /** Null when the whole total is due now. */
  deposit: { percent: number; reason: "shop" | "large-order" } | null;
};

export type QuotePayment = {
  /** Stripe Checkout session for the current attempt. */
  sessionId: string;
  sessionUrl: string;
  /** Exactly what the session charges, in cents. The webhook checks this. */
  amountCents: number;
  kind: "full" | "deposit";
  startedAt: string;
  paymentIntentId?: string;
  amountPaid?: number;
  paidAt?: string;
};

export type PrintavoHandoff = {
  state: "creating" | "created" | "failed";
  at: string;
  id?: string;
  visualId?: string;
  error?: string;
};

export type QuoteLink = {
  id: string;
  /** Shown to the customer and written into the Printavo nickname. */
  orderNumber: string;
  /** Bumped by regenerate; the token pointer carries it. */
  tokenVersion: number;
  status: QuoteLinkStatus;
  createdAt: string;
  expiresAt?: string;
  customer: { name: string; email: string; phone?: string };
  spec: QuoteLinkSpec;
  catalogSizes: QuoteLinkSize[];
  minimumPieces: number;
  /** The shop's own deposit for this quote, 1-99, or null. */
  depositPercent: number | null;
  turnaroundNote: string;
  /** What the customer currently has entered. */
  sizes: Record<string, number>;
  approval?: ApprovalRecord;
  approvedSnapshot?: PriceBreakdown & { approvedSizes: Record<string, number> };
  payment?: QuotePayment;
  printavo?: PrintavoHandoff;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ── tokens and ids ─────────────────────────────────────────────────────── */

function randomBase64Url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);

  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 32 bytes of CSPRNG, base64url — 43 characters, 256 bits. */
export function createQuoteToken(): string {
  return randomBase64Url(32);
}

/** Shape only: safe to put in a path before it is used. */
export function isValidQuoteToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** An internal id: lowercase, 20 characters. Never shown to a customer. */
export function createLinkId(): string {
  return randomBase64Url(24).replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 20);
}

/**
 * "GQ-7K2M9QXA". The GQ- prefix keeps it from ever matching a website order's
 * GS- number in Printavo's nickname search, which is how a retried webhook
 * finds the order it already created.
 */
export function createOrderNumber(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);

  return `GQ-${Array.from(buf, (b) => alphabet[b % alphabet.length]).join("")}`;
}

/* ── sizes ──────────────────────────────────────────────────────────────── */

export type SizesCheck =
  | { ok: true; sizes: Record<string, number> }
  | { ok: false; error: string };

export const MAX_PER_SIZE = 5000;

/**
 * Whatever the browser sent, reduced to a clean size map or refused.
 *
 * Unknown sizes are refused rather than dropped: a customer who typed 12 into
 * a size we do not stock should be told, not left with a total that quietly
 * omits them. Zeros are discarded. Unavailable sizes are refused.
 */
export function validateSizes(link: QuoteLink, raw: unknown): SizesCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Sizes must be an object of size to quantity." };
  }

  const known = new Map(link.catalogSizes.map((s) => [s.sizeName, s]));
  const sizes: Record<string, number> = {};

  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const size = known.get(name);
    if (!size) return { ok: false, error: `${name} is not offered in this colour.` };

    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PER_SIZE) {
      return { ok: false, error: `Enter a whole number for ${name}.` };
    }
    if (n === 0) continue;

    if (!size.available) {
      return { ok: false, error: `${name} is out of stock in this colour.` };
    }

    sizes[name] = n;
  }

  return { ok: true, sizes };
}

/* ── pricing ────────────────────────────────────────────────────────────── */

function toSsSize(s: QuoteLinkSize): SsCatalogSize {
  return {
    sku: s.sizeName,
    sizeName: s.sizeName,
    markedUpPrice: s.markedUpPrice,
    priceByMarkup: s.priceByMarkup,
    isAvailable: s.available,
    outOfStock: !s.available,
  };
}

function unitAt(s: QuoteLinkSize, markup: number): number {
  return sizePriceAtMarkup(toSsSize(s), markup);
}

function asCatalogColor(link: QuoteLink): SsCatalogColor {
  return {
    colorName: link.spec.colorName,
    colorHex: null,
    swatchImage: null,
    frontImage: link.spec.imageUrl ?? null,
    backImage: null,
    sideImage: null,
    isAvailable: true,
    outOfStock: false,
    sizes: link.catalogSizes.map(toSsSize),
  };
}

/**
 * What is due now.
 *
 * The shop's own deposit wins. Otherwise the app-wide rule: over
 * FULL_PAYMENT_CEILING, DEPOSIT_FRACTION of it now and the balance before the
 * job leaves (Gabe, 2026-09-07, confirmed for quote links 2026-11-03). Both
 * numbers are imported, never copied: AGENTS.md, "never give either flow its
 * own copy of either number".
 */
export function depositFor(
  total: number,
  shopPercent: number | null
): PriceBreakdown["deposit"] {
  if (shopPercent && shopPercent > 0 && shopPercent < 100) {
    return { percent: shopPercent, reason: "shop" };
  }
  if (total > FULL_PAYMENT_CEILING) {
    return { percent: DEPOSIT_FRACTION * 100, reason: "large-order" };
  }

  return null;
}

/** The full price for these sizes, from the shop's engine, plus the card fee. */
export function priceQuoteLink(
  link: QuoteLink,
  sizes: Record<string, number>
): PriceBreakdown {
  const pieces = Object.values(sizes).reduce((sum, n) => sum + n, 0);

  if (pieces === 0) {
    return {
      garmentMarkup: apparelPricingConfig.baseGarmentMarkup,
      pieces: 0,
      sizes,
      perSize: [],
      garmentUnitPrice: 0,
      garmentTotal: 0,
      decorationTotal: 0,
      setupTotal: 0,
      rushTotal: 0,
      subtotal: 0,
      cardFee: 0,
      tax: 0,
      total: 0,
      perPiece: 0,
      amountDue: 0,
      deposit: null,
    };
  }

  const byMarkup = garmentPriceByMarkup(asCatalogColor(link), sizes, pieces);

  const quote = quoteApparelCart(
    [
      {
        id: "line-1",
        garmentLabel: link.spec.styleLabel,
        colorName: link.spec.colorName,
        catalogStyle: link.spec.catalogStyle,
        garmentPriceByMarkup: byMarkup,
        quantity: pieces,
      },
    ],
    {
      printLocations: link.spec.printLocations,
      inkColors: link.spec.inkColors,
      inkColorsByLocation: link.spec.inkColorsByLocation,
      hasUnderbase: link.spec.hasUnderbase,
    }
  );

  // Upcharges are against the cheapest size on offer, the same reference the
  // size grid uses, so the two never disagree about what 2XL costs extra.
  const basePrice = Math.min(
    ...link.catalogSizes.map((s) => unitAt(s, quote.garmentMarkup))
  );

  const perSize = link.catalogSizes
    .filter((s) => sizes[s.sizeName] > 0)
    .map((s) => {
      const unitPrice = unitAt(s, quote.garmentMarkup);
      return {
        sizeName: s.sizeName,
        quantity: sizes[s.sizeName],
        unitPrice,
        upcharge: round2(Math.max(0, unitPrice - basePrice)),
      };
    });

  const rushTotal = quote.rushFee ?? 0;
  const subtotal = round2(quote.total + rushTotal);
  const cardFee = round2(subtotal * CARD_FEE_RATE);
  const total = round2(subtotal + cardFee);
  const deposit = depositFor(total, link.depositPercent);

  return {
    garmentMarkup: quote.garmentMarkup,
    pieces,
    sizes,
    perSize,
    garmentUnitPrice: quote.lines[0]?.garmentUnitPrice ?? 0,
    garmentTotal: quote.garmentTotal,
    decorationTotal: quote.printTotal,
    setupTotal: quote.setupTotal,
    rushTotal,
    subtotal,
    cardFee,
    tax: 0,
    total,
    perPiece: round2(total / pieces),
    amountDue: deposit ? round2((total * deposit.percent) / 100) : total,
    deposit,
  };
}

/* ── state rules ────────────────────────────────────────────────────────── */

export function isLocked(link: QuoteLink): boolean {
  return (
    link.status === "approved" ||
    link.status === "payment_started" ||
    link.status === "paid"
  );
}

export function belowMinimum(link: QuoteLink, pieces: number): string | null {
  if (pieces >= link.minimumPieces) return null;

  return `The minimum order is ${link.minimumPieces} pieces. You have ${pieces}.`;
}

export type ApproveInput = { name: unknown; email: unknown; agreed: unknown; ip: string };

export function checkApproval(
  link: QuoteLink,
  input: ApproveInput
): { ok: true; name: string; email: string } | { ok: false; error: string } {
  if (isLocked(link)) return { ok: false, error: "This quote is already approved." };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";

  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: "Enter your full name." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (input.agreed !== true) {
    return { ok: false, error: "Tick the box to approve the mockup, sizes and price." };
  }

  const pieces = Object.values(link.sizes).reduce((a, b) => a + b, 0);
  const min = belowMinimum(link, pieces);
  if (min) return { ok: false, error: min };

  return { ok: true, name, email };
}

/** Lock the quote and freeze what was approved: the snapshot is what is charged. */
export function applyApproval(
  link: QuoteLink,
  who: { name: string; email: string; ip: string },
  now = new Date()
): QuoteLink {
  const breakdown = priceQuoteLink(link, link.sizes);

  return {
    ...link,
    status: "approved",
    approval: { approvedAt: now.toISOString(), ...who },
    approvedSnapshot: { ...breakdown, approvedSizes: { ...link.sizes } },
  };
}

/** Shop unlock: clears approval so the customer can edit again. */
export function applyUnlock(link: QuoteLink): QuoteLink {
  return {
    ...link,
    status: "sent",
    approval: undefined,
    approvedSnapshot: undefined,
    payment: undefined,
  };
}

export type PaymentGate =
  | { state: "not-approved" }
  | { state: "ready"; amountDue: number }
  | { state: "paid" };

/** May this customer pay now, and how much. */
export function paymentGate(link: QuoteLink): PaymentGate {
  if (link.status === "paid") return { state: "paid" };
  if (!link.approvedSnapshot || !isLocked(link)) return { state: "not-approved" };

  return { state: "ready", amountDue: link.approvedSnapshot.amountDue };
}

/** Dollars to Stripe's integer cents, without float dust. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/* ── what the public may see ────────────────────────────────────────────── */

export type PublicQuote = {
  orderNumber: string;
  customerName: string;
  status: QuoteLinkStatus;
  locked: boolean;
  spec: QuoteLinkSpec;
  sizes: Array<{ sizeName: string; available: boolean; unitPrice: number; upcharge: number }>;
  entered: Record<string, number>;
  minimumPieces: number;
  turnaroundNote: string;
  /** While locked, the APPROVED snapshot: exactly what will be charged. */
  price: PriceBreakdown;
  belowMinimum: string | null;
  gate: PaymentGate;
  approval?: { name: string; approvedAt: string };
  amountPaid?: number;
};

/**
 * The ONLY shape that leaves the server for a customer.
 *
 * Built field by field. Spreading the record would one day ship an internal
 * field (Stripe ids, IP, approval email, Printavo ids) without anyone
 * deciding to.
 */
export function toPublicQuote(link: QuoteLink): PublicQuote {
  const price =
    isLocked(link) && link.approvedSnapshot
      ? stripSnapshot(link.approvedSnapshot)
      : priceQuoteLink(link, link.sizes);
  const unit = (s: QuoteLinkSize) => unitAt(s, price.garmentMarkup);
  const base = Math.min(...link.catalogSizes.map(unit));

  return {
    orderNumber: link.orderNumber,
    customerName: link.customer.name,
    status: link.status,
    locked: isLocked(link),
    spec: link.spec,
    sizes: link.catalogSizes.map((s) => ({
      sizeName: s.sizeName,
      available: s.available,
      unitPrice: unit(s),
      upcharge: round2(Math.max(0, unit(s) - base)),
    })),
    entered: link.sizes,
    minimumPieces: link.minimumPieces,
    turnaroundNote: link.turnaroundNote,
    price,
    belowMinimum: belowMinimum(link, price.pieces),
    gate: paymentGate(link),
    approval: link.approval
      ? { name: link.approval.name, approvedAt: link.approval.approvedAt }
      : undefined,
    amountPaid: link.payment?.amountPaid,
  };
}

function stripSnapshot(
  snapshot: NonNullable<QuoteLink["approvedSnapshot"]>
): PriceBreakdown {
  const { approvedSizes: _approved, ...price } = snapshot;
  void _approved;
  return price;
}
