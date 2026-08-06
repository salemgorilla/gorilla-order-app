import { NextResponse } from "next/server";

import { MAX_ATTACHED_ARTWORK_BYTES } from "../../../lib/upload-limits";

import { sendQuoteEmail, type QuoteAttachment } from "../../../lib/email";
import {
  createPrintavoQuote,
  createStickerCheckout,
} from "../../../lib/printavo";

// Cap the artwork we attach to an email. Big print files (large AI/PDF/PNG)
// blow past mail-provider limits, so above this we skip the attachment and
// tell the shop to ask the customer for the file directly.
//
// NOTE: this is now the SECOND line of defense, not the first. Vercel kills
// any request body over ~4.4 MB at the edge before this route runs, so a file
// between 4.4 MB and 15 MB never arrives here at all — see lib/upload-limits.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

type ParsedQuoteRequest = {
  order: Record<string, unknown>;
  artworkAnalysis: Record<string, unknown> | null;
  artworkFile: File | null;
  oversizedArtwork: { name: string; size: number } | null;
  artworkBlob: { url: string; name: string; size: number } | null;
};

async function parseQuoteRequest(request: Request): Promise<ParsedQuoteRequest> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const orderRaw = form.get("order");
    const analysisRaw = form.get("artworkAnalysis");
    const file = form.get("artwork");

    const urlRaw = form.get("artworkUrl");
    const uploadedUrl = typeof urlRaw === "string" ? urlRaw : "";

    return {
      order:
        typeof orderRaw === "string" ? JSON.parse(orderRaw) : {},
      artworkAnalysis:
        typeof analysisRaw === "string" ? JSON.parse(analysisRaw) : null,
      artworkFile: file && typeof file !== "string" ? file : null,
      // The client deliberately withholds artwork above the platform body
      // limit, because sending it would get the whole request killed at the
      // edge and the order lost. It tells us the name and size instead so the
      // shop knows exactly which file to chase.
      oversizedArtwork:
        form.get("artworkTooLarge") === "true"
          ? {
              name: String(form.get("artworkFileName") || "artwork"),
              size: Number(form.get("artworkFileSize") || 0),
            }
          : null,
      // Artwork that went straight to blob storage. The file never passed
      // through here, so there is nothing to cap — only a URL to record.
      artworkBlob: uploadedUrl
        ? {
            url: uploadedUrl,
            name: String(form.get("artworkFileName") || "artwork"),
            size: Number(form.get("artworkFileSize") || 0),
          }
        : null,
    };
  }

  // Backward-compatible JSON path (no file).
  const body = await request.json();
  return {
    order: body.order ?? body,
    artworkAnalysis: body.artworkAnalysis ?? null,
    artworkFile: null,
    oversizedArtwork: null,
    artworkBlob: null,
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
    const { order, artworkAnalysis, artworkFile, oversizedArtwork, artworkBlob } =
      await parseQuoteRequest(request);

    const quoteNumber = generateQuoteNumber();
    const receivedAt = new Date().toISOString();

    const { attachment, info: builtAttachmentInfo } =
      await buildArtworkAttachment(artworkFile);

    // An oversized file never leaves the customer's browser, so there is
    // nothing to attach — but the shop still needs to know it exists and to
    // go collect it, or the job stalls waiting on art nobody asked for.
    let attachmentInfo = builtAttachmentInfo;

    if (artworkBlob) {
      // The file uploaded straight to storage, so there is no attachment to
      // build — the shop opens the link instead. This is the normal path once
      // a blob store is connected, at any size up to 100 MB.
      attachmentInfo = `Uploaded — ${artworkBlob.name} (${(
        artworkBlob.size /
        (1024 * 1024)
      ).toFixed(1)} MB): ${artworkBlob.url}`;
    } else if (oversizedArtwork) {
      // An oversized file never leaves the customer's browser, so there is
      // nothing to attach — but the shop still needs to know it exists and to
      // go collect it, or the job stalls waiting on art nobody asked for.
      attachmentInfo = `ARTWORK NOT UPLOADED — "${oversizedArtwork.name}" is ${(
        oversizedArtwork.size /
        (1024 * 1024)
      ).toFixed(1)} MB, over the ${(
        MAX_ATTACHED_ARTWORK_BYTES /
        (1024 * 1024)
      ).toFixed(1)} MB form limit. Email the customer to collect it.`;
    }

    const quoteRecord = {
      quoteNumber,
      receivedAt,
      status: "received",
      customer: order.customer,
      product: order.product,
      production: order.production,
      pricing: order.pricing,
      // Extra items the customer asked to add. They ride alongside pricing,
      // never inside it.
      addOns: Array.isArray(order.addOns) ? order.addOns : [],
      addOnsNote: order.addOnsNote ?? "",
      artworkAnalysis,
      artwork: {
        fileName:
          artworkBlob?.name ?? artworkFile?.name ?? oversizedArtwork?.name ?? null,
        fileSize:
          artworkBlob?.size ?? artworkFile?.size ?? oversizedArtwork?.size ?? null,
        url: artworkBlob?.url ?? null,
        attachment: attachmentInfo,
        awaitingArtwork: Boolean(oversizedArtwork),
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
      console.log(
        `QUOTE EMAIL SENT for ${quoteNumber} via ${notification.provider}`
      );
    } else if (notification.skipped) {
      console.log(
        `QUOTE EMAIL SKIPPED for ${quoteNumber} (set RESEND_API_KEY, or GMAIL_USER + GMAIL_APP_PASSWORD, in .env.local to enable).`
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

    // Stickers check out on their own. Every other flow still waits for the
    // shop, because only stickers are fully priced with nothing to review.
    const product = (order.product || {}) as Record<string, unknown>;
    const isStickers =
      !product.supplier &&
      !product.garmentType &&
      !product.signType &&
      !String(product.type || "")
        .toLowerCase()
        .includes("signs");

    let checkout = null;

    if (isStickers && printavo.created && printavo.quoteId) {
      checkout = await createStickerCheckout({
        quoteId: printavo.quoteId,
        publicUrl: printavo.publicUrl || "",
        customerEmail:
          String(
            (order.customer as Record<string, unknown> | undefined)?.email || ""
          ) || undefined,
      });

      console.log(
        checkout.ready
          ? `STICKER CHECKOUT READY for ${quoteNumber}: ${checkout.payUrl}`
          : `STICKER CHECKOUT UNAVAILABLE for ${quoteNumber}: ${checkout.error}`
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
      // null for signs/apparel — the confirmation screen falls back to
      // "we'll be in touch" whenever this is absent or not ready.
      checkout,
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
