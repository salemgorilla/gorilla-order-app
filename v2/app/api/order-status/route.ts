import { NextResponse } from "next/server";

import { lookupOrderStatus } from "../../../lib/printavo";
import { rateLimited, requestKey } from "../../../lib/rate-limit";
import { toCustomerStatus, TOTAL_STEPS } from "../../../lib/order-status";

/**
 * "Where is my order?" — the only endpoint a customer can ask about a job.
 *
 * ── WHAT IT WILL AND WILL NOT SAY ─────────────────────────────────────────
 * It takes a quote number AND the email on that order, and answers only with
 * a production status. No prices, no artwork, no addresses, no line items,
 * no other orders — none of which the question needs, and all of which would
 * be readable by anyone who guessed a quote number.
 *
 * Wrong number and wrong email give the SAME answer. Splitting them would
 * turn this into an oracle: try a number, learn an order exists, then probe
 * addresses against it. The customer loses nothing, because in both cases the
 * useful instruction is identical — check the number and the address on your
 * confirmation email.
 *
 * A Printavo outage is reported as an outage, never as "no such order".
 * Telling somebody holding a real receipt that we have never heard of them is
 * a worse failure than admitting a system is down.
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * Ten lookups a minute per IP.
 *
 * The throttle itself moved to lib/rate-limit.ts when the drop-off station
 * needed the identical thing — see the note there on what it is and is not.
 * It is not the defence here; requiring the email is.
 */
const MAX_PER_WINDOW = 10;

export async function POST(request: Request) {
  if (rateLimited("order-status", requestKey(request), MAX_PER_WINDOW)) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate-limited",
        message: "Too many checks just now. Give it a minute and try again.",
      },
      { status: 429 }
    );
  }

  let quoteNumber = "";
  let email = "";

  try {
    const body = await request.json();
    quoteNumber = String(body?.quoteNumber ?? "").trim();
    email = String(body?.email ?? "").trim();
  } catch {
    // A malformed body is a failed lookup, not a server error.
  }

  if (!quoteNumber || !email) {
    return NextResponse.json(
      {
        ok: false,
        reason: "no-match",
        message:
          "Enter the order number and the email address the confirmation was sent to.",
      },
      { status: 400 }
    );
  }

  const result = await lookupOrderStatus({ quoteNumber, email });

  if (!result.found) {
    if (result.reason === "unavailable") {
      // Logged with the reason, because this one is the shop's problem to fix
      // and the customer cannot tell it apart from anything else.
      console.error(
        `ORDER STATUS LOOKUP UNAVAILABLE for ${quoteNumber}: ${result.error}`
      );

      return NextResponse.json(
        {
          ok: false,
          reason: "unavailable",
          message:
            "We can't reach our order system right now. Try again shortly, or email us and we'll look it up by hand.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        reason: "no-match",
        message:
          "We couldn't find an order with that number and email. Check both against your confirmation email — the number looks like GS-20260812-AB12C.",
      },
      { status: 404 }
    );
  }

  const status = toCustomerStatus(result.status);

  if (status.unrecognised) {
    // The shop's board has a status the map has never seen. The customer gets
    // a safe line either way; this is so somebody can go and add it.
    console.warn(
      `ORDER STATUS UNRECOGNISED for ${result.quoteNumber}: Printavo said "${result.status}". Add it to lib/order-status.ts.`
    );
  }

  return NextResponse.json({
    ok: true,
    quoteNumber: result.quoteNumber,
    label: status.label,
    detail: status.detail,
    stage: status.stage,
    step: status.step,
    totalSteps: TOTAL_STEPS,
    complete: status.complete,
  });
}
