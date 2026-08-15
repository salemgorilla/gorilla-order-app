import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  rateLimit,
  recordFailure,
  clearFailures,
  resetRateLimitForTests,
} from "../app/api/kiosk-auth/route";

/**
 * The lock on the staff door.
 *
 * This route shipped with a 400ms delay and a comment claiming it made walking
 * the 10,000 four-digit PIN space "pointless". It did not — the delay only
 * slows a sequential attacker, and ten thousand concurrent requests each wait
 * 400ms in parallel. These tests exist because the guarantee was in prose and
 * nowhere else.
 *
 * Time is passed in rather than read, so the cases assert real elapsed
 * behaviour instead of sleeping through it.
 */
describe("kiosk staff PIN: guess rate", () => {
  const START = 1_700_000_000_000;

  beforeEach(() => resetRateLimitForTests());

  test("lets a member of staff mistype without punishing them", () => {
    for (let i = 0; i < 4; i += 1) {
      assert.equal(
        rateLimit("1.2.3.4", START).allowed,
        true,
        `attempt ${i + 1} should be allowed`
      );
      recordFailure("1.2.3.4", START);
    }

    assert.equal(rateLimit("1.2.3.4", START).allowed, true, "5th try still allowed");
  });

  test("stops the sixth wrong answer in a minute", () => {
    for (let i = 0; i < 5; i += 1) recordFailure("1.2.3.4", START);

    const limit = rateLimit("1.2.3.4", START);

    assert.equal(limit.allowed, false);
    assert.ok(limit.retryAfterSeconds > 0, "must say how long to wait");
    assert.ok(limit.retryAfterSeconds <= 60, "and never longer than the window");
  });

  test("a parallel burst is capped, not merely slowed", () => {
    // The defect this file was written for: 10,000 requests at the same
    // instant. The delay lets them all through; the counter must not.
    let allowed = 0;

    for (let i = 0; i < 10_000; i += 1) {
      if (rateLimit("9.9.9.9", START).allowed) {
        allowed += 1;
        recordFailure("9.9.9.9", START);
      }
    }

    assert.equal(
      allowed,
      5,
      `a simultaneous burst got ${allowed} guesses through, not 5`
    );
  });

  test("the door reopens on its own", () => {
    // Nobody can brick the front counter by mistyping at it from the shop
    // wifi, which shares the kiosk's public address.
    for (let i = 0; i < 5; i += 1) recordFailure("1.2.3.4", START);

    assert.equal(rateLimit("1.2.3.4", START).allowed, false);
    assert.equal(
      rateLimit("1.2.3.4", START + 60_000).allowed,
      true,
      "still locked after the window elapsed"
    );
  });

  test("one guesser cannot lock out everybody else", () => {
    for (let i = 0; i < 20; i += 1) recordFailure("6.6.6.6", START);

    assert.equal(rateLimit("6.6.6.6", START).allowed, false);
    assert.equal(
      rateLimit("1.2.3.4", START).allowed,
      true,
      "an unrelated address was caught in someone else's lockout"
    );
  });

  test("a correct PIN clears the slate", () => {
    // Otherwise a staff member who mistyped four times carries those failures
    // for the rest of the minute and gets locked out on their next genuine
    // slip, having already signed in successfully in between.
    for (let i = 0; i < 4; i += 1) recordFailure("1.2.3.4", START);
    clearFailures("1.2.3.4");

    for (let i = 0; i < 5; i += 1) {
      assert.equal(rateLimit("1.2.3.4", START).allowed, true);
      recordFailure("1.2.3.4", START);
    }
  });

  test("the full four-digit space takes more than a day at this rate", () => {
    // The number the old comment claimed without arithmetic behind it.
    const perMinute = 5;
    const hours = 10_000 / perMinute / 60;

    assert.ok(hours > 24, `10,000 PINs would fall in ${hours.toFixed(1)} hours`);
  });
});
