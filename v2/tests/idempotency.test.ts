import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { POST } from "../app/api/quote/route";
import { DERIVED_CODE_LENGTH, deriveQuoteNumber, quoteNumberFor } from "../lib/idempotency";
import { resetRateLimits } from "../lib/rate-limit";
import {
  SUBMISSION_KEY_MAX,
  SUBMISSION_KEY_MIN,
  isSubmissionKeyShape,
  newSubmissionKey,
} from "../lib/submission-key";

/**
 * ONE SUBMIT, ONE ORDER.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * /api/quote built its quote number with Math.random() per request, so a
 * RETRIED submit became a second Printavo order — and for stickers, signs
 * and banners, a second live payable link. Two "ready to pay" emails for one
 * job, both payable.
 *
 * The button's isSubmitting flag never covered the case that matters: the
 * request SUCCEEDS and the response is lost. The customer sees a failure
 * that was not one and presses submit again. Unlike every classification
 * defect fixed this week, this one needs no crafted payload — bad wifi does
 * it.
 *
 * ── WHAT IS PROVEN HERE AND WHAT IS NOT ───────────────────────────────────
 * The mechanism is: same key -> same quote number -> Printavo already has
 * it -> return it, create nothing. The first two links are pure and are
 * proven here, including through the real route.
 *
 * The third needs Printavo. With no PRINTAVO_* configured, findExistingQuote
 * reports `searched: false` and the route FAILS OPEN by design, so the
 * duplicate branch itself cannot be reached from this suite and this file
 * does not pretend to cover it. What it does cover is the property the
 * branch rests on — that a retry asks about the number the first attempt
 * created — plus the fail-open behaviour, which is the part that must never
 * refuse a customer.
 */

beforeEach(() => {
  resetRateLimits();
});

describe("the key the browser mints", () => {
  test("it is accepted by its own shape guard", () => {
    for (let i = 0; i < 50; i += 1) {
      const key = newSubmissionKey();
      assert.ok(
        isSubmissionKeyShape(key),
        `newSubmissionKey() produced something its own guard rejects: ${key}`
      );
    }
  });

  test("two keys are not the same key", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newSubmissionKey()));
    assert.equal(keys.size, 200, "newSubmissionKey() repeated itself");
  });

  test("the guard refuses what a public endpoint will be sent", () => {
    // /api/quote is public and this value is hashed and logged, so it is
    // checked before it is either.
    const refused: unknown[] = [
      undefined,
      null,
      42,
      {},
      [],
      "",
      "short",                                  // under the minimum
      "a".repeat(SUBMISSION_KEY_MAX + 1),        // over the maximum
      "has spaces in it here",
      "line\nbreak-in-the-key-value",            // must not reach a log line
      'quote"in-the-key-value-here',             // must not reach a query
      "semi;colon-in-the-key-value-x",
      "../../../etc/passwd-traversal-x",
    ];

    for (const value of refused) {
      assert.equal(
        isSubmissionKeyShape(value),
        false,
        `accepted ${JSON.stringify(value)}`
      );
    }
  });

  test("it accepts exactly the bounds it documents", () => {
    assert.equal(isSubmissionKeyShape("a".repeat(SUBMISSION_KEY_MIN)), true);
    assert.equal(isSubmissionKeyShape("a".repeat(SUBMISSION_KEY_MIN - 1)), false);
    assert.equal(isSubmissionKeyShape("a".repeat(SUBMISSION_KEY_MAX)), true);
    assert.equal(isSubmissionKeyShape("a".repeat(SUBMISSION_KEY_MAX + 1)), false);
  });
});

describe("the number the key derives", () => {
  const key = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  const morning = new Date("2026-09-26T09:00:00Z");
  const evening = new Date("2026-09-26T23:00:00Z");

  test("the same key on the same day derives the same number", () => {
    // THE whole mechanism. Without this a retry asks Printavo about a
    // number nobody created and duplicates exactly as before.
    assert.equal(deriveQuoteNumber(key, morning), deriveQuoteNumber(key, evening));
  });

  test("a different key derives a different number", () => {
    assert.notEqual(
      deriveQuoteNumber(key, morning),
      deriveQuoteNumber("ffffffffffffffffffffffffffffffff", morning)
    );
  });

  test("a different day derives a different number, and that is deliberate", () => {
    // The stamp is the ORDER DATE and the shop reads it. A retry twelve
    // hours later is a different submission by any reasonable reading; the
    // window this closes is seconds to minutes, which is the one that
    // happens.
    assert.notEqual(
      deriveQuoteNumber(key, morning),
      deriveQuoteNumber(key, new Date("2026-09-27T09:00:00Z"))
    );
  });

  test("it is the shape the rest of the repo already accepts", () => {
    // lib/dropoff.ts validates quote numbers as /^GS-\d{8}-[A-Z0-9]{3,8}$/.
    // Eight characters is the top of a range something else already takes,
    // so no other module has to learn a new shape.
    const derived = deriveQuoteNumber(key, morning);

    assert.match(derived, /^GS-\d{8}-[A-Z0-9]{3,8}$/);
    assert.match(derived, /^GS-20260926-/);
    assert.equal(derived.split("-")[2].length, DERIVED_CODE_LENGTH);
  });

  test("eight characters, because a DERIVED collision drops an order", () => {
    /**
     * A random number colliding means two orders share a label. A DERIVED
     * number colliding means the second customer's submit finds the FIRST
     * customer's order and is told "already received" — their order
     * silently never placed, which is far worse than a duplicate.
     *
     * A cheap distribution check, not a proof: 20,000 keys, no collision.
     * At five characters (60.4M) this passes too; the argument for eight is
     * the year-scale arithmetic in lib/idempotency.ts, and this pins that
     * the code is actually eight wide rather than truncated somewhere.
     */
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i += 1) {
      seen.add(deriveQuoteNumber(`key-for-collision-probe-${i}-xxxx`, morning));
    }
    assert.equal(seen.size, 20_000, "derived quote numbers collided");
  });

  test("no key means the old random number and no dedupe", () => {
    // An older tab, the kiosk before it updates, a direct API caller. They
    // behave exactly as they do today. A new guarantee must not become a
    // new way to refuse an order.
    for (const submissionKey of [undefined, null, "", "short", 42, {}]) {
      const result = quoteNumberFor({
        submissionKey,
        fallback: () => "GS-19700101-FALLBACK",
        now: morning,
      });

      assert.equal(result.deduplicable, false, JSON.stringify(submissionKey));
      assert.equal(result.quoteNumber, "GS-19700101-FALLBACK");
    }
  });

  test("a valid key means the derived number and dedupe on", () => {
    const result = quoteNumberFor({
      submissionKey: key,
      fallback: () => "GS-19700101-FALLBACK",
      now: morning,
    });

    assert.equal(result.deduplicable, true);
    assert.equal(result.quoteNumber, deriveQuoteNumber(key, morning));
  });
});

