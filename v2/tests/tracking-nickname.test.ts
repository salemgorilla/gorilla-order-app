import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildPrintavoQuotePlan,
  nicknameMatchesQuoteNumber,
  asciiSafe,
} from "../lib/printavo";

/**
 * Order tracking rests on a string format, and nothing was holding it.
 *
 * ── THE COUPLING ──────────────────────────────────────────────────────────
 * `buildPrintavoQuotePlan` writes a nickname. `lookupOrderStatus` finds a
 * customer's order by looking for their quote number inside that nickname.
 * Printavo's own visualId is assigned by Printavo and the customer has never
 * seen it, so the nickname is the ONLY field carrying a number they can type.
 *
 * Two pieces of code, in different halves of the file, agreeing about a
 * format by convention. There are five nickname branches — kiosk and web,
 * across stickers, signs and apparel, each with its own suffix — and until
 * now not one test mentioned the word "nickname".
 *
 * The failure is silent and it is the worst-shaped kind: drop the number from
 * one branch and that flow's customers are told "we couldn't find an order
 * with that number and email" while holding a real receipt. No exception, no
 * log, nothing red anywhere. And as of the tracking link going into the
 * payment email, we now actively invite them to go and find out.
 *
 * These assert the writer's real output against the reader's real rule —
 * `nicknameMatchesQuoteNumber` is the same function the lookup calls, not a
 * copy of its logic. A test that reimplemented the matcher would agree with
 * itself while production disagreed.
 * ──────────────────────────────────────────────────────────────────────────
 */

const QUOTE_NUMBER = "GS-20260817-TBNFS";

/**
 * What Printavo actually stores. `createPrintavoQuote` sends
 * `asciiSafe(plan.nickname)`, and asciiSafe DELETES anything outside
 * \x20-\x7E — so asserting on the raw plan value would test a string that
 * never reaches the field the lookup reads.
 */
function storedNickname(plan: { nickname: string }) {
  return asciiSafe(plan.nickname);
}

function planFor(order: Record<string, unknown>) {
  return buildPrintavoQuotePlan({
    quoteNumber: QUOTE_NUMBER,
    order: {
      customer: { customerName: "T", email: "t@example.com" },
      production: { deliveryMethod: "Pickup" },
      pricing: { total: 10 },
      ...order,
    },
    artworkAnalysis: null,
  });
}

/** Every branch of the nickname expression, named by what makes it distinct. */
const FLOWS: Array<[string, Record<string, unknown>]> = [
  [
    "sticker, one design",
    {
      product: { type: "Custom Stickers", quantity: 100 },
      items: [{ type: "Custom Stickers", quantity: 100, size: '2" x 2"' }],
    },
  ],
  [
    // The " / 3 designs" suffix branch.
    "sticker cart, three designs",
    {
      product: { type: "Custom Stickers", quantity: 300 },
      items: [
        { type: "Custom Stickers", quantity: 100, size: '2" x 2"' },
        { type: "Custom Stickers", quantity: 100, size: '3" x 3"' },
        { type: "Custom Stickers", quantity: 100, size: '4" x 4"' },
      ],
    },
  ],
  [
    "signs, priced",
    {
      product: { type: "Banners & Signs", signType: "Banner", quantity: 2 },
      pricing: { total: 120, quoteRequired: false },
    },
  ],
  [
    // The " (NEEDS PRICING)" suffix branch.
    "signs, hand-quoted",
    {
      product: { type: "Banners & Signs", signType: "Banner", quantity: 2 },
      pricing: { total: 0, quoteRequired: true },
    },
  ],
  [
    "apparel",
    {
      product: { type: "T-Shirts & Apparel", garmentType: "Tee", quantity: 24 },
    },
  ],
  [
    // The " (SPECIAL ORDER - NEEDS QUOTE)" suffix branch — the live apparel
    // path today, since choosing apparel pins specialOrder.
    "apparel, special order",
    {
      product: {
        type: "T-Shirts & Apparel",
        garmentType: "Tee",
        quantity: 24,
        specialOrder: true,
      },
    },
  ],
];

