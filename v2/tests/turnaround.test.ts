/**
 * The turnaround floors — Gabe's numbers, 2026-08-31: stickers and vinyl
 * banners next business day; apparel, yard signs and rigid signs 14
 * business days. Enforcement is BLOCK WITH AN OUT: the picker's min and the
 * validator both refuse earlier dates, and the message offers the phone.
 *
 * Before this rule there was no floor at all — every flow accepted TODAY,
 * and stickers auto-bill, so an impossible in-hand date could be paid for
 * before anyone at the shop read it.
 */
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  addBusinessDays,
  earliestNeedBy,
  formatNeedByDate,
  isNeedByTooSoon,
  needByTooSoonError,
  turnaroundLaneFor,
  turnaroundNote,
  turnaroundRules,
} from "../lib/turnaround";
import {
  getApparelFieldErrors,
  getOrderFieldErrors,
  getSignsFieldErrors,
} from "../lib/validation";

// 2026-08-31 is a Monday; 2026-09-04 a Friday; 2026-09-05/06 the weekend.
const MONDAY = "2026-08-31";
const FRIDAY = "2026-09-04";
const SATURDAY = "2026-09-05";

describe("the lanes are Gabe's grouping, verbatim", () => {
  test("stickers ride the fast lane", () => {
    assert.equal(
      turnaroundLaneFor({ isApparel: false, isSigns: false, signsFamily: "signs" }),
      "fast"
    );
  });

  test("vinyl banners ride the fast lane with stickers", () => {
    assert.equal(
      turnaroundLaneFor({ isApparel: false, isSigns: true, signsFamily: "banners" }),
      "fast"
    );
  });

  test("yard and rigid signs follow apparel's rule", () => {
    assert.equal(
      turnaroundLaneFor({ isApparel: false, isSigns: true, signsFamily: "signs" }),
      "slow"
    );
  });

  test("apparel is the slow lane", () => {
    assert.equal(
      turnaroundLaneFor({ isApparel: true, isSigns: false, signsFamily: "signs" }),
      "slow"
    );
  });
});

describe("the day counts are the decision, as literal figures", () => {
  // Like the price sheet: changing these must be a readable diff, not a
  // side effect. Gabe set them 2026-08-31.
  test("fast = 1 business day, slow = 14", () => {
    assert.equal(turnaroundRules.fast.minBusinessDays, 1);
    assert.equal(turnaroundRules.slow.minBusinessDays, 14);
  });
});

describe("business-day arithmetic", () => {
  test("a weekday plus one is the next weekday", () => {
    assert.equal(addBusinessDays(MONDAY, 1), "2026-09-01");
  });

  test("Friday plus one skips the weekend", () => {
    assert.equal(addBusinessDays(FRIDAY, 1), "2026-09-07");
  });

  test("Saturday plus one is Monday", () => {
    assert.equal(addBusinessDays(SATURDAY, 1), "2026-09-07");
  });

  test("14 business days from a Monday is the Friday two weeks on", () => {
    // Aug 31 + 14 business days: the 4 remaining weekdays of that week,
    // then two full 5-day weeks — Sep 1..4, 7..11, 14..18.
    assert.equal(addBusinessDays(MONDAY, 14), "2026-09-18");
  });
});

