import { NextResponse } from "next/server";

import { MAX_ATTACHED_ARTWORK_BYTES } from "../../../lib/upload-limits";
import { getShippingPrice, getStickerPrice } from "../../../lib/pricing";

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
  proofFile: File | null;
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

    const proofRaw = form.get("proof");

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
      // Our rendered proof of the die-cut, so the shop sees exactly what the
      // customer approved rather than having to imagine it from raw art.
      proofFile: proofRaw && typeof proofRaw !== "string" ? proofRaw : null,
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
    proofFile: null,
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

/** True for the sticker flow, which is the only one that self-checks-out. */
function isStickerOrder(order: Record<string, unknown>) {
  const product = (order.product || {}) as Record<string, unknown>;
  return (
    !product.supplier &&
    !product.garmentType &&
    !product.signType &&
    !String(product.type || "")
      .toLowerCase()
      .includes("signs")
  );
}

/**
 * Recompute a sticker total from its spec, server-side.
 *
 * Returns the order with server pricing substituted, plus what the browser
 * claimed, so a disagreement can be logged. Non-sticker flows pass straight
 * through: they are hand-quoted or priced by a different engine, and nothing
 * auto-bills them.
 */
function repriceStickers(order: Record<string, unknown>) {
  const clientPricing = (order.pricing || {}) as Record<string, unknown>;
  const clientTotal = Number(clientPricing.total) || 0;

  if (!isStickerOrder(order)) {
    return { order, mismatch: false, clientTotal, serverTotal: clientTotal };
  }

  const product = (order.product || {}) as Record<string, unknown>;
  const production = (order.production || {}) as Record<string, unknown>;

  const stickerPrice = getStickerPrice(
    Number(product.quantity) || 0,
    String(product.material || ""),
    String(product.finish || ""),
    String(product.size || ""),
    {
      widthInches: Number(product.widthInches) || 0,
      heightInches: Number(product.heightInches) || 0,
    }
  );

  const shippingPrice = getShippingPrice(
    String(production.deliveryMethod || "")
  );

  const serverTotal = Math.round((stickerPrice + shippingPrice) * 100) / 100;

  return {
    order: {
      ...order,
      pricing: {
        ...clientPricing,
        stickerPrice,
        shippingPrice,
        total: serverTotal,
      },
    },
    // Cents of float drift are not worth shouting about; real tampering is.
    mismatch: Math.abs(serverTotal - clientTotal) > 0.01,
    clientTotal,
    serverTotal,
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
    const {
      order,
      artworkAnalysis,
      artworkFile,
      oversizedArtwork,
      artworkBlob,
      proofFile,
    } = await parseQuoteRequest(request);

    const quoteNumber = generateQuoteNumber();
    const receivedAt = new Date().toISOString();

    // Reprice stickers on the SERVER before anything bills for them.
    //
    // order.pricing arrives from the browser, and for stickers this route
    // hands it to Printavo which auto-generates a payment link — no human
    // looks at it, because self-checkout is the point of that flow. Trusting
    // the client meant anyone with devtools could post a $2 total for a 1,000
    // sticker order and get a payment link for $2.
    //
    // lib/pricing.ts is pure and runs anywhere, so the same function the
    // customer was quoted from is the one that charges them. The browser's
    // number is kept only to log a disagreement.
    const priced = repriceStickers(order);

    if (priced.mismatch) {
      console.error(
        `PRICE MISMATCH on ${quoteNumber}: browser said $${priced.clientTotal}, server computed $${priced.serverTotal}. Charging the server figure.`
      );
    }

    // Everything downstream — the record, the email, Printavo, the payment
    // link — reads this, never the raw request.
    const pricedOrder = priced.order;

    const { attachment, info: builtAttachmentInfo } =
      await buildArtworkAttachment(artworkFile);

    // We render this ourselves at ~1000px, so it is small by construction and
    // needs no size gate the way customer artwork does.
    const proofAttachment = proofFile
      ? {
          filename: "gorilla-proof.png",
          content: Buffer.from(await proofFile.arrayBuffer()).toString("base64"),
        }
      : null;

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
      // Server figure, not the browser's — this record is what the shop and
      // Printavo work from.
      pricing: pricedOrder.pricing,
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
      order: pricedOrder,
      artworkAnalysis,
      // The customer's own file plus our proof of the cut, so the shop can
      // compare what was sent against what was approved.
      attachments: [attachment, proofAttachment],
      attachmentInfo: proofAttachment
        ? `${attachmentInfo} | Proof attached: gorilla-proof.png`
        : attachmentInfo,
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
      order: pricedOrder,
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
    const isStickers = isStickerOrder(pricedOrder);

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

    // Did this quote actually reach anyone?
    //
    // Both channels are best-effort and NEITHER throws — sendQuoteEmail
    // returns {sent:false} and createPrintavoQuote returns {created:false} on
    // failure. This route used to return 200 success regardless, so if Resend
    // was down and the Printavo token had expired, the customer got a green
    // checkmark and a quote number for an order that existed nowhere. The only
    // trace was a console.error in a function log nobody watches.
    //
    // An email that is SKIPPED (no provider configured) is not a delivery, so
    // it does not count here either.
    const reachedShop = Boolean(notification.sent) || Boolean(printavo.created);

    if (!reachedShop) {
      console.error(
        `QUOTE UNDELIVERED for ${quoteNumber} — email: ${
          notification.error || (notification.skipped ? "skipped" : "failed")
        }; printavo: ${printavo.error || "failed"}`
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "We could not deliver your request. Nothing was sent — please call the shop or email us directly.",
          quoteNumber,
          notification,
          printavo,
        },
        { status: 502 }
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
