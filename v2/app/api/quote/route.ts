import { NextResponse } from "next/server";

import { sendQuoteEmail, type QuoteAttachment } from "../../../lib/email";
import { createPrintavoQuote } from "../../../lib/printavo";

// Cap the artwork we attach to an email. Big print files (large AI/PDF/PNG)
// blow past mail-provider limits, so above this we skip the attachment and
// tell the shop to ask the customer for the file directly.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

type ParsedQuoteRequest = {
  order: Record<string, unknown>;
  artworkAnalysis: Record<string, unknown> | null;
  artworkFile: File | null;
};

async function parseQuoteRequest(request: Request): Promise<ParsedQuoteRequest> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const orderRaw = form.get("order");
    const analysisRaw = form.get("artworkAnalysis");
    const file = form.get("artwork");

    return {
      order:
        typeof orderRaw === "string" ? JSON.parse(orderRaw) : {},
      artworkAnalysis:
        typeof analysisRaw === "string" ? JSON.parse(analysisRaw) : null,
      artworkFile: file && typeof file !== "string" ? file : null,
    };
  }

  // Backward-compatible JSON path (no file).
  const body = await request.json();
  return {
    order: body.order ?? body,
    artworkAnalysis: body.artworkAnalysis ?? null,
    artworkFile: null,
  };
}

async function buildArtworkAttachment(
  file: File | null
): Promise<{ attachment: QuoteAttachment | null; info: string }> {
  if (!file) {
    return { attachment: null, info: "No file uploaded" };
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      attachment: null,
      info: `Too large to attach (${mb} MB) — ask the customer to email the file directly`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  return {
    attachment: {
      filename: file.name || "artwork",
      content: buffer.toString("base64"),
    },
    info: "Attached to this email",
  };
}

function generateQuoteNumber() {
  const now = new Date();

  const dateStamp = now
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  const randomCode = Math.random().toString(36).slice(2, 7).toUpperCase();

  return `GS-${dateStamp}-${randomCode}`;
}

export async function POST(request: Request) {
  try {
    const { order, artworkAnalysis, artworkFile } =
      await parseQuoteRequest(request);

    const quoteNumber = generateQuoteNumber();
    const receivedAt = new Date().toISOString();

    const { attachment, info: attachmentInfo } =
      await buildArtworkAttachment(artworkFile);

    const quoteRecord = {
      quoteNumber,
      receivedAt,
      status: "received",
      customer: order.customer,
      product: order.product,
      production: order.production,
      pricing: order.pricing,
      artworkAnalysis,
      artwork: {
        fileName: artworkFile?.name ?? null,
        fileSize: artworkFile?.size ?? null,
        attachment: attachmentInfo,
      },
      internalNotes: [
        "This quote was generated from the Gorilla Order app.",
        "The uploaded artwork is attached to the quote email when under 15 MB.",
        "Next step: also store the quote + artwork in a database or Sheet for a searchable record.",
      ],
    };

    console.log("GORILLA SALEM QUOTE REQUEST");
    console.log(JSON.stringify(quoteRecord, null, 2));

    // Email the quote to the shop (best-effort — never blocks the customer).
    const notification = await sendQuoteEmail({
      quoteNumber,
      receivedAt,
      order,
      artworkAnalysis,
      attachment,
      attachmentInfo,
    });

    if (notification.sent) {
      console.log(`QUOTE EMAIL SENT for ${quoteNumber}`);
    } else if (notification.skipped) {
      console.log(
        `QUOTE EMAIL SKIPPED for ${quoteNumber} (set RESEND_API_KEY in .env.local to enable).`
      );
    } else {
      console.error(
        `QUOTE EMAIL FAILED for ${quoteNumber}: ${notification.error}`
      );
    }

    // Push into Printavo as a draft/unconfirmed quote (best-effort too).
    const printavo = await createPrintavoQuote({
      quoteNumber,
      order,
      artworkAnalysis,
      attachmentInfo,
    });

    if (printavo.created) {
      console.log(
        `PRINTAVO QUOTE CREATED for ${quoteNumber}: ${printavo.publicUrl || printavo.quoteId}`
      );
    } else if (printavo.skipped) {
      console.log(
        `PRINTAVO SKIPPED for ${quoteNumber} (set PRINTAVO_EMAIL / PRINTAVO_TOKEN / PRINTAVO_CUSTOMER_ID in .env.local to enable).`
      );
    } else {
      console.error(
        `PRINTAVO FAILED for ${quoteNumber}: ${printavo.error}`
      );
    }

    return NextResponse.json({
      success: true,
      message: "Quote received by Gorilla Salem.",
      quoteNumber,
      receivedAt,
      quote: quoteRecord,
      notification,
      printavo,
    });
  } catch (error) {
    console.error("QUOTE API ERROR");
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to receive quote request.",
      },
      { status: 500 }
    );
  }
}
