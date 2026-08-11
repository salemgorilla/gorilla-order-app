import { isTaxableFlow, SALES_TAX } from "./tax";

// Pushes each submitted quote into Printavo as a DRAFT/UNCONFIRMED quote.
//
// Env vars (all optional — if any are missing, pushing is skipped safely):
//   PRINTAVO_EMAIL        - the Printavo account email (API v2 auth header)
//   PRINTAVO_TOKEN        - the Printavo API token
//   PRINTAVO_CUSTOMER_ID  - OPTIONAL catch-all customer, used only as a
//                           fallback when a quote's customer can't be resolved
//                           (falls back to PRINTAVO_TEST_CUSTOMER_ID)
//
// Design notes:
// - Best-effort: a Printavo failure never blocks the customer's confirmation.
// - Quotes are tagged #WebQuote / #Unconfirmed so they're obviously not
//   reviewed yet. A Printavo "quote" is already pre-order, not an invoice.
// - Customer identity: quotes attach to the REAL customer. We look them up by
//   email and create a Printavo customer + primary contact if they're new, so
//   repeat customers accumulate history on one record.

const PRINTAVO_API_URL = "https://www.printavo.com/api/v2";

export type PrintavoResult = {
  created: boolean;
  skipped?: boolean;
  error?: string;
  quoteId?: string;
  publicUrl?: string;
  /** True when a brand-new Printavo customer was created for this quote. */
  createdCustomer?: boolean;
  /** True when an existing Printavo customer was matched by email. */
  matchedExistingCustomer?: boolean;
};

type AnyRecord = Record<string, unknown>;

function str(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const s = String(value);
  return s.trim() === "" ? fallback : s;
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isApparel(product: AnyRecord) {
  return (
    str(product.type).toLowerCase().includes("apparel") ||
    Boolean(product.supplier) ||
    Boolean(product.garmentType)
  );
}

function isSigns(product: AnyRecord) {
  return (
    str(product.type).toLowerCase().includes("signs") ||
    Boolean(product.signType)
  );
}

/**
 * Printavo mangles non-ASCII in line-item text ("10 × $2" arrives as "10 � $2"),
 * so swap the typographic characters we use for plain ASCII before sending.
 */
function asciiSafe(value: string) {
  return value
    .replace(/[×✕✖]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/″/g, '"')
    .replace(/′/g, "'")
    // Anything still outside ASCII would come through as a replacement char.
    .replace(/[^\x20-\x7E\n]/g, "");
}

export type PrintavoSizeCount = { size: string; count: number };

// Printavo's LineItemSize enum (lowercase snake_case), verified against
// https://www.printavo.com/docs/api/v2/enum/lineitemsize/
const SIZE_ENUM_BY_NAME: Record<string, string> = {
  XS: "size_xs",
  S: "size_s",
  M: "size_m",
  L: "size_l",
  XL: "size_xl",
  "2XL": "size_2xl",
  XXL: "size_2xl",
  "3XL": "size_3xl",
  XXXL: "size_3xl",
  "4XL": "size_4xl",
  "5XL": "size_5xl",
  "6XL": "size_6xl",
  // Youth
  YXS: "size_yxs",
  YS: "size_ys",
  YM: "size_ym",
  YL: "size_yl",
  YXL: "size_yxl",
};

export function toPrintavoSize(sizeName: string) {
  const key = sizeName.trim().toUpperCase().replace(/\s+/g, "");
  return SIZE_ENUM_BY_NAME[key] || "size_other";
}

/**
 * Turns the app's size-breakdown string ("S-4, M-8, L-8, XL-4") into Printavo
 * size/count pairs. Returns [] when nothing usable can be parsed, so callers
 * can fall back to a single size_other row.
 */
export function parseSizeBreakdown(sizeBreakdown: string): PrintavoSizeCount[] {
  if (!sizeBreakdown.trim()) return [];

  const counts = new Map<string, number>();

  for (const part of sizeBreakdown.split(",")) {
    // Last dash wins so names containing a dash still parse.
    const match = part.trim().match(/^(.+)-(\d+)$/);
    if (!match) continue;

    const count = Number(match[2]);
    if (!Number.isFinite(count) || count <= 0) continue;

    const size = toPrintavoSize(match[1]);
    // Unknown names all collapse to size_other, so merge their counts.
    counts.set(size, (counts.get(size) || 0) + count);
  }

  return Array.from(counts.entries()).map(([size, count]) => ({ size, count }));
}

export function getPrintavoConfig() {
  const email = process.env.PRINTAVO_EMAIL;
  const token = process.env.PRINTAVO_TOKEN;
  const customerId =
    process.env.PRINTAVO_CUSTOMER_ID || process.env.PRINTAVO_TEST_CUSTOMER_ID;

  return { email, token, customerId };
}

function isConfigured() {
  // customerId is only a fallback now — find-or-create resolves real customers.
  const { email, token } = getPrintavoConfig();
  return Boolean(email && token);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Printavo allows 10 requests per 5 seconds per account. Creating one quote
// costs 3 requests, so a couple of simultaneous submissions can trip the limit.
// Retry 429s (and 5xx) with exponential backoff instead of dropping the quote.
const MAX_RETRIES = 3;

async function printavoRequest<T = AnyRecord>(
  query: string,
  variables?: AnyRecord
): Promise<T> {
  const { email, token } = getPrintavoConfig();

  let lastError = "Printavo request failed.";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(PRINTAVO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        email: email as string,
        token: token as string,
      },
      body: JSON.stringify({ query, variables }),
    });

    const retryable = response.status === 429 || response.status >= 500;

    if (retryable && attempt < MAX_RETRIES) {
      // Honor Retry-After when Printavo sends it; otherwise back off 1s, 2s, 4s.
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * 2 ** attempt;

      lastError = `HTTP ${response.status}`;
      await sleep(waitMs);
      continue;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok || data?.errors) {
      const detail =
        data?.errors?.[0]?.message || `HTTP ${response.status}`;
      throw new Error(`Printavo: ${detail}`);
    }

    return data.data as T;
  }

  throw new Error(`Printavo: ${lastError} after ${MAX_RETRIES} retries.`);
}

