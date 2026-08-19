/**
 * Turning a Printavo status into something a customer should read.
 *
 * ── WHY THERE IS A MAP AT ALL ─────────────────────────────────────────────
 * The shop's status names are shop taxonomy. They exist to sort work on a
 * production board, not to be read by the person waiting for the job:
 *
 *   "Lab Order " is the prefix that separates app orders from walk-ins. It
 *   means nothing to a customer and makes their order sound like a specimen.
 *
 *   "Pre-Press" is trade jargon.
 *
 *   "Order on Hold (Issue)" is the bad one. To a customer that reads as
 *   something is wrong, possibly your fault, with no idea what to do next.
 *   The shop means "we have a question" — so say that, and say who acts.
 *
 * ── THE RISK IN THE DEFAULT ───────────────────────────────────────────────
 * ORDER-TRACKING-SPEC says show statuses verbatim and override the ones that
 * leak. That is fine for the eight that exist today and quietly unsafe for
 * the ninth: any status added to Printavo later appears on a customer's
 * screen exactly as typed, including whatever shorthand a busy shop invents
 * at the time.
 *
 * So an unrecognised status is sanitised rather than trusted — the internal
 * prefix and any parenthetical aside are stripped — and it is flagged, so the
 * page can hedge and the shop can be told its board has drifted. Anything
 * that still looks like internal shorthand after sanitising is withheld
 * entirely in favour of a neutral, honest line.
 * ──────────────────────────────────────────────────────────────────────────
 */

export type OrderStage =
  | "received"
  | "artwork"
  | "printing"
  | "ready"
  | "done"
  | "hold"
  | "unknown";

export type CustomerStatus = {
  /** The headline the customer reads. */
  label: string;
  /** One line: what it means, and who does the next thing. */
  detail: string;
  stage: OrderStage;
  /**
   * Position in the normal run, 1-based, for the progress display. null when
   * the order is off that path (on hold, or a status we do not recognise) —
   * drawing a bar at a position we are unsure of would be a confident lie.
   */
  step: number | null;
  /** True once nothing further will happen. */
  complete: boolean;
  /** True when Printavo sent something not in the agreed set. */
  unrecognised: boolean;
};

export const TOTAL_STEPS = 4;

type Entry = {
  label: string;
  detail: string;
  stage: OrderStage;
  step: number | null;
  complete?: boolean;
};

/**
 * The eight statuses agreed with the shop on 2026-08-10.
 *
 * Keys are the Printavo names EXACTLY. They are compared case-insensitively
 * and with whitespace collapsed, because a status renamed with a stray double
 * space in the Printavo UI should not silently drop a customer into the
 * unrecognised path.
 */
const CUSTOMER_FACING: Record<string, Entry> = {
  "Order on Hold (Issue)": {
    label: "On hold — we need to check something with you",
    // Names who moves next. "On hold" without that leaves the customer
    // wondering whether they are the blocker.
    detail:
      "We've paused this one and someone from Gorilla Salem is getting in touch. You don't need to do anything yet.",
    stage: "hold",
    step: null,
  },
  "Lab Order Placed": {
    label: "Order received",
    detail: "We have your order and it's in the queue.",
    stage: "received",
    step: 1,
  },
  "Lab Order Pre-Press": {
    label: "Preparing your artwork",
    detail:
      "We're setting your artwork up for print and checking it over. We'll send a proof if anything needs your eye.",
    stage: "artwork",
    step: 2,
  },
  "Lab Order Printing": {
    label: "Printing",
    detail: "On the machine now.",
    stage: "printing",
    step: 3,
  },
  "Lab Order Completed - Ready For Local Pickup": {
    label: "Ready for pickup in Salem",
    detail: "Come and get it — 47 Canal Street, Salem MA.",
    stage: "ready",
    step: 4,
  },
  "Lab Order Completed - Picked Up": {
    label: "Picked up — thank you",
    detail: "This order is closed. Thanks for printing with us.",
    stage: "done",
    step: 4,
    complete: true,
  },
  "Lab Order Completed - Ready To Ship": {
    label: "Ready to ship",
    detail: "Packed and waiting for the carrier.",
    stage: "ready",
    step: 4,
  },
  "Lab Order Completed - Shipped": {
    label: "Shipped",
    detail: "On its way to you.",
    stage: "done",
    step: 4,
    complete: true,
  },
};

