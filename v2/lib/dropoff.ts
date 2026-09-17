/**
 * THE DROP-OFF STATION — a screen on the counter whose whole job is taking
 * artwork for an order that already exists.
 *
 * ── WHY IT IS NOT /kiosk ──────────────────────────────────────────────────
 * /kiosk is the ORDER DESK: the full quote flow, running on the machine at
 * the front of the shop, where staff or a customer write up a NEW order. It
 * works, it takes orders today, and it is documented in lib/kiosk.ts.
 *
 * This is a different appliance for a different moment: somebody who already
 * ordered, walking in with a file. It looks an order up and takes files. It
 * cannot place an order, cannot take money, and cannot reach the rest of the
 * site. Two devices, or one device pointed at whichever URL the shop needs
 * that day — but never one route trying to be both, because the two have
 * opposite rules about what a stranger at the counter is allowed to do.
 *
 * ── WHAT A SESSION IS ─────────────────────────────────────────────────────
 * A signed token naming one order (lib/dropoff-token.ts). No server-side
 * session record, deliberately: the two devices in this flow — the counter
 * screen and the customer's phone — are talking to stateless functions that
 * may not even be the same instance, and the token is the only thing they
 * can both hold. It expires on its own, so an abandoned session cannot be
 * revived by the next person who walks up.
 *
 * ── WHAT IT NEVER SHOWS ───────────────────────────────────────────────────
 * No prices, no addresses, no line items, no other orders. The confirmation
 * screen shows the order number the customer just typed and its production
 * status — nothing they did not already have to know to get here.
 */

/**
 * How long one drop-off session lives.
 *
 * Long enough to find a file in a phone's photo library and upload it over
 * shop wifi; short enough that a session abandoned at the counter is dead
 * before the next customer arrives. The idle reset below usually gets there
 * first — this is the backstop for the case where the counter screen is
 * closed, rebooted or never touched again.
 */
export const DROPOFF_TTL_MS = 20 * 60 * 1000;

/**
 * Idle before the screen clears itself.
 *
 * Shorter than the order desk's two minutes (KIOSK_IDLE_MS). There, an idle
 * customer is mid-decision on a quote worth real money and losing it means
 * starting over. Here the entire task is "find file, send file", and what is
 * left on screen is somebody else's order number — so the balance tips the
 * other way.
 */
export const DROPOFF_IDLE_MS = 90_000;
export const DROPOFF_WARNING_MS = 20_000;

/**
 * Shape only — is this the right sort of string to put in a path or a URL?
 *
 * ── WHY IT LIVES HERE AND NOT BESIDE THE SIGNING ──────────────────────────
 * It was in lib/dropoff-token.ts, next to the code that mints these. That
 * module imports node:crypto, and the two things that need the shape check —
 * the phone's upload page and lib/upload-limits.ts — are both reachable from
 * the BROWSER. Importing it there pulled node:crypto into the client bundle
 * and the page died at build time with "Reading from node:crypto is not
 * handled by plugins", which no type check can see.
 *
 * Worse than the page it broke: lib/upload-limits.ts is imported by
 * lib/artwork-upload.ts, which every quote in the app runs through. One
 * import in the wrong module would have taken the whole upload path down.
 *
 * So: the regex is here, client-safe, and the crypto stays server-side.
 * Nothing in lib/dropoff.ts may import node: anything.
 */
export function isDropoffTokenShape(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length <= 400 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  );
}

/** Blob path prefix for one session. Everything scopes off this. */
export function dropoffPrefix(token: string) {
  return `dropoff/${token}/`;
}

export type DropoffFile = {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  uploadedAt: string;
};

/**
 * Order numbers this shop issues, e.g. GS-20260914-T6JBK.
 *
 * Checked before the value is put anywhere — a token payload, a log line, an
 * email subject. Printavo's own lookup is the real authority on whether an
 * order exists; this is only about shape.
 */
export function isQuoteNumberShape(value: unknown): value is string {
  return typeof value === "string" && /^GS-\d{8}-[A-Z0-9]{3,8}$/.test(value.trim().toUpperCase());
}

/**
 * What the customer types, turned into what the shop issued.
 *
 * A touchscreen keypad and a paper receipt disagree about spaces and case,
 * and somebody reading a number aloud drops the dashes. None of that is a
 * different order.
 */
export function normaliseQuoteNumber(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^GS(\d{8})([A-Z0-9]+)$/, "GS-$1-$2");
}
