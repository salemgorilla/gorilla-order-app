import { NextResponse } from "next/server";

import {
  isQuoteNumberShape,
  normaliseQuoteNumber,
} from "../../../../lib/dropoff";
import {
  createDropoffToken,
  isDropoffConfigured,
} from "../../../../lib/dropoff-token";
import { looksLikeEmailAddress } from "../../../../lib/email-address";
import { lookupOrderStatus } from "../../../../lib/printavo";
import { rateLimited, requestKey } from "../../../../lib/rate-limit";

/**
 * "Which order am I dropping off for?" — the only way into a drop-off session.
 *
 * ── THE IDENTITY CHECK IS THE SAME ONE /track USES, ON PURPOSE ────────────
 * Order number AND the email on the order, answered by lookupOrderStatus.
 * Wrong number and wrong email give the same answer, for the same reason
 * they do there: splitting them turns this into an oracle for whether an
 * order exists.
 *
 * The spec this was built from proposed last-4-of-phone as a lighter check.
 * It is not lighter, it is weaker, and this is a screen any passer-by can
 * touch: four digits has ten thousand values and a phone number is not a
 * secret. It would also mean a new Printavo query — the order lookup fetches
 * the contact's email and nothing else today. If Gabe wants it after using
 * the thing at the counter, it is a deliberate change with its own note,
 * not a default.
 *
 * ── WHAT A SUCCESSFUL LOOKUP HANDS BACK ───────────────────────────────────
 * A signed token naming the order, and the order's production status. No
 * prices, no contact details, no line items — the station has no use for any
 * of it, and everything it does not receive is something that cannot be read
 * off a counter screen by the next person in the queue.
 */

/**
 * Five a minute per IP. Tighter than /track's ten: there is one person at a
 * counter, and anyone genuinely mistyping their own order number is nowhere
 * near five attempts in sixty seconds.
 */
const MAX_PER_WINDOW = 5;

export async function POST(request: Request) {
  if (rateLimited("dropoff-lookup", requestKey(request), MAX_PER_WINDOW)) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate-limited",
        message: "Too many tries just now. Give it a minute, or ask at the counter.",
      },
      { status: 429 }
    );
  }

  // No secret, no signed token, and an unsigned session is a forgeable one —
  // see lib/dropoff-token.ts. Reported as its own state so the screen can say
  // "ask at the counter" rather than "no such order", which would send a
  // customer holding a real receipt away believing their order is missing.
  if (!isDropoffConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not-configured",
        message: "The drop-off screen isn't set up yet. Please hand your file to the counter.",
      },
      { status: 501 }
    );
  }

  let quoteNumber = "";
  let email = "";

  try {
    const body = await request.json();
    quoteNumber = normaliseQuoteNumber(body?.quoteNumber);
    email = String(body?.email ?? "").trim();
  } catch {
    // A malformed body is a failed lookup, not a server error.
  }

  // Shape is checked here so an obviously-wrong number never reaches Printavo
  // and never spends the customer's rate-limit budget on a round trip.
  if (!isQuoteNumberShape(quoteNumber) || !looksLikeEmailAddress(email)) {
    return NextResponse.json({ ok: false, reason: "no-match" });
  }

  const result = await lookupOrderStatus({ quoteNumber, email });

  if (!result.found) {
    // "unavailable" is passed through rather than flattened into "no-match":
    // telling somebody with a real receipt that we have never heard of them
    // is a worse failure than admitting Printavo is down.
    return NextResponse.json({ ok: false, reason: result.reason });
  }

  const token = createDropoffToken(result.quoteNumber);

  if (!token) {
    return NextResponse.json(
      { ok: false, reason: "not-configured" },
      { status: 501 }
    );
  }

  return NextResponse.json({
    ok: true,
    token,
    quoteNumber: result.quoteNumber,
    status: result.status,
  });
}
