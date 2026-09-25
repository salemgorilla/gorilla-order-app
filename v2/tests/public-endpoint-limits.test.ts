/**
 * THE TWO PUBLIC ENDPOINTS THAT HAD NO CEILING.
 *
 * lib/rate-limit.ts already guarded /api/order-status, /api/dropoff/lookup
 * and /api/artwork-upload. The two that did not were the one that creates a
 * payable link and the one that answers whether a discount code is live.
 *
 *   /api/quote          writes a Printavo record, creates a contact, and
 *                       emails a live payment request addressed to
 *                       `customer.email`. An unauthenticated loop with a
 *                       valid $45 payload and a victim's address had the
 *                       shop's own Printavo account mailing them "ready to
 *                       pay" without limit, and created a contact per
 *                       address.
 *
 *   /api/discount-code  takes an arbitrary string and says whether it is a
 *                       live discount. Unthrottled that turns "codes I hand
 *                       out" into "codes anyone can find" — the codes are
 *                       short words, permanent and unlimited-use, and
 *                       FAMFRE is 40% off every order thereafter.
 *
 * These drive the SHARED limiter rather than the routes, because the routes
 * need a request, a Printavo account and a mail server. What is pinned is
 * the contract the routes rely on: a per-key ceiling, independent budgets,
 * and a window that reopens.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { rateLimited } from "../lib/rate-limit";

/** Drive N calls against one key and report where it first refused. */
function firstRefusalAt(bucket: string, key: string, limit: number, now = 0) {
  for (let i = 1; i <= limit + 5; i += 1) {
    if (rateLimited(bucket, key, limit, now)) return i;
  }
  return null;
}

describe("a caller cannot ask without limit", () => {
  test("the quote ceiling admits a real retry and stops a loop", () => {
    // 8 per minute: a failed submit, a flaky connection and a second design
    // all fit. Ten in sixty seconds is not a customer.
    const at = firstRefusalAt("quote-test", "1.2.3.4", 8);

    assert.equal(at, 9, "the ninth submission in a minute was allowed");
  });

  test("the discount ceiling is tight, because guessing is the attack", () => {
    // A customer types one code and maybe mistypes it once. Nobody
    // legitimately tries thirty.
    const at = firstRefusalAt("discount-test", "1.2.3.4", 12);

    assert.equal(at, 13);
  });

  test("one caller's budget is not another's", () => {
    // Otherwise a busy shop day would throttle real customers.
    for (let i = 0; i < 8; i += 1) rateLimited("quote-test2", "attacker", 8, 0);

    assert.equal(
      rateLimited("quote-test2", "attacker", 8, 0),
      true,
      "the attacker was not stopped"
    );
    assert.equal(
      rateLimited("quote-test2", "a-real-customer", 8, 0),
      false,
      "a different caller was caught in someone else's limit"
    );
  });

  test("the two endpoints do not share a budget", () => {
    // A customer checking a code must not spend their ability to submit.
    for (let i = 0; i < 12; i += 1) rateLimited("discount-test2", "same-ip", 12, 0);

    assert.equal(rateLimited("discount-test2", "same-ip", 12, 0), true);
    assert.equal(
      rateLimited("quote-test3", "same-ip", 8, 0),
      false,
      "checking a discount code spent the caller's quote budget"
    );
  });

  test("the window reopens, so a throttle is never a lockout", () => {
    for (let i = 0; i < 8; i += 1) rateLimited("quote-test4", "ip", 8, 1_000);
    assert.equal(rateLimited("quote-test4", "ip", 8, 1_000), true);

    // A minute later the same caller is served again.
    assert.equal(rateLimited("quote-test4", "ip", 8, 1_000 + 61_000), false);
  });
});
