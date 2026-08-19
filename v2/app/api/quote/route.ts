import { NextResponse } from "next/server";

import { MAX_ATTACHED_ARTWORK_BYTES } from "../../../lib/upload-limits";
import {
  getCartSetupFee,
  getShippingPrice,
  getStickerMaterialPrice,
} from "../../../lib/pricing";

import {
  sendCustomerEmail,
  sendQuoteEmail,
  type ArtworkDeliveryEntry,
  type QuoteAttachment,
} from "../../../lib/email";
import { getDesignNumbers } from "../../../lib/attachment-plan";
import { buildOrderConfirmation } from "../../../lib/order-confirmation";
import { subscribeToNewsletter } from "../../../lib/newsletter";
import { describeKioskSource, readKioskSession } from "../../../lib/kiosk";
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

/** True for the sticker flow, which is the only one that self-checks-out. */
export function isStickerOrder(order: Record<string, unknown>) {
  const product = (order.product || {}) as Record<string, unknown>;
  const type = String(product.type || "").toLowerCase();

  // Positive requirement, checked FIRST.
  //
  // This used to be defined purely by absence — no supplier, no garmentType,
  // no signType, "signs" not in the type. Membership by omission means any
  // NEW flow that fails to set one of those fields is silently classified as
  // stickers, gets repriced against the sticker table, and auto-generates a
  // Printavo payment link with no human in the loop. A lead-capture or
  // hand-quote payload is exactly the shape that slips through.
  //
  // Requiring the type to actually say stickers can only ever shrink the set
  // that auto-bills, so the worst case here is a sticker order that does not
  // self-check-out and gets followed up by hand — not a customer billed for
  // something nobody priced.
  if (!type.includes("sticker")) {
    return false;
  }

  return (
    !product.supplier &&
    !product.garmentType &&
    !product.signType &&
    !type.includes("signs")
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
export function repriceStickers(order: Record<string, unknown>) {
  const clientPricing = (order.pricing || {}) as Record<string, unknown>;
  const clientTotal = Number(clientPricing.total) || 0;

  if (!isStickerOrder(order)) {
    return {
      order,
      mismatch: false,
      unpriceable: false,
      clientTotal,
      serverTotal: clientTotal,
    };
  }

  const product = (order.product || {}) as Record<string, unknown>;
  const production = (order.production || {}) as Record<string, unknown>;

  // Reprice from `items` when the payload carries a cart, falling back to the
  // synthesised `product` so an older payload still reprices exactly as it
  // used to. The browser is never the authority on price — this is the figure
  // the payment link is generated from.
  const items = Array.isArray(order.items)
    ? (order.items as Record<string, unknown>[])
    : [product];

  /**
   * Each design with the price the SERVER put on it.
   *
   * Written back onto the item so everything downstream bills the figure that
   * was actually computed here, rather than calling the pricing engine a
   * second time and hoping the two agree. Printavo's per-design line items
   * read this.
   */
  const pricedItems = items.map((item) => ({
    ...item,
    linePrice: getStickerMaterialPrice(
      Number(item.quantity) || 0,
      String(item.material || ""),
      String(item.size || ""),
      {
        widthInches: Number(item.widthInches) || 0,
        heightInches: Number(item.heightInches) || 0,
      }
    ),
  }));

  const stickerPrice =
    Math.round(
      pricedItems.reduce((sum, item) => sum + item.linePrice, 0) * 100
    ) / 100;

  /**
   * A design with no usable area cannot be priced, and must not auto-bill.
   *
   * ── WHAT THIS CATCHES ─────────────────────────────────────────────────
   * The material formula is area x rate, so a payload carrying no width, no
   * height and no usable size label prices at exactly $0 and says nothing.
   * A submission for 1,000 stickers came out of here at $25 — the setup fee
   * alone — and stickers self-check-out, so that is a live payable link at a
   * price nobody set.
   *
   * The browser blocks the missing-dimensions case today: width and height
   * are validated and submit is refused. That is not the point. This function
   * exists BECAUSE the browser is not the authority on price, and it was
   * trusting the browser for the one input the price is computed from.
   *
   * The test is the FIGURE, not one cause of it — any design whose material
   * comes out at $0 or less. Missing dimensions is how it was found, and it
   * is the case that matters; a real but tiny order lands there too (10 at
   * 0.1" x 0.1" rounds to $0.00, though 1,000 of them is $0.32 and bills
   * normally). Either way, $0 of material is not a price to charge against
   * unattended.
   *
   * Deliberately not an error. The shop still gets the quote, the email and
   * the Printavo record, and can price it by hand — the only thing withheld
   * is the automatic payment link. Refusing the order outright would lose a
   * real customer over a field we can ask about.
   */
  const unpriceable = pricedItems.some((item) => item.linePrice <= 0);

  // Counted from the items the server can see, never from a client-supplied
  // design count — that number decides how much setup is charged.
  const setupPrice = getCartSetupFee(items.length);

  const shippingPrice = getShippingPrice(
    String(production.deliveryMethod || "")
  );

  const serverTotal =
    Math.round((stickerPrice + setupPrice + shippingPrice) * 100) / 100;

  return {
    order: {
      ...order,
      // Only when the payload really carried a cart — `items` falls back to
      // [product] above, and writing that back would invent a one-design cart
      // on a payload that never had one.
      ...(Array.isArray(order.items) ? { items: pricedItems } : {}),
      pricing: {
        ...clientPricing,
        stickerPrice,
        setupPrice,
        shippingPrice,
        total: serverTotal,
      },
    },
    // Cents of float drift are not worth shouting about; real tampering is.
    mismatch: Math.abs(serverTotal - clientTotal) > 0.01,
    unpriceable,
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
      artworkParts,
      knockoutParts,
      proofParts,
      proofsDropped,
    } =
      await parseQuoteRequest(request);

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

    // Design order, so the labels below match the order in the quote.
    const orderedItems = Array.isArray(order.items)
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
     */
    const designNumber = new Map(
      orderedItems.map((item, index) => [String(item.id), index + 1])
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
        // still has to know it exists and go and collect it.
        artworkDelivery.push({
          designId: part.id,
          label,
          status: `ARTWORK NOT UPLOADED — "${part.dropped.name}" is ${mb(
            part.dropped.size
          )} MB, over the ${mb(
            MAX_ATTACHED_ARTWORK_BYTES
          )} MB form limit. Email the customer to collect it.`,
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

    // Email the quote to the shop (best-effort — never blocks the customer).
    const notification = await sendQuoteEmail({
      quoteNumber,
      receivedAt,
      order: pricedOrder,
      artworkAnalysis,
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

    // Stickers check out on their own. Every other flow still waits for the
    // shop, because only stickers are fully priced with nothing to review.
    const isStickers = isStickerOrder(pricedOrder);

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

    if (
      !kioskSession &&
      !priced.unpriceable &&
      isStickers &&
      printavo.created &&
      printavo.quoteId
    ) {
      checkout = await createStickerCheckout({
        quoteId: printavo.quoteId,
        publicUrl: printavo.publicUrl || "",
        // Carries the tracking link in the payment email. This is the same
        // string lookupOrderStatus matches against the Printavo nickname.
        quoteNumber,
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
