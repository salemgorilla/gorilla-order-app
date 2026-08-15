import { NextResponse } from "next/server";

import { adminSecretMatches, isAdminSecretConfigured } from "../../../lib/admin-auth";
import { getConfigHealth } from "../../../lib/config-health";

/**
 * What this deployment can and cannot do right now.
 *
 * Admin-guarded, and fails closed with no ADMIN_SECRET, for the same reason
 * as the payment-request route: the answer names which integrations are dark,
 * which is a shopping list for anyone probing the site.
 *
 * Reports capabilities, never values. Whether a secret is SET is operational
 * fact the shop needs; what it is set TO is not something this endpoint will
 * ever say, however convenient that would be for debugging.
 */
export async function GET(request: Request) {
  // A whitespace-only value counts as unset — see lib/admin-auth.
  if (!isAdminSecretConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ADMIN_SECRET is not set, so this check is disabled. Set it to use /api/health.",
      },
      { status: 503 }
    );
  }

  const url = new URL(request.url);

  // Header or query string. The query string is there because this gets read
  // on a phone, from a message, by someone who is not going to craft a curl.
  const header = request.headers.get("x-admin-secret");
  const query = url.searchParams.get("secret");
  const provided = header || query;

  if (!adminSecretMatches(provided)) {
    /**
     * WHY THIS SAYS MORE THAN "Unauthorized".
     *
     * The shop spent a run of failed attempts against a bare "Unauthorized."
     * that could not distinguish "you sent nothing" from "you sent the wrong
     * thing" — and the usual cause is neither. It is that the secret never
     * survived the URL: a "#" in the value makes the browser treat the rest as
     * a fragment and never send it, "&" splits the parameter, and "+" arrives
     * as a space. All three look identical to a wrong password.
     *
     * Saying WHICH leaks nothing about the value. An attacker guessing already
     * knows whether they sent a parameter. The shop, standing in front of a
     * dark integration, does not know whether theirs arrived.
     */
    const trimmed = (provided ?? "").trim();

    const hint = !provided
      ? "No secret was sent. Append ?secret=... to the URL, or send an x-admin-secret header."
      : query && !header && / /.test(trimmed)
      ? // A literal "+" in the value arrives as a space. Tested on the TRIMMED
        // value: surrounding whitespace is stripped before comparison now, so
        // a trailing space is no longer a cause of failure and pointing at it
        // would send the shop after the wrong thing. An INTERIOR space still
        // breaks the match and still means a "+".
        "The secret arrived containing a space, which usually means a '+' in the value. Send it as an x-admin-secret header instead, or URL-encode it."
      : // The rest are invisible server-side, which is what `characters` is
        // for: a "#" truncates the value in the browser and a "&" splits it,
        // and both arrive looking exactly like a wrong password — just
        // shorter. Compare the count below against what you pasted.
        "That secret doesn't match ADMIN_SECRET for this environment. Compare the character count below against the value you pasted: if it is short, a '#' or '&' in the secret cut it off in the URL, and it needs to go in an x-admin-secret header. If the count matches, check you are reading the Production value and not Preview.";

    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized.",
        hint,
        // Length only, never content: enough to spot a truncated paste,
        // useless for reconstructing the value. This is the length AFTER
        // trimming, because that is the string that was actually compared —
        // reporting the raw length would tell the shop to compare a number
        // against a value that is not what the check used.
        received: provided
          ? {
              characters: trimmed.length,
              // Stated rather than silently absorbed. Trimming means this no
              // longer causes a failure, but the shop should still know its
              // stored value or its paste is carrying whitespace.
              whitespaceTrimmed: trimmed.length !== provided.length,
            }
          : null,
      },
      { status: 401 }
    );
  }

  const health = getConfigHealth();

  return NextResponse.json({
    ok: true,
    environment: process.env.VERCEL_ENV || "development",
    needsAttention: health.needsAttention,
    capabilities: health.capabilities,
  });
}
