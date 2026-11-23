import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEALS, DEAL_STARTS, dealHref, liveDeals } from "../lib/deals";
import { readFileSync } from "node:fs";

describe("the deals list", () => {
  it("has unique ids", () => {
    assert.equal(new Set(DEALS.map((d) => d.id)).size, DEALS.length);
  });
  it("hides a deal after its last day, on that day still shows it", () => {
    const hoodie = DEALS.find((d) => d.id === "hoodie-special");
    assert.ok(hoodie?.endsOn);
    assert.ok(liveDeals(hoodie.endsOn).some((d) => d.id === "hoodie-special"));
    assert.ok(!liveDeals("2099-01-01").some((d) => d.id === "hoodie-special"));
  });
  it("links only into the app or to the shop's own email", () => {
    for (const deal of DEALS) {
      if (deal.how === "soon") continue;
      const href = dealHref(deal, "quote@gorillasalem.com");
      assert.ok(
        href.startsWith("/?start=") || href.startsWith("mailto:quote@gorillasalem.com?"),
        `${deal.id}: ${href}`
      );
    }
  });
  it("starts in-app deals only at a place the order page understands", () => {
    for (const deal of DEALS) {
      if (deal.how === "order" || deal.how === "estimate") {
        assert.ok(deal.start && DEAL_STARTS.includes(deal.start), deal.id);
      }
    }
  });
  it("every start value is one the order page handles", () => {
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    assert.match(page, /start === "hoodie-special"/);
    assert.match(page, /start === "stickers-deal"/);
    assert.match(page, /teeDealFor\(start\)/);
    assert.match(page, /start === "apparel"/);
  });
});