/**
 * Verifies PRINTAVO_EMAIL / PRINTAVO_TOKEN by querying the account.
 * Handy for confirming credentials before relying on quote pushing.
 */
export async function testPrintavoConnection(): Promise<{
  ok: boolean;
  account?: AnyRecord;
  error?: string;
}> {
  const { email, token } = getPrintavoConfig();

  if (!email || !token) {
    return { ok: false, error: "Missing PRINTAVO_EMAIL or PRINTAVO_TOKEN." };
  }

  try {
    const data = await printavoRequest<{ account: AnyRecord }>(`
      query GorillaOrderAuthTest {
        account {
          id
          companyName
          companyEmail
        }
      }
    `);

    return { ok: true, account: data.account };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Printavo error.",
    };
  }
}

/**
 * Finds the Printavo contact for this customer by email, creating a new
 * customer + primary contact when they're new to the shop.
 *
 * Falls back to PRINTAVO_CUSTOMER_ID's primary contact if the customer gave no
 * email or if lookup/create fails, so a quote never gets lost.
 */
export async function findOrCreateContactId(customer: AnyRecord): Promise<{
  contactId: string | null;
  created: boolean;
  matchedExisting: boolean;
}> {
  const email = str(customer.email).trim();
  const name = str(customer.customerName).trim();

  // ---- 1. look for an existing contact with this email ----
  if (email) {
    try {
      const found = await printavoRequest<{
        contacts: { nodes: AnyRecord[] };
      }>(
        `query GorillaFindContact($q: String!) {
           contacts(query: $q, first: 10) { nodes { id fullName email } }
         }`,
        { q: email }
      );

      const wanted = email.toLowerCase();
      const matches = (found.contacts?.nodes || []).filter((n) =>
        // Printavo stores multiple addresses in one comma-separated string.
        str(n.email)
          .toLowerCase()
          .split(",")
          .map((e) => e.trim())
          .includes(wanted)
      );

      // Duplicates exist in real data — prefer the most complete record.
      const best =
        matches.find((m) => str(m.fullName).trim().length > 0) || matches[0];

      if (best?.id) {
        return {
          contactId: str(best.id),
          created: false,
          matchedExisting: true,
        };
      }
    } catch {
      // fall through to create / fallback
    }
  }

  // ---- 2. create a new customer + primary contact ----
  if (email) {
    try {
      const [firstName, ...rest] = name.split(/\s+/).filter(Boolean);

      const created = await printavoRequest<{ customerCreate: AnyRecord }>(
        `mutation GorillaCustomerCreate($input: CustomerCreateInput!) {
           customerCreate(input: $input) {
             id
             companyName
             primaryContact { id }
           }
         }`,
        {
          input: {
            // Company if they gave one, otherwise their name, otherwise email.
            companyName: str(customer.company) || name || email,
            primaryContact: {
              ...(firstName ? { firstName } : {}),
              ...(rest.length ? { lastName: rest.join(" ") } : {}),
              email: [email], // ContactInput.email is a list
              ...(str(customer.phone) ? { phone: str(customer.phone) } : {}),
            },
          },
        }
      );

      const contactId = (
        (created.customerCreate as AnyRecord)?.primaryContact as AnyRecord
      )?.id;

      if (contactId) {
        return { contactId: str(contactId), created: true, matchedExisting: false };
      }
    } catch {
      // fall through to fallback
    }
  }

  // ---- 3. fallback: the configured catch-all customer ----
  const { customerId } = getPrintavoConfig();
  if (!customerId) {
    return { contactId: null, created: false, matchedExisting: false };
  }

  try {
    const data = await printavoRequest<{ customer: AnyRecord }>(
      `query GorillaOrderCustomer($id: ID!) {
         customer(id: $id) { id primaryContact { id } }
       }`,
      { id: customerId }
    );

    const fallbackId = (
      (data.customer as AnyRecord)?.primaryContact as AnyRecord
    )?.id;

    return {
      contactId: fallbackId ? str(fallbackId) : null,
      created: false,
      matchedExisting: false,
    };
  } catch {
    return { contactId: null, created: false, matchedExisting: false };
  }
}

