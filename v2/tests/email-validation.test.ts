import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { looksLikeEmailAddress } from "../lib/email-address";
import {
  getApparelFieldErrors,
  getEmailError,
  getOrderFieldErrors,
  getSignsFieldErrors,
} from "../lib/validation";

/**
 * What this locks down: all three flows once checked `!email.trim()` and
 * nothing else, so "x" was a valid email address as far as this app was
 * concerned. The address then became the Printavo contact, the recipient of a
 * live payment link, and half the /track lookup — and the customer got a green
 * confirmation screen for an order nobody could reach them about.
 */

/** Typos and junk a real form actually receives. */
const UNREACHABLE = [
  "x",
  "dana",
  "dana@gmailcom",
  "dana@",
  "@example.com",
  "no at sign",
  "two@@ats.com",
  "spaces in@example.com",
  "trailing space@ example.com",
  "a@b",
  "",
  "   ",
];

/** Ordinary addresses that must keep working. */
const REACHABLE = [
  "dana@example.com",
  "first.last@example.co.uk",
  "dana+stickers@example.com",
  "d@e.io",
  "DANA@EXAMPLE.COM",
  "  dana@example.com  ",
];

describe("getEmailError", () => {
  it("rejects everything a provider would bounce", () => {
    for (const email of UNREACHABLE) {
      assert.ok(
        getEmailError(email),
        `expected ${JSON.stringify(email)} to be rejected`
      );
    }
  });

  it("accepts ordinary addresses, including tags, subdomains and stray spaces", () => {
    for (const email of REACHABLE) {
      assert.equal(
        getEmailError(email),
        null,
        `expected ${JSON.stringify(email)} to be accepted`
      );
    }
  });

  it("distinguishes empty from malformed — they need different messages", () => {
    assert.match(String(getEmailError("")), /Enter your email/);
    assert.match(String(getEmailError("dana@gmailcom")), /@ and a domain/);
  });

  it("rejects the undeliverable shapes the old local copies allowed", () => {
    // /api/lead and the abandoned-quote beacon each carried their own regex,
    // looser than this one on exactly these inputs. No provider accepts them,
    // so the extra permissiveness only ever admitted leads nobody could
    // follow up.
    for (const email of ["a@b.c.", "a@b..c", "dana@example.com."]) {
      assert.ok(
        getEmailError(email),
        `expected ${JSON.stringify(email)} to be rejected`
      );
    }
  });

  it("is the same predicate lib/email.ts uses before sending", () => {
    // If these ever diverge, the form accepts an address the mail path then
    // refuses — which is the silent-failure shape this whole fix is about.
    for (const email of [...UNREACHABLE, ...REACHABLE]) {
      assert.equal(
        getEmailError(email) === null,
        looksLikeEmailAddress(email),
        `disagreement on ${JSON.stringify(email)}`
      );
    }
  });
});

/** Minimal orders that are valid apart from the address under test. */
function stickerOrder(email: string) {
  return {
    production: { needBy: "2026-09-01", deliveryMethod: "Pickup" },
    customer: { customerName: "Dana", email },
    artwork: { file: {} },
    items: [],
  } as never;
}

function signsOrder(email: string) {
  return {
    production: { needBy: "2026-09-01" },
    customer: { customerName: "Dana", email },
    artwork: { file: {} },
  } as never;
}

describe("all three flows enforce it", () => {
  // The recurring defect in this repo is a rule that is right in one flow and
  // missing in its siblings, so each one is checked separately rather than
  // trusting that they share code today.
  it("stickers reject a malformed address", () => {
    assert.ok(getOrderFieldErrors(stickerOrder("dana@gmailcom")).customerEmail);
    assert.equal(
      getOrderFieldErrors(stickerOrder("dana@example.com")).customerEmail,
      undefined
    );
  });

  it("signs reject a malformed address", () => {
    const signsQuote = {
      templateId: "t1",
      quantity: 1,
      size: "2x4",
      customWidthInches: 0,
      customHeightInches: 0,
    };

    assert.ok(
      getSignsFieldErrors(signsQuote, signsOrder("dana@gmailcom"), false)
        .customerEmail
    );
    assert.equal(
      getSignsFieldErrors(signsQuote, signsOrder("dana@example.com"), false)
        .customerEmail,
      undefined
    );
  });

  it("apparel rejects a malformed address", () => {
    const apparelQuote = {
      specialOrder: true,
      specialOrderNotes: "Two dozen black tees, front print.",
      quantity: 24,
      printLocations: ["front"],
    };

    assert.ok(
      getApparelFieldErrors(apparelQuote, signsOrder("dana@gmailcom"), 24)
        .customerEmail
    );
    assert.equal(
      getApparelFieldErrors(apparelQuote, signsOrder("dana@example.com"), 24)
        .customerEmail,
      undefined
    );
  });

  it("stickers still reject an empty address", () => {
    // The old rule's one real job. Keeping it proven means the rewrite cannot
    // have traded one gap for another.
    assert.ok(getOrderFieldErrors(stickerOrder("   ")).customerEmail);
  });
});