/** Lower-cased, whitespace-collapsed, for tolerant matching. */
function normalise(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const BY_NORMALISED = new Map(
  Object.entries(CUSTOMER_FACING).map(([name, entry]) => [
    normalise(name),
    entry,
  ])
);

/**
 * Anything that still smells like the production board after sanitising.
 *
 * Deliberately broad. The cost of withholding a status a customer could have
 * read is one vague sentence; the cost of showing one we should not have is a
 * customer reading the shop's private note about their job.
 */
const INTERNAL_SIGNALS =
  /\b(lab|press|rip|nest|weed|reprint|redo|scrap|waste|hold|issue|problem|chase|unpaid|owes|refund|comp|internal|test|dnp|do not)\b/i;

/** Strip the shop's prefix and any parenthetical aside. */
function sanitise(raw: string) {
  return raw
    .replace(/^lab order\s*/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–—]\s*$/, "")
    .trim();
}

/**
 * What to show the customer for a Printavo status.
 *
 * Never throws and always returns something sayable — a tracker that renders
 * nothing because a status was unexpected is worse than one that admits it is
 * unsure.
 */
export function toCustomerStatus(printavoStatus: string): CustomerStatus {
  const raw = String(printavoStatus ?? "").trim();

  if (!raw) {
    return {
      label: "In progress",
      detail:
        "We have your order. Give us a call on a weekday if you need a firmer update.",
      stage: "unknown",
      step: null,
      complete: false,
      unrecognised: true,
    };
  }

  const known = BY_NORMALISED.get(normalise(raw));

  if (known) {
    return {
      label: known.label,
      detail: known.detail,
      stage: known.stage,
      step: known.step,
      complete: Boolean(known.complete),
      unrecognised: false,
    };
  }

  const cleaned = sanitise(raw);

  // Unrecognised AND still looking internal, or reduced to nothing by
  // sanitising: say something true and unremarkable instead.
  if (!cleaned || INTERNAL_SIGNALS.test(cleaned)) {
    return {
      label: "In progress",
      detail:
        "Your order is moving through the shop. Give us a call on a weekday if you need a firmer update.",
      stage: "unknown",
      step: null,
      complete: false,
      unrecognised: true,
    };
  }

  return {
    label: cleaned,
    detail:
      "Your order is moving through the shop. Give us a call on a weekday if you need a firmer update.",
    stage: "unknown",
    step: null,
    complete: false,
    unrecognised: true,
  };
}

/** The normal run, for drawing the progress display. */
export const STEP_LABELS = [
  "Received",
  "Artwork",
  "Printing",
  "Ready",
] as const;

/**
 * Where a customer goes to check on an order.
 *
 * ── ONE COPY, BECAUSE THERE ARE NOW TWO CALLERS ───────────────────────────
 * This lived inside lib/printavo.ts, private, because only the payment email
 * needed it. The kiosk needs it too now: a counter customer never receives
 * that email — the server suppresses the payment request deliberately — so
 * the screen in front of them is the only place they will ever see this.
 *
 * Two hardcoded copies of a hostname is how one of them ends up pointing at
 * a domain that moved.
 *
 * Hardcoded rather than derived from a request header: the submit path runs
 * server-side, and the only address that matters is the one the customer can
 * actually reach. A preview deployment must still send people to production —
 * a tracking link pointing at a preview URL would 404 for them the moment that
 * deployment is superseded.
 */
export const TRACK_URL = "labs.gorillasalem.com/track";

/**
 * The full tracking link, with the order number prefilled when we have it.
 *
 * The email is NEVER put in this URL, and there is deliberately no parameter
 * for it. It is the only thing standing between a guessed order number and
 * somebody else's order status — see the note in app/track/page.tsx.
 */
export function getTrackUrl(quoteNumber?: string) {
  const number = String(quoteNumber || "").trim();
  if (!number) return `https://${TRACK_URL}`;

  return `https://${TRACK_URL}?order=${encodeURIComponent(number)}`;
}
