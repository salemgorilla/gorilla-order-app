// Pushes each submitted quote into Printavo as a DRAFT/UNCONFIRMED quote.
//
// Env vars (all optional — if any are missing, pushing is skipped safely):
//   PRINTAVO_EMAIL        - the Printavo account email (API v2 auth header)
//   PRINTAVO_TOKEN        - the Printavo API token
//   PRINTAVO_CUSTOMER_ID  - customer whose primary contact the quotes attach to
//                           (falls back to PRINTAVO_TEST_CUSTOMER_ID)
//
// Design notes:
// - Best-effort: a Printavo failure never blocks the customer's confirmation.
// - Quotes are tagged #WebQuote / #Unconfirmed so they're obviously not
//   reviewed yet. A Printavo "quote" is already pre-order, not an invoice.
// - Customer identity: every web quote currently attaches to ONE configured
//   contact, with the real customer's details in the quote's customerNote.
//   Find-or-create of real Printavo customers needs schema verification
//   against a live account — see GAMEPLAN "Printavo follow-ups".

const PRINTAVO_API_URL = "https://www.printavo.com/api/v2";

export type PrintavoResult = {
  created: boolean;
  skipped?: boolean;
  error?: string;
  quoteId?: string;
  publicUrl?: string;
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
  const { email, token, customerId } = getPrintavoConfig();
  return Boolean(email && token && customerId);
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

  // The decal unit price excludes shipping — shipping becomes its own line
  // item so the Printavo total matches the website total.
  const itemsSubtotal = apparel ? total : num(pricing.stickerPrice, total);
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

  const nickname = apparel
    ? `WEB QUOTE ${quoteNumber} - ${quantity} ${garmentLabel}`
    : `WEB QUOTE ${quoteNumber} - ${quantity} Decals`;

  const description = apparel
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
      ].join("\n")
    : [
        `${quantity}x Custom Decals`,
        `Size: ${str(product.size, "TBD")}`,
        `Shape: ${str(product.shape, "TBD")}`,
        `Type: ${str(product.material, "TBD")}`,
        `Art placement: ${str(product.artScale, "80")}% size, ${str(
          product.artMargin,
          "40"
        )}% ${str(product.shape) === "Die Cut" ? "cut border" : "margin"}`,
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
    apparel ? "APPAREL" : "DECALS",
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
    tags: ["#GorillaOrder", "#WebQuote", "#Unconfirmed"],
    lineItem: {
      description,
      itemNumber: apparel
        ? `GORILLA-APPAREL-${str(supplier.catalogStyle, "NA")}`
        : "GORILLA-DECAL",
      price: unitPrice,
      quantity,
      // Apparel: map the real size breakdown onto Printavo's size enums so the
      // shop sees S/M/L/XL counts. Decals (and unparseable breakdowns) fall
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

  const { customerId } = getPrintavoConfig();
  const plan = buildPrintavoQuotePlan(input);

  try {
    // 1. Resolve the contact the quote attaches to.
    const customerData = await printavoRequest<{ customer: AnyRecord }>(
      `
        query GorillaOrderCustomer($id: ID!) {
          customer(id: $id) {
            id
            companyName
            primaryContact {
              id
              fullName
              email
            }
          }
        }
      `,
      { id: customerId }
    );

    const primaryContact = (customerData.customer as AnyRecord)
      ?.primaryContact as AnyRecord | undefined;

    if (!primaryContact?.id) {
      return {
        created: false,
        error: "Printavo customer has no primary contact to attach the quote to.",
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
          contact: { id: primaryContact.id },
          nickname: plan.nickname,
          customerDueAt: plan.customerDueAt,
          dueAt: plan.dueAt,
          customerNote: plan.customerNote,
          productionNote: plan.productionNote,
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
          // NOTE: lineItems is [[LineItemCreateInput!]] — a nested array. Both
          // items go in ONE inner array so they land in a single group.
          lineItems: [
            [
              {
                description: plan.lineItem.description,
                itemNumber: plan.lineItem.itemNumber,
                position: 1,
                price: plan.lineItem.price,
                sizes: plan.lineItem.sizes,
                taxed: true,
              },
              ...(plan.shippingLineItem
                ? [
                    {
                      description: plan.shippingLineItem.description,
                      itemNumber: plan.shippingLineItem.itemNumber,
                      position: 2,
                      price: plan.shippingLineItem.price,
                      sizes: [{ size: "size_other", count: 1 }],
                      taxed: false,
                    },
                  ]
                : []),
            ],
          ],
        },
      }
    );

    return {
      created: true,
      quoteId: str(quote.id),
      publicUrl: str(quote.publicUrl),
    };
  } catch (error) {
    return {
      created: false,
      error: error instanceof Error ? error.message : "Unknown Printavo error.",
    };
  }
}
