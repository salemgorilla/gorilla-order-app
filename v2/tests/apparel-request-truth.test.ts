import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildQuoteEmail } from "../lib/email";
import { buildPrintavoQuotePlan } from "../lib/printavo";

/**
 * The apparel REQUEST flow, the day the catalog came alive.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * selectedSs* deliberately fall back to the first catalog product/colour/
 * size so the CONFIGURATOR always has a live selection. The request flow
 * never asks those questions — and while the catalog was dark the
 * difference was invisible, because selectedSs* were null and every surface
 * fell through to the customer's own words.
 *
 * The morning Gabe's key went live, a customer who picked "Hats" and typed
 * "25 black hats, front logo embroidery" reviewed as:
 *
 *     Garment   Starter Tee
 *     Color     White
 *
 * — the pinned defaults, on the screen that says "Check everything before
 * submitting" — and the payload's supplier block named a Gildan 2000 SKU
 * the shop would read as the blank to order. The catalog-load effect went
 * further and WROTE the first product's name into the quote state itself.
 *
 * Verified by driving the request flow in Chromium against the production
 * catalog JSON (84/47/60 colors): before, review said "Starter Tee ·
 * White"; after, "Hats" with the notes, and the supplier block says "Not
 * selected" — exactly what it said the day before the key worked.
 *
 * These pin the wiring; the flows are closures over page state.
 */

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const review = readFileSync(
  new URL("../features/QuoteReviewCard.tsx", import.meta.url),
  "utf8"
);
const confirmation = readFileSync(
  new URL("../features/QuoteConfirmation.tsx", import.meta.url),
  "utf8"
);

describe("the pinned catalog defaults cannot speak for a request customer", () => {
  test("chosenSs* null out the pinned selection in request mode", () => {
    assert.match(
      page,
      /const chosenSsProduct = apparelIsRequestFlow \? null : selectedSsProduct;/
    );
    assert.match(
      page,
      /const chosenSsColor = apparelIsRequestFlow \? null : selectedSsColor;/
    );
    assert.match(
      page,
      /const chosenSsSize = apparelIsRequestFlow \? null : selectedSsSize;/
    );
  });

  test("the payload's supplier block reads the chosen values, never the pinned ones", () => {
    const supplier = page.split("supplier: {")[1]?.split("},")[0] ?? "";
    assert.match(supplier, /chosenSsProduct\?\.displayName/);
    assert.match(supplier, /chosenSsColor\?\.colorName/);
    assert.match(supplier, /chosenSsSize\?\.sku/);
    assert.doesNotMatch(supplier, /[^n]selectedSsProduct|[^n]selectedSsColor|[^n]selectedSsSize/);
  });

  test("the garment label falls through to the customer's words", () => {
    assert.match(
      page,
      /const selectedGarmentLabel =\s*\n?\s*chosenSsProduct\?\.customerLabel \|\|\s*\n?\s*chosenSsProduct\?\.displayName \|\|\s*\n?\s*apparelQuoteState\.garmentType;/
    );
  });

  test("the catalog load does not overwrite a request customer's garment fields", () => {
    // The sync exists FOR the configurator; unqualified it renamed whatever
    // the customer picked to the first catalog product on every page load.
    assert.match(
      page,
      /if \(!apparelIsRequestFlow && \(firstProduct \|\| firstColor\)\)/
    );
  });
});

describe("the review card shows the questions the flow actually asked", () => {
  test("a request branch exists ahead of the configurator branch", () => {
    const requestBranch = review.split(": isApparelRequest ? (")[1]?.split(": isApparelSelected ? (")[0] ?? "";
    assert.ok(requestBranch, "the request branch is missing");
    assert.match(requestBranch, /apparelQuote\.garmentType/);
    assert.match(requestBranch, /apparelQuote\.specialOrderNotes/);
    assert.match(requestBranch, /Quoted by hand/);
    // The rows below are form defaults in this flow — nobody answered them.
    assert.doesNotMatch(
      requestBranch,
      /<span>(?:Print Locations|Ink Colors|Sizes|Color)<\/span>/
    );
    assert.doesNotMatch(requestBranch, /selectedGarmentLabel|selectedSsColor/);
  });
});

describe("the confirmation repeats the request, not the defaults", () => {
  test("a request submission confirms garment, count and the notes", () => {
    const branch = confirmation.split("isApparelSubmitted && isApparelRequest ? (")[1]?.split("isApparelSubmitted ? (")[0] ?? "";
    assert.ok(branch, "the request branch is missing");
    assert.match(branch, /apparelQuote\.garmentType/);
    assert.match(branch, /apparelQuote\.specialOrderNotes/);
    assert.doesNotMatch(branch, /printLocations|inkColors|selectedSsColor/);
  });
});

