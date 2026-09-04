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
import type { RepricingNote } from "./repricing-note";

// Re-exported so the many existing callers here keep working; the rule itself
// lives alone so the form can use it without importing this file.
export { looksLikeEmailAddress } from "./email-address";
import { looksLikeEmailAddress } from "./email-address";

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
  // Both large-format pipelines. `signType` is the load-bearing test — every
  // payload the machinery builds carries it — and the type strings ("Vinyl
  // Banners", "Signs", and the pre-split "Banners & Signs") are belt and
  // braces for anything hand-fed.
  return (
    str(product.type).toLowerCase().includes("signs") ||
    str(product.type).toLowerCase().includes("banner") ||
    Boolean(product.signType)
  );
}

function line(label: string, value: string) {
  return `${label}: ${value}`;
}

/**
 * Who this quote is from, and what they agreed to.
 *
 * ── WHY THIS IS A FUNCTION AND NOT TWO COPIES ─────────────────────────────
 * Every quote email is rendered twice — once as plain text and once as HTML —
 * and this block was written out in full in both places. They agreed, but
 * nothing made them agree, and the field most likely to be edited is the one
 * least able to survive drifting: the newsletter consent record.
 *
 * That record is the shop's evidence of what a customer was actually shown.
 * "The box was ticked by default and left ticked" is a materially different
 * answer from "the customer ticked it", and on the website the box arrives
 * pre-ticked while on the kiosk it starts empty — so on the kiosk "Declined"
 * would claim a decision nobody made. Two copies of that reasoning is two
 * chances for the HTML the shop reads to disagree with the text an archive
 * keeps.
 *
 * The Zapier hook has been unset in production, so these lines are currently
 * the ONLY record that any opt-in happened at all, and the thing a backfill
 * would be reconstructed from. That is what makes the duplication worth
 * removing rather than merely tidy.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function buildCustomerLines(input: {
  customer: AnyRecord;
  kiosk?: { mode?: string; staffName?: string } | null;
}) {
  const customer = input.customer;

  return [
    ...(input.kiosk
      ? [
          line(
            "Taken",
            input.kiosk.mode === "staff"
              ? `At the counter by ${str(input.kiosk.staffName, "a staff member")}`
              : "At the counter — customer used the kiosk themselves"
          ),
          line(
            "Payment",
            "NOT charged — no payment link was sent. Take payment at the counter."
          ),
        ]
      : []),
    line("Name", str(customer.customerName, "Not entered")),
    line("Company", str(customer.company, "N/A")),
    line("Email", str(customer.email, "Not entered")),
    line("Phone", str(customer.phone, "N/A")),
    // Optional, so "Not answered" rather than an omitted line — a missing row
    // reads as a rendering bug, and knowing nobody answered is itself data.
    line(
      "Heard about us via",
      Array.isArray(customer.heardAbout) && customer.heardAbout.length
        ? (customer.heardAbout as string[]).join(", ")
        : "Not answered"
    ),
    line(
      "Newsletter",
      customer.newsletterOptIn === true
        ? input.kiosk
          ? "Opted in (box started empty — ticked deliberately)"
          : "Opted in (box shipped pre-ticked)"
        : input.kiosk
        ? "Not opted in (box started empty)"
        : "Declined"
    ),
  ];
}


/**
 * A titled run of "Label: Value" lines.
 *
 * The artwork section is the only one that needs several of these — a cart
 * has one artwork story per design, and flattening them into one list is how
 * the shop ends up printing design 2's file at design 1's size.
 */
type LineGroup = { title: string; lines: string[] };

/** One design's artwork delivery status, as computed by the quote route. */
export type ArtworkDeliveryEntry = {
  designId: string;
  label: string;
  /**
   * Prose, for a human reading the email. Keep it prose — it is what the
   * shop actually reads, and it says HOW the file arrived.
   */
  status: string;
  /**
   * The same facts, structured, for anything that has to act on them.
   *
   * The blob URL used to exist only inside `status`, as
   * "uploaded — name (2.1 MB): https://…". That is fine for a person and
   * brittle for a parser, and it is why the URL reaching Printavo went
   * unnoticed: it was buried mid-sentence under a heading that said the file
   * had been emailed. Carried separately so neither reader has to pick the
   * other's format apart.
   *
   * Absent when the file was attached to the email rather than uploaded —
   * those two are different facts and must not be conflated.
   */
  design?: number;
  fileName?: string;
  url?: string;
};