export type PaymentRequestResult = {
  sent: boolean;
  error?: string;
  paymentRequestId?: string;
  visualId?: string;
  amount?: number;
  status?: string;
};

/**
 * Asks a customer to pay, against an existing Printavo quote/invoice.
 *
 * NOT automatic in general. Web submissions are unreviewed — artwork may be
 * unprintable, signs and apparel may still need hand pricing, and spam
 * happens. For those flows this stays reachable only through the guarded
 * /api/payment-request route.
 *
 * STICKERS ARE THE EXCEPTION, and the reason is narrow: getStickerPrice()
 * always returns a price from a fixed quantity table, so `quoteRequired` is
 * never true and there is nothing for the shop to price. The pricing
 * objection simply does not apply, so waiting on a human adds delay and no
 * safety. See createStickerCheckout below.
 *
 * The artwork and spam objections DO still apply to stickers — they are
 * handled by promising a proof and a refund at checkout, not by blocking.
 */
export async function createPaymentRequest(input: {
  /** Printavo quote or invoice id to bill against. */
  quoteId: string;
  /** Amount to request. Defaults to the quote's outstanding total. */
  amount?: number;
  /** Who to email. Defaults to the quote's contact. */
  to?: string[];
  subject?: string;
  body?: string;
}): Promise<PaymentRequestResult> {
  if (!isConfigured()) {
    return { sent: false, error: "Printavo is not configured." };
  }

  try {
    // Read the quote so we can default the amount and recipient, and so we
    // never request payment against something that doesn't exist.
    const quoteData = await printavoRequest<{ quote: AnyRecord }>(
      `query GorillaQuoteForPayment($id: ID!) {
         quote(id: $id) {
           id
           visualId
           nickname
           total
           amountOutstanding
           contact { id fullName email }
         }
       }`,
      { id: input.quoteId }
    );

    const quote = quoteData.quote as AnyRecord;
    if (!quote?.id) {
      return { sent: false, error: `Quote ${input.quoteId} was not found.` };
    }

    const outstanding = num(quote.amountOutstanding, num(quote.total));
    const amount = input.amount !== undefined ? input.amount : outstanding;

    if (!(amount > 0)) {
      return {
        sent: false,
        error: "Nothing to request — the amount is zero. Price the quote first.",
      };
    }

    const contact = (quote.contact as AnyRecord) || {};
    const contactEmails = str(contact.email)
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const to = input.to?.length ? input.to : contactEmails;

    if (!to.length) {
      return { sent: false, error: "No email address to send the request to." };
    }

    const label = str(quote.nickname, `Quote ${str(quote.visualId)}`);

    const data = await printavoRequest<{ paymentRequestCreate: AnyRecord }>(
      `mutation GorillaPaymentRequest($parentId: ID!, $input: PaymentRequestCreateInput!) {
         paymentRequestCreate(parentId: $parentId, input: $input) {
           id
           visualId
           amount
           status
         }
       }`,
      {
        parentId: input.quoteId,
        input: {
          amount,
          email: {
            to,
            subject:
              input.subject || `Gorilla Salem — payment request for ${label}`,
            body:
              input.body ||
              `Hi,\n\nYour order is ready for payment. Use the link below to pay securely.\n\n${label}\nAmount due: $${amount.toFixed(
                2
              )}\n\nThanks,\nGorilla Salem`,
          },
        },
      }
    );

    const pr = data.paymentRequestCreate as AnyRecord;

    return {
      sent: true,
      paymentRequestId: str(pr.id),
      visualId: str(pr.visualId),
      amount: num(pr.amount, amount),
      status: str(pr.status),
    };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Unknown Printavo error.",
    };
  }
}

