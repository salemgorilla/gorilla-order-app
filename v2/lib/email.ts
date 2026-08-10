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
//   LEAD_TO_EMAIL    - where INCOMPLETE-quote notices go. Optional; falls back
//                      to QUOTE_TO_EMAIL. Worth splitting: abandoned quotes
//                      arrive far more often than real ones, and in a shared
//                      inbox they bury the submissions that need working.
//   QUOTE_FROM_EMAIL - sender. Ignored for Gmail, which must send as GMAIL_USER.
//
// If neither provider is configured, sendQuoteEmail() returns
// { sent:false, skipped:true } and the quote submission still succeeds —
// email is best-effort and never blocks the customer.

// Type-only import — erased at build time, so the email path stays free of
// the add-on catalogue and the pricing engines behind it.
import type { AddOn } from "../types/order";

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
  const addOns = (Array.isArray(order.addOns) ? order.addOns : []) as AddOn[];
  const addOnsNote = str(order.addOnsNote);
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
  // Whether the PRIMARY product could be priced. This alone governs the
  // ESTIMATE section — an unpriced add-on must never hide a total the app
  // actually computed for the main job.
  const primaryNeedsHandQuote =
    Boolean(product.specialOrder) || Boolean(pricing.quoteRequired);

  // Whether ANY part of this quote needs hand pricing. Subject line only:
  // it is the shop's inbox triage signal, so a priced sticker order carrying
  // an unpriced add-on still has to be flagged.
  const needsHandQuote =
    primaryNeedsHandQuote || addOns.some((a) => a.quoteRequired);

  // Same suffix on both subjects so add-ons are never invisible in the list.
  const addOnCount = addOns.length + (addOnsNote ? 1 : 0);
  const suffix = addOnCount > 0 ? ` + ${addOnCount} more` : "";

  const subject = needsHandQuote
    ? `NEED TO QUOTE — ${quoteNumber} — ${quantity} ${productLabel}${suffix}`
    : `New Quote ${quoteNumber} — ${quantity} ${productLabel}${suffix}`;

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
      // Real dimensions when the customer entered them — "Custom size" on its
      // own is not something the shop can cut.
      line(
        "Size",
        Number(product.widthInches) > 0 && Number(product.heightInches) > 0
          ? `${product.widthInches}" x ${product.heightInches}"`
          : str(product.size)
      ),
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
  const signsDelivery = line(
    "Delivery",
    str(production.deliveryMethod) === "Ship"
      ? "Ship (quote shipping)"
      : "Local pickup in Salem"
  );

  const estimateLines: string[] = primaryNeedsHandQuote && !signs
    ? [
        line("Estimated Total", "NEEDS A HAND QUOTE"),
        line("Why", str(pricing.note, "Special order — outside the online menu.")),
      ]
    : signs && Boolean(pricing.quoteRequired)
    ? [line("Estimated Total", "Quoted by hand — needs pricing"), signsDelivery]
    : signs
    ? // Signs have been live-priced since v3.10.0. This branch used to send
      // "needs pricing" unconditionally, so the shop lost the computed total
      // on every signs quote while the subject line said it was priced.
      [
        line("Estimated Total", money(total)),
        line("Estimated Each", money(pricing.unitPrice ?? each)),
        signsDelivery,
      ]
    : [line("Estimated Total", money(total)), line("Estimated Each", money(each))];

  if (signs) {
    // Itemised breakdown straight from the pricing engine. $0 lines are kept
    // deliberately: they carry the "quoted separately" finishing add-ons the
    // customer asked for, which the shop has to action by hand. Printavo
    // filters those out (printavo.ts:535), so this email is the only place
    // they surface.
    const breakdown = Array.isArray(pricing.lines)
      ? (pricing.lines as AnyRecord[])
      : [];

    for (const item of breakdown) {
      // Rendered as "Label: Value" and split on the first ": ", so strip the
      // engine's " - quoted separately" suffix rather than letting it repeat
      // the value. Dashes are written as \u escapes: a literal em dash in
      // this file did not survive the round trip reliably enough to match.
      const label = str(item.label)
        .replace(/quoted separately\s*$/i, "")
        .replace(new RegExp("[\\s\\u2010-\\u2015\\u2212-]+$"), "");
      const amount = Number(item.amount) || 0;
      // Three cases, not two. Only ZERO means "quoted separately" — a negative
      // is a credit (the no-hem credit) and must show as -$36.00, not get
      // mislabelled as something the shop still has to price.
      const value =
        amount === 0
          ? "Quoted separately"
          : amount < 0
          ? `-${money(Math.abs(amount))}`
          : money(amount);

      estimateLines.push(line(label, value));
    }
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

  // ---- add-ons ----
  // Extra items the customer asked to add to this quote. They are NOT in
  // pricing.total on purpose, so they are listed as their own section rather
  // than folded into the estimate.
  const addOnLines: string[] = [];

  for (const item of addOns) {
    const label = str((item as AnyRecord).label);
    if (!label) continue;
    const quoteRequired = Boolean((item as AnyRecord).quoteRequired);
    const amount = Number((item as AnyRecord).amount) || 0;
    addOnLines.push(
      line(label, quoteRequired ? "Quote by hand" : money(amount))
    );
  }

  if (addOnsNote) addOnLines.push(line("Also asked about", addOnsNote));

  if (addOnLines.length > 0) {
    // Computed inline rather than imported, to keep the email path free of
    // the add-on catalogue and the pricing engines it pulls in.
    const priced = addOns.reduce(
      (sum, a) => sum + (a.quoteRequired ? 0 : Number(a.amount) || 0),
      0
    );
    const quoteCount = addOns.filter((a) => a.quoteRequired).length;
    addOnLines.push(
      line(
        "Add-ons subtotal",
        `${money(priced)}${
          quoteCount > 0 ? ` + ${quoteCount} to quote by hand` : ""
        } (not included in the estimate above)`
      )
    );
  }

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
    // Optional, so "Not answered" rather than an omitted line — a missing row
    // reads as a rendering bug, and knowing nobody answered is itself data.
    line(
      "Heard about us via",
      Array.isArray(customer.heardAbout) && customer.heardAbout.length
        ? customer.heardAbout.join(", ")
        : "Not answered"
    ),
    ``,
    apparel ? `APPAREL DETAILS` : signs ? `SIGNS DETAILS` : `STICKER DETAILS`,
    ...productLines,
    ``,
    `ESTIMATE`,
    ...estimateLines,
    `Note: Estimate only. Final pricing reviewed by Gorilla Salem.`,
    ...(addOnLines.length ? [``, `ADD-ONS THE CUSTOMER ASKED FOR`, ...addOnLines] : []),
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
    addOnLines,
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

// Order Desk inks, duplicated as literals on purpose: email clients do not
// support CSS custom properties, so `var(--ink-black)` would render as black
// in some and as nothing in others. Keep these in sync with app/globals.css.
const INK_BLACK = "#111111";
const INK_MUTED = "#5f594e";
const SHIRT_BLANK = "#f4f1ea";
const GORILLA_GREEN = "#2e7d32";
const RUSH_RED = "#b23a2e";
const RULE = "#d8d2c4";
// Webfonts are unreliable in email; this is the closest safe stack.
const SPEC_FONT = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function htmlSection(title: string, lines: string[]) {
  const rows = lines
    .map((l) => {
      const idx = l.indexOf(": ");
      const label = idx >= 0 ? l.slice(0, idx) : l;
      const value = idx >= 0 ? l.slice(idx + 2) : "";
      return `<tr><td style="padding:3px 12px 3px 0;color:${INK_MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(
        label
      )}</td><td style="padding:3px 0;color:${INK_BLACK};font-weight:600;">${escapeHtml(
        value
      )}</td></tr>`;
    })
    .join("");
  return `<h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${RUSH_RED};">${escapeHtml(
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
  addOnLines: string[];
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
    line(
      "Heard about us via",
      Array.isArray(input.customer.heardAbout) && input.customer.heardAbout.length
        ? input.customer.heardAbout.join(", ")
        : "Not answered"
    ),
  ];

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:${SHIRT_BLANK};color:${INK_BLACK};">
  <div style="background:#ffffff;border:1px solid ${RULE};padding:24px;">
    <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:${RUSH_RED};font-weight:800;">New Quote Request</p>
    <h1 style="margin:6px 0 2px;font-size:26px;color:${GORILLA_GREEN};font-family:${SPEC_FONT};letter-spacing:.02em;">${escapeHtml(
      input.quoteNumber
    )}</h1>
    <p style="margin:0;color:${INK_MUTED};font-size:13px;font-family:${SPEC_FONT};">Submitted ${escapeHtml(
      input.submittedAt
    )}</p>
    ${htmlSection("Customer", customerLines)}
    ${htmlSection(input.detailsLabel, input.productLines)}
    ${htmlSection("Estimate", input.estimateLines)}
    <p style="margin:6px 0 0;font-size:12px;color:${INK_MUTED};">Estimate only. Final pricing reviewed by Gorilla Salem.</p>
    ${
      input.addOnLines.length
        ? htmlSection("Add-ons the customer asked for", input.addOnLines)
        : ""
    }
    ${htmlSection("Artwork", input.artworkLines)}
    ${htmlSection("Notes", [`_: ${input.notes}`]).replace("_", "")}
    <p style="margin:22px 0 0;padding-top:14px;border-top:1px solid ${RULE};font-size:13px;color:${INK_MUTED};">${
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
  /**
   * Everything to attach. The quote email carries up to two: the customer's
   * own artwork, and our rendered proof of the die-cut. `attachment` above is
   * the older single-file form and is folded in with these.
   */
  attachments?: (QuoteAttachment | null)[];
  attachmentInfo?: string;
}): Promise<QuoteEmailResult> {
  const provider = getEmailProvider();

  if (!provider) {
    return { sent: false, skipped: true };
  }

  const to = process.env.QUOTE_TO_EMAIL || "quote@gorillasalem.com";
  const { subject, text, html, replyTo } = buildQuoteEmail(input);

  const attachments = [
    ...(input.attachment ? [input.attachment] : []),
    ...(input.attachments ?? []),
  ].filter((item): item is QuoteAttachment => Boolean(item));

  try {
    if (provider === "gmail") {
      return await sendViaGmail({
        to,
        subject,
        text,
        html,
        replyTo,
        attachments,
      });
    }

    return await sendViaResend({
      to,
      subject,
      text,
      html,
      replyTo,
      attachments,
    });
  } catch (error) {
    return {
      sent: false,
      provider,
      error: error instanceof Error ? error.message : "Unknown email error.",
    };
  }
}

/**
 * Send a plain message to the shop through whichever provider is configured.
 *
 * sendQuoteEmail() above IS the quote pipeline — it builds a quote body and
 * its result feeds the "did this reach the shop" check. This is the bare
 * channel underneath, for notices that are explicitly NOT quotes. Kept as its
 * own entry point so a notice can never acquire a quote number, an
 * attachment, or anything downstream that reads as a submitted order.
 *
 * Same contract as sendQuoteEmail when nothing is configured: skipped, not
 * thrown. A notice failing to send must never take a request down with it.
 */
export async function sendShopEmail(input: {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /**
   * Override the destination. Defaults to the quote inbox, so a notice with
   * nowhere special to go still reaches a human rather than being dropped.
   */
  to?: string;
}): Promise<QuoteEmailResult> {
  const provider = getEmailProvider();

  if (!provider) {
    return { sent: false, skipped: true };
  }

  const { to: requestedTo, ...message } = input;
  const to =
    requestedTo?.trim() || process.env.QUOTE_TO_EMAIL || "quote@gorillasalem.com";

  try {
    const args: SendArgs = { to, ...message, attachments: [] };

    return provider === "gmail"
      ? await sendViaGmail(args)
      : await sendViaResend(args);
  } catch (error) {
    return {
      sent: false,
      provider,
      error: error instanceof Error ? error.message : "Unknown email error.",
    };
  }
}

/** Shared by the quote body and the plain notices above. */
export function escapeEmailHtml(value: string) {
  return escapeHtml(value);
}

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments: QuoteAttachment[];
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
      ...(args.attachments.length
        ? { attachments: args.attachments }
        : {}),
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
    ...(args.attachments.length
      ? {
          attachments: args.attachments.map((item) => ({
            filename: item.filename,
            content: item.content,
            encoding: "base64" as const,
          })),
        }
      : {}),
  });

  return { sent: true, provider: "gmail" };
}
