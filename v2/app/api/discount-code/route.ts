import { NextResponse } from "next/server";

import { findDiscountCode } from "../../../lib/discount-codes";
import { rateLimited, requestKey } from "../../../lib/rate-limit";

/**
 * Guesses per caller per minute.
 *
 * A customer types one code, maybe mistypes it once. Nobody legitimately
 * tries thirty. Low on purpose — see the note on the oracle below.
 */
const MAX_GUESSES_PER_WINDOW = 12;

/**
 * "Is this code good?" — the only thing the browser can ask about codes.
 *
 * The list never leaves the server; the browser sends one code and gets
 * back that code's discount or nothing. Submit does NOT trust the answer:
 * repriceStickers looks the code up again from the payload, so a browser
 * that fabricates `{ kind: "percent", percent: 90 }` is repriced at list.
 */
export async function POST(request: Request) {
  /**
   * THIS ENDPOINT IS AN ORACLE, AND IT HAD NO COST TO ASK.
   *
   * It takes an arbitrary string and answers whether it is a live discount.
   * Unthrottled, that turns "codes I hand out" into "codes anyone can
   * find": normalizeDiscountCode upper-cases and strips spaces, so the
   * search space is short English words — DIME is four characters, FAMFRE
   * six — and the built-in codes are permanent, unlimited-use, with no
   * expiry, no per-customer cap and no minimum order. A wordlist finds all
   * of them in minutes, and FAMFRE is 40% off every order thereafter.
   *
   * The throttle does not make the codes secret; it makes finding them by
   * brute force slow enough to be pointless from one machine, and it is
   * honest about being per-instance (see lib/rate-limit.ts).
   *
   * What it deliberately does NOT do is change the codes. Permanent
   * unlimited-use codes are Gabe's decision ("codes that are always
   * working"), and expiry or usage caps are his call, not a defect.
   *
   * Submit does not trust this answer either way: repriceStickers looks the
   * code up again from the payload, so the worst a bypass buys is knowing
   * whether a guess was right.
   */
  if (rateLimited("discount-code", requestKey(request), MAX_GUESSES_PER_WINDOW)) {
    // Deliberately the same shape as a wrong code, not a distinct 429 body:
    // a throttled guesser learns nothing about whether it was close.
    return NextResponse.json({ valid: false }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  const discount = findDiscountCode(body.code);
  if (!discount) return NextResponse.json({ valid: false });
  return NextResponse.json({ valid: true, discount });
}