describe("the floor and its message", () => {
  test("the earliest fast date is tomorrow's business day", () => {
    assert.equal(earliestNeedBy("fast", MONDAY), "2026-09-01");
  });

  test("a date on the floor is allowed — the floor is a promise, not a buffer", () => {
    assert.equal(isNeedByTooSoon("2026-09-01", "fast", MONDAY), false);
  });

  test("a date under the floor is refused", () => {
    assert.equal(isNeedByTooSoon(MONDAY, "fast", MONDAY), true);
    assert.equal(isNeedByTooSoon("2026-09-17", "slow", MONDAY), true);
  });

  test("an empty date is missing, not too soon — the required rule owns it", () => {
    assert.equal(isNeedByTooSoon("", "slow", MONDAY), false);
    assert.equal(isNeedByTooSoon("   ", "slow", MONDAY), false);
  });

  test("the message names the products, the date, and the out", () => {
    const message = needByTooSoonError("slow", MONDAY);

    assert.match(message, /apparel and signs/);
    assert.match(message, /Fri, Sep 18/);
    assert.match(message, /Call or email us/);
  });

  test("the standing note under the picker carries the out too", () => {
    // The picker blocks silently, so the note is where a customer scrolling
    // for tomorrow finds out why it is not there and what to do instead.
    assert.match(turnaroundNote("fast"), /next business day/);
    assert.match(turnaroundNote("slow"), /14 business days/);
    assert.match(turnaroundNote("fast"), /Call or email us/);
    assert.match(turnaroundNote("slow"), /Call or email us/);
  });

  test("the date label matches the ISO date it names", () => {
    assert.equal(formatNeedByDate("2026-09-18"), "Fri, Sep 18");
  });
});

describe("all three validators enforce their lane", () => {
  // The recurring defect in this repo is a rule right in one flow and
  // missing in its siblings, so each flow is checked against the real
  // validator rather than trusting the shared helper.

  const contact = {
    customer: { customerName: "Dana", email: "dana@example.com" },
  };

  function stickerOrder(needBy: string) {
    return {
      ...contact,
      production: { needBy },
      items: [
        {
          widthInches: 3,
          heightInches: 3,
          quantity: 100,
          artwork: { file: {} },
        },
      ],
    } as never;
  }

  const signsDesign = {
    templateId: null,
    quantity: 5,
    customWidthInches: 24,
    customHeightInches: 18,
    artwork: { file: { name: "art.pdf" } },
    needsTypedSize: true,
  };

  test("stickers: today is refused, tomorrow's business day is allowed", () => {
    const refused = getOrderFieldErrors(stickerOrder(MONDAY), MONDAY);
    assert.match(refused.needBy ?? "", /stickers and banners/);

    const allowed = getOrderFieldErrors(stickerOrder("2026-09-01"), MONDAY);
    assert.equal(allowed.needBy, undefined);
  });

  test("banners: fast lane through the signs validator", () => {
    const refused = getSignsFieldErrors(
      [signsDesign],
      { ...contact, production: { needBy: MONDAY } },
      "fast",
      MONDAY
    );
    assert.match(refused.needBy ?? "", /stickers and banners/);

    const allowed = getSignsFieldErrors(
      [signsDesign],
      { ...contact, production: { needBy: "2026-09-01" } },
      "fast",
      MONDAY
    );
    assert.equal(allowed.needBy, undefined);
  });

  test("yard and rigid signs: below the RUSH floor is refused, 14 is allowed", () => {
    // Changed 3 Sep with rush (lib/rush.ts): a slow-lane date sooner than
    // 14 business days is no longer refused outright — between the rush
    // floor (5 business days) and standard it is ALLOWED and priced with
    // a rush fee. What the form still refuses is sooner than rush can go.
    const refused = getSignsFieldErrors(
      [signsDesign],
      { ...contact, production: { needBy: "2026-09-04" } },
      "slow",
      MONDAY
    );
    assert.match(refused.needBy ?? "", /apparel and signs/);

    const rushed = getSignsFieldErrors(
      [signsDesign],
      { ...contact, production: { needBy: "2026-09-17" } },
      "slow",
      MONDAY
    );
    assert.equal(rushed.needBy, undefined, "a rush date must be submittable");

    const allowed = getSignsFieldErrors(
      [signsDesign],
      { ...contact, production: { needBy: "2026-09-18" } },
      "slow",
      MONDAY
    );
    assert.equal(allowed.needBy, undefined);
  });

  const apparelQuote = {
    specialOrder: false,
    specialOrderNotes: "",
    quantity: 24,
    printLocations: ["Front"],
  };

  const apparelOrderPart = (needBy: string) =>
    ({ ...contact, artwork: { file: {} }, production: { needBy } }) as never;

  test("apparel: the floor holds at the rush limit", () => {
    // Same change as signs above: 2026-09-04 is sooner than even rush can
    // promise, so it is refused; a rush-window date is allowed and priced.
    const refused = getApparelFieldErrors(
      apparelQuote,
      apparelOrderPart("2026-09-04"),
      24,
      MONDAY
    );
    assert.match(refused.needBy ?? "", /apparel and signs/);

    const rushed = getApparelFieldErrors(
      apparelQuote,
      apparelOrderPart("2026-09-17"),
      24,
      MONDAY
    );
    assert.equal(rushed.needBy, undefined, "a rush date must be submittable");

    const allowed = getApparelFieldErrors(
      apparelQuote,
      apparelOrderPart("2026-09-18"),
      24,
      MONDAY
    );
    assert.equal(allowed.needBy, undefined);
  });

  test("a special order cannot beat the calendar either", () => {
    // Hand-priced, not hand-teleported: the request flow skips the menu
    // rules but keeps the floor.
    const refused = getApparelFieldErrors(
      { ...apparelQuote, specialOrder: true, specialOrderNotes: "25 hats" },
      apparelOrderPart("2026-09-01"),
      25,
      MONDAY
    );

    assert.match(refused.needBy ?? "", /apparel and signs/);
  });
});

