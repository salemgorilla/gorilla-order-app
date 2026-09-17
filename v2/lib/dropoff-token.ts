/**
 * THE DROP-OFF SESSION TOKEN — "this browser proved it knows an order".
 *
 * ── WHY SIGNED, AND NOT RANDOM ────────────────────────────────────────────
 * The hand-off token (lib/handoff.ts) is random because it names nothing: it
 * is a bearer capability to put a file in a bucket somebody is watching. This
 * one has to name an ORDER, and it has to survive the round trip to a phone
 * and back with no server-side record to check it against. A random token
 * would need that record; a signed one carries the fact and proves it.
 *
 * So: payload is the order number and an expiry, signature is an HMAC, and
 * the pair is the token. Nothing to store, nothing to clean up, and a session
 * that dies on its own schedule whatever happens to the screen that made it.
 *
 * ── WHAT A FORGED ONE WOULD BUY ───────────────────────────────────────────
 * Without the signature, anyone could mint a token for any order number and
 * upload into it — which is precisely the lookup gate (order number AND the
 * email on the order) defeated by typing a URL. The files would land in the
 * shop's store, attributed to a stranger's job, and the shop would be told
 * they arrived. That is the whole reason this is signed.
 *
 * It buys nothing else: the token grants no read of the order, no prices, no
 * contact details, and no access to any other session's files.
 *
 * ── THE SECRET, AND WHY THE FALLBACK IS DIFFERENT HERE ────────────────────
 * DROPOFF_SECRET when set, otherwise ADMIN_SECRET.
 *
 * lib/unsubscribe-token.ts refuses to share ADMIN_SECRET, and is right to:
 * those tokens live in customers' inboxes for years, so rotating the admin
 * password would silently break every unsubscribe link the shop ever sent.
 * These tokens live twenty minutes. Rotating ADMIN_SECRET kills the sessions
 * open at that moment and nothing else, and the customer's fix is to tap the
 * screen again — so the argument that applies there does not apply here, and
 * the cost of a separate mandatory variable would be a counter appliance
 * that is dark until somebody sets it.
 *
 * With NEITHER set it mints nothing and verifies nothing. The station says so
 * on screen rather than pretending to work, because an unsigned token is the
 * forgery case above.
 *
 * Read with .trim(): a trailing newline on a pasted value is invisible in the
 * Vercel UI and invisible in the error it causes.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  DROPOFF_TTL_MS,
  isDropoffTokenShape,
  isQuoteNumberShape,
  normaliseQuoteNumber,
} from "./dropoff";

// Re-exported so server-side callers have one import, and so the browser
// never reaches this module to get it. See the note on the original.
export { isDropoffTokenShape };

function secret(): string {
  return (
    process.env.DROPOFF_SECRET?.trim() ||
    process.env.ADMIN_SECRET?.trim() ||
    ""
  );
}

export function isDropoffConfigured(): boolean {
  return secret().length > 0;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/**
 * A token for one order, good until it expires.
 *
 * Null when there is no secret — callers must treat that as "cannot start a
 * session", never as "start one without a token".
 */
export function createDropoffToken(
  quoteNumber: string,
  now = Date.now()
): string | null {
  const key = secret();
  if (!key) return null;

  const number = normaliseQuoteNumber(quoteNumber);
  if (!isQuoteNumberShape(number)) return null;

  // base64url so the whole token is one path segment: it becomes part of a
  // blob key and part of a URL a phone opens from a QR code, and neither
  // tolerates a slash or a pad character.
  const payload = Buffer.from(`${number}|${now + DROPOFF_TTL_MS}`).toString("base64url");

  return `${payload}.${sign(payload, key)}`;
}

export type DropoffClaim = { quoteNumber: string; expiresAt: number };

/**
 * The order this token names, or null.
 *
 * Null covers every failure with one answer — bad shape, bad signature,
 * expired, no secret — because the caller's response is the same in all four
 * and distinguishing them out loud tells an attacker which half to work on.
 */
export function readDropoffToken(
  token: unknown,
  now = Date.now()
): DropoffClaim | null {
  const key = secret();
  if (!key || !isDropoffTokenShape(token)) return null;

  const [payload, signature] = token.split(".");

  const expected = Buffer.from(sign(payload, key));
  const actual = Buffer.from(signature);

  // timingSafeEqual throws on a length mismatch, which would itself be a side
  // channel and, worse, a 500 on a customer standing at the counter.
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  const [quoteNumber, expiresRaw] = Buffer.from(payload, "base64url")
    .toString("utf8")
    .split("|");

  const expiresAt = Number(expiresRaw);

  if (!isQuoteNumberShape(quoteNumber) || !Number.isFinite(expiresAt)) return null;
  if (now > expiresAt) return null;

  return { quoteNumber, expiresAt };
}
