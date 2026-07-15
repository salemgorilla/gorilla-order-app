// Sends each submitted quote to the shop as an email, via Resend.
// Configured entirely through env vars so no secrets live in the repo:
//   RESEND_API_KEY   - required to actually send (if missing, sending is skipped)
//   QUOTE_TO_EMAIL   - where quotes are sent (default quote@gorillasalem.com)
//   QUOTE_FROM_EMAIL - verified sender (default Resend's onboarding sandbox)
//
// If RESEND_API_KEY is not set, sendQuoteEmail() returns { sent:false, skipped:true }
// and the quote submission still succeeds — email is best-effort, never a blocker.

export type QuoteEmailResult = {
  sent: boolean;
  skipped?: boolean;
  error?: string;
};

type AnyRecord = Record<string, unknown>;

function str(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const s = String(value);
  return s.trim() === "" ? fallback : s;
}

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "N/A";
}

function isApparel(product: AnyRecord) {
  return (
    str(product.type).toLowerCase().includes("apparel") ||
    Boolean(product.supplier) ||
    Boolean(product.garmentType)
  );
}

function line(label: string, value: string) {
  return `${label}: ${value}`;
}

export function buildQuoteEmail(input: {
  quoteNumber: string;
  receivedAt: string;
  order: AnyRecord;
  artworkAnalysis: AnyRecord | null;
}) {
  const { quoteNumber, receivedAt, order, artworkAnalysis } = input;
  const customer = (order.customer as AnyRecord) || {};
  const product = (order.product as AnyRecord) || {};
  const production = (order.production as AnyRecord) || {};
  const pricing = (order.pricing as AnyRecord) || {};
  const apparel = isApparel(product);

  const submittedAt = (() => {
    const d = new Date(receivedAt);
    return Number.isNaN(d.getTime()) ? receivedAt : d.toLocaleString();
  })();

  const quantity = Number(product.quantity) || 0;
  const total = Number(pricing.total) || 0;
  const each = quantity > 0 ? total / quantity : 0;

  const productLabel = apparel
    ? str(
        (product.supplier as AnyRecord)?.productName ||
          product.garmentType ||
          "Apparel"
      )
    : "Custom Decals";

  const subject = `New Quote ${quoteNumber} — ${quantity} ${productLabel}`;

  // ---- product section ----
  const productLines: string[] = [];
  if (apparel) {
    const supplier = (product.supplier as AnyRecord) || {};
    productLines.push(
      line("Type", "T-Shirts & Apparel"),
      line("Garment", str(supplier.productName || product.garmentType, "Not selected")),
      line("Quantity", String(quantity)),
      line("Color", str(product.garmentColor || supplier.colorName, "Not selected")),
      line(
        "Print Locations",
        Array.isArray(product.printLocations)
          ? (product.printLocations as string[]).join(", ")
          : str(product.printLocations)
      ),
      line("Ink Colors", str(product.inkColors)),
      line("Size Breakdown", str(product.sizeBreakdown, "Not entered")),
      line("S&S Style", str(supplier.catalogStyle, "N/A")),
      line("Sample Size", str(supplier.sampleSize, "N/A")),
      line("SKU", str(supplier.sku, "N/A")),
      line("Garment Price (marked up)", money(supplier.markedUpGarmentPrice))
    );
  } else {
    productLines.push(
      line("Type", "Custom Decals"),
      line("Quantity", String(quantity)),
      line("Size", str(product.size)),
      line("Shape", str(product.shape)),
      line("Decal Type", str(product.material))
    );
  }

  // ---- estimate section ----
  const estimateLines: string[] = [
    line("Estimated Total", money(total)),
    line("Estimated Each", money(each)),
  ];
  if (apparel) {
    estimateLines.push(
      line("Garments", money(pricing.garmentTotal)),
      line("Printing", money(pricing.printTotal)),
      line("Setup / Screens", money(pricing.setupTotal))
    );
  }

  // ---- artwork section ----
  const artworkFileName =
    str(artworkAnalysis?.fileName) ||
    str((order.artwork as AnyRecord)?.fileName) ||
    "No file uploaded";
  const artworkLines: string[] = [
    line("File", artworkFileName),
    line("Type", str(artworkAnalysis?.fileType, "N/A")),
    line("Size", str(artworkAnalysis?.fileSize, "N/A")),
    line("Dimensions", str(artworkAnalysis?.dimensions, "N/A")),
    line("Estimated Colors", str(artworkAnalysis?.estimatedColorCount, "N/A")),
  ];

  const customerEmail = str(customer.email);

  const text = [
    `NEW QUOTE REQUEST — Gorilla Salem`,
    `Quote #: ${quoteNumber}`,
    `Submitted: ${submittedAt}`,
    ``,
    `CUSTOMER`,
    line("Name", str(customer.customerName, "Not entered")),
    line("Company", str(customer.company, "N/A")),
    line("Email", str(customer.email, "Not entered")),
    line("Phone", str(customer.phone, "N/A")),
    ``,
    apparel ? `APPAREL DETAILS` : `DECAL DETAILS`,
    ...productLines,
    ``,
    `ESTIMATE`,
    ...estimateLines,
    `Note: Estimate only. Final pricing reviewed by Gorilla Salem.`,
    ``,
    `TIMELINE`,
    line("Needed In Hand", str(production.needBy, "Not entered")),
    line("Deadline", str(production.deadlineType, "N/A")),
    ``,
    `ARTWORK`,
    ...artworkLines,
    ``,
    `NOTES`,
    str(customer.notes, "No customer notes"),
    ``,
    customerEmail
      ? `Reply to this email to reach ${str(customer.customerName, "the customer")} (${customerEmail}).`
      : `No customer email provided.`,
  ].join("\n");

  const html = buildHtml({
    quoteNumber,
    submittedAt,
    apparel,
    customer,
    productLines,
    estimateLines,
    artworkLines,
    notes: str(customer.notes, "No customer notes"),
    customerName: str(customer.customerName, "the customer"),
    customerEmail,
  });

  return { subject, text, html, replyTo: customerEmail || undefined };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlSection(title: string, lines: string[]) {
  const rows = lines
    .map((l) => {
      const idx = l.indexOf(": ");
      const label = idx >= 0 ? l.slice(0, idx) : l;
      const value = idx >= 0 ? l.slice(idx + 2) : "";
      return `<tr><td style="padding:3px 12px 3px 0;color:#6f695e;white-space:nowrap;vertical-align:top;">${escapeHtml(
        label
      )}</td><td style="padding:3px 0;color:#171717;font-weight:600;">${escapeHtml(
        value
      )}</td></tr>`;
    })
    .join("");
  return `<h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b7352d;">${escapeHtml(
    title
  )}</h3><table style="border-collapse:collapse;font-size:14px;">${rows}</table>`;
}

function buildHtml(input: {
  quoteNumber: string;
  submittedAt: string;
  apparel: boolean;
  customer: AnyRecord;
  productLines: string[];
  estimateLines: string[];
  artworkLines: string[];
  notes: string;
  customerName: string;
  customerEmail: string;
}) {
  const customerLines = [
    line("Name", str(input.customer.customerName, "Not entered")),
    line("Company", str(input.customer.company, "N/A")),
    line("Email", str(input.customer.email, "Not entered")),
    line("Phone", str(input.customer.phone, "N/A")),
  ];

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#F8F5EE;color:#171717;">
  <div style="background:#fff;border:1px solid #dfd0b8;border-radius:16px;padding:24px;">
    <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#b7352d;font-weight:800;">New Quote Request</p>
    <h1 style="margin:6px 0 2px;font-size:26px;color:#2E5037;">${escapeHtml(
      input.quoteNumber
    )}</h1>
    <p style="margin:0;color:#6f695e;font-size:13px;">Submitted ${escapeHtml(
      input.submittedAt
    )}</p>
    ${htmlSection("Customer", customerLines)}
    ${htmlSection(input.apparel ? "Apparel Details" : "Decal Details", input.productLines)}
    ${htmlSection("Estimate", input.estimateLines)}
    <p style="margin:6px 0 0;font-size:12px;color:#8a8172;">Estimate only. Final pricing reviewed by Gorilla Salem.</p>
    ${htmlSection("Artwork", input.artworkLines)}
    ${htmlSection("Notes", [`_: ${input.notes}`]).replace("_", "")}
    <p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #dfd0b8;font-size:13px;color:#6f695e;">${
      input.customerEmail
        ? `Reply to this email to reach ${escapeHtml(
            input.customerName
          )} (${escapeHtml(input.customerEmail)}).`
        : "No customer email provided."
    }</p>
  </div>
</div>`;
}

export async function sendQuoteEmail(input: {
  quoteNumber: string;
  receivedAt: string;
  order: AnyRecord;
  artworkAnalysis: AnyRecord | null;
}): Promise<QuoteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { sent: false, skipped: true };
  }

  const to = process.env.QUOTE_TO_EMAIL || "quote@gorillasalem.com";
  const from =
    process.env.QUOTE_FROM_EMAIL ||
    "Gorilla Salem Quotes <onboarding@resend.dev>";

  const { subject, text, html, replyTo } = buildQuoteEmail(input);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { sent: false, error: `Resend ${response.status}: ${errorText}` };
    }

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Unknown email error.",
    };
  }
}
