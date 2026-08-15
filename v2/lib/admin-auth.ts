import { timingSafeEqual } from "node:crypto";

/**
 * The shop's own key, and the one place that decides whether a caller has it.
 *
 * Two routes guard on ADMIN_SECRET — /api/health, which names which
 * integrations are dark, and /api/payment-request, which asks a customer for
 * money. They each read the variable and compared it themselves, and they did
 * it slightly differently. This is the one comparison in the app where being
 * wrong means either the shop is locked out of its own tools or someone else
 * is not.
 *
 * ── WHY TRIM ──────────────────────────────────────────────────────────────
 * `process.env.ADMIN_SECRET` was compared raw. A trailing newline or space in
 * the Vercel value — the single most common way a pasted secret goes wrong —
 * made every correct attempt fail forever, and /api/health's hint then sent
 * the shop looking in the wrong place ("check you are reading the Production
 * value and not Preview"). Trailing whitespace is invisible in the Vercel UI
 * and invisible in the character count the hint asks you to compare, so
 * nothing about the failure points at the cause.
 *
 * This is the same class of fault as LEAD_TO_EMAIL holding an address with two
 * "@" signs: a value that is obviously wrong once seen, that nothing in the
 * app was looking at. The newsletter hook already trims. These did not.
 *
 * Trimming cannot turn a wrong secret into a right one. It only stops
 * whitespace nobody typed on purpose from being load-bearing.
 *
 * ── WHY A WHITESPACE-ONLY SECRET IS "NOT SET" ─────────────────────────────
 * Both routes fail closed on a missing secret, which was written as
 * `if (!secret)`. A value of "   " is truthy, so it read as configured — and
 * the endpoint then accepted "   " as the password. Trimming first means an
 * accidentally-blank variable disables the route, which is what failing
 * closed was supposed to mean.
 * ──────────────────────────────────────────────────────────────────────────
 */
export function getAdminSecret(): string {
  return (process.env.ADMIN_SECRET ?? "").trim();
}

/** Is this deployment able to authenticate the shop at all? */
export function isAdminSecretConfigured(): boolean {
  return getAdminSecret().length > 0;
}

/**
 * Constant-time string comparison.
 *
 * `===` on a secret leaks its prefix through timing. The exposure here is
 * small — the endpoints are rate-limited by nothing but the platform, and the
 * secret is long — but this is the comparison guarding a money action, and
 * the constant-time version costs nothing.
 *
 * Lengths are compared first and in the clear. That leaks the LENGTH of the
 * secret, which timingSafeEqual cannot hide anyway (it throws on mismatched
 * buffers), and which is not what an attacker is short of.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

/**
 * Does this caller hold the shop's key?
 *
 * Returns false when no secret is configured, so a caller can never
 * authenticate against an unset variable. Both sides are trimmed: the stored
 * value for the reason above, and the provided one because the shop reads
 * these secrets off a phone and a copied line very often carries a trailing
 * newline it did not ask for.
 */
export function adminSecretMatches(provided: string | null | undefined): boolean {
  const expected = getAdminSecret();

  // No secret configured is not a free pass. Callers check this separately to
  // return a 503 with an explanation, but this must never be the thing that
  // lets an empty string through.
  if (!expected) return false;

  return constantTimeEquals((provided ?? "").trim(), expected);
}
