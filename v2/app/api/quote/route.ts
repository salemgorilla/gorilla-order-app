import { NextResponse } from "next/server";

import { MAX_ATTACHED_ARTWORK_BYTES } from "../../../lib/upload-limits";
import {
  isStickerOrder,
  repriceStickers,
} from "../../../lib/sticker-repricing";

import {
  sendCustomerEmail,
  sendQuoteEmail,
  type ArtworkDeliveryEntry,
  type QuoteAttachment,
} from "../../../lib/email";
import { getDesignNumbers } from "../../../lib/attachment-plan";
import { buildOrderConfirmation } from "../../../lib/order-confirmation";
import { reorderUrl } from "../../../lib/reorder";
import { describeRepricing } from "../../../lib/repricing-note";
import { repriceSigns } from "../../../lib/signs-repricing";
import {
  isSpecialOrder,
  decideSignsAutoBill,
  decideStickersAutoBill,
  isSignsOrder,
  shopPaymentNote,
} from "../../../lib/auto-bill";
import { getEmailError } from "../../../lib/validation";
import { describeSubmission } from "../../../lib/submission-log";
import { earliestNeedBy, turnaroundLaneFor } from "../../../lib/turnaround";
import { subscribeToNewsletter } from "../../../lib/newsletter";
import { describeKioskSource, readKioskSession } from "../../../lib/kiosk";
import {
  createPrintavoQuote,
  createCheckout,
} from "../../../lib/printavo";

// Cap the artwork we attach to an email. Big print files (large AI/PDF/PNG)
// blow past mail-provider limits, so above this we skip the attachment and
// tell the shop to ask the customer for the file directly.
//
// NOTE: this is now the SECOND line of defense, not the first. Vercel kills
// any request body over ~4.4 MB at the edge before this route runs, so a file
// between 4.4 MB and 15 MB never arrives here at all — see lib/upload-limits.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Ceiling for ALL artwork attached to one quote email.
 *
 * Per-file was sufficient while a quote carried one file. A cart can carry
 * several that each clear the per-file cap and together produce an email no
 * provider will accept — which fails the notification, which is how the shop
 * finds out an order exists.
 */
const MAX_EMAIL_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * One design's artwork, however it travelled.
 *
 * `id` is the design it belongs to ("order" for the single-file signs and
 * apparel flows). Exactly one of file/blob/dropped is meaningful.
 */
type ArtworkPart = {
  id: string;
  file: File | null;
  blob: { url: string; name: string; size: number } | null;
  dropped: { name: string; size: number } | null;
  /** Why the browser's direct-to-blob upload failed, when it did. */
  uploadFailure: string | null;
};

type ParsedQuoteRequest = {
  order: Record<string, unknown>;
  artworkAnalysis: Record<string, unknown> | null;
  /** Every design's artwork, keyed by design id. */
  artworkParts: ArtworkPart[];
  /** Background-removed copies, keyed by design id. Original always sent too. */
  knockoutParts: { id: string; file: File }[];
  /** Our rendered proof for each design, keyed by design id. */
  proofParts: { id: string; file: File }[];
  /** True when the browser had proofs it could not fit in the request body. */
  proofsDropped: boolean;
};

/** Read `prefix:designId` form keys into a map of designId -> value. */
function collectKeyed(form: FormData, prefix: string) {
  const found = new Map<string, FormDataEntryValue>();

  for (const [key, value] of form.entries()) {
    if (key.startsWith(prefix)) {
      found.set(key.slice(prefix.length), value);
    }
  }

  return found;
}