/** "100 x 3\" x 3\" Die Cut, Matte" — enough to identify the design at a glance. */
function describeItem(item: AnyRecord) {
  const size =
    Number(item.widthInches) > 0 && Number(item.heightInches) > 0
      ? `${item.widthInches}" x ${item.heightInches}"`
      : str(item.size);

  return [
    Number(item.quantity) > 0 ? `${item.quantity} qty` : "",
    size,
    str(item.shape),
    str(item.material),
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildQuoteEmail(input: {
  quoteNumber: string;
  receivedAt: string;
  order: AnyRecord;
  artworkAnalysis: AnyRecord | null;
  attachmentInfo?: string;
  /** One entry per design. Absent on the single-file signs and apparel flows. */
  artworkDelivery?: ArtworkDeliveryEntry[];
  /** Our rendered proof for each design, by design id. */
  proofs?: { designId: string; filename: string }[];
  /** Background-removed artwork, by design id. The original is attached too. */
  knockouts?: { designId: string; filename: string }[];
  /** Set when the order was taken on the shop's own terminal. */
  kiosk?: { mode: "self" | "staff"; staffName: string } | null;
  /** True when the browser had proofs it could not fit in the request body. */
  proofsDropped?: boolean;
  /**
   * Set only when the server's price disagreed with the browser's. Rendered
   * beside the total, because that is the number being questioned — see
   * lib/repricing-note.ts for why a console.error was not enough.
   */
  repricing?: RepricingNote | null;
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
  /**
   * The sticker cart. `product` above is a SYNTHESIS — design 1's spec carrying
   * the combined quantity — kept so the payload still classifies as stickers
   * and so single-design quotes read as they always have. `items` is the truth,
   * and anything that would otherwise state design 1's size as fact about the
   * whole order has to read this instead.
   */
  const items = (Array.isArray(order.items) ? order.items : []) as AnyRecord[];
  /**
   * The signs cart. Same shape and same reason as `items` above: `product` is
   * a synthesis of design 1 carrying the whole order's sign count, kept so
   * the payload still classifies as signs, and this is where the truth lives.
   * Absent on quotes built before signs had designs.
   */
  const signsDesigns = (
    Array.isArray(order.signsDesigns) ? order.signsDesigns : []
  ) as AnyRecord[];

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

  // A counter order is a different job in the inbox: nobody is waiting for a
  // reply, somebody is waiting at the till. Say so first.
  const kioskPrefix = input.kiosk ? "IN STORE — " : "";

  const subject = needsHandQuote
    ? `${kioskPrefix}NEED TO QUOTE — ${quoteNumber} — ${quantity} ${productLabel}${suffix}`
    : `${kioskPrefix}New Quote ${quoteNumber} — ${quantity} ${productLabel}${suffix}`;

  // ---- product section ----
  const productLines: string[] = [];
  if (apparel) {
    const supplier = (product.supplier as AnyRecord) || {};
    productLines.push(
      line("Type", "T-Shirts & Apparel"),
      line("Garment", str(supplier.productName || product.garmentType, "Not selected")),
      line("Quantity", String(quantity)),
      // A cart: the full garment list, right under the first garment's row,
      // so "Garment: Premium Tee / Quantity: 36" cannot be read as 36 tees
      // when 12 of them are hoodies. Absent on a one-garment order.
      ...(str(product.garmentLines)
        ? [line("All Garments", str(product.garmentLines))]
        : []),
      // "Not specified", not blank: a request-mode payload sends these empty
      // because its form never asked (the answers are in the notes below).
      // A blank after the label reads as a rendering fault; the words say
      // the shop should look at the notes. Configurator payloads — and every
      // payload from before the change — carry real values and print as
      // they always did.
      line("Color", str(product.garmentColor || supplier.colorName, "Not specified")),
      line(
        "Print Locations",
        Array.isArray(product.printLocations) && product.printLocations.length > 0
          ? (product.printLocations as string[]).join(", ")
          : str(product.printLocations, "Not specified")
      ),
      line("Ink Colors", str(product.inkColors, "Not specified")),
      line("Size Breakdown", str(product.sizeBreakdown, "Not entered")),
      ...(product.specialOrder
        ? [
            line("*** SPECIAL ORDER ***", "Needs a hand quote"),
            line("What they need", str(product.specialOrderNotes, "Not described")),
          ]
        : []),
      // The style, SKU and blank price used to print here — four lines
      // naming the supplier and stating outright that a markup is applied,
      // in the email the shop REPLIES TO CUSTOMERS from. One forward or one
      // quoted thread and the customer could price the blank themselves.
      // Gabe's call, 31 Aug: ordering details live only in the Printavo
      // internal note, which no customer can ever see. The figure is not
      // lost — the note carries style, SKU, sample size and blank cost.
    );
  } else if (signs && signsDesigns.length > 1) {
    /**
     * A signs quote with several designs in it has no single size, material
     * or finishing — exactly the hazard the sticker cart block below was
     * written for. Printing design 1's spec under a combined quantity would
     * tell the shop "12 signs, 18x24, Coroplast" for an order that is a
     * banner and two yard signs, and the shop can act on that.
     *
     * `product` is still the synthesised summary the flow duck-typing needs;
     * this reads the real list.
     */
    productLines.push(
      // The pipeline's own name — "Vinyl Banners" or "Signs". The combined
      // string is only ever seen on payloads from before the split.
      line("Type", str(product.type, "Banners & Signs")),
      line("Designs", String(signsDesigns.length)),
      line("Total Quantity", String(quantity))
    );

    for (const [index, design] of signsDesigns.entries()) {
      productLines.push(
        line(
          `Design ${index + 1}`,
          [
            str(design.signType, "Not selected"),
            `${str(design.quantity, "?")} @ ${str(design.size, "size not specified")}`,
            str(design.material, "material not specified"),
            str(design.finishing, "finishing not specified"),
            str(design.sides, "Single-sided"),
          ].join(" / ")
        )
      );
    }
  } else if (signs) {
    productLines.push(
      // The pipeline's own name — "Vinyl Banners" or "Signs". The combined
      // string is only ever seen on payloads from before the split.
      line("Type", str(product.type, "Banners & Signs")),
      line("Product", str(product.signType, "Not selected")),
      line("Quantity", String(quantity)),
      line("Size", str(product.size, "Not specified")),
      // Real signs payloads always carry both. The fallbacks exist because a
      // blank value reads as a rendering fault rather than as missing data —
      // the same reason the customer block says "N/A" instead of nothing.
      line("Material", str(product.material, "Not specified")),
      line("Finishing", str(product.finishing, "Not specified")),
      line("Sides", str(product.sides, "Single-sided"))
    );
  } else if (items.length > 1) {
    // A cart has no single size, shape or material. Printing design 1's spec
    // under a combined quantity says "450 stickers, 3 inch die cut, matte" for
    // an order that is three different stickers — a statement the shop could
    // act on and cut the whole run wrong. List them instead.
    productLines.push(
      line("Type", "Custom Stickers"),
      line("Designs", String(items.length)),
      line("Total Quantity", String(quantity))
    );

    for (const [index, item] of items.entries()) {
      productLines.push(
        line(
          `Design ${index + 1}`,
          [
            describeItem(item),
            str(item.finish),
            item.magentaCutLine ? "magenta cut line supplied" : "",
          ]
            .filter(Boolean)
            .join(", ")
        )
      );
    }
  } else {
    // One design — `product` and items[0] say the same thing, so this is the
    // original block, unchanged.
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
  /**
   * What the ESTIMATE block needs to say about delivery, which is only ever
   * whether this total leaves something out.
   *
   * It used to be a "Delivery" row repeating the method — and TIMELINE has a
   * "Delivery" row too, so on every signs PICKUP quote the shop read the
   * identical sentence twice in one email. On a Ship quote the two at least
   * said different things, but the estimate's job was still the exclusion,
   * not the method.
   *
   * So: named for what it is, and present only when something is actually
   * excluded. calculateSignsPricing returns productTotal + setupFee and never
   * adds shipping, which is why "quoted separately" is the honest wording
   * here and on the builder's delivery card.
   */
  const signsShipping =
    str(production.deliveryMethod) === "Ship"
      ? [line("Shipping", "Quoted separately")]
      : [];

  const estimateLines: string[] = primaryNeedsHandQuote && !signs
    ? [
        line("Estimated Total", "NEEDS A HAND QUOTE"),
        line("Why", str(pricing.note, "Special order — outside the online menu.")),
      ]
    : signs && Boolean(pricing.quoteRequired)
    ? [line("Estimated Total", "Quoted by hand — needs pricing"), ...signsShipping]
    : signs
    ? // Signs have been live-priced since v3.10.0. This branch used to send
      // "needs pricing" unconditionally, so the shop lost the computed total
      // on every signs quote while the subject line said it was priced.
      [
        line("Estimated Total", money(total)),
        line("Estimated Each", money(pricing.unitPrice ?? each)),
        ...signsShipping,
      ]
    : [line("Estimated Total", money(total)), line("Estimated Each", money(each))];

  // Immediately after the total, because the total is the thing in question.
  if (input.repricing) {
    estimateLines.push(line(input.repricing.label, input.repricing.detail));
  }

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

    // Rush is a scheduling fee on top of the goods, and the shop has to
    // see it: this is the line that says a date was BOUGHT, not just
    // asked for. Signs get theirs from pricing.lines a few lines up.
    if ((Number(pricing.rushFee) || 0) > 0) {
      estimateLines.push(line("Rush scheduling", money(pricing.rushFee)));
    }

    // What the customer's figure stood on — the assumed size mix, or their
    // entered breakdown. The payload has said this since the blend landed;
    // without this line the shop priced replies blind to it.
    if (pricing.note) {
      estimateLines.push(line("Basis", str(pricing.note)));
    }
  } else {
    estimateLines.push(
      line("Stickers", money(pricing.stickerPrice)),
      /**
       * The setup fee, which this breakdown used to omit entirely.
       *
       * Apparel lists "Setup / Screens" and signs itemise straight from the
       * pricing engine. Stickers — the one flow that bills with nobody in the
       * loop — listed material and shipping and stopped, so the lines under
       * Estimated Total did not add up to it. On the reference cart the shop
       * read $110.30 with $60.80 and $12.00 beneath it and no account of the
       * missing $37.50.
       *
       * That matters most exactly where it was missing: AGENTS.md makes
       * reconciling a real order against the Printavo invoice the gate for
       * any pricing change, and this email is what the shop reconciles FROM.
       * The Printavo customer note has carried the setup figure all along, so
       * the two records disagreed on completeness.
       *
       * Always shown, never hidden when zero: setup is $25 for the first
       * design and $12.50 for each one after, so $0.00 here is not a tidy
       * blank to suppress, it is a bug worth seeing.
       */
      line("Setup", money(pricing.setupPrice)),
      line(
        "Shipping",
        shippingPrice > 0 ? money(shippingPrice) : "Free (local pickup)"
      )
    );
  }

  // ---- artwork section ----
  //
  // One group per design. This used to be a single block with the whole
  // multi-line delivery status crammed into one "Attachment" value, which HTML
  // rendered as a single run-on table cell — so on a three-design order the
  // shop could not tell which file belonged to which sticker. Printavo gets no
  // bytes, so this email is the ONLY place that mapping exists.
  const delivery = input.artworkDelivery ?? [];
  const deliveryById = new Map(delivery.map((entry) => [entry.designId, entry]));
  const proofs = input.proofs ?? [];
  const proofByDesign = new Map(
    proofs.map((proof) => [proof.designId, proof.filename])
  );
  const knockoutByDesign = new Map(
    (input.knockouts ?? []).map((entry) => [entry.designId, entry.filename])
  );
  const artworkGroups: LineGroup[] = [];

  // The template brief, when the customer personalised one of ours instead of
  // uploading a file. Without this the email says "No file uploaded" and the
  // customer's actual words — the entire job — appear nowhere.
  const template = (order.artwork as AnyRecord)?.template as AnyRecord | null;

  if (template) {
    const words = (Array.isArray(template.text) ? template.text : []) as AnyRecord[];

    artworkGroups.push({
      title: `Template: ${str(template.name, str(template.id, "Unnamed"))}`,
      lines: [
        line(
          "What to do",
          "No file to chase — set these words into our master artwork and send a proof."
        ),
        ...words.map((word) => line(str(word.label, "Line"), str(word.value))),
      ],
    });
  }

  if (items.length > 0) {
    // Sticker cart. Each design carries its own spec, file and status, because
    // those three together are what the shop needs to cut the right art.
    for (const [index, item] of items.entries()) {
      const entry = deliveryById.get(str(item.id));
      const spec = describeItem(item);
      const fileName = str(item.artworkFileName);

      const lines = [
        line("Spec", spec || "Not specified"),
        line("File", fileName || "No file uploaded"),
        // Said in words, in the block for the design it applies to. A shop
        // reading "Die Cut" and seeing a rectangular proof should not have to
        // work out why.
        ...(item.hasTransparentEdges === false && str(item.shape) === "Die Cut"
          ? [
              line(
                "*** Background",
                "SOLID — knock it out before cutting, or the cut follows the image edge"
              ),
            ]
          : []),
        // The customer asked us to remove it and we did, in their browser.
        // Prepress needs to know the attached knockout is OURS and unchecked,
        // not something they supplied — and that the original is there to
        // redo it from if our matting is not good enough to print.
        ...(item.backgroundRemoved
          ? [
              line(
                "Background removed",
                `Yes — ${str(
                  item.backgroundRemovedColor,
                  "flat colour"
                )} knocked out in the browser at the customer's request. ${
                  knockoutByDesign.get(str(item.id)) ??
                  "(file too large to attach)"
                } — CHECK IT; the original is attached too.`
              ),
            ]
          : []),
        line("Delivery", entry ? entry.status : "No file uploaded"),
        // What the customer saw on screen and pressed submit on. Named per
        // design, because "our proof is attached" is not an answer when three
        // proofs are attached and only one of them is this sticker.
        line(
          "Our proof",
          proofByDesign.get(str(item.id)) ??
            (fileName ? "not rendered" : "no artwork to proof")
        ),
      ];

      // The analysis is of the FIRST file only, so it is reported under design
      // 1 and nowhere else. Repeating it under every design would state design
      // 1's dimensions and colour count as fact about designs it never saw.
      if (index === 0 && artworkAnalysis) {
        lines.push(
          line("Type (design 1)", str(artworkAnalysis.fileType, "N/A")),
          line("Size (design 1)", str(artworkAnalysis.fileSize, "N/A")),
          line("Dimensions (design 1)", str(artworkAnalysis.dimensions, "N/A")),
          line(
            "Estimated colors (design 1)",
            str(artworkAnalysis.estimatedColorCount, "N/A")
          )
        );
      }

      artworkGroups.push({ title: `Design ${index + 1}`, lines });
    }
  } else if (signsDesigns.length > 1) {
    /**
     * One block per sign, each naming its own file or its own template
     * wording. A single "Artwork: banner.pdf" line under a three-design quote
     * tells the shop to print one thing three times.
     *
     * The artwork ANALYSIS is deliberately absent here: it describes one file
     * (the last one analysed), and attaching those dimensions to every design
     * would state as fact something about designs it never saw. Same reason
     * the sticker cart keeps analysis per design.
     *
     * DELIVERY is not optional here, and leaving it out was a real hole. The
     * only place a signs file's fate was written down was `attachmentInfo`,
     * rendered by the single-design branch below — which a cart never
     * reaches. So a two-design quote whose 42 MB banner never left the
     * browser said, in full:
     *
     *     -- Design 1 — Vinyl Banner --
     *     File: huge-banner.psd
     *
     * The shop reads a filename, goes looking for an attachment that is not
     * there, and is never told to email the customer for it. Same for a file
     * that went to blob storage: the LINK lived only in attachmentInfo, so a
     * cart named the file and withheld the one thing needed to open it.
     *
     * The sticker cart has carried this line per design since it grew a cart.
     * Signs are the sibling that did not — this repo's usual shape.
     */
    for (const [index, design] of signsDesigns.entries()) {
      const designTemplate = design.template as AnyRecord | null;
      const words = (
        Array.isArray(designTemplate?.text) ? designTemplate?.text : []
      ) as AnyRecord[];
      const entry = deliveryById.get(str(design.id));

      artworkGroups.push({
        title: `Design ${index + 1} — ${str(design.signType, "Sign")}`,
        lines: designTemplate
          ? [
              line(
                "Template",
                str(designTemplate.name, str(designTemplate.id, "Unnamed"))
              ),
              line(
                "What to do",
                "No file to chase — set these words into our master artwork and send a proof."
              ),
              ...words.map((word) => line(str(word.label, "Line"), str(word.value))),
            ]
          : [
              line("File", str(design.fileName, "No file uploaded")),
              // Named "Delivery" to match the sticker block, so the shop reads
              // one vocabulary whatever was ordered.
              line("Delivery", entry ? entry.status : "No file uploaded"),
            ],
      });
    }
  } else if (!template) {
    // Signs and apparel: one file, or none. Unchanged from the single-design
    // form, because that is still exactly what these flows send.
    const artworkFileName =
      str(artworkAnalysis?.fileName) ||
      str((order.artwork as AnyRecord)?.fileName) ||
      "No file uploaded";

    artworkGroups.push({
      title: "Artwork",
      lines: [
        line("File", artworkFileName),
        line("Type", str(artworkAnalysis?.fileType, "N/A")),
        line("Size", str(artworkAnalysis?.fileSize, "N/A")),
        line("Dimensions", str(artworkAnalysis?.dimensions, "N/A")),
        line("Estimated Colors", str(artworkAnalysis?.estimatedColorCount, "N/A")),
        line("Attachment", str(attachmentInfo, "Not attached")),
      ],
    });
  }

  // Signs and apparel have no cart to file a proof under, so theirs stands on
  // its own. A cart names its proofs inside each design's block above.
  if (items.length === 0 && proofs.length > 0) {
    artworkGroups.push({
      title: "Our proof",
      lines: [
        line("Attached", proofs.map((proof) => proof.filename).join(", ")),
        line("What it is", "What the customer saw and approved on screen."),
      ],
    });
  }

  // Never let a partial set of proofs read as a complete one.
  if (input.proofsDropped) {
    artworkGroups.push({
      title: "Note on the proofs",
      lines: [
        line(
          "Incomplete",
          "Some proofs would not fit in the submission and were left out. The artwork and the written spec above are complete."
        ),
      ],
    });
  }

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
    // `customer` here is order.customer; the HTML builder receives it already
    // unwrapped. Passing it explicitly keeps both callers on the one function.
    ...buildCustomerLines({ customer, kiosk: input.kiosk }),
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
    ...artworkGroups.flatMap((group) => [`-- ${group.title} --`, ...group.lines, ``]),
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
    artworkGroups,
    notes: str(customer.notes, "No customer notes"),
    customerName: str(customer.customerName, "the customer"),
    customerEmail,
    kiosk: input.kiosk,
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

function htmlRows(lines: string[]) {
  const rows = lines
    .map((l) => {
      const idx = l.indexOf(": ");
      const label = idx >= 0 ? l.slice(0, idx) : l;
      const value = idx >= 0 ? l.slice(idx + 2) : "";
      /**
       * WHICH CELL GETS nowrap IS THE WHOLE BUG.
       *
       * It used to be the LABEL. One long label then set the label column's
       * width for the entire table and squeezed the value column to almost
       * nothing, so on a 390px phone the dollar amounts broke one character
       * per line — "$327.00" down six rows. Three separate changes have now
       * shipped that symptom (the repricing note in #35, the yard-sign bumped
       * label, and the multi-design estimate), each fixed by shortening a
       * string, which is treating the symptom.
       *
       * A label wrapping onto two lines is fine. A NUMBER wrapping is never
       * fine — it stops being a number. Dropping nowrap from the LABEL lets
       * the browser share the width out, and the value column then has enough
       * of it that "$327.00" stays on one line. The columns are then given
       * explicit widths under `table-layout:fixed`, because sharing by
       * content still left the value column narrower than the number it had
       * to hold — "$327.0" then "0" on the next line.
       *
       * Not nowrap on the value instead: this same table renders email
       * addresses and customer notes, and one unbreakable 40-character
       * address would push the whole email into horizontal scroll — measured
       * at 686px against a 390px screen.
       */
      return `<tr><td style="padding:3px 12px 3px 0;color:${INK_MUTED};vertical-align:top;width:58%;">${escapeHtml(
        label
      )}</td><td style="padding:3px 0;color:${INK_BLACK};font-weight:600;overflow-wrap:break-word;vertical-align:top;width:42%;">${escapeHtml(
        value
      )}</td></tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;font-size:14px;width:100%;table-layout:fixed;">${rows}</table>`;
}

function htmlSection(title: string, lines: string[]) {
  return `<h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${RUSH_RED};">${escapeHtml(
    title
  )}</h3>${htmlRows(lines)}`;
}

/**
 * The artwork section: one sub-block per design, under a single heading.
 *
 * A flat table would put "Design 1" and "Design 2" rows side by side with no
 * boundary between them, which is the failure this whole change is about. The
 * hairline above each sub-heading is the boundary — a rule, not a shadow.
 */
function htmlArtwork(groups: LineGroup[]) {
  const blocks = groups
    .map(
      (group, index) =>
        `<p style="margin:${
          index === 0 ? "10px" : "18px"
        } 0 4px;padding-top:${
          index === 0 ? "0" : "12px"
        };${
          index === 0 ? "" : `border-top:1px solid ${RULE};`
        }font-size:13px;font-weight:800;color:${INK_BLACK};">${escapeHtml(
          group.title
        )}</p>${htmlRows(group.lines)}`
    )
    .join("");

  return `<h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${RUSH_RED};">Artwork</h3>${blocks}`;
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
  artworkGroups: LineGroup[];
  notes: string;
  customerName: string;
  customerEmail: string;
  kiosk?: { mode: "self" | "staff"; staffName: string } | null;
}) {
  // Shared with the plain-text rendering, so the consent record the shop reads
  // and the one an archive keeps can never describe the same customer
  // differently. See buildCustomerLines.
  const customerLines = buildCustomerLines(input);

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
    ${htmlArtwork(input.artworkGroups)}
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
  artworkDelivery?: ArtworkDeliveryEntry[];
  proofs?: { designId: string; filename: string }[];
  knockouts?: { designId: string; filename: string }[];
  kiosk?: { mode: "self" | "staff"; staffName: string } | null;
  proofsDropped?: boolean;
  /** Forwarded to buildQuoteEmail; null whenever the two prices agreed. */
  repricing?: RepricingNote | null;
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

  const fallback = looksLikeEmailAddress(process.env.QUOTE_TO_EMAIL)
    ? (process.env.QUOTE_TO_EMAIL as string).trim()
    : "quote@gorillasalem.com";

  /**
   * A malformed override is DEMOTED to the main inbox, not sent as-is.
   *
   * The previous version passed any non-empty string straight to the provider,
   * which rejects it — and the abandoned-quote route swallows send failures on
   * purpose, so a typo in LEAD_TO_EMAIL meant those notices went nowhere and
   * said nothing. Delivering to the quote inbox is worse than delivering to a
   * dedicated one, and enormously better than delivering to neither.
   */
  let to = fallback;

  if (requestedTo?.trim()) {
    if (looksLikeEmailAddress(requestedTo)) {
      to = requestedTo.trim();
    } else {
      console.error(
        `EMAIL RECIPIENT INVALID: "${requestedTo.trim()}" is not a usable address. Sending to ${fallback} instead. Fix the environment variable that set it.`
      );
    }
  }

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

/**
 * A message to a CUSTOMER. The important difference from sendShopEmail.
 *
 * ── WHY THIS IS A SEPARATE FUNCTION AND NOT AN OPTION ─────────────────────
 * sendShopEmail DEMOTES a missing or malformed recipient to QUOTE_TO_EMAIL,
 * and that is right for a shop notice: delivering an abandoned-quote alert to
 * the main inbox is enormously better than delivering it nowhere.
 *
 * It is dangerous here. A customer's order update — and, if this is ever used
 * for one, a magic link — demoted to the shop inbox is somebody's private
 * information landing in a mailbox several people read, while the log says
 * "sent". The failure is silent and it looks like success.
 *
 * So this FAILS CLOSED. No fallback, no default, no "send it somewhere". A
 * bad address sends nothing and says so. Two callers have now needed this
 * warning written out — the tracker handoff and the repeat-customer spec —
 * which is why it exists once, here, rather than as a flag on the other one.
 * ──────────────────────────────────────────────────────────────────────────
 */
export async function sendCustomerEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}): Promise<QuoteEmailResult> {
  const provider = getEmailProvider();

  if (!provider) {
    return { sent: false, skipped: true };
  }

  const to = String(input.to || "").trim();

  if (!looksLikeEmailAddress(to)) {
    // Logged rather than thrown: a status update is not worth failing an
    // operation over, but it must never quietly go to the shop instead.
    console.error(
      `CUSTOMER EMAIL NOT SENT: "${to}" is not a usable address. Nothing was sent — a customer-facing message is never redirected to the shop inbox.`
    );

    return { sent: false, error: "No usable customer address." };
  }

  try {
    return provider === "gmail"
      ? await sendViaGmail({
          to,
          subject: input.subject,
          text: input.text,
          html: input.html,
          replyTo: input.replyTo,
          attachments: [],
        })
      : await sendViaResend({
          to,
          subject: input.subject,
          text: input.text,
          html: input.html,
          replyTo: input.replyTo,
          attachments: [],
        });
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