describe("a customer can find every order we take", () => {
  for (const [name, order] of FLOWS) {
    test(`${name}: the nickname carries the quote number`, () => {
      const nickname = storedNickname(planFor(order));

      assert.ok(
        nicknameMatchesQuoteNumber(nickname, QUOTE_NUMBER),
        `${name} produced "${nickname}", which lookupOrderStatus would not match — this flow's customers cannot track their order`
      );
    });

    test(`${name}: still findable when taken at the counter`, () => {
      // The kiosk prefix is "IN STORE" rather than "WEB QUOTE", which is a
      // second copy of the same expression and so a second chance to lose the
      // number. A walk-in customer is given the same order number.
      const nickname = storedNickname(planFor({ ...order, kiosk: true }));

      assert.ok(
        nicknameMatchesQuoteNumber(nickname, QUOTE_NUMBER),
        `kiosk ${name} produced "${nickname}", which lookupOrderStatus would not match`
      );
    });
  }

  test("asciiSafe leaves a quote number alone", () => {
    // The nickname is sanitised on the way to Printavo. If asciiSafe ever
    // touched the characters a quote number is made of, every order would
    // become untrackable at once.
    assert.equal(asciiSafe(QUOTE_NUMBER), QUOTE_NUMBER);
    assert.equal(asciiSafe(`WEB QUOTE ${QUOTE_NUMBER} - 100 Stickers`), `WEB QUOTE ${QUOTE_NUMBER} - 100 Stickers`);
  });

  test("a nickname mangled by a hyphen sweep stops matching", () => {
    // Proves the assertions above can fail. asciiSafe already rewrites en and
    // em dashes to "-"; the reverse — a well-meaning typographic pass turning
    // the number's hyphens into en dashes before it — silently breaks every
    // lookup, and this is what that looks like.
    const prettified = `WEB QUOTE ${QUOTE_NUMBER.replaceAll("-", "–")} - 100 Stickers`;

    assert.equal(
      nicknameMatchesQuoteNumber(prettified, QUOTE_NUMBER),
      false,
      "the matcher accepted a nickname whose hyphens had been replaced — it is not actually checking the number"
    );
  });
});

describe("the matcher itself", () => {
  const NICKNAME = `WEB QUOTE ${QUOTE_NUMBER} - 100 Stickers`;

  test("finds the number inside the shop's own labelling", () => {
    assert.equal(nicknameMatchesQuoteNumber(NICKNAME, QUOTE_NUMBER), true);
  });

  test("is case- and whitespace-insensitive about what the customer typed", () => {
    // /track uppercases and trims before it posts, but the API is reachable
    // directly and a customer pasting from an email brings whitespace with it.
    assert.equal(nicknameMatchesQuoteNumber(NICKNAME, "  gs-20260817-tbnfs  "), true);
  });

  test("survives the shop editing the nickname around the number", () => {
    // The nickname is a working field — the shop scans and annotates it.
    // Matching on substring rather than equality is what makes that safe.
    assert.equal(
      nicknameMatchesQuoteNumber(`RUSH!! ${NICKNAME} (reprint)`, QUOTE_NUMBER),
      true
    );
  });

  test("rejects a different order's number", () => {
    assert.equal(nicknameMatchesQuoteNumber(NICKNAME, "GS-20260817-XXXXX"), false);
  });

  test("rejects an order from the same day", () => {
    // The date prefix is shared by every order placed that day, so a partial
    // number must not be enough to open somebody else's status.
    assert.equal(nicknameMatchesQuoteNumber(NICKNAME, "GS-20260817-TBNFT"), false);
  });

  test("an empty query matches nothing", () => {
    // Substring semantics make "" match everything, which would hand the first
    // search result to anyone who guessed one email address.
    assert.equal(nicknameMatchesQuoteNumber(NICKNAME, ""), false);
    assert.equal(nicknameMatchesQuoteNumber(NICKNAME, "   "), false);
  });

  test("an absent nickname matches nothing", () => {
    // Printavo returns orders with no nickname set. str() gives "" and the
    // old expression would have thrown on null before it got there.
    assert.equal(nicknameMatchesQuoteNumber("", QUOTE_NUMBER), false);
    assert.equal(
      nicknameMatchesQuoteNumber(undefined as unknown as string, QUOTE_NUMBER),
      false
    );
  });
});