describe("through the real route", () => {
  function stickerOrder(overrides: Record<string, unknown> = {}) {
    return {
      customer: {
        customerName: "Dana",
        email: "dana@example.com",
        company: "",
        phone: "",
      },
      production: {
        deliveryMethod: "Pickup",
        needBy: "2026-10-01",
        deadlineType: "Flexible",
      },
      product: {
        type: "Custom Stickers",
        quantity: 100,
        size: '3"',
        widthInches: 3,
        heightInches: 3,
        shape: "Die Cut",
        material: "Gloss White Vinyl",
        finish: "Gloss",
        designCount: 1,
      },
      items: [
        {
          id: "design-1",
          type: "Custom Stickers",
          quantity: 100,
          size: '3"',
          widthInches: 3,
          heightInches: 3,
          shape: "Die Cut",
          material: "Gloss White Vinyl",
          finish: "Gloss",
        },
      ],
      pricing: { stickerPrice: 84, setupPrice: 15, total: 99 },
      addOns: [],
      addOnsNote: "",
      ...overrides,
    };
  }

  async function submit(order: unknown) {
    const body = new FormData();
    body.append("order", JSON.stringify(order));

    const response = await POST(
      new Request("https://labs.gorillasalem.com/api/quote", {
        method: "POST",
        body,
      })
    );

    return (await response.json()) as Record<string, unknown>;
  }

  test("two submits with the SAME key ask about the same quote number", async () => {
    // The property the whole mechanism rests on, driven through the real
    // ~900-line route rather than asserted about a helper.
    const key = "retry-of-one-intent-abcdef123456";

    const first = await submit(stickerOrder({ submissionKey: key }));
    const second = await submit(stickerOrder({ submissionKey: key }));

    assert.equal(
      first.quoteNumber,
      second.quoteNumber,
      "a retry got a different quote number — it would create a second order"
    );
  });

  test("two submits with DIFFERENT keys are two orders", async () => {
    // The inverse, and it matters just as much: a customer legitimately
    // ordering twice must not be refused as a duplicate.
    const first = await submit(
      stickerOrder({ submissionKey: "first-genuine-order-abcdef123456" })
    );
    const second = await submit(
      stickerOrder({ submissionKey: "second-genuine-order-abcdef12345" })
    );

    assert.notEqual(first.quoteNumber, second.quoteNumber);
  });

  test("no key still gets a quote number, and a random one", async () => {
    const first = await submit(stickerOrder());
    const second = await submit(stickerOrder());

    assert.match(String(first.quoteNumber), /^GS-\d{8}-[A-Z0-9]{3,8}$/);
    assert.notEqual(
      first.quoteNumber,
      second.quoteNumber,
      "keyless submits should be independent, exactly as before"
    );
  });

  test("a rubbish key is ignored, not refused", async () => {
    // Hostile input on a public endpoint. It must fall back to the random
    // number and let the order through, never 400 the customer.
    const result = await submit(
      stickerOrder({ submissionKey: "../../etc/passwd\nX" })
    );

    assert.match(String(result.quoteNumber), /^GS-\d{8}-[A-Z0-9]{3,8}$/);
  });

  test("Printavo being unreachable does NOT refuse the order", async () => {
    /**
     * FAIL OPEN. With no PRINTAVO_* configured findExistingQuote reports
     * `searched: false`, and the route proceeds rather than refusing.
     *
     * Refusing would turn a Printavo blip into "no orders can be placed",
     * and this repo's standing trade is that a lost order is the worst
     * outcome available — lib/artwork-upload.ts makes the same call. The
     * risk carried instead is a duplicate, which is what every submit
     * carried before today.
     */
    const result = await submit(
      stickerOrder({ submissionKey: "printavo-is-down-abcdef123456" })
    );

    assert.notEqual(result.duplicate, true, "refused the order as a duplicate");
    assert.match(String(result.quoteNumber), /^GS-\d{8}-[A-Z0-9]{3,8}$/);
  });
});
