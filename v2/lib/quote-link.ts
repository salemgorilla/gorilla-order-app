import { quoteApparelCart } from "./apparel-cart";
import { garmentPriceByMarkup, sizePriceAtMarkup } from "./apparel-blend";
import { apparelPricingConfig } from "./apparel-pricing-config";
import type { SsCatalogColor, SsCatalogSize } from "../features/types";

/**
 * THE CUSTOMER QUOTE LINK — pure logic, no I/O.
 *
 * A private page where a customer adjusts sizes on a quote the SHOP built,
 * watches the price move, approves, and pays. Everything that decides what a
 * customer sees, may change, or owes lives here so it can be tested without
 * Printavo or a blob store (lib/quote-link-store.ts is the I/O).
 *
 * ── WHO IS THE AUTHORITY ON WHAT ──────────────────────────────────────────
 * PRICE SHOWN while editing: this app's apparel engine (quoteApparelCart),
 * run on the server against a catalogue snapshot taken when the link was
 * made. The browser never supplies a figure.
 *
 * AMOUNT CHARGED: Printavo's own `amountOutstanding`. AGENTS.md: the app
 * never passes a total it derived itself to a payment request. So when a
 * customer changes sizes, the Printavo quote is no longer what they approved
 * and PAYMENT IS HELD until the shop updates Printavo and releases it —
 * see paymentGate().
 *
 * ── THE PRINT SPEC IS THE SHOP'S ──────────────────────────────────────────
 * A hand-built Printavo quote holds free text, not a style/colour/ink spec.
 * The shop confirms the spec when it creates the link; the customer cannot
 * change garment, colour, locations or inks (Phase 3).
 */

export type QuoteLinkStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "approved"
  | "payment_requested"
  | "paid";

export type QuoteLinkSize = {
  sizeName: string;
  /** Customer-facing prices only. Wholesale never enters this record. */
  markedUpPrice: number;
  priceByMarkup?: Record<string, number>;
  available: boolean;
  /** Units in stock when S&S said; undefined when unknown. */
  stock?: number;
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
  garmentTotal: number;
  decorationTotal: number;
  setupTotal: number;
  rushTotal: number;
  subtotal: number;
  tax: number;
  total: number;
  /** Per-piece, all in. */
  perPiece: number;
  depositPercent: number | null;
  depositAmount: number | null;
};

export type QuoteLink = {
  id: string;
  /** Bumped by regenerate; the token pointer carries it. */
  tokenVersion: number;
  status: QuoteLinkStatus;
  createdAt: string;
  expiresAt?: string;
  printavo: {
    quoteId: string;
    visualId: string;
    /** Sizes on the Printavo quote when the link was made. */
    sizes: Record<string, number>;
    total: number;
  };
  customer: { name: string; email: string };
  spec: QuoteLinkSpec;
  catalogSizes: QuoteLinkSize[];
  minimumPieces: number;
  depositPercent: number | null;
  turnaroundNote: string;
  /** What the customer currently has entered. */
  sizes: Record<string, number>;
  approval?: ApprovalRecord;
  approvedSnapshot?: PriceBreakdown & { approvedSizes: Record<string, number> };
  /** The shop's release of payment after a size change. */
  paymentReleased: boolean;
  payment?: {
    requestId: string;
    amount: number;
    /** Printavo's amountOutstanding just before the request was raised. */
    baseOutstanding: number;
    requestedAt: string;
    paidAt?: string;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ── tokens ─────────────────────────────────────────────────────────────── */

/** 32 bytes of CSPRNG, base64url — 43 characters, 256 bits. */
export function createQuoteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Shape only: safe to put in a path before it is used. */
export function isValidQuoteToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/* ── sizes ──────────────────────────────────────────────────────────────── */

export type SizesCheck =
  | { ok: true; sizes: Record<string, number>; warnings: string[] }
  | { ok: false; error: string };

export const MAX_PER_SIZE = 5000;

/**
 * Whatever the browser sent, reduced to a clean size map or refused.
 *
 * Unknown sizes are refused rather than dropped: a customer who typed 12 into
 * a size we do not stock should be told, not left with a total that quietly
 * omits them. Zeros are discarded. Out-of-stock sizes are refused; low stock
 * is a warning.
 */
export function validateSizes(link: QuoteLink, raw: unknown): SizesCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Sizes must be an object of size to quantity." };
  }

  const known = new Map(link.catalogSizes.map((s) => [s.sizeName, s]));
  const sizes: Record<string, number> = {};
  const warnings: string[] = [];

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
    if (size.stock !== undefined && n > size.stock) {
      return {
        ok: false,
        error: `Only ${size.stock} of ${name} are in stock. Reduce it or call us.`,
      };
    }
    if (size.stock !== undefined && n > size.stock * 0.8) {
      warnings.push(`${name} is running low - ${size.stock} left.`);
    }

    sizes[name] = n;
  }

  return { ok: true, sizes, warnings };
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
  const sizes: SsCatalogSize[] = link.catalogSizes.map(toSsSize);

  return {
    colorName: link.spec.colorName,
    colorHex: null,
    swatchImage: null,
    frontImage: link.spec.imageUrl ?? null,
    backImage: null,
    sideImage: null,
    isAvailable: true,
    outOfStock: false,
    sizes,
  };
}