export type StickerCheckoutResult = {
  /** True when the customer can pay right now, unassisted. */
  ready: boolean;
  payUrl?: string;
  amount?: number;
  error?: string;
};

/**
 * Turns a freshly created sticker quote into something payable immediately.
 *
 * Fires the payment request automatically — the one flow where that is safe,
 * because sticker pricing is fully determined (see createPaymentRequest's
 * note) — and hands back the quote's public URL so the confirmation screen
 * can offer "Pay now" instead of "we'll be in touch".
 *
 * Best-effort by design: if this fails, the quote and the shop email have
 * already succeeded, so the customer still has a real order. They simply get
 * the old "we'll follow up" path instead of a pay button. Never throw from
 * here — a payment hiccup must not fail a submission.
 */
export async function createStickerCheckout(input: {
  quoteId: string;
  publicUrl: string;
  customerEmail?: string;
}): Promise<StickerCheckoutResult> {
  if (!input.quoteId || !input.publicUrl) {
    return { ready: false, error: "No Printavo quote to bill against." };
  }

  try {
    const request = await createPaymentRequest({
      quoteId: input.quoteId,
      // No amount: bills the quote's amountOutstanding, which is the taxed
      // total Printavo computed. The app deliberately does not pass a figure
      // it derived itself.
      to: input.customerEmail ? [input.customerEmail] : undefined,
      subject: "Your Gorilla Salem sticker order — ready to pay",
      body:
        "Thanks for your order.\n\n" +
        "Your stickers are priced and ready to pay using the link below. " +
        "Once you pay we'll send a proof before anything goes to print — if " +
        "we can't print your artwork, you get a full refund.\n\n" +
        "Thanks,\nGorilla Salem",
    });

    if (!request.sent) {
      return { ready: false, error: request.error };
    }

    return {
      ready: true,
      payUrl: input.publicUrl,
      amount: request.amount,
    };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof Error ? error.message : "Unknown Printavo error.",
    };
  }
}

/**
 * One sticker spec, as production reads it.
 *
 * Takes any spec-shaped record so it serves both the synthesised `product`
 * (single design) and each item in a cart, rather than being written twice
 * and drifting.
 */
function describeStickerSpec(spec: AnyRecord, quantity: number) {
  return [
    `${quantity}x Custom Stickers`,
    // Real dimensions when entered — the shop cannot cut a "Custom size".
    `Size: ${
      num(spec.widthInches) > 0 && num(spec.heightInches) > 0
        ? `${num(spec.widthInches)}in x ${num(spec.heightInches)}in`
        : str(spec.size, "TBD")
    }`,
    `Shape: ${str(spec.shape, "TBD")}`,
    `Type: ${str(spec.material, "TBD")}`,
    `Art placement: ${str(spec.artScale, "80")}% size, ${str(
      spec.artMargin,
      "40"
    )}% ${str(spec.shape) === "Die Cut" ? "cut border" : "margin"}`,
    `Magenta cut line: ${
      spec.magentaCutLine ? "YES — art has a magenta cut path" : "no"
    }`,
  ].join("\n");
}

export type PrintavoQuotePlan = {
  nickname: string;
  customerDueAt: string;
  dueAt: string;
  customerNote: string;
  productionNote: string;
  tags: string[];
  /**
   * The goods. One entry for signs and apparel; one PER DESIGN for a sticker
   * cart, because a cart has no single size, shape or material and a blended
   * unit price across three different stickers is not something a shop can
   * work from — or adjust one of.
   */
  lineItems: {
    description: string;
    itemNumber: string;
    price: number;
    quantity: number;
    sizes: PrintavoSizeCount[];
  }[];
  // Only present when the customer chose shipping over local pickup.
  shippingLineItem: {
    description: string;
    itemNumber: string;
    price: number;
  } | null;
  /**
   * Fees and add-ons broken out as their own Printavo lines (setup fee, custom
   * size fee, banner finishing). Sending these separately means the shop can
   * adjust one charge in Printavo without reverse-engineering a lumped total.
   */
  feeLineItems: {
    description: string;
    itemNumber: string;
    price: number;
  }[];
  /**
   * Sales tax rate as a percentage, or null to leave the quote untaxed.
   * Only set on flows that take payment — see lib/tax.ts.
   */
  salesTaxRate: number | null;
};

/**
 * Pure mapping from a submitted Gorilla quote to the Printavo inputs.
 * Exported so it can be tested without hitting the API.
 */
