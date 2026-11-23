/**
 * The 50 Hoodie Special's landing-page ad (Gabe, 2026-11-23: "add a
 * advertisement for the hoodie special on the landing page once you press
 * the link to get to the order").
 *
 * Pins that every figure in the ad is the one the quote charges, read from
 * HOODIE_SPECIAL rather than typed into the ad, and that the special's own
 * rush note stops promising a 25% fee its flat price never adds.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { HoodieSpecialAd } from "../features/apparel/HoodieSpecial";
import {
  HOODIE_SPECIAL,
  isHoodieSpecialOpen,
  quoteHoodieSpecial,
} from "../lib/hoodie-special";
import { rushOffer } from "../lib/rush";

const MONDAY = "2026-11-23";

describe("hoodie special landing ad", () => {
  const html = renderToStaticMarkup(<HoodieSpecialAd onStart={() => {}} />);

  test("advertises the two prices the quote charges", () => {
    const front = quoteHoodieSpecial({
      quantity: 50,
      colorName: "Black",
      printLocations: ["Front"],
      sizeBreakdown: "",
    });
    const both = quoteHoodieSpecial({
      quantity: 50,
      colorName: "Black",
      printLocations: ["Front", "Back"],
      sizeBreakdown: "",
    });
    assert.ok(html.includes(`$${front.unitPrice}`), "front price shown");
    assert.ok(html.includes(`$${both.unitPrice}`), "front and back price shown");
    assert.equal(front.unitPrice, 27);
    assert.equal(both.unitPrice, 33);
  });

  test("names the minimum and the last day, on screen and to a screen reader", () => {
    assert.ok(html.includes(`${HOODIE_SPECIAL.minPieces} printed`));
    assert.ok(html.includes("Order by Dec 1"));
    assert.ok(
      html.includes(
        `aria-label="${HOODIE_SPECIAL.name}: ${HOODIE_SPECIAL.minPieces} printed hoodies, $27 each front print, $33 each front and back, order by December 1. Start your hoodie order."`
      )
    );
  });

  test("is a spiked starburst, with no photo", () => {
    assert.ok(html.includes("clip-path:polygon("), "starburst outline");
    assert.ok(!/<img/i.test(html), "no photo: S&S does not carry MQK00107");
  });

  test("the whole badge is the button that starts the special", () => {
    assert.ok(/^<button[^>]*data-testid="hoodie-special-ad"/.test(html));
  });

  test("is gated by the same last-day rule as the apparel button", () => {
    assert.equal(isHoodieSpecialOpen("2026-12-01"), true);
    assert.equal(isHoodieSpecialOpen("2026-12-02"), false);
  });
});

describe("hoodie special rush note", () => {
  test("a flat-price offer names no rush fee", () => {
    const offer = rushOffer("slow", MONDAY, { flatPrice: true }) ?? "";
    assert.ok(offer.length > 0, "rush dates are still offered");
    assert.ok(!/%|rush fee/i.test(offer), offer);
    assert.ok(/flat price stays the same/.test(offer), offer);
  });

  test("the regular apparel note is unchanged", () => {
    assert.ok(/25% rush fee/.test(rushOffer("slow", MONDAY) ?? ""));
  });
});
