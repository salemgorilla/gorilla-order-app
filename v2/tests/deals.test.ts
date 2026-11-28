import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEALS, DEAL_STARTS, dealHref, liveDeals } from "../lib/deals";
import { readFileSync } from "node:fs";

describe("the deals list", () => {
  it("has unique ids", () => {
    assert.equal(new Set(DEALS.map((d) => d.id)).size, DEALS.length);
  });
  it("hides a deal after its last day, on that day still shows it", () => {
    const dated = { ...DEALS[0], id: "dated", endsOn: "2026-12-01" };
    assert.ok(liveDeals("2026-12-01", [dated]).some((d) => d.id === "dated"));
    assert.ok(!liveDeals("2026-12-02", [dated]).some((d) => d.id === "dated"));
  });
  it("leaves the 50 Hoodie Special off the page (Gabe, 2026-11-23)", () => {
    assert.ok(!DEALS.some((d) => d.id === "hoodie-special"));
  });
  it("links only into the app or to the shop's own email", () => {
    for (const deal of DEALS) {
      if (deal.how === "soon") continue;
      const href = dealHref(deal);
      assert.ok(
        href.startsWith("/?start="),
        `${deal.id}: ${href}`
      );
    }
  });
  it("starts in-app deals only at a place the order page understands", () => {
    for (const deal of DEALS) {
      if (deal.how === "order") {
        assert.ok(deal.start && DEAL_STARTS.includes(deal.start), deal.id);
      }
    }
  });
  it("every start value is one the order page handles", () => {
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    assert.match(page, /start === "hoodie-special"/);
    assert.match(page, /start === "stickers-deal"/);
    assert.match(page, /teeDealFor\(start\)/);
  });
  it("every orderable deal has its one fixed price, and the regular price is higher", () => {
    for (const deal of DEALS) {
      if (deal.id === "hoodie-special") continue;
      if (deal.how === "order") assert.ok(deal.price !== null, deal.id);
      if (deal.price !== null && deal.regularPrice !== null) {
        assert.ok(deal.regularPrice > deal.price, deal.id);
      }
    }
  });
  it("the tee and sticker cards read their prices from the pricing code", () => {
    const byId = Object.fromEntries(DEALS.map((d) => [d.id, d]));
    assert.equal(byId["stickers-50"].price, 25);
    assert.equal(byId["tees-12-1color"].price, 130.32);
    assert.equal(byId["tees-12-1color"].regularPrice, 180.4);
    assert.equal(byId["tees-24-1color"].price, 187.68);
    assert.equal(byId["tees-24-1color"].regularPrice, 287.8);
    assert.equal(byId["tees-24-2color"].price, 264.24);
    assert.equal(byId["tees-24-2color"].regularPrice, 364.4);
    assert.equal(byId["beanies-12"].price, 109.8);
    assert.equal(byId["beanies-12"].regularPrice, 146.4);
    assert.equal(byId["hats-12"].price, 159.72);
    assert.equal(byId["hats-12"].regularPrice, 213);
    assert.equal(byId["polos-6"], undefined);
  });
});

describe("every deal is paid in full up front (Gabe, 2026-11-24)", () => {
  it("every deal start that takes an order has a pay-in-full gate", async () => {
    const { DEAL_STARTS, DEALS } = await import("../lib/deals");
    const { PAY_IN_FULL_STARTS } = await import("../lib/deal-payment");
    for (const start of DEAL_STARTS) {
      assert.ok(start in PAY_IN_FULL_STARTS, `${start} has no pay-in-full gate`);
    }
    for (const deal of DEALS) {
      if (deal.how === "order") {
        assert.ok(deal.start && deal.start in PAY_IN_FULL_STARTS, `${deal.id} opens without paying in full`);
      }
    }
  });

  it("the cards and the checkout say so", async () => {
    const { readFileSync } = await import("node:fs");
    const list = readFileSync(new URL("../components/DealsList.tsx", import.meta.url), "utf8");
    assert.match(list, /label="Payment" value=\{DEAL_PAYMENT_ROW\}/);
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    // The tee deal strip and the sticker deal strip.
    assert.equal(page.match(/\$\{DEAL_PAYMENT_TERMS\}`\}/g)?.length, 2);
    const hoodie = readFileSync(new URL("../features/apparel/HoodieSpecial.tsx", import.meta.url), "utf8");
    assert.equal(hoodie.match(/\{DEAL_PAYMENT_TERMS\}/g)?.length, 2);
  });
});

describe("only deals with a price are listed (Gabe, 2026-11-28)", () => {
  it("every deal on the page has a price and a regular price", async () => {
    const { DEALS } = await import("../lib/deals");
    for (const deal of DEALS) {
      assert.equal(typeof deal.price, "number", `${deal.id} has no price`);
      assert.equal(typeof deal.regularPrice, "number", `${deal.id} has no regular price`);
    }
  });
});