/**
 * The full price for these sizes, from the shop's engine.
 *
 * Returns the customer-facing breakdown only. Tax is zero: apparel is not a
 * taxed flow here (lib/tax.ts isTaxableFlow), the same rule the website uses.
 */
export function priceQuoteLink(
  link: QuoteLink,
  sizes: Record<string, number>
): PriceBreakdown {
  const pieces = Object.values(sizes).reduce((sum, n) => sum + n, 0);
  const deposit = link.depositPercent;

  if (pieces === 0) {
    return {
      garmentMarkup: apparelPricingConfig.baseGarmentMarkup,
      pieces: 0,
      sizes,
      perSize: [],
      garmentTotal: 0,
      decorationTotal: 0,
      setupTotal: 0,
      rushTotal: 0,
      subtotal: 0,
      tax: 0,
      total: 0,
      perPiece: 0,
      depositPercent: deposit,
      depositAmount: deposit ? 0 : null,
    };
  }

  const color = asCatalogColor(link);
  const byMarkup = garmentPriceByMarkup(color, sizes, pieces);

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
  const total = subtotal;

  return {
    garmentMarkup: quote.garmentMarkup,
    pieces,
    sizes,
    perSize,
    garmentTotal: quote.garmentTotal,
    decorationTotal: quote.printTotal,
    setupTotal: quote.setupTotal,
    rushTotal,
    subtotal,
    tax: 0,
    total,
    perPiece: round2(total / pieces),
    depositPercent: deposit,
    depositAmount: deposit ? round2((total * deposit) / 100) : null,
  };
}

/* ── state rules ────────────────────────────────────────────────────────── */

export function isLocked(link: QuoteLink): boolean {
  return (
    link.status === "approved" ||
    link.status === "payment_requested" ||
    link.status === "paid"
  );
}

export function isExpired(link: QuoteLink, now = Date.now()): boolean {
  return Boolean(link.expiresAt) && Date.parse(link.expiresAt as string) <= now;
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

/** Lock the quote and freeze what was approved. */
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
    paymentReleased: false,
  };
}

/** Shop unlock: clears approval so the customer can edit again. */
export function applyUnlock(link: QuoteLink): QuoteLink {
  return {
    ...link,
    status: "sent",
    approval: undefined,
    approvedSnapshot: undefined,
    paymentReleased: false,
  };
}

function sameSizes(a: Record<string, number>, b: Record<string, number>): boolean {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const name of names) {
    if ((a[name] ?? 0) !== (b[name] ?? 0)) return false;
  }

  return true;
}

export type PaymentGate =
  | { state: "not-approved" }
  | { state: "held"; reason: string }
  | { state: "ready" }
  | { state: "requested" }
  | { state: "paid" };

/**
 * May this customer be sent a payment link now?
 *
 * Printavo's quote is the billing authority. If the approved sizes are the
 * ones the Printavo quote already has, its figure is what the customer saw
 * and the link can go. If they changed anything, Printavo is stale until the
 * shop updates it, so the link waits for the shop's release.
 */
export function paymentGate(link: QuoteLink): PaymentGate {
  if (link.status === "paid") return { state: "paid" };
  if (link.status === "payment_requested") return { state: "requested" };
  if (link.status !== "approved" || !link.approvedSnapshot) {
    return { state: "not-approved" };
  }

  const changed = !sameSizes(link.approvedSnapshot.approvedSizes, link.printavo.sizes);

  if (changed && !link.paymentReleased) {
    return {
      state: "held",
      reason: "You changed the sizes, so the shop is updating your invoice first.",
    };
  }

  return { state: "ready" };
}

/** Deposit as a 0-1 fraction for Printavo, or undefined for full payment. */
export function depositFraction(link: QuoteLink): number | undefined {
  const p = link.depositPercent;

  return p && p > 0 && p < 100 ? p / 100 : undefined;
}

/* ── what the public may see ────────────────────────────────────────────── */

export type PublicQuote = {
  orderNumber: string;
  customerName: string;
  status: QuoteLinkStatus;
  locked: boolean;
  spec: QuoteLinkSpec;
  sizes: Array<{
    sizeName: string;
    available: boolean;
    stock?: number;
    unitPrice: number;
    upcharge: number;
  }>;
  entered: Record<string, number>;
  minimumPieces: number;
  turnaroundNote: string;
  price: PriceBreakdown;
  belowMinimum: string | null;
  gate: PaymentGate;
  approval?: { name: string; approvedAt: string };
};

/**
 * The ONLY shape that leaves the server for a customer.
 *
 * Built field by field. Spreading the record would one day ship an internal
 * field (Printavo ids, IP, approval email) without anyone deciding to.
 */
export function toPublicQuote(link: QuoteLink): PublicQuote {
  const price = priceQuoteLink(link, link.sizes);
  const unit = (s: QuoteLinkSize) => unitAt(s, price.garmentMarkup);

  // Upcharges are shown against the cheapest offered size, so 2XL reads as
  // "+$2.00" whatever the customer has typed so far.
  const base = Math.min(...link.catalogSizes.map(unit));

  return {
    orderNumber: link.printavo.visualId,
    customerName: link.customer.name,
    status: link.status,
    locked: isLocked(link),
    spec: link.spec,
    sizes: link.catalogSizes.map((s) => ({
      sizeName: s.sizeName,
      available: s.available,
      stock: s.stock,
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
  };
}