export function buildPrintavoQuotePlan(input: {
  quoteNumber: string;
  order: AnyRecord;
  artworkAnalysis: AnyRecord | null;
  attachmentInfo?: string;
}): PrintavoQuotePlan {
  const { quoteNumber, order, artworkAnalysis, attachmentInfo } = input;

  const customer = (order.customer as AnyRecord) || {};
  const product = (order.product as AnyRecord) || {};
  const production = (order.production as AnyRecord) || {};
  const pricing = (order.pricing as AnyRecord) || {};
  const addOns = (Array.isArray(order.addOns)
    ? order.addOns
    : []) as AnyRecord[];
  const addOnsNote = str(order.addOnsNote);
  const apparel = isApparel(product);

  // asciiSafe() runs over the whole note before sending, so no transliteration
  // is needed here — but keep labels plain anyway (see lib/addons.ts).
  const addOnLines = [
    ...addOns
      .filter((a) => str(a.label))
      .map(
        (a) =>
          `- ${str(a.label)}: ${
            a.quoteRequired ? "QUOTE BY HAND" : `$${num(a.amount).toFixed(2)}`
          }`
      ),
    ...(addOnsNote ? [`- Also asked about: ${addOnsNote}`] : []),
  ];

  if (addOnLines.length > 0) {
    addOnLines.push("(Not included in the website estimate above.)");
  }

  const quantity = Math.max(1, num(product.quantity, 1));
  const total = num(pricing.total);
  const shippingPrice = num(pricing.shippingPrice);
  const deliveryMethod = str(production.deliveryMethod, "Pickup");

  // Signs send an itemised breakdown (product line, setup fee, add-ons). Split
  // it so Printavo shows the same lines the customer saw, instead of one lump.
  const allSignsLines = Array.isArray(pricing.lines)
    ? (pricing.lines as AnyRecord[])
    : [];

  // Credits (the no-hem credit) are negative and would be dropped by the
  // positive-only filter below, which would make the Printavo total HIGHER
  // than the price the customer was shown. Net them into the product line
  // instead of sending a negative line item.
  const creditTotal = allSignsLines
    .filter((l) => num(l.amount) < 0)
    .reduce((sum, l) => sum + num(l.amount), 0);

  const signsLines = allSignsLines.filter((l) => num(l.amount) > 0);
  // The first line is the product itself; everything after is a fee/add-on.
  const signsProductLine = signsLines[0];
  const signsFeeLines = signsLines.slice(1);

  // The decal unit price excludes shipping — shipping becomes its own line
  // item so the Printavo total matches the website total.
  const itemsSubtotal = apparel
    ? total
    : signsProductLine
    ? // creditTotal is negative, so this subtracts.
      Math.max(0, num(signsProductLine.amount) + creditTotal)
    : num(pricing.stickerPrice, total);

  const unitPrice =
    apparel && pricing.unitPrice !== undefined
      ? num(pricing.unitPrice)
      : quantity > 0
      ? Number((itemsSubtotal / quantity).toFixed(4))
      : itemsSubtotal;

  // Printavo wants a date; default to two weeks out if none was given.
  const needBy = str(production.needBy);
  const customerDueAt =
    needBy ||
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dueAt = `${customerDueAt}T17:00:00Z`;

  const supplier = (product.supplier as AnyRecord) || {};
  const garmentLabel = str(
    supplier.productName || product.garmentType,
    "Apparel"
  );

  const signs = isSigns(product);
  const signLabel = str(product.signType, "Signs");

  /**
   * The sticker cart, when the payload carries one.
   *
   * `product` is a synthesis — design 1's spec under the combined quantity —
   * so anything priced or described off it alone states design 1's size as
   * fact about the whole run.
   */
  const stickerItems =
    !apparel && !signs && Array.isArray(order.items)
      ? (order.items as AnyRecord[])
      : [];

  // Flag anything the app couldn't price: unpriced signs, and apparel special
  // orders (a garment or placement outside the simple online menu).
  //
  // Two separate questions, deliberately not merged. `productNeedsHandPricing`
  // describes the PRIMARY item and is what labels the nickname and the
  // description — an unpriced add-on must never make a priced sign read as
  // "quoted by hand". `needsHandPricing` is the whole-quote triage signal and
  // only drives the #NeedsPricing tag.
  const productNeedsHandPricing = Boolean(pricing.quoteRequired);
  const needsHandPricing =
    productNeedsHandPricing || addOns.some((a) => Boolean(a.quoteRequired));
  const isSpecialOrder = Boolean(product.specialOrder);

  const nickname = apparel
    ? `WEB QUOTE ${quoteNumber} - ${quantity} ${garmentLabel}${
        isSpecialOrder ? " (SPECIAL ORDER - NEEDS QUOTE)" : ""
      }`
    : signs
    ? `WEB QUOTE ${quoteNumber} - ${quantity} ${signLabel}${
        productNeedsHandPricing ? " (NEEDS PRICING)" : ""
      }`
    : `WEB QUOTE ${quoteNumber} - ${quantity} Stickers${
        stickerItems.length > 1 ? ` / ${stickerItems.length} designs` : ""
      }`;

  const description = signs
    ? [
        `${quantity}x ${signLabel}`,
        `Size: ${str(product.size, "TBD")}`,
        `Material: ${str(product.material, "TBD")}`,
        `Finishing: ${str(product.finishing, "TBD")}`,
        `Sides: ${str(product.sides, "Single-sided")}`,
        ...(productNeedsHandPricing
          ? [`PRICING NEEDED — this sign is quoted by hand.`]
          : []),
      ].join("\n")
    : apparel
    ? [
        `${quantity}x ${garmentLabel}`,
        `Color: ${str(product.garmentColor || supplier.colorName, "TBD")}`,
        `Print locations: ${
          Array.isArray(product.printLocations)
            ? (product.printLocations as string[]).join(", ")
            : str(product.printLocations, "TBD")
        }`,
        `Ink: ${str(product.inkColors, "TBD")}`,
        `Sizes: ${str(product.sizeBreakdown, "Not provided")}`,
        `S&S style: ${str(supplier.catalogStyle, "N/A")} / SKU ${str(
          supplier.sku,
          "N/A"
        )}`,
        // The whole point of a special order — what they actually asked for.
        ...(isSpecialOrder
          ? [
              "",
              "*** SPECIAL ORDER - NEEDS A HAND QUOTE ***",
              str(product.specialOrderNotes, "No details given"),
            ]
          : []),
      ].join("\n")
    : stickerItems.length > 1
    ? // A cart. The note has to say what the run actually is, not repeat
      // design 1's spec under the combined quantity.
      [
        `${quantity}x Custom Stickers across ${stickerItems.length} designs`,
        "",
        ...stickerItems.flatMap((item, index) => [
          `DESIGN ${index + 1}`,
          describeStickerSpec(item, num(item.quantity, 0)),
          "",
        ]),
      ]
        .join("\n")
        .trimEnd()
    : describeStickerSpec(product, quantity);

  const customerNote = [
    `GORILLA ORDER WEB QUOTE — ${quoteNumber}`,
    "",
    "Submitted from the Gorilla Order website. NOT yet reviewed or confirmed.",
    "",
    "CUSTOMER",
    `Name: ${str(customer.customerName, "Not entered")}`,
    `Company: ${str(customer.company, "N/A")}`,
    `Email: ${str(customer.email, "Not entered")}`,
    `Phone: ${str(customer.phone, "N/A")}`,
    "",
    apparel ? "APPAREL" : signs ? "SIGNS" : "STICKERS",
    description,
    "",
    "TIMELINE",
    `Needed in hand: ${needBy || "Not entered"}`,
    `Deadline type: ${str(production.deadlineType, "N/A")}`,
    `Delivery: ${
      deliveryMethod === "Ship" ? "SHIP to customer" : "LOCAL PICKUP in Salem"
    }`,
    "",
    "WEBSITE ESTIMATE",
    `Total: $${total.toFixed(2)}`,
    // One "each" across three different stickers is a blended average of
    // things that do not average — it read as a real per-sticker price the
    // shop could quote from. Each design's own unit price is on its own line
    // item, which is where it belongs.
    ...(stickerItems.length > 1
      ? [`Setup: $${num(pricing.setupPrice).toFixed(2)} (see the line items for per-design pricing)`]
      : [`Each: $${unitPrice.toFixed(2)}`]),
    ...(shippingPrice > 0
      ? [`Shipping: $${shippingPrice.toFixed(2)}`]
      : ["Shipping: Free (local pickup)"]),
    "",
    // Add-ons live in the note, NOT in the line items. Two reasons: the line
    // item builder below filters out anything with amount <= 0, which would
    // silently drop every "quote by hand" add-on; and every web quote already
    // lands #Unconfirmed for hand review, so a line in a note the shop is
    // already reading loses nothing.
    ...(addOnLines.length
      ? ["", "ADD-ONS THE CUSTOMER ASKED FOR", ...addOnLines]
      : []),
    "",
    "ARTWORK",
    `File: ${str(artworkAnalysis?.fileName, "No file uploaded")}`,
    `Estimated colors: ${str(artworkAnalysis?.estimatedColorCount, "N/A")}`,
    `Emailed to shop: ${str(attachmentInfo, "N/A")}`,
    "",
    `Customer notes: ${str(customer.notes, "None")}`,
  ].join("\n");

  const productionNote = [
    "Auto-created by Gorilla Order from a website quote request.",
    "STATUS: UNCONFIRMED — review pricing, artwork, sizes and stock before quoting the customer.",
    "Website pricing is an estimate only.",
    "Artwork is attached to the quote email, not uploaded to Printavo.",
  ].join("\n");

  return {
    nickname,
    customerDueAt,
    dueAt,
    customerNote,
    productionNote,
    // Tags are sent raw, not through asciiSafe() — keep them ASCII.
    tags: [
      "#GorillaOrder",
      "#WebQuote",
      "#Unconfirmed",
      ...(needsHandPricing ? ["#NeedsPricing"] : []),
      ...(addOnLines.length ? ["#Upsell"] : []),
    ],
    lineItems:
      stickerItems.length > 1
        ? // One row per design. Each carries its own spec, its own count and
          // the price the SERVER put on it (item.linePrice, written by
          // repriceStickers) — never a blended average, and never a figure
          // recomputed here that could drift from what was charged.
          stickerItems.map((item, index) => {
            const itemQuantity = Math.max(1, num(item.quantity, 1));
            const linePrice = num(item.linePrice);

            return {
              description: `Design ${index + 1}\n${describeStickerSpec(
                item,
                itemQuantity
              )}`,
              // Numbered, not the bare "GORILLA-DECAL" every row used to
              // carry: two identical designs produced byte-identical rows the
              // shop could not tell apart (CART-PLAN bug 3). The number is the
              // design's cart position — the same number the shop email's
              // block and the design-N-*.png attachment use.
              itemNumber: `GORILLA-DECAL-${index + 1}`,
              price: Number((linePrice / itemQuantity).toFixed(4)),
              quantity: itemQuantity,
              sizes: [{ size: "size_other", count: itemQuantity }],
            };
          })
        : [
            {
              description,
              itemNumber: signs
                ? `GORILLA-SIGN-${str(product.signType, "NA").toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`
                : apparel
                ? `GORILLA-APPAREL-${str(supplier.catalogStyle, "NA")}`
                : "GORILLA-DECAL",
              price: unitPrice,
              quantity,
              // Apparel: map the real size breakdown onto Printavo's size enums
              // so the shop sees S/M/L/XL counts. Stickers (and unparseable
              // breakdowns) fall back to a single size_other row carrying the
              // full count.
              sizes: (() => {
                if (!apparel) return [{ size: "size_other", count: quantity }];

                const parsed = parseSizeBreakdown(str(product.sizeBreakdown));
                const parsedTotal = parsed.reduce((sum, s) => sum + s.count, 0);

                // Only trust the breakdown if it actually accounts for the order.
                return parsed.length > 0 && parsedTotal === quantity
                  ? parsed
                  : [{ size: "size_other", count: quantity }];
              })(),
            },
          ],
    shippingLineItem:
      shippingPrice > 0
        ? {
            description: "Shipping",
            itemNumber: "GORILLA-SHIPPING",
            price: shippingPrice,
          }
        : null,
    feeLineItems: [
      /**
       * Sticker setup, as its own line.
       *
       * THIS WAS BEING LOST. getStickerPrice() used to bake setup into the
       * price the browser sent as `stickerPrice`, so the single decal line
       * carried it. Splitting material from setup for the cart left
       * `stickerPrice` material-only and nothing ever sent `setupPrice` — so
       * the Printavo quote came to $25 less than the website total on a single
       * design, and $50 less on three. Stickers self-check-out against the
       * quote's amountOutstanding with no human in the loop, so that shortfall
       * was money the shop simply did not collect.
       */
      ...(!apparel && !signs && num(pricing.setupPrice) > 0
        ? [
            {
              description:
                stickerItems.length > 1
                  ? `Setup and artwork prep (${stickerItems.length} designs)`
                  : "Setup and artwork prep",
              itemNumber: "GORILLA-DECAL-SETUP",
              price: num(pricing.setupPrice),
            },
          ]
        : []),
      ...signsFeeLines.map((l) => ({
        description: str(l.label, "Fee"),
        itemNumber: `GORILLA-FEE-${str(l.label, "FEE")
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .slice(0, 24)
          .replace(/-$/, "")}`,
        price: num(l.amount),
      })),
    ],
    // Taxability follows the GOODS, not whether the flow checks out online.
    // Stickers and signs are ordinary tangible goods; Massachusetts exempts
    // clothing, so apparel carries no tax. See lib/tax.ts.
    salesTaxRate: isTaxableFlow(apparel ? "apparel" : signs ? "signs" : "stickers")
      ? SALES_TAX.ratePercent
      : null,
  };
}

