import { NextResponse } from "next/server";

/**
 * Unlock staff mode on the kiosk.
 *
 * The check is here rather than in the browser for one reason: a PIN compared
 * client-side ships IN THE BUNDLE, where anyone who opens devtools — or reads
 * the page source on the machine in the lobby — can find it.
 *
 * What this is defending against is a customer wandering from self-service
 * into the staff view, and a member of the public writing orders up under a
 * staff name. It is a lock on an internal door, not a login: staff mode does
 * not expose pricing overrides, other customers' orders, or anything that
 * takes money.
 *
 * KIOSK_PIN unset means staff mode is unavailable, not that it is open. A
 * missing secret must never fail open.
 */

/** Length-independent comparison, so timing cannot leak the PIN digit by digit. */
function constantTimeEquals(a: string, b: string) {
  // Compare a fixed number of characters regardless of input, so a wrong
  // length cannot return faster than a wrong digit.
  const length = Math.max(a.length, b.length, 16);
  let mismatch = a.length === b.length ? 0 : 1;

  for (let i = 0; i < length; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return mismatch === 0;
}

export async function POST(request: Request) {
  const expected = process.env.KIOSK_PIN || "";

  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not-configured",
        message:
          "Staff mode is not set up on this deployment. Set KIOSK_PIN to enable it.",
      },
      { status: 503 }
    );
  }

  let pin = "";

  try {
    const body = await request.json();
    pin = String(body?.pin ?? "");
  } catch {
    // A malformed body is a failed attempt, not a server error.
  }

  // A small fixed delay on every answer, right or wrong. It makes a scripted
  // guess through the 10,000 four-digit space slow enough to be pointless
  // without making a correct entry feel sluggish to a human.
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (!constantTimeEquals(pin, expected)) {
    return NextResponse.json(
      { ok: false, reason: "wrong-pin", message: "That PIN didn't work." },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
