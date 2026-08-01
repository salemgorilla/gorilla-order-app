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
 * DELIBERATELY NOT automatic. Web submissions are unreviewed — artwork may be
 * unprintable, signs may still need hand pricing, and spam happens. Sending a
 * payment request is a decision the shop makes after looking at the job, so
 * this is only reachable through the guarded /api/payment-request route.
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

export type PrintavoQuotePlan = {
  nickname: string;
  customerDueAt: string;
  dueAt: string;
  customerNote: string;
  productionNote: string;
  tags: string[];
  lineItem: {
    description: string;
    itemNumber: string;
    price: number;
    quantity: number;
    sizes: PrintavoSizeCount[];
  };
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
  const apparel = isApparel(product);

  const quantity = Math.max(1, num(product.quantity, 1));
  const total = num(pricing.total);
  const shippingPrice = num(pricing.shippingPrice);
  const deliveryMethod = str(production.deliveryMethod, "Pickup");

  // Signs send an itemised breakdown (product line, setup fee, add-ons). Split
  // it so Printavo shows the same lines the customer saw, instead of one lump.
  const signsLines = Array.isArray(pricing.lines)
    ? (pricing.lines as AnyRecord[]).filter((l) => num(l.amount) > 0)
    : [];
  // The first line is the product itself; everything after is a fee/add-on.
  const signsProductLine = signsLines[0];
  const signsFeeLines = signsLines.slice(1);

  // The decal unit price excludes shipping — shipping becomes its own line
  // item so the Printavo total matches the website total.
  const itemsSubtotal = apparel
    ? total
    : signsProductLine
    ? num(signsProductLine.amount)
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

  // Flag anything the app couldn't price: unpriced signs, and apparel special
  // orders (a garment or placement outside the simple online menu).
  const needsHandPricing = Boolean(pricing.quoteRequired);
  const isSpecialOrder = Boolean(product.specialOrder);

  const nickname = apparel
    ? `WEB QUOTE ${quoteNumber} - ${quantity} ${garmentLabel}${
        isSpecialOrder ? " (SPECIAL ORDER - NEEDS QUOTE)" : ""
      }`
    : signs
    ? `WEB QUOTE ${quoteNumber} - ${quantity} ${signLabel}${
        needsHandPricing ? " (NEEDS PRICING)" : ""
      }`
    : `WEB QUOTE ${quoteNumber} - ${quantity} Stickers`;

  const description = signs
    ? [
        `${quantity}x ${signLabel}`,
        `Size: ${str(product.size, "TBD")}`,
        `Material: ${str(product.material, "TBD")}`,
        `Finishing: ${str(product.finishing, "TBD")}`,
        `Sides: ${str(product.sides, "Single-sided")}`,
        ...(needsHandPricing ? [`PRICING NEEDED — this sign is quoted by hand.`] : []),
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
    : [
        `${quantity}x Custom Stickers`,
        `Size: ${str(product.size, "TBD")}`,
        `Shape: ${str(product.shape, "TBD")}`,
        `Type: ${str(product.material, "TBD")}`,
        `Art placement: ${str(product.artScale, "80")}% size, ${str(
          product.artMargin,
          "40"
        )}% ${str(product.shape) === "Die Cut" ? "cut border" : "margin"}`,
        `Magenta cut line: ${
          product.magentaCutLine ? "YES — art has a magenta cut path" : "no"
        }`,
      ].join("\n");

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
    `Each: $${unitPrice.toFixed(2)}`,
    ...(shippingPrice > 0
      ? [`Shipping: $${shippingPrice.toFixed(2)}`]
      : ["Shipping: Free (local pickup)"]),
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
    tags: needsHandPricing
      ? ["#GorillaOrder", "#WebQuote", "#Unconfirmed", "#NeedsPricing"]
      : ["#GorillaOrder", "#WebQuote", "#Unconfirmed"],
    lineItem: {
      description,
      itemNumber: signs
        ? `GORILLA-SIGN-${str(product.signType, "NA").toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`
        : apparel
        ? `GORILLA-APPAREL-${str(supplier.catalogStyle, "NA")}`
        : "GORILLA-DECAL",
      price: unitPrice,
      quantity,
      // Apparel: map the real size breakdown onto Printavo's size enums so the
      // shop sees S/M/L/XL counts. Stickers (and unparseable breakdowns) fall
      // back to a single size_other row carrying the full count.
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
    shippingLineItem:
      shippingPrice > 0
        ? {
            description: "Shipping",
            itemNumber: "GORILLA-SHIPPING",
            price: shippingPrice,
          }
        : null,
    feeLineItems: signsFeeLines.map((l) => ({
      description: str(l.label, "Fee"),
      itemNumber: `GORILLA-FEE-${str(l.label, "FEE")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .slice(0, 24)
        .replace(/-$/, "")}`,
      price: num(l.amount),
    })),
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
            {
              description: asciiSafe(plan.lineItem.description),
              itemNumber: plan.lineItem.itemNumber,
              position: 1,
              price: plan.lineItem.price,
              sizes: plan.lineItem.sizes,
              taxed: true,
            },
            // Setup fee, custom size fee, banner add-ons — each its own line so
            // the shop can adjust one charge without unpicking a lumped total.
            ...plan.feeLineItems.map((fee, index) => ({
              description: asciiSafe(fee.description),
              itemNumber: fee.itemNumber,
              position: index + 2,
              price: fee.price,
              sizes: [{ size: "size_other", count: 1 }],
              taxed: true,
            })),
            ...(plan.shippingLineItem
              ? [
                  {
                    description: asciiSafe(plan.shippingLineItem.description),
                    itemNumber: plan.shippingLineItem.itemNumber,
                    position: plan.feeLineItems.length + 2,
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
