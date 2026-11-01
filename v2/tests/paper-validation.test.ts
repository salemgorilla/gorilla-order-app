/**
 * What a paper quote request needs before it can be sent, and what it does not.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

import { defaultPaperSpec } from "../lib/paper";
import { getPaperFieldErrors, getPaperValidationSummary } from "../lib/validation";
import { addBusinessDays } from "../lib/turnaround";
import { turnaroundLaneFor } from "../lib/turnaround";

const TODAY = "2026-10-26"; // a Monday
const FAR = addBusinessDays(TODAY, 30);

const complete = {
  customer: { customerName: "Dana", email: "dana@example.com" },
  production: { needBy: FAR },
};

describe("a complete request has no errors", () => {
  test("and does not ask for artwork", () => {
    assert.deepEqual(getPaperFieldErrors(defaultPaperSpec(), complete, TODAY), {});
    assert.deepEqual(getPaperValidationSummary(defaultPaperSpec(), complete, TODAY), []);
  });
});

describe("what it does ask for", () => {
  test("a name, a working email and a date", () => {
    const errors = getPaperFieldErrors(
      defaultPaperSpec(),
      { customer: { customerName: " ", email: "dana@gmailcom" }, production: { needBy: "" } },
      TODAY
    );

    assert.ok(errors.customerName);
    assert.ok(errors.customerEmail);
    assert.ok(errors.needBy);
  });

  test("a spec the catalogue sells", () => {
    const errors = getPaperFieldErrors(
      { ...defaultPaperSpec("postcards"), stock: "Cardboard" },
      complete,
      TODAY
    );

    assert.ok(errors.paperSpec);
  });

  test("a date on the slow lane: paper is made elsewhere and shipped in", () => {
    assert.equal(turnaroundLaneFor({ isApparel: false, isSigns: false, isPaper: true, signsFamily: "signs" }), "slow");

    const tooSoon = getPaperFieldErrors(
      defaultPaperSpec(),
      { ...complete, production: { needBy: addBusinessDays(TODAY, 1) } },
      TODAY
    );

    assert.ok(tooSoon.needBy, "next-day paper would be a promise nobody can keep");
  });

  test("the checklist lists them in the order the form asks, once each", () => {
    const summary = getPaperValidationSummary(
      { ...defaultPaperSpec(), quantity: 3 },
      { customer: { customerName: "", email: "" }, production: { needBy: "" } },
      TODAY
    );

    assert.equal(summary.length, 4);
    assert.match(summary[0], /quantities/i, "the spec comes first: it is on the details step");
  });
});

describe("the page is wired so paper cannot fall into the sticker branch", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "");

  test("every sticker fallthrough names paper", () => {
    // Three sites derive "is this the sticker flow" from the absence of the
    // other flows. A fourth flow that is not named there is a sticker flow.
    const sites = code.match(/!isSignsSelected && !isApparelSelected(?! && !isPaperSelected)/g) ?? [];
    assert.equal(sites.length, 0, "a sticker fallthrough forgot paper");

    const named = code.match(/!isSignsSelected && !isApparelSelected && !isPaperSelected/g) ?? [];
    assert.equal(named.length, 3);
  });

  test("validation checks paper first", () => {
    assert.match(code, /function getCurrentFieldErrors\(\): FieldErrors \{\s*if \(isPaperSelected\)/);
    assert.match(code, /function getCurrentValidationErrors\(\) \{\s*if \(isPaperSelected\)/);
  });

  test("the payload is a paper payload with no money in it", () => {
    const start = code.indexOf("type: PAPER_PRODUCT_TYPE");
    assert.ok(start > 0, "the paper payload branch is gone");
    const body = code.slice(start, code.indexOf("if (isApparelSelected) {", start));

    assert.match(body, /type: PAPER_PRODUCT_TYPE/);
    assert.match(body, /quoteRequired: true/);
    assert.match(body, /total: 0/);
    assert.doesNotMatch(body, /garmentType|supplier|signType|sticker/i);
  });

  test("a discount code can never ride a paper order", () => {
    assert.match(code, /isSignsSelected \|\| isApparelSelected \|\| isPaperSelected\s*\?\s*null/);
    assert.match(code, /!isApparelSelected && !isSignsSelected && !isPaperSelected && \(\s*<DiscountCodeCard/);
  });

  test("the builder, the previews and the review card all know about paper", () => {
    assert.equal((code.match(/<PaperRequestBuilder/g) ?? []).length, 1);
    assert.match(code, /const previewCard = isPaperSelected/);
    assert.match(code, /const summaryCard = isPaperSelected/);
    assert.match(code, /<QuoteReviewCard\s+isPaperSelected=\{isPaperSelected\}/);
    assert.match(code, /isPaperSubmitted=\{isPaperSubmitted\}/);
  });

  test("selecting paper does not flip the apparel flow into special-order mode", () => {
    assert.match(code, /product\.status === "request" && product\.id === "apparel"/);
  });
});