/**
 * A request-mode payload as the browser now sends it: garmentType chosen,
 * count typed, notes written — colour, locations and ink EMPTY, because the
 * form never asked. The shop's two records must render those empties as
 * "not specified", never as a blank after a colon and never by resurrecting
 * a default.
 */
const hatsRequest = {
  customer: { customerName: "Dana", email: "dana@example.com" },
  production: { deliveryMethod: "Pickup", needBy: "2026-09-15" },
  product: {
    type: "T-Shirts & Apparel",
    garmentType: "Hats",
    quantity: 25,
    garmentColor: "",
    printLocations: [],
    inkColors: "",
    sizeBreakdown: "",
    specialOrder: true,
    specialOrderNotes: "25 black hats, front logo embroidery",
    supplier: {
      source: "S&S Activewear",
      productName: "Hats",
      supplierProductName: "Not selected",
      catalogStyle: "Not selected",
      colorName: "Not selected",
      sampleSize: "Not selected",
      sku: "Not selected",
      markedUpGarmentPrice: 0,
      image: null,
      outOfStock: false,
    },
  },
  pricing: { total: 0, quoteRequired: true },
};

describe("the shop email says 'not specified', not 'White · Front · 1 color'", () => {
  const email = buildQuoteEmail({
    quoteNumber: "GS-1042",
    receivedAt: new Date("2026-08-25T12:00:00Z").toISOString(),
    order: hatsRequest as never,
    artworkAnalysis: null,
  }).text;

  test("the unanswered questions read as unanswered", () => {
    // Colour falls through to the supplier block, whose request-mode value
    // is the literal "Not selected" — different words, same honesty.
    assert.match(email, /Color: Not selected/);
    assert.match(email, /Print Locations: Not specified/);
    assert.match(email, /Ink Colors: Not specified/);
  });

  test("no label is left with a blank after the colon", () => {
    assert.doesNotMatch(email, /^(Color|Print Locations|Ink Colors): *$/m);
  });

  test("the customer's own words are the spec", () => {
    assert.match(email, /What they need: 25 black hats, front logo embroidery/);
  });

  test("a configurator payload still prints its real answers", () => {
    const configured = buildQuoteEmail({
      quoteNumber: "GS-1043",
      receivedAt: new Date("2026-08-25T12:00:00Z").toISOString(),
      order: {
        ...hatsRequest,
        product: {
          ...hatsRequest.product,
          garmentType: "T-Shirts",
          garmentColor: "Navy",
          printLocations: ["Front", "Back"],
          inkColors: "2 colors",
          specialOrder: false,
          specialOrderNotes: "",
        },
        pricing: { total: 250, unitPrice: 10 },
      } as never,
      artworkAnalysis: null,
    }).text;

    assert.match(configured, /Color: Navy/);
    assert.match(configured, /Print Locations: Front, Back/);
    assert.match(configured, /Ink Colors: 2 colors/);
  });
});

describe("the Printavo note marks the unasked questions TBD", () => {
  const plan = buildPrintavoQuotePlan({
    quoteNumber: "GS-1042",
    order: hatsRequest,
    artworkAnalysis: null,
  } as never) as never as { customerNote: string };

  test("an empty locations array is TBD, not a blank line", () => {
    assert.match(plan.customerNote, /Print locations: TBD/);
    assert.match(plan.customerNote, /Color: Not selected/);
    assert.match(plan.customerNote, /Ink: TBD/);
  });
});

describe("the customer's own record carries the request", () => {
  const apparelText = page.split("GORILLA SALEM APPAREL QUOTE REQUEST")[1] ?? "";

  test("request-mode copy text prints the notes", () => {
    assert.match(apparelText, /Your Request: \$\{apparelQuote\.specialOrderNotes/);
  });

  test("the fabricated fields and the S&S block are configurator-only", () => {
    // In request mode nothing asked for colour, locations or ink — and the
    // S&S CATALOG DETAILS block would print the pinned defaults as if the
    // customer had picked a SKU.
    assert.match(apparelText, /isApparelRequest\s*\n?\s*\? `\nYour Request:/);
    assert.match(apparelText, /S&S Product: \$\{chosenSsProduct\?\.displayName/);
  });
});