describe("the walk-in lane — the shop's own counter", () => {
  // Gabe's call, 1 Sep 2026. The floor exists to stop the WEB promising
  // what nobody at the shop heard; a walk-in is standing in front of the
  // person who runs the press, so that reason does not apply. Fast-lane
  // work only — blanks and screens do not care who is at the counter.
  test("a kiosk sticker order may promise today", () => {
    const lane = turnaroundLaneFor({
      isApparel: false,
      isSigns: false,
      signsFamily: "signs",
      isKiosk: true,
    });

    assert.equal(lane, "walkin");
    assert.equal(earliestNeedBy(lane, MONDAY), MONDAY);
    assert.equal(isNeedByTooSoon(MONDAY, lane, MONDAY), false);
  });

  test("kiosk banners ride the same counter rule", () => {
    assert.equal(
      turnaroundLaneFor({
        isApparel: false,
        isSigns: true,
        signsFamily: "banners",
        isKiosk: true,
      }),
      "walkin"
    );
  });

  test("a kiosk APPAREL order still waits 14 business days", () => {
    // The load-bearing half of this rule: staff standing there cannot
    // conjure blanks or burn screens any faster.
    const lane = turnaroundLaneFor({
      isApparel: true,
      isSigns: false,
      signsFamily: "signs",
      isKiosk: true,
    });

    assert.equal(lane, "slow");
    assert.equal(earliestNeedBy(lane, MONDAY), "2026-09-18");
  });

  test("kiosk yard and rigid signs keep the slow floor too", () => {
    assert.equal(
      turnaroundLaneFor({
        isApparel: false,
        isSigns: true,
        signsFamily: "signs",
        isKiosk: true,
      }),
      "slow"
    );
  });

  test("the web is unchanged — no kiosk flag, no same day", () => {
    assert.equal(
      turnaroundLaneFor({ isApparel: false, isSigns: false, signsFamily: "signs" }),
      "fast"
    );
    assert.equal(isNeedByTooSoon(MONDAY, "fast", MONDAY), true);
  });

  test("the counter's note drops the call-us out — the customer is here", () => {
    const note = turnaroundNote("walkin");

    assert.match(note, /same day/i);
    assert.doesNotMatch(note, /call or email/i);
  });

  test("yesterday is still refused at the counter", () => {
    // Same day, not any day: a date in the past is never a promise.
    assert.equal(isNeedByTooSoon("2026-08-30", "walkin", MONDAY), true);
  });
});
