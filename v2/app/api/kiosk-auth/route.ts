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

/**
 * ── WHY A COUNTER AND NOT JUST THE DELAY ──────────────────────────────────
 * This route used to rely on a 400ms delay alone, with a comment claiming it
 * made walking the 10,000 four-digit space "pointless". It does not. The delay
 * only slows a SEQUENTIAL attacker; ten thousand requests fired concurrently
 * each wait 400ms in parallel and the whole space falls in seconds. The
 * comment was asserting a guarantee the code did not provide, which is worse
 * than no comment — it stops anyone looking twice.
 *
 * So: at most MAX_FAILURES wrong answers per IP per window, which caps a
 * scripted guess at five a minute however many it runs at once. The full
 * space then takes well over a day per address.
 *
 * ── AND WHY IT IS DELIBERATELY FORGIVING ──────────────────────────────────
 * The kiosk sits in the shop, so an attacker on the shop's wifi shares its
 * public IP. A long lockout would let anyone brick the front counter's own
 * door by mistyping at it. The window is therefore SHORT: a member of staff
 * who fat-fingers the PIN twice waits under a minute, and nothing a stranger
 * can do keeps the kiosk locked for longer than that.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 * The counters live in memory, so they are per serverless instance and reset
 * on redeploy. An attacker spread across many IPs, or lucky with instance
 * routing, gets more attempts than the numbers above suggest. This is a speed
 * bump that makes casual guessing impractical. The actual defence is a PIN
 * that is not a year or a birthday.
 * ──────────────────────────────────────────────────────────────────────────
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 60 * 1000;

type Attempts = { failures: number; windowStartedAt: number };

const attemptsByClient = new Map<string, Attempts>();

/** Keeps the map from growing without bound on a long-lived instance. */
function pruneExpired(now: number) {
  for (const [client, record] of attemptsByClient) {
    if (now - record.windowStartedAt >= WINDOW_MS) attemptsByClient.delete(client);
  }
}

/**
 * Exported for tests: the limiter is the security-relevant part, and testing
 * it through the route would mean standing up a server to assert on timing.
 */
export function rateLimit(
  client: string,
  now: number
): { allowed: boolean; retryAfterSeconds: number } {
  pruneExpired(now);

  const record = attemptsByClient.get(client);

  if (!record || now - record.windowStartedAt >= WINDOW_MS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.failures < MAX_FAILURES) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - record.windowStartedAt)) / 1000)
    ),
  };
}

export function recordFailure(client: string, now: number) {
  const record = attemptsByClient.get(client);

  if (!record || now - record.windowStartedAt >= WINDOW_MS) {
    attemptsByClient.set(client, { failures: 1, windowStartedAt: now });
    return;
  }

  record.failures += 1;
}

/** A correct PIN clears the slate, so one bad shift does not follow staff around. */
export function clearFailures(client: string) {
  attemptsByClient.delete(client);
}

/** Test-only: the counters are module state and would leak between cases. */
export function resetRateLimitForTests() {
  attemptsByClient.clear();
}

function clientAddress(request: Request) {
  // Vercel sets both of these at the edge and overwrites anything the client
  // sent, so they cannot be spoofed to dodge the counter. The leftmost
  // x-forwarded-for entry is the original client.
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;

  // No address means no per-client bucket. Everyone anonymous shares one,
  // which is stricter than letting them through unmetered.
  return "unknown";
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

  const client = clientAddress(request);
  const now = Date.now();
  const limit = rateLimit(client, now);

  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        reason: "too-many-attempts",
        // Says how long, because "try again later" at a counter with a
        // customer waiting is worse than a number.
        message: `Too many tries. Wait ${limit.retryAfterSeconds} seconds and try again.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  let pin = "";

  try {
    const body = await request.json();
    pin = String(body?.pin ?? "");
  } catch {
    // A malformed body is a failed attempt, not a server error.
  }

  // A small fixed delay on every answer, right or wrong. On its own it only
  // slows a sequential guesser — the counter above is what bounds a parallel
  // one — but it keeps a wrong PIN from being measurably faster than a right
  // one, and it costs a human nothing.
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (!constantTimeEquals(pin, expected)) {
    recordFailure(client, now);

    return NextResponse.json(
      { ok: false, reason: "wrong-pin", message: "That PIN didn't work." },
      { status: 401 }
    );
  }

  clearFailures(client);

  return NextResponse.json({ ok: true });
}
