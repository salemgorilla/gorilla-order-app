import { createHash } from "node:crypto";

import { isSubmissionKeyShape } from "./submission-key";

/**
 * Turn the browser's submission key into the quote number it will produce.
 *
 * SERVER ONLY — it imports node:crypto. The shape check the browser needs
 * lives in lib/submission-key.ts, which imports nothing. See the note there.
 *
 * ── WHY DERIVE THE NUMBER RATHER THAN STORE THE KEY ───────────────────────
 * The obvious design is a key -> quote table. On this app there is nowhere
 * to put it: lib/rate-limit.ts is in-process and says so, and on serverless
 * that means per-instance. A rate ceiling survives that (somebody spread
 * across instances just gets a looser limit); idempotency does not — a retry
 * landing on a second instance finds no key and creates the duplicate the
 * whole mechanism exists to prevent.
 *
 * So the key derives the QUOTE NUMBER, and Printavo — the system of record,
 * shared by definition — is the store. A retry derives the same number,
 * finds the order already there, and returns it. No new infrastructure, no
 * new field, and it reuses the one search this repo has actually proven
 * against the live account: `orders(query:)` confirmed by the nickname
 * carrying the GS- number. AGENTS.md is explicit that an unproven query
 * shape is a blind spot, not a pass.
 *
 * ── WHAT IT DOES NOT COVER ────────────────────────────────────────────────
 * The date stamp is TODAY, so the same key either side of midnight derives
 * two different numbers and a retry across that boundary still duplicates.
 * Kept deliberately: the stamp is the order date, the shop reads it, and a
 * retry twelve hours later is a different submission by any reasonable
 * reading. The window this closes is the one that actually happens — a
 * customer pressing submit again within seconds or minutes.
 */

/**
 * Eight base36 characters, not the five the random generator uses.
 *
 * A DERIVED number collides differently from a random one. Two customers on
 * the same day whose keys hash to the same code would have the second one's
 * submit find the first one's order and be told "already received" — their
 * order silently never placed, which is far worse than a duplicate. At five
 * characters (60.4M) and a busy day, that is roughly a 1-in-a-few-hundred
 * chance per year; at eight (2.8e12) it is not a thing that happens.
 *
 * Eight is chosen rather than longer because lib/dropoff.ts already
 * validates quote numbers as /^GS-\d{8}-[A-Z0-9]{3,8}$/ — this is the top of
 * the range something else in the repo already accepts, so no other module
 * has to learn a new shape.
 */
export const DERIVED_CODE_LENGTH = 8;

/** `GS-20260926-3K9QW2XM`, stable for a given key on a given day. */
export function deriveQuoteNumber(
  submissionKey: string,
  now: Date = new Date()
): string {
  const dateStamp = now.toISOString().slice(0, 10).replaceAll("-", "");

  // Namespaced so the digest is about THIS app's quote numbers and could not
  // be replayed from a hash of the same key taken somewhere else.
  const digest = createHash("sha256")
    .update(`gorilla-quote-number:${dateStamp}:${submissionKey}`)
    .digest();

  // Base36 from the leading bytes, upper-cased to match the existing format.
  const code = BigInt(`0x${digest.subarray(0, 8).toString("hex")}`)
    .toString(36)
    .toUpperCase()
    .slice(0, DERIVED_CODE_LENGTH)
    .padStart(DERIVED_CODE_LENGTH, "0");

  return `GS-${dateStamp}-${code}`;
}

/**
 * The quote number for this submission, and whether it can be deduplicated.
 *
 * A payload with no key — an older tab, a direct API caller, the kiosk
 * before it was updated — still works and still gets a number. It simply
 * gets the random one and no duplicate protection, which is exactly the
 * behaviour it has today. A new guarantee must not become a new way to
 * refuse an order.
 */
export function quoteNumberFor(input: {
  submissionKey?: unknown;
  /** The existing Math.random() generator, injected so this stays pure. */
  fallback: () => string;
  now?: Date;
}): { quoteNumber: string; deduplicable: boolean } {
  if (!isSubmissionKeyShape(input.submissionKey)) {
    return { quoteNumber: input.fallback(), deduplicable: false };
  }

  return {
    quoteNumber: deriveQuoteNumber(input.submissionKey, input.now),
    deduplicable: true,
  };
}