async function parseQuoteRequest(request: Request): Promise<ParsedQuoteRequest> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const orderRaw = form.get("order");
    const analysisRaw = form.get("artworkAnalysis");
    const proofRaw = form.get("proof");

    // Parts arrive keyed by design id, never on a shared "artwork" key.
    // form.getAll() on a shared key gives an array whose indices shift the
    // moment one design has no file, quietly pairing every later file with the
    // wrong design — the exact bug CART-PLAN calls out.
    const inlineFiles = collectKeyed(form, "artwork:");
    // Artwork with its background knocked out in the browser, when the
    // customer ticked the box. Rides alongside the original, never instead
    // of it — see lib/background-removal.ts.
    const knockouts = collectKeyed(form, "knockout:");
    const blobUrls = collectKeyed(form, "artworkUrl:");
    const blobNames = collectKeyed(form, "artworkName:");
    const blobSizes = collectKeyed(form, "artworkSize:");

    // Files the client deliberately withheld: sending them would have blown
    // the platform body limit and killed the whole request at the edge,
    // losing the ORDER rather than one attachment.
    let dropped: { id: string; name: string; size: number }[] = [];
    const droppedRaw = form.get("artworkDropped");

    if (typeof droppedRaw === "string") {
      try {
        const parsed = JSON.parse(droppedRaw);
        if (Array.isArray(parsed)) dropped = parsed;
      } catch {
        // A malformed list is not worth failing a quote over.
      }
    }

    // Why the browser's direct-to-blob upload failed, when it did. Logged
    // HERE because the client's own record of it dies with the tab: the
    // 25 Aug drop (a 10.6 MB apparel file, quote submitted, customer never
    // told) was unattributable by the time anyone looked, since the only
    // trace was a console.warn in a closed browser. A server log line makes
    // the next one a fact instead of a theory — and countable.
    let uploadFailures: { id: string; name: string; reason: string }[] = [];
    const failuresRaw = form.get("artworkUploadFailures");

    if (typeof failuresRaw === "string") {
      try {
        const parsed = JSON.parse(failuresRaw);
        if (Array.isArray(parsed)) uploadFailures = parsed.slice(0, 20);
      } catch {
        // Same rule as above.
      }
    }

    for (const failure of uploadFailures) {
      console.error(
        `ARTWORK DIRECT UPLOAD FAILED in the customer's browser: "${String(
          failure.name
        ).slice(0, 120)}" — ${String(failure.reason).slice(0, 300)}`
      );
    }

    const ids = new Set<string>([
      ...inlineFiles.keys(),
      ...blobUrls.keys(),
      ...dropped.map((entry) => entry.id),
    ]);

    const artworkParts: ArtworkPart[] = [...ids].map((id) => {
      const file = inlineFiles.get(id);
      const url = blobUrls.get(id);
      const droppedEntry = dropped.find((entry) => entry.id === id);

      return {
        id,
        file: file && typeof file !== "string" ? file : null,
        blob:
          typeof url === "string" && url
            ? {
                url,
                name: String(blobNames.get(id) || "artwork"),
                size: Number(blobSizes.get(id) || 0),
              }
            : null,
        dropped: droppedEntry
          ? { name: droppedEntry.name, size: droppedEntry.size }
          : null,
        uploadFailure:
          uploadFailures.find((failure) => failure.id === id)?.reason ?? null,
      };
    });

    // Our rendered proof of the die-cut, so the shop sees exactly what the
    // customer approved rather than having to imagine it from raw art. Keyed
    // by design, like the artwork — a cart has one per design.
    const keyedProofs = collectKeyed(form, "proof:");
    const proofParts = [...keyedProofs.entries()]
      .filter(([, value]) => typeof value !== "string")
      .map(([id, value]) => ({ id, file: value as File }));

    // The single unkeyed part the pre-cart client sent. Nothing ships it now,
    // but accepting it costs three lines and means an older tab left open
    // still delivers its proof.
    if (!proofParts.length && proofRaw && typeof proofRaw !== "string") {
      proofParts.push({ id: "order", file: proofRaw });
    }

    return {
      order: typeof orderRaw === "string" ? JSON.parse(orderRaw) : {},
      artworkAnalysis:
        typeof analysisRaw === "string" ? JSON.parse(analysisRaw) : null,
      artworkParts,
      knockoutParts: [...knockouts.entries()]
        .filter(([, value]) => typeof value !== "string")
        .map(([id, value]) => ({ id, file: value as File })),
      proofParts,
      proofsDropped: form.get("proofsDropped") === "true",
    };
  }

  // Backward-compatible JSON path (no file).
  const body = await request.json();
  return {
    order: body.order ?? body,
    artworkAnalysis: body.artworkAnalysis ?? null,
    artworkParts: [],
    knockoutParts: [],
    proofParts: [],
    proofsDropped: false,
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
    const {
      order,
      artworkAnalysis,
      artworkParts,
      knockoutParts,
      proofParts,
      proofsDropped,
    } =
      await parseQuoteRequest(request);

    /**
     * An order nobody can be reached about is not an order.
     *
     * Same argument as repriceStickers below: the browser validates this, and
     * the browser is not the authority. This endpoint is public, and an
     * address that cannot receive mail poisons everything downstream — it
     * becomes the Printavo contact, the recipient of a live payment link, and
     * half of the /track lookup. Worse, when the address is missing entirely
     * the payment request falls back to whatever contact Printavo has on the
     * quote, which for an unmatched customer is the shop's own fallback
     * contact: a payable link for someone else's order, delivered to us.
     *
     * Refused rather than accepted-and-flagged, unlike the unpriceable case
     * further down. There the shop can still price the job by hand and ring
     * the customer; here there is nobody to ring.
     *
     * Same predicate the form uses, so the two layers cannot disagree.
     */
    const emailError = getEmailError(
      String(
        (order.customer as Record<string, unknown> | undefined)?.email ?? ""
      )
    );

    if (emailError) {
      return NextResponse.json(
        { success: false, message: emailError },
        { status: 400 }
      );
    }

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

    /**
     * Signs and banners get the same treatment, one line later. They never
     * raise a payment link, but their figures land as Printavo LINE ITEMS on
     * the quote the shop invoices from — and "the shop reviews it by hand"
     * reads the very numbers the browser sent, so a tampered payload does
     * not look tampered, it looks priced. The two reprices are mutually
     * exclusive by flow; each passes the other's orders through untouched.
     * See lib/signs-repricing.ts for why it re-synthesises rather than
     * patches.
     */
    const signsPriced = repriceSigns(priced.order);

    /** Whichever flow actually recomputed this order's money. */
    const priceCheck = signsPriced.repriced ? signsPriced : priced;

    /**
     * The disagreement itself, kept rather than only logged.
     *
     * The console line below stays — it is what a deployment-wide problem
     * shows up as. But a console.error in a serverless function log is
     * something nobody watches, and this is the one signal that a submitted
     * price did not match the priced one. The shop reads the quote email for
     * every order, so it goes there too. See lib/repricing-note.ts.
     */
    const repricing = describeRepricing(priceCheck);

    if (priceCheck.mismatch) {
      console.error(
        `PRICE MISMATCH on ${quoteNumber}: browser said $${priceCheck.clientTotal}, server computed $${priceCheck.serverTotal}. Charging the server figure.`
      );
    }

    // Everything downstream — the record, the email, Printavo, the payment
    // link — reads this, never the raw request.
    const pricedOrder = signsPriced.order;

    // Null for an ordinary web quote. Non-null means the order was taken on
    // the shop's own terminal, which changes how it is paid for.
    const kioskSession = readKioskSession(order);

    // We render these ourselves at ~1000px, and the browser already budgeted
    // them against the request body, so they need no size gate the way
    // customer artwork does.
    const proofAttachments = await Promise.all(
      proofParts.map(async (part) => ({
        designId: part.id,
        filename: part.file.name || "gorilla-proof.png",
        content: Buffer.from(await part.file.arrayBuffer()).toString("base64"),
      }))
    );

    // Background-removed copies. The browser already checked these against the
    // same inline budget as the artwork, so they need no second gate here.
    const knockoutAttachments = await Promise.all(
      knockoutParts.map(async (part) => ({
        designId: part.id,
        filename: part.file.name || "artwork-no-background.png",
        content: Buffer.from(await part.file.arrayBuffer()).toString("base64"),
      }))
    );

    /**
     * Artwork, per design.
     *
     * `buildArtworkAttachment` returned ONE {attachment, info}, and that single
     * info string was the only artwork-delivery status anywhere — it reached
     * the email, Printavo and the API response. With a cart it has to become
     * one status per design, or a shop reading "Attached to this email" has no
     * idea which of three files that refers to.
     *
     * Printavo receives no bytes, so this email is the ONLY place the
     * file-to-design mapping can exist. Getting it wrong means the shop prints
     * the wrong art.
     */
    const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

    const attachments: QuoteAttachment[] = [];
    /**
     * One delivery status per design, structured rather than pre-joined.
     *
     * It used to be a list of "Design 1: ..." strings joined with newlines and
     * handed to the email as a single value. The email renders those as one
     * table row, and HTML collapses the newlines — so three designs' statuses
     * arrived as one run-on sentence, which is useless as a file-to-design map.
     * The email now renders a block per design and needs the design id to do
     * it; the joined string below is what Printavo and the API response take.
     */
    /**
     * Typed from lib/email's own definition rather than restated here. The
     * inline copy that used to sit in this spot is why the entry could gain
     * fields at one end and not the other.
     */
    const artworkDelivery: ArtworkDeliveryEntry[] = [];
    let emailBytesUsed = 0;

    /**
     * Design order, so the labels below match the order in the quote.
     *
     * A SIGNS quote carries its designs in `signsDesigns`, not in `items` —
     * `items` is the sticker cart and still holds the untouched default one
     * even on a signs order. Ordering by it therefore matched none of the
     * signs design ids and dropped every signs attachment from the list, so
     * this has to ask the right cart which cart it is.
     */
    const signsDesignList = Array.isArray(
      (order as Record<string, unknown>).signsDesigns
    )
      ? ((order as Record<string, unknown>).signsDesigns as Record<
          string,
          unknown
        >[])
      : [];

    const orderedItems = signsDesignList.length
      ? signsDesignList
      : Array.isArray(order.items)
      ? (order.items as Record<string, unknown>[])
      : [];

    const partOrder = orderedItems.length
      ? orderedItems
          .map((item) =>
            artworkParts.find((part) => part.id === String(item.id))
          )
          .filter((part): part is (typeof artworkParts)[number] => Boolean(part))
      : artworkParts;

    /**
     * A design's number in the CART, not its position in this list.
     *
     * partOrder holds only the designs that actually sent a file, so counting
     * it numbers the FILES. On an order whose middle design has no artwork,
     * design 3's file was labelled "Design 2" and attached as
     * design-2-<name>.png — so the shop's file-to-design map pointed design
     * 3's art at design 2. Exactly the misalignment CART-PLAN calls out, just
     * moved from the payload into the labels. Number by cart position, which
     * is what the customer and the email both count from.
     *
     * Calls getDesignNumbers rather than rebuilding it. It was imported here
     * and never used — the rule was extracted so it could be tested, six
     * tests were written against it, and this line went on computing its own
     * copy. The two agreed, so nothing was wrong; the safety net was simply
     * attached to nothing, which is the failure the extraction was meant to
     * prevent.
     */
    const designNumber = getDesignNumbers(
      orderedItems.map((item) => String(item.id))
    );

    for (const [index, part] of partOrder.entries()) {
      const number = designNumber.get(part.id) ?? index + 1;
      const label =
        partOrder.length > 1 || part.id !== "order"
          ? `Design ${number}`
          : "Artwork";

      if (part.blob) {
        // Straight to storage, so there is nothing to attach — the shop opens
        // the link. The normal path once a blob store is connected, up to 100 MB.
        artworkDelivery.push({
          designId: part.id,
          label,
          status: `uploaded — ${part.blob.name} (${mb(part.blob.size)} MB): ${
            part.blob.url
          }`,
          // The same facts, structured, so Printavo can list the links under
          // an honest heading and a reorder can parse them. `number` comes
          // from the designNumber Map — the cart position, never this loop's
          // index; see the note where the Map is built.
          design: number,
          fileName: part.blob.name,
          url: part.blob.url,
        });
        continue;
      }

      if (part.dropped) {
        // Never left the customer's browser, because sending it would have
        // killed the whole request at the edge and lost the order. The shop
        // still has to know it exists and go and collect it — and since the
        // direct-to-storage path exists precisely for files this size, the
        // email now also says WHY that path failed, so a pattern (an outage,
        // a broken deploy, one customer's network) is visible from the
        // inbox instead of needing logs that expire.
        artworkDelivery.push({
          designId: part.id,
          label,
          status: `ARTWORK NOT UPLOADED — "${part.dropped.name}" is ${mb(
            part.dropped.size
          )} MB, over the ${mb(
            MAX_ATTACHED_ARTWORK_BYTES
          )} MB form limit. The customer was told on their confirmation screen to email it in; if it doesn't arrive, chase it.${
            part.uploadFailure
              ? ` (Direct upload failed first: ${part.uploadFailure})`
              : ""
          }`,
        });
        continue;
      }

      const { attachment, info } = await buildArtworkAttachment(part.file);

      // Per-file was enough with one file; a cart also needs a running total,
      // or three files that each pass the per-file cap can still produce an
      // email no provider will accept.
      if (
        attachment &&
        emailBytesUsed + (part.file?.size ?? 0) > MAX_EMAIL_ATTACHMENT_TOTAL_BYTES
      ) {
        artworkDelivery.push({
          designId: part.id,
          label,
          status: `not attached — "${part.file?.name}" would push this email over ${mb(
            MAX_EMAIL_ATTACHMENT_TOTAL_BYTES
          )} MB. Ask the customer for it.`,
        });
        continue;
      }

      if (attachment) {
        // Prefixed so three files called "logo.png" arrive distinguishable,
        // and numbered by cart position so the prefix agrees with the block
        // the email files it under.
        const filename =
          partOrder.length > 1
            ? `design-${number}-${attachment.filename}`
            : attachment.filename;

        attachments.push({ ...attachment, filename });
        emailBytesUsed += part.file?.size ?? 0;

        // Name the attachment the shop will actually see in its mail client.
        // "Attached to this email" is not a map when three files are attached;
        // the renamed filename is the only thing tying a file to a design.
        artworkDelivery.push({
          designId: part.id,
          label,
          status: `attached to this email as ${filename}`,
        });
        continue;
      }

      artworkDelivery.push({ designId: part.id, label, status: info });
    }

    const attachmentInfo = artworkDelivery.length
      ? artworkDelivery
          .map((entry) => `${entry.label}: ${entry.status}`)
          .join("\n")
      : "No file uploaded";

    /**
     * The permanent artwork links, for the Printavo record.
     *
     * Only the designs that actually went to storage have one. A design
     * attached to the email has no URL and must not appear here — "we mailed
     * you the file" and "here is a link to the file" are different promises,
     * and the old single string made them look the same.
     */
    const artworkLinks = artworkDelivery
      .filter((entry) => entry.url)
      .map((entry) => ({
        design: entry.design ?? 0,
        name: entry.fileName ?? "artwork",
        url: entry.url as string,
      }));

    const quoteRecord = {
      quoteNumber,
      receivedAt,
      status: "received",
      customer: order.customer,
      // Where the order was taken. A quote written up at the counter and one
      // submitted from the website are different things to follow up on.
      source: describeKioskSource(kioskSession) ?? "labs.gorillasalem.com",
      kiosk: kioskSession,
      product: order.product,
      // The cart, each design carrying the price the server put on it. The
      // record is the log of what the shop and Printavo work from, and it was
      // omitting the only field that says what was actually ordered.
      items: Array.isArray(pricedOrder.items) ? pricedOrder.items : [],
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
        // First design's file, kept so anything already reading these keys
        // still finds something sensible. `files` below is the real record.
        fileName:
          partOrder[0]?.blob?.name ??
          partOrder[0]?.file?.name ??
          partOrder[0]?.dropped?.name ??
          null,
        fileSize:
          partOrder[0]?.blob?.size ??
          partOrder[0]?.file?.size ??
          partOrder[0]?.dropped?.size ??
          null,
        url: partOrder[0]?.blob?.url ?? null,
        attachment: attachmentInfo,
        awaitingArtwork: partOrder.some((part) => part.dropped),
        /**
         * Our rendered proofs, by design. Part of the record because "what did
         * the shop actually receive" has to be answerable from the log alone.
         */
        proofs: proofAttachments.map((proof) => ({
          designId: proof.designId,
          filename: proof.filename,
        })),
        proofsDropped,
        /** One entry per design that sent a file, numbered by cart position. */
        files: partOrder.map((part, index) => ({
          design: designNumber.get(part.id) ?? index + 1,
          designId: part.id,
          name: part.blob?.name ?? part.file?.name ?? part.dropped?.name ?? null,
          size: part.blob?.size ?? part.file?.size ?? part.dropped?.size ?? null,
          url: part.blob?.url ?? null,
          awaitingArtwork: Boolean(part.dropped),
        })),
      },
      internalNotes: [
        "This quote was generated from the Gorilla Order app.",
        "Artwork goes to blob storage and its permanent link lands in the Printavo customer note, under ARTWORK FILES. Files small enough are attached to the quote email as well.",
        // Was "Next step: also store the quote + artwork in a database or
        // Sheet for a searchable record." That next step is already taken and
        // has been for a while: the quote number, the customer, the spec and
        // the artwork link are all on the Printavo quote, which is searchable
        // and is what the shop already works from. Leaving the line in invited
        // somebody to build a second record nobody needs.
        "Printavo IS that searchable record. No database or Sheet is needed.",
      ],
    };

    console.log("GORILLA SALEM QUOTE REQUEST");
    console.log(JSON.stringify(quoteRecord, null, 2));

    /**
     * Whether this order may bill — decided HERE, above the shop email, so
     * that email can say which orders the shop still has to invoice by hand.
     *
     * `printavoCreated: true` is not a claim that Printavo answered; it has
     * not been called yet. It says "nothing about the ORDER stops this", and
     * the real Printavo result is ANDed in at the checkout call below. Passing
     * true here cannot raise a link on its own — the only thing that raises
     * one is the condition further down, which requires a real quote id.
     *
     * One decision, read by two surfaces. The shop email and the payment link
     * cannot disagree about whether an order was charged, which is the
     * "several surfaces, two answers" failure this repo keeps paying for.
     */
    // Stickers check out on their own, and since 7 Sep so do signs and
    // banners — Gabe: "All 3 should be instant price - pay online". Apparel
    // still waits for the shop: its garment prices come from a supplier
    // catalogue that can be stale or out of stock, so there IS something to
    // review before a card is taken.
    //
    // Two gates, deliberately not one. Stickers are classified by
    // isStickerOrder() because that ALSO decides what gets repriced against
    // the sticker table; signs are decided by lib/auto-bill.ts against their
    // own reprice. Widening the sticker gate to cover signs would auto-bill
    // them at sticker prices, which is the worse bug. What the two DO share
    // is the money rule: one FULL_PAYMENT_CEILING and one DEPOSIT_FRACTION,
    // read by both decisions, so an order over $4,999.99 is asked for half
    // whichever of the two flows it came through.
    const signsAutoBill = decideSignsAutoBill({
      order: pricedOrder,
      // The server's own recompute, never the browser's claim. `repriced` is
      // false when the payload carried no spec to rebuild from, and that
      // alone withholds the link — see lib/auto-bill.ts.
      repriced: signsPriced.repriced,
      unpriceable: signsPriced.unpriceable,
      serverTotal: signsPriced.serverTotal,
      kioskSession: Boolean(kioskSession),
      printavoCreated: true,
    });

    const isStickers = isStickerOrder(pricedOrder);

    const stickersAutoBill = decideStickersAutoBill({
      order: pricedOrder,
      // repriceStickers() never passes a sticker order through, so this is
      // always the server's own figure — the one the link is raised for.
      unpriceable: priced.unpriceable,
      serverTotal: priced.serverTotal,
      kioskSession: Boolean(kioskSession),
      printavoCreated: true,
    });

    // Email the quote to the shop (best-effort — never blocks the customer).
    const notification = await sendQuoteEmail({
      quoteNumber,
      receivedAt,
      order: pricedOrder,
      artworkAnalysis,
      // Null on the overwhelming majority of orders, where the two agreed.
      repricing,
      // "Charged automatically", or why not and what to do about it.
      paymentNote: shopPaymentNote({
        order: pricedOrder,
        signs: signsAutoBill,
        stickers: stickersAutoBill,
      }),
      // Every design's file plus our proof of each cut, so the shop can
      // compare what was sent against what was approved — design by design.
      attachments: [
        ...attachments,
        ...knockoutAttachments.map(({ filename, content }) => ({
          filename,
          content,
        })),
        ...proofAttachments.map(({ filename, content }) => ({
          filename,
          content,
        })),
      ],
      attachmentInfo: proofAttachments.length
        ? `${attachmentInfo}\nProofs attached: ${proofAttachments
            .map((proof) => proof.filename)
            .join(", ")}`
        : attachmentInfo,
      // Per-design, so the email can put each status under the design it
      // belongs to instead of in one shared row.
      artworkDelivery,
      kiosk: kioskSession,
      proofs: proofAttachments.map(({ designId, filename }) => ({
        designId,
        filename,
      })),
      knockouts: knockoutAttachments.map(({ designId, filename }) => ({
        designId,
        filename,
      })),
      proofsDropped,
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
      artworkLinks,
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

    // The Printavo half of both gates: there has to be something to bill
    // against. Kept out of decideSignsAutoBill's early call above, which
    // answers the ORDER-level question before Printavo has been reached.
    const printavoReady = Boolean(printavo.created && printavo.quoteId);

    // Every signs order that does NOT bill says why, once, in the log. A sign
    // that quietly stops self-checking-out is otherwise invisible until a
    // customer asks where their payment link went. Printavo failing is
    // reported one branch up, so it is named here rather than repeated.
    if (isSignsOrder(pricedOrder) && !(signsAutoBill.bill && printavoReady)) {
      console.log(
        `SIGNS ORDER ${quoteNumber} — no payment link: ${
          signsAutoBill.bill ? "the quote never reached Printavo" : signsAutoBill.reason
        }.`
      );
    }

    // The same line for stickers, now that they too can be refused by the
    // ceiling. The kiosk and unpriceable cases below keep their own, more
    // specific lines as well — this one exists so that NO sticker order can
    // fail to bill without the reason being in the log.
    if (isStickers && !(stickersAutoBill.bill && printavoReady)) {
      console.log(
        `STICKER ORDER ${quoteNumber} — no payment link: ${
          stickersAutoBill.bill ? "the quote never reached Printavo" : stickersAutoBill.reason
        }.`
      );
    }

    let checkout = null;

    /**
     * A kiosk order is never emailed a payment link.
     *
     * The customer is standing at the counter, so payment is taken there on
     * the shop's own terminal. Two reasons this is the right default, and the
     * second is the serious one:
     *
     *   1. Emailing a link to somebody in the room is worse than useless.
     *   2. The address was typed on a shared machine, often by a member of
     *      staff hearing it out loud. One transposed character sends a live,
     *      payable link for someone else's order to a stranger.
     *
     * Decided HERE, on the server, next to the call it suppresses — not in
     * the browser that asked. The client marker is only an input to it.
     */
    if (kioskSession && isStickers) {
      console.log(
        `KIOSK ORDER ${quoteNumber} — no payment link generated; payment is taken at the counter.`
      );
    }

    /**
     * Same rule, second reason: nothing auto-bills at a price nobody set.
     *
     * repriceStickers could not put a number on at least one design, so its
     * material came out at $0 and the total is the setup fee alone. The quote,
     * the email and the Printavo record all still go out — the shop prices it
     * by hand, exactly as it does for signs — and only the payment link is
     * withheld. Logged as an error rather than a note: it means a submission
     * reached the server with no dimensions, which the browser should have
     * refused, so something upstream is wrong as well.
     */
    if (priced.unpriceable && isStickers) {
      console.error(
        `UNPRICEABLE STICKER ORDER ${quoteNumber} — a design has no usable size, so material priced at $0. No payment link generated; price this one by hand.`
      );
    }

    // Both decisions were made above the shop email, with Printavo assumed;
    // the real Printavo result is ANDed in here, once, for both. An order
    // over the ceiling DOES reach this call — it bills a deposit rather than
    // being refused — so the flag below is what makes the difference.
    if (printavoReady && (stickersAutoBill.bill || signsAutoBill.bill)) {
      checkout = await createCheckout({
        quoteId: printavo.quoteId as string,
        publicUrl: printavo.publicUrl || "",
        flow: signsAutoBill.bill ? "signs" : "stickers",
        // Over the full-payment ceiling the customer is asked for half now
        // and the balance before the job leaves the shop (Gabe, 2026-09-07).
        // Read off whichever gate said yes, so the email, the link and the
        // shop's copy cannot disagree about which it is.
        deposit: signsAutoBill.bill
          ? signsAutoBill.deposit
          : stickersAutoBill.deposit,
        // Shipped signs pay for the goods now and settle delivery before the
        // order leaves the shop. The email has to say so.
        shipped:
          String(
            (order.production as Record<string, unknown> | undefined)
              ?.deliveryMethod || ""
          ) === "Ship",
        // Carries the tracking link in the payment email. This is the same
        // string lookupOrderStatus matches against the Printavo nickname.
        quoteNumber,
        customerEmail:
          String(
            (order.customer as Record<string, unknown> | undefined)?.email || ""
          ) || undefined,
      });

      const label = signsAutoBill.bill ? "SIGNS" : "STICKER";

      console.log(
        checkout.ready
          ? `${label} CHECKOUT READY for ${quoteNumber}: ${checkout.payUrl}`
          : `${label} CHECKOUT UNAVAILABLE for ${quoteNumber}: ${checkout.error}`
      );
    }

    // Newsletter sign-up, if they left the box ticked.
    //
    // Fired here rather than from the browser so a customer closing the tab
    // cannot lose it, and deliberately NOT awaited into anything that decides
    // the response. subscribeToNewsletter never throws; the worst case is one
    // lost subscriber and a line in the log. A marketing list must not be able
    // to affect what someone is told about an order they just paid for.
    const customerRecord = (order.customer || {}) as Record<string, unknown>;
    const optedIn = customerRecord.newsletterOptIn === true;

    const newsletter = optedIn
      ? await subscribeToNewsletter({
          email: String(customerRecord.email || ""),
          name: String(customerRecord.customerName || ""),
          company: String(customerRecord.company || ""),
          phone: String(customerRecord.phone || ""),
          heardAbout: Array.isArray(customerRecord.heardAbout)
            ? (customerRecord.heardAbout as string[])
            : [],
          quoteNumber,
          // Stamped server-side at submit. A timestamp the browser supplied
          // would be worth nothing as a consent record.
          consent: {
            optedIn: true,
            at: receivedAt,
            source:
              describeKioskSource(kioskSession) ??
              "labs.gorillasalem.com quote builder",
            // The box arrives ticked, so every record has to say so. This is
            // the field that answers "did they choose this, or did we?" —
            // which is the first question an ESP asks about a flagged list.
            preChecked: true,
          },
        })
      : { sent: false as const, skipped: true as const, reason: "Not opted in." };

    if (!newsletter.sent) {
      console.log(
        `NEWSLETTER NOT SENT for ${quoteNumber}: ${
          "reason" in newsletter ? newsletter.reason : newsletter.error
        }`
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

    /**
     * ONE GREP-ABLE LINE PER SUBMISSION.
     *
     * Everything above logs richly and inconsistently — a whole quote
     * record, a sentence per refusal, a line per email. None of it can be
     * counted. This can: same fields, same order, every time, no PII. See
     * lib/submission-log.ts for the four questions it exists to answer and
     * for why `atFloor` is a proxy rather than a measurement.
     *
     * Emitted HERE — after every decision is made and the delivery attempt
     * has come back, but BEFORE the undelivered gate below returns 502. The
     * first draft sat beside the success response and never fired for a
     * failed delivery, which is the submission worth counting most.
     */
    console.log(
      describeSubmission({
        quoteNumber,
        flow: isStickers
          ? "stickers"
          : isSignsOrder(pricedOrder)
          ? String(
              (pricedOrder.product as Record<string, unknown> | undefined)
                ?.family || "signs"
            )
          : "apparel",
        // The escape reaches the payload the same way in both flows —
        // product.specialOrder, read positively (lib/auto-bill.ts).
        door: isSpecialOrder(pricedOrder) ? "special" : "priced",
        quantity: Number(
          (pricedOrder.product as Record<string, unknown> | undefined)
            ?.quantity || 0
        ),
        // The SERVER's figure for the flows that reprice; the payload's for
        // apparel, which is an estimate the shop confirms either way.
        total: Number(
          (pricedOrder.pricing as Record<string, unknown> | undefined)
            ?.total || 0
        ),
        needBy: String(
          (order.production as Record<string, unknown> | undefined)?.needBy || ""
        ),
        earliest: earliestNeedBy(
          turnaroundLaneFor({
            isApparel: !isStickers && !isSignsOrder(pricedOrder),
            isSigns: isSignsOrder(pricedOrder),
            signsFamily:
              String(
                (pricedOrder.product as Record<string, unknown> | undefined)
                  ?.family || "signs"
              ) === "banners"
                ? "banners"
                : "signs",
            isKiosk: Boolean(kioskSession),
          })
        ),
        /**
         * How the artwork actually travelled, read off the parts the route
         * already holds rather than off the parser's internals.
         *
         * "dropped" wins over "form": a submission where anything was left
         * behind is the one worth counting, and it is the number that says
         * whether the blob store being down is costing real files
         * (lib/blob-health.ts, lib/upload-limits.ts).
         */
        artwork: artworkParts.some((part) => part.dropped)
          ? "dropped"
          : artworkParts.some((part) => part.blob)
          ? "blob"
          : artworkParts.some((part) => part.file)
          ? "form"
          : "none",
        delivered: reachedShop,
        billed: Boolean(checkout?.ready),
        deposit: Boolean(checkout?.deposit),
        /**
         * Why it did not bill — from the gate that actually applies.
         *
         * The first version read the signs reason whenever signs had not
         * billed, which put `why="not a signs order"` on every apparel line
         * in the first real drive: true, and a non-answer. Apparel has no
         * gate to fail — it is an estimate the shop confirms, by design —
         * so it carries no reason at all rather than a borrowed one.
         */
        reason: isStickers
          ? stickersAutoBill.reason
          : isSignsOrder(pricedOrder)
          ? signsAutoBill.reason
          : undefined,
        kiosk: Boolean(kioskSession),
      })
    );

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

    /**
     * The customer's own copy — for every order Printavo will not email.
     *
     * Deliberately AFTER the reachedShop gate above. If nothing reached the
     * shop we return 502 and never get here, so this email cannot tell
     * somebody "we've got your order" about an order that exists nowhere.
     *
     * Best-effort like every other channel here: buildOrderConfirmation
     * decides whether there is anything to send, sendCustomerEmail fails
     * closed with no shop fallback, and neither throws. A customer who does
     * not get this still has the number on screen.
     */
    const confirmation = buildOrderConfirmation({
      quoteNumber,
      customerEmail: String(customerRecord.email || ""),
      customerName: String(customerRecord.customerName || ""),
      paymentEmailSent: Boolean(checkout?.ready),
      printavoCreated: Boolean(printavo.created),
      kiosk: Boolean(kioskSession),
      // Stickers only: they are the repeat product, and the only flow whose
      // whole spec a link can carry. reorderUrl returns null for anything
      // it cannot describe, and the email omits the line.
      reorderUrl: isStickerOrder(order)
        ? reorderUrl("https://labs.gorillasalem.com", {
            items: Array.isArray(order.items)
              ? (order.items as Record<string, unknown>[])
              : [],
            deliveryMethod: (order.production as Record<string, unknown>)
              ?.deliveryMethod,
          })
        : null,
      droppedArtwork: artworkParts
        .filter((part) => part.dropped)
        .map((part) => ({
          name: String(part.dropped?.name || "your artwork file"),
          size: Number(part.dropped?.size) || 0,
        })),
    });

    if (confirmation.send) {
      const sent = await sendCustomerEmail({
        to: String(customerRecord.email || ""),
        subject: confirmation.subject,
        text: confirmation.text,
        html: confirmation.html,
      });

      console.log(
        sent.sent
          ? `CUSTOMER CONFIRMATION SENT for ${quoteNumber}`
          : `CUSTOMER CONFIRMATION NOT SENT for ${quoteNumber}: ${
              sent.error ?? "no email provider configured"
            }`
      );
    } else {
      console.log(
        `CUSTOMER CONFIRMATION SKIPPED for ${quoteNumber}: ${confirmation.reason}`
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
