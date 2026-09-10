/**
 * "STOP EMAILING ME", WITHOUT A PASSWORD AND WITHOUT A GUESSABLE URL.
 *
 * ── THE TWO THINGS THIS HAS TO BE AT ONCE ────────────────────────────────
 * An unsubscribe link has to work for somebody who has no account, is on a
 * phone, has not read the email properly and is already annoyed. One tap,
 * no login, and it has to still work in two years when the email resurfaces
 * in a search.
 *
 * It also cannot be a URL anybody can construct. `/unsubscribe?e=<address>`
 * would let one bored person walk a customer list and silently remove
 * everyone, and nobody would find out until the sends stopped mattering.
 *
 * An HMAC of the address settles both: derived, so no state to store and no
 * expiry to manage, and unforgeable without the secret.
 *
 * ── THE SECRET IS ITS OWN, AND ITS ABSENCE IS A REFUSAL ──────────────────
 * NEWSLETTER_SECRET, not ADMIN_SECRET. These tokens live in customers'
 * inboxes forever, so rotating the admin password must not quietly break
 * every unsubscribe link the shop has ever sent — and an unsubscribe link
 * that 404s is the fastest route to a spam complaint there is.
 *
 * With no secret set, this mints nothing and verifies nothing. That is the
 * intended behaviour: no secret means no working unsubscribe, and no working
 * unsubscribe means the app must not be sending marketing at all. The health
 * page says so.
 *
 * ── READ WITH .trim() ────────────────────────────────────────────────────
 * A trailing newline on a pasted value is invisible in the Vercel UI and
 * invisible in the error it causes. Here it would mint tokens that verify
 * today and stop verifying the day somebody re-pastes the value cleanly.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { normaliseEmail } from "./subscribers";

function secret(): string {
  return process.env.NEWSLETTER_SECRET?.trim() || "";
}

export function isUnsubscribeConfigured(): boolean {
  return secret().length > 0;
}

/**
 * The token for one address. Null when there is no secret — callers must
 * treat that as "cannot send", never as "send without a link".
 */
export function unsubscribeToken(email: string): string | null {
  const key = secret();
  if (!key) return null;

  return createHmac("sha256", key)
    .update(normaliseEmail(email))
    .digest("base64url");
}

/** Constant-time, so the token cannot be recovered a byte at a time. */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = unsubscribeToken(email);
  if (!expected || !token) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));

  // timingSafeEqual throws on a length mismatch, which would itself be a
  // side channel and, worse, a 500 on a customer pressing unsubscribe.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * The link that goes in an email.
 *
 * It points at a PAGE, not at an endpoint that acts on GET. Mail clients,
 * security scanners and link previewers all fetch URLs found in a message
 * without a human involved — an unsubscribe that happens on GET is an
 * unsubscribe that happens to people who never clicked anything. The page
 * asks once and posts.
 *
 * The one-click List-Unsubscribe header is the separate, correct place for
 * a no-page unsubscribe, and it is a POST by specification (RFC 8058) for
 * exactly this reason.
 */
export const SITE_ORIGIN = "https://labs.gorillasalem.com";

export function unsubscribeUrl(
  email: string,
  origin: string = SITE_ORIGIN
): string | null {
  const token = unsubscribeToken(email);
  if (!token) return null;

  const url = new URL("/unsubscribe", origin);
  url.searchParams.set("e", normaliseEmail(email));
  url.searchParams.set("t", token);

  return url.toString();
}
