/**
 * One submit, one order — the client's half.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * /api/quote generates its quote number with Math.random() on the server, so
 * a RETRIED submit gets a new number and becomes a second Printavo order.
 * For stickers, signs and banners that means a second live payable link: the
 * customer holds two "ready to pay" emails for one job and can pay both.
 *
 * The button's `isSubmitting` flag does not cover the case that matters —
 * the request SUCCEEDS and the response is lost. The customer sees a failure
 * that was not one, presses submit again, and the shop now has two orders.
 * Anyone on hotel wifi can do this without trying.
 *
 * The route's own rate limiter says so in its comment: "NOT an idempotency
 * key. A retried submit still creates a second quote — that is a separate
 * defect needing a client-supplied key."
 *
 * ── WHY THE KEY IS THE BROWSER'S TO MINT ──────────────────────────────────
 * Only the browser knows that two requests are the same INTENT. The server
 * sees two POSTs; the network cannot tell it whether the second is a retry
 * or a customer legitimately ordering the same thing twice. So the tab mints
 * one key when a quote build starts, sends it with every attempt, and mints
 * a fresh one once an order is actually placed.
 *
 * ── WHY THIS FILE IMPORTS NOTHING ─────────────────────────────────────────
 * It is reachable from the browser, and lib/dropoff.ts records what happens
 * when a client-reachable module pulls in node:crypto: the page dies at
 * build time with "Reading from node:crypto is not handled by plugins",
 * which no type check can see. The derivation that needs a hash lives in
 * lib/idempotency.ts, server-side. Nothing here may import `node:` anything.
 */

/** Length bounds, so a hostile client cannot post a megabyte of "key". */
export const SUBMISSION_KEY_MIN = 16;
export const SUBMISSION_KEY_MAX = 128;

/**
 * Shape only. `/api/quote` is public, so this is checked before the value is
 * hashed, logged or used to derive anything a customer sees.
 *
 * Deliberately permissive about FORMAT and strict about CHARACTERS: the key
 * is opaque to the server, so any URL-safe token will do, but it must not be
 * able to carry a newline into a log line or a quote into a query.
 */
export function isSubmissionKeyShape(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= SUBMISSION_KEY_MIN &&
    value.length <= SUBMISSION_KEY_MAX &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/**
 * A fresh key for one quote build.
 *
 * `crypto.randomUUID()` where the browser has it — every target does — with
 * a `getRandomValues` fallback, then Math.random as the floor. The floor is
 * not a security claim: a guessed key cannot do anything except collide with
 * the guesser's own order, and the server checks the derived quote number
 * against Printavo before it believes anything.
 */
export function newSubmissionKey(): string {
  const webCrypto =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;

  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID().replaceAll("-", "");
  }

  if (webCrypto?.getRandomValues) {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  ).slice(0, 32);
}