/**
 * Creates the draft/unconfirmed quote in Printavo.
 * Returns { created:false, skipped:true } when credentials aren't configured.
 */
export async function createPrintavoQuote(input: {
  quoteNumber: string;
  order: AnyRecord;
  artworkAnalysis: AnyRecord | null;
  attachmentInfo?: string;
}): Promise<PrintavoResult> {
  if (!isConfigured()) {
    return { created: false, skipped: true };
  }

  const plan = buildPrintavoQuotePlan(input);

  try {
    // 1. Attach the quote to the real customer — reuse their Printavo record
    //    if they already exist, otherwise create one from what they entered.
    const customerRecord = (input.order.customer as AnyRecord) || {};
    const { contactId, created: createdCustomer, matchedExisting } =
      await findOrCreateContactId(customerRecord);

    if (!contactId) {
      return {
        created: false,
        error:
          "Could not resolve a Printavo contact for this customer (and no PRINTAVO_CUSTOMER_ID fallback is configured).",
      };
    }

    // 2. Create the quote shell.
    const quoteData = await printavoRequest<{ quoteCreate: AnyRecord }>(
      `
        mutation GorillaOrderQuoteCreate($input: QuoteCreateInput!) {
          quoteCreate(input: $input) {
            id
            nickname
            publicUrl
          }
        }
      `,
      {
        input: {
          contact: { id: contactId },
          nickname: asciiSafe(plan.nickname),
          customerDueAt: plan.customerDueAt,
          dueAt: plan.dueAt,
          customerNote: asciiSafe(plan.customerNote),
          productionNote: asciiSafe(plan.productionNote),
          tags: plan.tags,
          // Only the flows that actually take money carry tax. Printavo
          // computes salesTaxAmount from this rate and the per-line `taxed`
          // flags, so the app never derives a figure that could drift from
          // the invoice the customer pays.
          ...(plan.salesTaxRate ? { salesTax: plan.salesTaxRate } : {}),
        },
      }
    );

    const quote = quoteData.quoteCreate as AnyRecord;

    // 3. Add the priced line item.
    await printavoRequest(
      `
        mutation GorillaOrderLineItemGroupCreate($parentId: ID!, $input: LineItemGroupCreateInput!) {
          lineItemGroupCreate(parentId: $parentId, input: $input) {
            id
          }
        }
      `,
      {
        parentId: quote.id,
        input: {
          position: 1,
          // lineItems is [LineItemCreateInput!] — a FLAT list. (The published
          // docs render it as [[...]], but live schema introspection against
          // the account confirms a flat list; the live schema wins.)
          lineItems: [
            // The goods — one row for signs and apparel, one per design for a
            // sticker cart.
            ...plan.lineItems.map((item, index) => ({
              description: asciiSafe(item.description),
              itemNumber: item.itemNumber,
              position: index + 1,
              price: item.price,
              sizes: item.sizes,
              // Follows the plan so apparel does not read as "taxable" in
              // Printavo's UI. Harmless while the rate is null, but it would
              // be misleading to anyone looking at the quote.
              taxed: plan.salesTaxRate !== null,
            })),
            // Setup fee, custom size fee, banner add-ons — each its own line so
            // the shop can adjust one charge without unpicking a lumped total.
            ...plan.feeLineItems.map((fee, index) => ({
              description: asciiSafe(fee.description),
              itemNumber: fee.itemNumber,
              position: plan.lineItems.length + index + 1,
              price: fee.price,
              sizes: [{ size: "size_other", count: 1 }],
              taxed: plan.salesTaxRate !== null,
            })),
            ...(plan.shippingLineItem
              ? [
                  {
                    description: asciiSafe(plan.shippingLineItem.description),
                    itemNumber: plan.shippingLineItem.itemNumber,
                    position:
                      plan.lineItems.length + plan.feeLineItems.length + 1,
                    price: plan.shippingLineItem.price,
                    sizes: [{ size: "size_other", count: 1 }],
                    taxed: false,
                  },
                ]
              : []),
          ],
        },
      }
    );

    return {
      created: true,
      quoteId: str(quote.id),
      publicUrl: str(quote.publicUrl),
      createdCustomer,
      matchedExistingCustomer: matchedExisting,
    };
  } catch (error) {
    return {
      created: false,
      error: error instanceof Error ? error.message : "Unknown Printavo error.",
    };
  }
}
