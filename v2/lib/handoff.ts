/**
 * Getting artwork off a customer's phone and onto the kiosk.
 *
 * ── THE PROBLEM ───────────────────────────────────────────────────────────
 * A walk-in has their logo in their photos, or in an email on their phone.
 * The kiosk is a machine on the counter with no access to any of that, and
 * nobody wants to log into their email on the shop's terminal.
 *
 * So the kiosk shows a QR code, they scan it, and their phone opens a page
 * that does one thing: upload a file. The kiosk notices it arrive.
 *
 * ── WHERE THE FILE LIVES IN BETWEEN ───────────────────────────────────────
 * Blob storage, under a path scoped to the hand-off token. That is not an
 * implementation detail, it is the whole design: the phone and the kiosk are
 * two different devices talking to a stateless serverless function, so there
 * is no memory they can share. An in-process Map would work perfectly in
 * development and fail in production the moment the two requests landed on
 * different instances — the exact class of bug that only shows up in front of
 * a customer.
 *
 * The token IS the shared key, and the blob store is the shared state.
 *
 * ── WHAT THE TOKEN IS ─────────────────────────────────────────────────────
 * A bearer capability. Anyone holding it can upload into that one prefix, so
 * it is 160 bits from a CSPRNG and it expires. What it CANNOT do matters more:
 * it grants no read of anything else, is tied to no customer record, and
 * carries no identity — the worst a stolen token achieves is putting a file
 * in front of a member of staff who is looking at the screen.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** How long a QR code is good for. Long enough to find the file, not longer. */
export const HANDOFF_TTL_MS = 15 * 60 * 1000;

/** Blob path prefix for one hand-off. Everything scopes off this. */
export function handoffPrefix(token: string) {
  return `handoff/${token}/`;
}

/**
 * A token that cannot be guessed.
 *
 * 20 bytes of crypto randomness, base36. Deliberately not a timestamp, a
 * counter, or anything derived from the order — all of those are guessable by
 * somebody who knows roughly when a session started, and guessing one means
 * uploading into a stranger's order.
 */
export function createHandoffToken() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("");
}

/** Rejects anything that is not shaped like one of ours, before it is used in a path. */
export function isValidHandoffToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-z0-9]{30,60}$/.test(token);
}

export function isExpired(uploadedAt: string | Date, now = Date.now()) {
  const at = new Date(uploadedAt).getTime();
  return !Number.isFinite(at) || now - at > HANDOFF_TTL_MS;
}

export type HandoffFile = {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  uploadedAt: string;
};
