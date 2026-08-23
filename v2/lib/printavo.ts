import { isTaxableFlow, SALES_TAX } from "./tax";
import { getTrackUrl } from "./order-status";

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

/**
 * A cash amount, to the cent.
 *
 * Fee and shipping lines are totals sent at count 1, and they are built by
 * multiplying a per-piece rate by a quantity — which in binary floating point
 * produces values like 25.950000000000003. Printavo stores 4dp and rounds, so
 * this never moved money; it just meant a quarter of all apparel orders posted
 * a nonsense number to the API and showed it to anyone reading the raw quote.
 *
 * NOT applied to per-piece prices on the goods line: those are deliberately
 * 4dp, because a decal at $0.1725 each is a real price and $0.17 is not.
 */
function money(value: unknown, fallback = 0) {
  return Math.round(num(value, fallback) * 100) / 100;
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
/**
 * Exported because the NICKNAME goes through it, and the nickname is what
 * order tracking matches on. A test has to be able to check the string
 * Printavo actually stores, not the one we assembled before this ran.
 */
export function asciiSafe(value: string) {
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
              `Hi,\n\nYour quote is ready for payment. Use the link below to pay securely.\n\n${label}\nAmount due: $${amount.toFixed(
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
  /**
   * The `GS-` number, so the payment email can carry a tracking link that
   * prefills it. lookupOrderStatus matches on this appearing in the Printavo
   * order's `nickname`, so it is the same string the customer must type.
   */
  quoteNumber?: string;
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
      subject: "Your Gorilla Salem sticker quote — ready to pay",
      body:
        "Thanks for your order.\n\n" +
        "Your stickers are priced and ready to pay using the link below. " +
        "Once you pay we'll send a proof before anything goes to print — if " +
        "we can't print your artwork, you get a full refund.\n\n" +
        // For a sticker order that bills, this is the message that carries
        // the tracking link. Everything else now gets it from our own
        // confirmation email instead — see lib/order-confirmation.ts, which
        // suppresses itself when this one went out.
        //
        // The number is prefilled from the URL; the email deliberately is not.
        // Requiring it is what stops a guessed order number returning someone
        // else's status — see app/track/page.tsx.
        (input.quoteNumber
          ? `Want to check on it later? Track your order at ` +
            `${getTrackUrl(input.quoteNumber)} — you'll need this order ` +
            `number (${input.quoteNumber}) and this email address.\n\n`
          : "") +
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
 * The Printavo item number for a sign, derived from what it IS.
 *
 * One function so a one-design quote and a cart cannot file the same product
 * under two different SKUs — which is precisely what happened when the cart
 * numbered its rows by position. Printavo's records are the shop's records:
 * "how many yard signs did we sell this quarter" is only answerable if the
 * same sign always lands in the same place.
 */
function signSku(signType: string) {
  return `GORILLA-SIGN-${signType
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
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
    // The filename ties this row to a file in the shop email. Without it, two
    // designs ordered at the same size and material describe themselves
    // identically and the shop has no way to tell which row is which — the
    // other half of CART-PLAN bug 3.
    `Artwork file: ${str(spec.artworkFileName, "none uploaded")}`,
    // Only when we actually looked and found a solid background. Unknown
    // (vector files we cannot raster-inspect) says nothing rather than
    // guessing, and a clean transparent file needs no line at all.
    ...(spec.hasTransparentEdges === false && str(spec.shape) === "Die Cut"
      ? [
          "*** SOLID BACKGROUND - knock out before cutting, or the cut is a rectangle ***",
        ]
      : []),
    // Ours, automated, and unchecked by anyone. Prepress has to be told, or a
    // knocked-out file arrives looking like something the customer supplied.
    ...(spec.backgroundRemoved
      ? [
          `Background removed in-app at customer request (${str(
            spec.backgroundRemovedColor,
            "flat colour"
          )}) - CHECK the knockout; original file also attached to the quote email`,
        ]
      : []),
  ].join("\n");
}

/**
 * A permanent artwork link, one per design that went to blob storage.
 *
 * Designs whose file was ATTACHED to the email have none, deliberately —
 * "we mailed you the file" and "here is a link to the file" are different
 * promises and the note used to render them as one sentence.
 */
export type ArtworkLink = { design: number; name: string; url: string };

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
  artworkLinks?: ArtworkLink[];
}): PrintavoQuotePlan {
  /**
   * Set when the order was taken on the shop's own terminal. Read straight
   * off the order so this stays a pure mapping — the route decides what a
   * kiosk order MEANS (no payment link); this only reports it.
   */
  const kiosk = (input.order.kiosk as AnyRecord | null) || null;
  const { quoteNumber, order, artworkAnalysis, attachmentInfo } = input;
  const artworkLinks = input.artworkLinks ?? [];

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
  /**
   * The signs cart. Same hazard as the sticker one below: `product` is a
   * synthesis of design 1 carrying the whole order's sign count, so a quote
   * built from it alone would state design 1's size and material as fact
   * about a banner and two yard signs.
   *
   * No `signs` guard, because it is declared further down and this is needed
   * up here — the key only exists on signs payloads, so the array is the
   * check.
   */
  const signsDesigns = (
    Array.isArray(order.signsDesigns) ? order.signsDesigns : []
  ) as AnyRecord[];

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

  /**
   * On a ONE-design quote the first line is the product itself and everything
   * after is a fee or an add-on.
   *
   * On a cart that slicing is wrong — line 2 is design 2's product, not a fee
   * — and it would have invoiced every design after the first as a surcharge
   * on design 1. A cart's line items are built per design below, each
   * carrying that design's own product cost, so the ONLY thing left to charge
   * separately is the collapsed setup row. It is found by `kind`, not by
   * position and not by matching its wording.
   */
  const signsCart = signsDesigns.length > 1;
  const signsProductLine = signsCart ? undefined : signsLines[0];

  /**
   * A cart's add-ons come from the DESIGNS, not from the flat line list.
   *
   * The flat list prefixes each label with its design number for the estimate
   * table, and those prefixed strings are the wrong thing to put on an
   * invoice line. Each design carries its own add-ons in the payload, already
   * separated from its product cost, so they are read from there and named
   * per design here.
   *
   * They used to be left inside the line item on a cart — not a double
   * charge, but it meant "Pole Pockets $30" was visible on a one-design
   * invoice and buried in a $177 unit price on a two-design one. Same work,
   * same money, two different invoices.
   */
  const signsCartAddOnLines = signsCart
    ? signsDesigns.flatMap((design, index) =>
        (Array.isArray(design.addOns) ? design.addOns : []).map(
          (addOn: AnyRecord) => ({
            label: `${str(design.label, `Design ${index + 1}`)}: ${str(
              addOn.label,
              "Finishing"
            )}`,
            amount: num(addOn.amount),
            code: str(addOn.code, ""),
          })
        )
      )
    : [];

  const signsFeeLines = signsCart
    ? [...signsLines.filter((l) => l.kind === "setup"), ...signsCartAddOnLines]
    : signsLines.slice(1);

  // The decal unit price excludes shipping — shipping becomes its own line
  // item so the Printavo total matches the website total.
  const itemsSubtotal = apparel
    ? // Garments only. Printing and screens are their own lines below, so
      // folding them in here would bill them twice.
      num(pricing.garmentTotal, total)
    : signsCart
    ? // Every design's product cost. Setup is the fee line above.
      signsDesigns.reduce((sum, design) => sum + num(design.lineTotal), 0)
    : signsProductLine
    ? // creditTotal is negative, so this subtracts.
      Math.max(0, num(signsProductLine.amount) + creditTotal)
    : num(pricing.stickerPrice, total);

  const unitPrice =
    // The supplier's marked-up garment price, exact to the cent — NOT
    // total/quantity, which does not divide evenly and drifts against the
    // quote once Printavo stores it at 4dp.
    apparel && pricing.garmentUnitPrice !== undefined
      ? num(pricing.garmentUnitPrice)
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

  /**
   * The nickname is what the shop scans in the Printavo list, so a counter
   * order has to be identifiable there and not just inside the note.
   *
   * ── IT IS ALSO WHERE ORDER TRACKING LOOKS ────────────────────────────────
   * `lookupOrderStatus()` finds a customer's order by checking that their
   * quote number appears in this string — Printavo's own visualId is assigned
   * by Printavo and the customer has never seen it, so the nickname is the
   * only field carrying a number they can type.
   *
   * Every branch below must therefore contain `quoteNumber` verbatim. Drop it
   * from one flow and tracking returns "we couldn't find that order" to a
   * customer holding a real receipt — no error, no log, and now the payment
   * email invites them to try.
   *
   * `nicknameMatchesQuoteNumber()` is the matcher, shared with the lookup so
   * the two cannot drift, and tests/tracking-nickname.test.ts runs it against
   * a real plan for every flow.
   * ─────────────────────────────────────────────────────────────────────────
   */
  const nicknamePrefix = kiosk ? "IN STORE" : "WEB QUOTE";

  const nickname = apparel
    ? `${nicknamePrefix} ${quoteNumber} - ${quantity} ${garmentLabel}${
        isSpecialOrder ? " (SPECIAL ORDER - NEEDS QUOTE)" : ""
      }`
    : signs
    ? // A cart says "11 Signs / 2 designs", never "11 Vinyl Banner" — which
      // is design 1's product wearing the whole order's count, and reads in
      // the job list as eleven banners. The sticker branch below has said
      // "/ N designs" since carts existed; signs are the sibling that did not.
      `${nicknamePrefix} ${quoteNumber} - ${quantity} ${
        signsCart ? "Signs" : signLabel
      }${signsCart ? ` / ${signsDesigns.length} designs` : ""}${
        productNeedsHandPricing ? " (NEEDS PRICING)" : ""
      }`
    : `${nicknamePrefix} ${quoteNumber} - ${quantity} Stickers${
        stickerItems.length > 1 ? ` / ${stickerItems.length} designs` : ""
      }`;

  /**
   * The template brief, when the customer personalised one of ours.
   *
   * A template REPLACES the upload — lib/validation.ts stops asking for a
   * file the moment one is chosen, because the template is the artwork. So
   * for these orders there is no attachment anywhere, and the words the
   * customer typed are the entire job.
   *
   * They were reaching the shop email and nothing else. The Printavo record
   * read "50x Yard Sign / Size / Material / Finishing" with no hint that a
   * brief existed, while its production note said "Artwork is attached to
   * the quote email" — which for a template order is not true, and sends
   * whoever reads it hunting for a file that was never created.
   *
   * Apparel already settled this argument for its own flow: a special order
   * appends the customer's notes to the description, because what they
   * actually asked for IS the job. A template sign is the same case.
   */
  const templateBrief = ((order.artwork as AnyRecord)?.template ||
    null) as AnyRecord | null;

  const templateLines = templateBrief
    ? (Array.isArray(templateBrief.text) ? templateBrief.text : [])
        .map((entry) => entry as AnyRecord)
        .map((entry) => `  ${str(entry.label, "Line")}: ${str(entry.value)}`)
        .filter((line) => line.trim().length > 0)
    : [];

  /**
   * One sign's spec, as production reads it.
   *
   * Takes any spec-shaped record so it serves both the synthesised `product`
   * (single design) and each entry in a cart — the same argument
   * describeStickerSpec makes, and the same reason: written twice, the two
   * drift, and the one nobody is looking at is the one that goes wrong.
   */
  const describeSignSpec = (spec: AnyRecord, count: number, label: string) => {
    const brief = (spec.template || null) as AnyRecord | null;
    const words = brief
      ? (Array.isArray(brief.text) ? brief.text : [])
          .map((entry) => entry as AnyRecord)
          .map((entry) => `  ${str(entry.label, "Line")}: ${str(entry.value)}`)
          .filter((entry) => entry.trim().length > 0)
      : [];

    return [
      `${count}x ${label}`,
      `Size: ${str(spec.size, "TBD")}`,
      `Material: ${str(spec.material, "TBD")}`,
      `Finishing: ${str(spec.finishing, "TBD")}`,
      `Sides: ${str(spec.sides, "Single-sided")}`,
      // Ties this row to a file in the shop email — the same job the sticker
      // spec's "Artwork file" line does, and for the same reason. Without it
      // a printer reading DESIGN 2 in Printavo has its size and its stock and
      // no idea which of the two attachments belongs to it. The block's own
      // "File:" line further down names ONE file, so on a cart it answers the
      // question for at most one design and looks like it answered it for all
      // of them.
      `Artwork file: ${str(spec.fileName, "none uploaded")}`,
      ...(brief
        ? [
            `*** TEMPLATE ARTWORK - NO FILE UPLOADED ***`,
            `Set these words into our "${str(
              brief.name,
              str(brief.id, "Unnamed")
            )}" master and send a proof:`,
            ...(words.length ? words : ["  (the customer left every line blank)"]),
          ]
        : []),
    ].join("\n");
  };

  const description = signsCart
    ? /**
       * A cart. The note has to say what the run actually IS.
       *
       * It used to print design 1's spec under the combined quantity, so a
       * quote for one 72x36 banner and ten yard signs reached Printavo as:
       *
       *     SIGNS
       *     11x Vinyl Banner
       *     Size: 72" x 36"
       *     Material: 13 oz Scrim Vinyl
       *
       * That is a job the shop could work — eleven big banners — and it is
       * not the order. The shop email and the line items were both taught
       * about the signs cart; this note, which is what a printer actually
       * reads off the Printavo job, was not.
       *
       * Same fix and same shape as the sticker cart directly below.
       */
      [
        `${quantity}x signs across ${signsDesigns.length} designs`,
        "",
        ...signsDesigns.flatMap((design, index) => [
          `DESIGN ${index + 1}`,
          describeSignSpec(
            design,
            Math.max(1, num(design.quantity, 1)),
            str(design.signType, "Sign")
          ),
          "",
        ]),
        ...(productNeedsHandPricing
          ? ["PRICING NEEDED — part of this quote is priced by hand."]
          : []),
      ]
        .join("\n")
        .trimEnd()
    : signs
    ? [
        `${quantity}x ${signLabel}`,
        `Size: ${str(product.size, "TBD")}`,
        `Material: ${str(product.material, "TBD")}`,
        `Finishing: ${str(product.finishing, "TBD")}`,
        `Sides: ${str(product.sides, "Single-sided")}`,
        ...(productNeedsHandPricing
          ? [`PRICING NEEDED — this sign is quoted by hand.`]
          : []),
        // What the customer actually asked for. No file exists for these.
        ...(templateBrief
          ? [
              "",
              `*** TEMPLATE ARTWORK - NO FILE UPLOADED ***`,
              `Set these words into our "${str(
                templateBrief.name,
                str(templateBrief.id, "Unnamed")
              )}" master and send a proof:`,
              ...(templateLines.length
                ? templateLines
                : ["  (the customer left every line blank)"]),
            ]
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
    : // One design. `product` is design 1's spec re-synthesised, but the item
      // is where anything ADDED to a design lands — the filename, whether the
      // background is solid, whether we knocked one out. Grafting named fields
      // one at a time is how the solid-background warning reached Printavo on
      // a cart and silently never on a single design, which is the common
      // case. Spread the whole item so a new field is carried by default.
      describeStickerSpec(
        { ...product, ...(stickerItems[0] ?? {}) },
        quantity
      );

  const customerNote = [
    kiosk
      ? `GORILLA ORDER — TAKEN IN STORE — ${quoteNumber}`
      : `GORILLA ORDER WEB QUOTE — ${quoteNumber}`,
    "",
    kiosk
      ? str(kiosk.mode) === "staff"
        ? `Written up at the counter by ${str(kiosk.staffName, "a staff member")}. NOT yet reviewed or confirmed.`
        : "Customer used the in-store kiosk themselves. NOT yet reviewed or confirmed."
      : "Submitted from the Gorilla Order website. NOT yet reviewed or confirmed.",
    ...(kiosk
      ? [
          "",
          "*** NO PAYMENT LINK WAS SENT - TAKE PAYMENT AT THE COUNTER ***",
        ]
      : []),
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
      : signsCart
      ? // One "each" across a banner and two yard signs is an average of
        // things that do not average. Each design's own price is on its own
        // line item, which is where it belongs.
        ["Per design: see the line items"]
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
    /**
     * The links, under a heading that says what they are.
     *
     * These URLs have always been in this note. They sat inside the
     * `Emailed to shop:` sentence, mid-line, after a file size — so anyone
     * scanning the note read "emailed" and never registered a link was
     * there. A previous reader of this codebase concluded from that heading
     * that the URL never reached Printavo at all. It always had; the label
     * was the bug.
     *
     * Every past order therefore already carries its artwork link. Nothing
     * needs backfilling — only relabelling from here on.
     */
    ...(artworkLinks.length
      ? [
          "",
          "ARTWORK FILES - OPEN THESE",
          ...artworkLinks.flatMap((link) => [
            `Design ${link.design}: ${link.name}`,
            `  ${link.url}`,
          ]),
          // One line, parseable, for the reorder flow to read a past order's
          // artwork back without unpicking the prose above it.
          `ARTWORK_LINKS_JSON: ${JSON.stringify(artworkLinks)}`,
          "",
        ]
      : []),
    `Delivery: ${str(attachmentInfo, "N/A")}`,
    "",
    `Customer notes: ${str(customer.notes, "None")}`,
  ].join("\n");

  const productionNote = [
    "Auto-created by Gorilla Order from a website quote request.",
    "STATUS: UNCONFIRMED — review pricing, artwork, sizes and stock before quoting the customer.",
    "Website pricing is an estimate only.",
    /**
     * This line said "Artwork is attached to the quote email, not uploaded to
     * Printavo" for every order. It was false twice over: a template order has
     * no file at all, and an uploaded order's permanent link is two fields
     * away in the customer note. Saying otherwise sent whoever read it to the
     * wrong place — or, worse, told them the record they were looking at was
     * not the record.
     */
    templateBrief
      ? "No artwork file — this is a template order. The words to set are on the line item above, and in the quote email."
      : artworkLinks.length
      ? "Artwork links are in the customer note, under ARTWORK FILES. They are permanent — open them from here, no need to find the email."
      : "Artwork came in as an email attachment; there is no link to open. See the quote email.",
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
      // Two different jobs to work, so two different tags to filter on.
      ...(kiosk ? ["#InStore", "#PayAtCounter"] : ["#WebQuote"]),
      "#Unconfirmed",
      ...(needsHandPricing ? ["#NeedsPricing"] : []),
      ...(addOnLines.length ? ["#Upsell"] : []),
    ],
    lineItems:
      signsDesigns.length > 1
        ? // One row per sign. Each carries its own spec and the price the
          // engine put on that design — never the cart total split evenly,
          // which would invoice three different signs at one blended rate.
          signsDesigns.map((design, index) => {
            const designQuantity = Math.max(1, num(design.quantity, 1));
            const lineTotal = num(design.lineTotal);

            return {
              description: `Design ${index + 1}\n${[
                str(design.signType, "Sign"),
                str(design.size, "size not specified"),
                str(design.material, "material not specified"),
                str(design.finishing, "finishing not specified"),
                str(design.sides, "Single-sided"),
              ].join(" / ")}`,
              // The PRODUCT, not the cart position. A one-design quote has
              // always filed a banner under GORILLA-SIGN-VINYL-BANNER, so
              // GORILLA-SIGN-1 meant the same banner landed under a
              // different SKU purely because a second design was in the
              // quote — and "how many yard signs did we sell" had no answer
              // across carts. Exactly the shape the setup and add-on SKUs
              // were fixed for: the description carries the story, the item
              // number names the thing and holds still.
              //
              // Two designs of the same product share a number, which is
              // fine here and was not for stickers: every signs row leads
              // with "Design N", so no two rows are byte-identical.
              itemNumber: signSku(str(design.signType, "NA")),
              price: Number((lineTotal / designQuantity).toFixed(4)),
              quantity: designQuantity,
              sizes: [{ size: "size_other", count: designQuantity }],
            };
          })
        : stickerItems.length > 1
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
                ? signSku(str(product.signType, "NA"))
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
            price: money(shippingPrice),
          }
        : null,
    feeLineItems: [
      /**
       * Apparel: printing and screens, broken out of the garment price.
       *
       * Apparel used to go to Printavo as ONE line at a blended unit price
       * covering garments, printing and setup together — the same
       * "average of things that do not average" the sticker cart was fixed
       * for. Two consequences, and the second is the one that costs money:
       *
       *   The shop could not adjust screens without unpicking a blend, even
       *   though the quote email had always broken the three out.
       *
       *   total/quantity is an infinite-repeating decimal on most orders, and
       *   Printavo stores a 4dp unit price and multiplies. Swept across 56,000
       *   quantity/garment/colour/location combinations, the invoice came out
       *   up to $0.02 ABOVE the quote, growing with quantity. Splitting the
       *   three removes every division: the garment line carries an exact 2dp
       *   supplier price, and printing and screens are flat amounts.
       *
       * Skipped for a special order, which has no breakdown to split.
       */
      ...(apparel && !isSpecialOrder && num(pricing.printTotal) > 0
        ? [
            {
              description: `Printing (${
                Array.isArray(product.printLocations)
                  ? (product.printLocations as string[]).length
                  : 1
              } location(s), ${str(product.inkColors, "ink TBD")}) - ${quantity} x $${num(
                pricing.printUnitPrice
              ).toFixed(2)}`,
              itemNumber: "GORILLA-APPAREL-PRINT",
              price: money(pricing.printTotal),
            },
          ]
        : []),
      ...(apparel && !isSpecialOrder && num(pricing.setupTotal) > 0
        ? [
            {
              description: "Screens / setup",
              itemNumber: "GORILLA-APPAREL-SETUP",
              price: money(pricing.setupTotal),
            },
          ]
        : []),
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
              price: money(pricing.setupPrice),
            },
          ]
        : []),
      /**
       * The DESCRIPTION carries the story; the ITEM NUMBER is the SKU and has
       * to hold still. That is already how the sticker setup fee above works —
       * "Setup and artwork prep (3 designs)" filed under a fixed
       * GORILLA-DECAL-SETUP — and signs were the odd one out.
       *
       * They derived the item number from the label text, so the SKU moved
       * whenever the wording did:
       *
       *   1 design    GORILLA-FEE-SETUP-FEE-PER-DESIGN
       *   2 designs   GORILLA-FEE-SETUP-2-DESIGNS-15
       *   3 designs   GORILLA-FEE-SETUP-3-DESIGNS-15
       *   pole pockets on 2   GORILLA-FEE-POLE-POCKETS-2-15
       *
       * Every order filed the same charge under a different SKU, so "how much
       * setup did we bill this quarter" had no answer. `code` comes from
       * lib/signs-pricing.ts and names the CHARGE, not its wording.
       */
      ...signsFeeLines.map((l) => ({
        description: str(l.label, "Fee"),
        itemNumber: `GORILLA-SIGN-${
          str(l.code, "") ||
          // Only reached by a line that predates `code` — kept so an old
          // payload still produces something rather than a bare prefix.
          str(l.label, "FEE")
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "-")
            .slice(0, 24)
            .replace(/-$/, "")
        }`,
        price: money(l.amount),
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
  artworkLinks?: ArtworkLink[];
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
          // Taxability follows the GOODS, not whether the flow takes money —
          // keying it off checkout was right for apparel by accident and
          // wrong for signs. See lib/tax.ts. Printavo computes salesTaxAmount
          // from this rate and the per-line `taxed` flags, so the app never
          // derives a figure that could drift from the invoice the customer
          // pays.
          //
          // NOTE: omitted entirely on an exempt flow. Whether Printavo then
          // applies an ACCOUNT-level default rate is unverified — it is the
          // tax question in PRINTAVO-PROBE.md, and it decides whether apparel
          // is really invoiced tax-free.
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
            // Setup fee, banner add-ons — each its own line so the shop can
            // adjust one charge without unpicking a lumped total.
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

export type OrderLookupResult =
  | { found: true; status: string; visualId: string; quoteNumber: string }
  /**
   * One shape for "no such order" AND "that is not the email on it".
   *
   * Deliberately indistinguishable. Quote numbers are short and dated, so a
   * lookup that answered "right number, wrong email" would confirm an order
   * exists and let someone probe addresses against it. The customer loses
   * nothing: either way the honest instruction is check the number and the
   * address on their confirmation.
   */
  | { found: false; reason: "no-match" }
  /** Printavo is unreachable or unconfigured — NOT the same as no such order. */
  | { found: false; reason: "unavailable"; error?: string };

/**
 * Look up one order's production status, for the customer-facing tracker.
 *
 * Matched on the quote number the app generated, which lives in the Printavo
 * NICKNAME ("WEB QUOTE GS-20260812-AB12C - ..."), not in visualId — Printavo
 * assigns that itself and the customer has never seen it.
 *
 * ── VERIFIED LIVE, WITH ONE THING STILL UNKNOWN ──────────────────────────
 * This shipped marked UNVERIFIED because it was written from the published
 * schema with no credentials to run it against. It has since been run: on
 * 17 Aug 2026 a real order was looked up against the live account (23070)
 * through the customer tracker and returned a real status, so the
 * `orders(query:)` connection and the `status { name }` shape are correct.
 * Corrected here because the old warning would send a future session to
 * "fix" working code — and the published schema has been wrong for this
 * integration before (lineItems is documented nested and is flat live).
 *
 * What is still unknown is how FUZZY `query:` is. One lookup on a quiet day
 * does not establish how the search ranks when many nicknames share the same
 * `GS-` date prefix. If it is loose, the real order could fall outside the
 * first page and a customer holding a receipt would be told no such order
 * exists. `first: 10` is deliberately left alone rather than raised on a
 * guess — an unsupported page size would error the whole query and take
 * tracking down for everyone, which is far worse than the risk it hedges.
 * Instead the full-page case is logged below, so if it ever happens the shop
 * finds out from a log rather than from a customer.
 *
 * Everything here fails to `unavailable`, never to `no-match`, so a broken
 * query shows "we couldn't reach our system" rather than telling a customer
 * with a real order that it does not exist.
 * ──────────────────────────────────────────────────────────────────────────
 */
/**
 * Does this Printavo nickname belong to this quote number?
 *
 * The one place that question is answered. `buildPrintavoQuotePlan` writes the
 * nickname and `lookupOrderStatus` reads it back, which is two pieces of code
 * that must agree about a string format with a customer's order status resting
 * on it. Sharing the predicate means a test can assert the writer's output
 * against the reader's rule rather than against a copy of it.
 *
 * Substring, not equality: the nickname carries a prefix, a quantity and a
 * product label around the number, and the shop edits these by hand.
 */
export function nicknameMatchesQuoteNumber(
  nickname: string,
  quoteNumber: string
) {
  const wanted = quoteNumber.trim().toUpperCase();
  if (!wanted) return false;

  return String(nickname || "")
    .toUpperCase()
    .includes(wanted);
}

/**
 * How many search hits we inspect. Not raised without being able to run it —
 * see the note on lookupOrderStatus.
 */
const ORDER_SEARCH_PAGE_SIZE = 10;

export async function lookupOrderStatus(input: {
  quoteNumber: string;
  email: string;
}): Promise<OrderLookupResult> {
  if (!isConfigured()) {
    return { found: false, reason: "unavailable", error: "Printavo is not configured." };
  }

  const quoteNumber = input.quoteNumber.trim().toUpperCase();
  const email = input.email.trim().toLowerCase();

  if (!quoteNumber || !email) return { found: false, reason: "no-match" };

  try {
    const data = await printavoRequest<{ orders: { nodes: AnyRecord[] } }>(
      `query GorillaOrderStatus($q: String!, $first: Int!) {
         orders(query: $q, first: $first) {
           nodes {
             ... on Quote    { id visualId nickname status { name } contact { email } }
             ... on Invoice  { id visualId nickname status { name } contact { email } }
           }
         }
       }`,
      { q: quoteNumber, first: ORDER_SEARCH_PAGE_SIZE }
    );

    const nodes = data.orders?.nodes || [];

    // Printavo's search is fuzzy, so confirm the quote number really is in the
    // nickname rather than trusting whatever the search decided was close.
    const match = nodes.find((node) =>
      nicknameMatchesQuoteNumber(str(node.nickname), quoteNumber)
    );

    if (!match) {
      // A full page with no match is the one case where "no such order" might
      // be a lie — the match could be on page two. Nothing changes for the
      // customer, who is told the same thing either way; this is so the shop
      // can see it happening instead of guessing.
      if (nodes.length >= ORDER_SEARCH_PAGE_SIZE) {
        console.warn(
          `ORDER STATUS SEARCH FILLED A PAGE without matching ${quoteNumber}. ` +
            `Printavo returned ${nodes.length} orders and none carried that ` +
            `number in its nickname — the search may be too fuzzy for a single page.`
        );
      }

      return { found: false, reason: "no-match" };
    }

    const contact = (match.contact as AnyRecord) || {};
    // Printavo keeps several addresses in one comma-separated string.
    const addresses = str(contact.email)
      .toLowerCase()
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!addresses.includes(email)) return { found: false, reason: "no-match" };

    return {
      found: true,
      status: str((match.status as AnyRecord)?.name),
      visualId: str(match.visualId),
      quoteNumber,
    };
  } catch (error) {
    // A thrown request is a broken pipe, not a missing order. Saying "no such
    // order" here would tell a customer holding a real receipt that we have
    // never heard of them.
    return {
      found: false,
      reason: "unavailable",
      error: error instanceof Error ? error.message : "Unknown Printavo error.",
    };
  }
}
