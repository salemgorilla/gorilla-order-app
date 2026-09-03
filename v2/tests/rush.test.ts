/**
 * Rush — the answer to "need it faster?" that is not a phone call.
 *
 * The rule and the reason live in lib/rush.ts. The load-bearing test in
 * this file is the LAST one: rush is not offered on the flow that
 * auto-bills, and that must stay true.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  applyRush,
  earliestRushNeedBy,
  isNeedByRefused,
  isRushNeedBy,
  laneOffersRush,
  needByRefusedError,
  rushChosenNote,
  rushFeeFor,
  rushOffer,
  rushRules,
} from "../lib/rush";
import { calculateApparelPricing } from "../lib/apparel-pricing";
import { isStickerOrder } from "../lib/sticker-repricing";

const MONDAY = "2026-08-31";

describe("the rush spec is Gabe's, as literal figures", () => {
  test("5 business days, 25%, slow lane only — set 2026-09-03", () => {
    assert.equal(rushRules.minBusinessDays, 5);
    assert.equal(rushRules.rate, 0.25);
    assert.deepEqual(rushRules.lanes, ["slow"]);
  });
});

describe("which flows can buy their way forward", () => {
  test("apparel and the signs pipeline can", () => {
    assert.equal(laneOffersRush("slow"), true);
  });

  test("stickers and banners cannot — the fast lane sells no rush", () => {
    assert.equal(laneOffersRush("fast"), false);
    assert.equal(laneOffersRush("walkin"), false);
  });

  test("a lane without rush keeps its floor exactly as it was", () => {
    assert.equal(earliestRushNeedBy("fast", MONDAY), "2026-09-01");
    assert.equal(earliestRushNeedBy("walkin", MONDAY), MONDAY);
  });

  test("the rush lane's floor moves from 14 business days to 5", () => {
    assert.equal(earliestRushNeedBy("slow", MONDAY), "2026-09-07");
  });
});

describe("the rush window", () => {
  test("sooner than standard but not sooner than rush", () => {
    // Standard slow floor is 2026-09-18; rush floor 2026-09-07.
    assert.equal(isRushNeedBy("2026-09-17", "slow", MONDAY), true);
    assert.equal(isRushNeedBy("2026-09-07", "slow", MONDAY), true);
  });

  test("a standard date is not a rush date", () => {
    assert.equal(isRushNeedBy("2026-09-18", "slow", MONDAY), false);
    assert.equal(isRushNeedBy("2026-10-01", "slow", MONDAY), false);
  });

  test("sooner than rush can go is not a rush date, it is refused", () => {
    assert.equal(isRushNeedBy("2026-09-04", "slow", MONDAY), false);
    assert.equal(isNeedByRefused("2026-09-04", "slow", MONDAY), true);
  });

  test("a fast-lane date never becomes a rush date", () => {
    assert.equal(isRushNeedBy("2026-09-01", "fast", MONDAY), false);
  });

  test("an empty date is missing, not rushed", () => {
    assert.equal(isRushNeedBy("", "slow", MONDAY), false);
    assert.equal(isNeedByRefused("", "slow", MONDAY), false);
  });
});

describe("the fee", () => {
  test("a quarter of the goods, to the cent", () => {
    assert.equal(rushFeeFor(252.76), 63.19);
    assert.equal(rushFeeFor(100), 25);
  });

  test("nothing is a quarter of nothing", () => {
    assert.equal(rushFeeFor(0), 0);
    assert.equal(rushFeeFor(-5), 0);
    assert.equal(rushFeeFor(Number.NaN), 0);
  });

  test("applyRush is off unless the date says otherwise", () => {
    assert.deepEqual(
      applyRush({ goodsSubtotal: 252.76, needBy: "2026-10-01", lane: "slow", today: MONDAY }),
      { isRush: false, fee: 0 }
    );

    assert.deepEqual(
      applyRush({ goodsSubtotal: 252.76, needBy: "2026-09-17", lane: "slow", today: MONDAY }),
      { isRush: true, fee: 63.19 }
    );
  });

  test("a fast-lane quote can never grow a rush fee", () => {
    assert.deepEqual(
      applyRush({ goodsSubtotal: 500, needBy: "2026-09-01", lane: "fast", today: MONDAY }),
      { isRush: false, fee: 0 }
    );
  });

  test("the worked example: 24 tees rushed", () => {
    // The audit's standing example, rushed: $252.76 goods + 25% = $315.95.
    const goods = calculateApparelPricing({
      quantity: 24,
      garmentUnitPrice: 3.49,
      printLocations: ["Front"],
      inkColors: "1 color",
      hasUnderbase: false,
    });
    const rush = applyRush({
      goodsSubtotal: goods.total,
      needBy: "2026-09-17",
      lane: "slow",
      today: MONDAY,
    });

    assert.equal(goods.total.toFixed(2), "252.76");
    assert.equal(rush.fee.toFixed(2), "63.19");
    assert.equal((goods.total + rush.fee).toFixed(2), "315.95");
  });
});

describe("what the customer is told", () => {
  test("the offer names both dates and the rate, and asks for nothing", () => {
    const offer = rushOffer("slow", MONDAY) ?? "";

    assert.match(offer, /Fri, Sep 18/);
    assert.match(offer, /Mon, Sep 7/);
    assert.match(offer, /25%/);
  });

  test("flows without rush make no offer at all", () => {
    assert.equal(rushOffer("fast", MONDAY), null);
    assert.equal(rushOffer("walkin", MONDAY), null);
  });

  test("once chosen, the fee is named and nothing is charged yet", () => {
    const note = rushChosenNote(63.19);

    assert.match(note, /\$63\.19/);
    assert.match(note, /before anything is charged/);
  });

  test("below the rush floor the message says even rushed", () => {
    assert.match(needByRefusedError("slow", MONDAY), /Even rushed/);
    assert.match(needByRefusedError("slow", MONDAY), /Mon, Sep 7/);
  });

  test("a lane without rush keeps the original wording", () => {
    const message = needByRefusedError("fast", MONDAY);

    assert.doesNotMatch(message, /Even rushed/);
    assert.match(message, /Call or email us/);
  });
});

describe("THE INVARIANT: rush must never reach the auto-billing path", () => {
  /**
   * Stickers self-check-out with no human in the loop. Rush is a promise
   * about a DATE, and a date nobody at the shop has agreed to must never
   * come with a live payment link — so the fast lane sells no rush at all
   * (lib/rush.ts explains why, and what would have to change first).
   *
   * Two ways this could break: the lane list grows, or a sticker payload
   * arrives carrying a rush fee. Both are checked.
   */
  test("no lane that auto-bills is in the rush list", () => {
    assert.equal(rushRules.lanes.includes("fast"), false);
    assert.equal(rushRules.lanes.includes("walkin"), false);
  });

  test("a sticker order still classifies as one, rush fee or not", () => {
    // Belt and braces: if a rush fee ever DID appear on a sticker payload,
    // it must not change what the classifier decides — the bug would be
    // the fee's presence, not a silent reclassification.
    const stickerOrder = {
      product: { type: "Custom Stickers", quantity: 100 },
      pricing: { total: 53.8, rushFee: 13.45 },
    };

    assert.equal(isStickerOrder(stickerOrder), true);
    assert.equal(
      applyRush({
        goodsSubtotal: 53.8,
        needBy: "2026-09-01",
        lane: "fast",
        today: MONDAY,
      }).fee,
      0,
      "the fast lane must price rush at zero however the date is chosen"
    );
  });
});

describe("the offer tells the truth about what will happen", () => {
  test("a priced flow says the estimate updates", () => {
    assert.match(
      rushOffer("slow", MONDAY) ?? "",
      /the estimate updates/
    );
  });

  test("a hand-quoted flow promises no estimate it does not have", () => {
    // The apparel REQUEST flow prices nothing on screen. Saying "the
    // estimate updates" there is the #86/#87 class of defect: a screen
    // describing something the flow never does.
    const offer = rushOffer("slow", MONDAY, { priced: false }) ?? "";

    assert.match(offer, /include it in your quote/);
    assert.doesNotMatch(offer, /estimate updates/);
  });
});
