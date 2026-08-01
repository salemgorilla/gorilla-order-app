// Sends each submitted quote to the shop as an email.
//
// Two providers are supported — whichever is configured wins (Resend first):
//
//   A) Resend  — set RESEND_API_KEY
//   B) Gmail   — set GMAIL_USER + GMAIL_APP_PASSWORD
//                (a Google "App Password", not your normal password;
//                 requires 2-Step Verification on the account)
//
// Shared:
//   QUOTE_TO_EMAIL   - where quotes are sent (default quote@gorillasalem.com)
//   QUOTE_FROM_EMAIL - sender. Ignored for Gmail, which must send as GMAIL_USER.
//
// If neither provider is configured, sendQuoteEmail() returns
// { sent:false, skipped:true } and the quote submission still succeeds —
// email is best-effort and never blocks the customer.

export type QuoteEmailResult = {
  sent: boolean;
  skipped?: boolean;
  error?: string;
  provider?: "resend" | "gmail";
};

export function getEmailProvider(): "resend" | "gmail" | null {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return "gmail";
  return null;
}

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

function isSigns(product: AnyRecord) {
  return (
    str(product.type).toLowerCase().includes("signs") ||
    Boolean(product.signType)
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
  attachmentInfo?: string;
}) {
  const { quoteNumber, receivedAt, order, artworkAnalysis, attachmentInfo } =
    input;
  const customer = (order.customer as AnyRecord) || {};
  const product = (order.product as AnyRecord) || {};
  const production = (order.production as AnyRecord) || {};
  const pricing = (order.pricing as AnyRecord) || {};
  const apparel = isApparel(product);
  const signs = isSigns(product);

  const submittedAt = (() => {
    const d = new Date(receivedAt);
    return Number.isNaN(d.getTime()) ? receivedAt : d.toLocaleString();
  })();

  const quantity = Number(product.quantity) || 0;
  const total = Number(pricing.total) || 0;
  // Decal "each" is per-decal and excludes shipping (matches the site).
  const baseForEach = apparel
    ? total
    : Number(pricing.stickerPrice) || total;
  const each = quantity > 0 ? baseForEach / quantity : 0;

  const productLabel = apparel
    ? str(
        (product.supplier as AnyRecord)?.productName ||
          product.garmentType ||
          "Apparel"
      )
    : signs
    ? str(product.signType, "Signs")
    : "Custom Stickers";

  // A special order (or anything the app couldn't price) needs the shop to
  // quote it by hand — say so in the subject so it stands out in the inbox.
  const needsHandQuote =
    Boolean(product.specialOrder) || Boolean(pricing.quoteRequired);

  const subject = needsHandQuote
    ? `NEED TO QUOTE — ${quoteNumber} — ${quantity} ${productLabel}`
    : `New Quote ${quoteNumber} — ${quantity} ${productLabel}`;

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
      ...(product.specialOrder
        ? [
            line("*** SPECIAL ORDER ***", "Needs a hand quote"),
            line("What they need", str(product.specialOrderNotes, "Not described")),
          ]
        : []),
      line("S&S Style", str(supplier.catalogStyle, "N/A")),
      line("Sample Size", str(supplier.sampleSize, "N/A")),
      line("SKU", str(supplier.sku, "N/A")),
      line("Garment Price (marked up)", money(supplier.markedUpGarmentPrice))
    );
  } else if (signs) {
    productLines.push(
      line("Type", "Banners & Signs"),
      line("Product", str(product.signType, "Not selected")),
      line("Quantity", String(quantity)),
      line("Size", str(product.size, "Not specified")),
      line("Material", str(product.material)),
      line("Finishing", str(product.finishing)),
      line("Sides", str(product.sides, "Single-sided"))
    );
  } else {
    productLines.push(
      line("Type", "Custom Stickers"),
      line("Quantity", String(quantity)),
      line("Size", str(product.size)),
      line("Shape", str(product.shape)),
      line("Sticker Type", str(product.material)),
      line(
        "Art Placement",
        `${str(product.artScale, "80")}% size, ${str(
          product.artMargin,
          "40"
        )}% ${str(product.shape) === "Die Cut" ? "cut border" : "margin"}`
      ),
      line(
        "Magenta Cut Line",
        product.magentaCutLine
          ? "Yes — customer art includes a magenta cut line"
          : "No"
      )
    );
  }

  // ---- estimate section ----
  const shippingPrice = Number(pricing.shippingPrice) || 0;
  // Signs are quoted by hand, so never show a $0.00 "estimate" that the shop
  // (or the customer) could mistake for a real price.
  const estimateLines: string[] = needsHandQuote && !signs
    ? [
        line("Estimated Total", "NEEDS A HAND QUOTE"),
        line("Why", str(pricing.note, "Special order — outside the online menu.")),
      ]
    : signs
    ? [
        line("Estimated Total", "Quoted by hand — needs pricing"),
        line(
          "Delivery",
          str(production.deliveryMethod) === "Ship"
            ? "Ship (quote shipping)"
            : "Local pickup in Salem"
        ),
      ]
    : [line("Estimated Total", money(total)), line("Estimated Each", money(each))];

  if (signs) {
    // no further breakdown — nothing is priced yet
  } else if (apparel) {
    estimateLines.push(
      line("Garments", money(pricing.garmentTotal)),
      line("Printing", money(pricing.printTotal)),
      line("Setup / Screens", money(pricing.setupTotal))
    );
  } else {
    estimateLines.push(
      line("Stickers", money(pricing.stickerPrice)),
      line(
        "Shipping",
        shippingPrice > 0 ? money(shippingPrice) : "Free (local pickup)"
      )
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
    line("Attachment", str(attachmentInfo, "Not attached")),
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
    apparel ? `APPAREL DETAILS` : signs ? `SIGNS DETAILS` : `STICKER DETAILS`,
    ...productLines,
    ``,
    `ESTIMATE`,
    ...estimateLines,
    `Note: Estimate only. Final pricing reviewed by Gorilla Salem.`,
    ``,
    `TIMELINE`,
    line("Needed In Hand", str(production.needBy, "Not entered")),
    line("Deadline", str(production.deadlineType, "N/A")),
    line(
      "Delivery",
      str(production.deliveryMethod) === "Ship"
        ? "Ship to customer"
        : "Local pickup in Salem"
    ),
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
    detailsLabel: apparel
      ? "Apparel Details"
      : signs
      ? "Signs Details"
      : "Sticker Details",
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
  detailsLabel: string;
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
    ${htmlSection(input.detailsLabel, input.productLines)}
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

export type QuoteAttachment = {
  filename: string;
  content: string; // base64-encoded file contents
};

export async function sendQuoteEmail(input: {
  quoteNumber: string;
  receivedAt: string;
  order: AnyRecord;
  artworkAnalysis: AnyRecord | null;
  attachment?: QuoteAttachment | null;
  attachmentInfo?: string;
}): Promise<QuoteEmailResult> {
  const provider = getEmailProvider();

  if (!provider) {
    return { sent: false, skipped: true };
  }

  const to = process.env.QUOTE_TO_EMAIL || "quote@gorillasalem.com";
  const { subject, text, html, replyTo } = buildQuoteEmail(input);

  try {
    if (provider === "gmail") {
      return await sendViaGmail({
        to,
        subject,
        text,
        html,
        replyTo,
        attachment: input.attachment ?? null,
      });
    }

    return await sendViaResend({
      to,
      subject,
      text,
      html,
      replyTo,
      attachment: input.attachment ?? null,
    });
  } catch (error) {
    return {
      sent: false,
      provider,
      error: error instanceof Error ? error.message : "Unknown email error.",
    };
  }
}

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachment: QuoteAttachment | null;
};

async function sendViaResend(args: SendArgs): Promise<QuoteEmailResult> {
  const from =
    process.env.QUOTE_FROM_EMAIL ||
    "Gorilla Salem Quotes <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      ...(args.attachment ? { attachments: [args.attachment] } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      sent: false,
      provider: "resend",
      error: `Resend ${response.status}: ${errorText}`,
    };
  }

  return { sent: true, provider: "resend" };
}

async function sendViaGmail(args: SendArgs): Promise<QuoteEmailResult> {
  // Imported lazily so the dependency only loads when Gmail is actually used.
  const nodemailer = (await import("nodemailer")).default;

  const user = process.env.GMAIL_USER as string;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      // A Google App Password (16 chars). Spaces are allowed in the UI but
      // must be stripped before use.
      pass: (process.env.GMAIL_APP_PASSWORD as string).replace(/\s+/g, ""),
    },
  });

  // Gmail always sends as the authenticated account, so we only customise the
  // display name — QUOTE_FROM_EMAIL's address would be rewritten anyway.
  await transporter.sendMail({
    from: `Gorilla Salem Quotes <${user}>`,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    ...(args.attachment
      ? {
          attachments: [
            {
              filename: args.attachment.filename,
              content: args.attachment.content,
              encoding: "base64",
            },
          ],
        }
      : {}),
  });

  return { sent: true, provider: "gmail" };
}
