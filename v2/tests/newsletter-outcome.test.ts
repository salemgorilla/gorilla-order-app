/**
 * THE EMAIL SAID "OPTED IN" OVER A SIGN-UP THAT HAD ALREADY FAILED.
 *
 * #206 fixed isSubscriberStoreConfigured so it recognised the OIDC store
 * production actually uses. The next orders, on 19 October, logged:
 *
 *   NEWSLETTER NOT SENT for GS-20261019-UN6FXF5F: Vercel Blob: Failed to fetch blob: 400 Bad Request
 *
 * — a DIFFERENT reason, the first evidence that the store may not accept
 * the private blobs the subscriber list is written as. That is a question
 * for infrastructure. This file is about the other thing the same two
 * orders exposed: with the check now answering "yes, configured", the shop
 * email dropped its "NOT added to any list" warning, while the add was
 * failing underneath it. The email is built before the attempt, so it could
 * only know that a store EXISTED, not that the write LANDED. The one trace
 * was a log line Vercel deletes within the hour.
 *
 * So the email now carries the actual outcome, quoted as the store gave it,
 * and the attempt moved ahead of the email so there is an outcome to carry.
 * That puts a blob call on the path that gets a paid order to the shop,
 * which is why the second half of this file is about the deadline.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildCustomerLines, buildQuoteEmail } from "../lib/email";
import {
  NEWSLETTER_TIMEOUT_MESSAGE,
  newsletterGap,
  subscribeWithin,
  type NewsletterPayload,
} from "../lib/newsletter";
import type { SubscriberStore } from "../lib/subscribers";

const optedIn = {
  customerName: "Stacey",
  email: "stacey@example.com",
  newsletterOptIn: true,
};

const row = (lines: string[]) =>
  lines.find((entry) => entry.startsWith("Newsletter")) ?? "";

const payload: NewsletterPayload = {
  email: "stacey@example.com",
  name: "Stacey",
  company: "",
  phone: "",
  heardAbout: [],
  quoteNumber: "GS-20261019-AAAAAAAA",
  consent: {
    optedIn: true,
    at: "2026-10-19T16:46:09.622Z",
    source: "labs.gorillasalem.com quote builder",
    preChecked: true,
  },
};

describe("the shop email reports what actually happened to the sign-up", () => {
  it("quotes the store's own error, which is the diagnosis", () => {
    const text = row(
      buildCustomerLines({
        customer: optedIn,
        newsletterConfigured: true,
        newsletterNote: "Vercel Blob: Failed to fetch blob: 400 Bad Request",
      })
    );

    assert.match(text, /Opted in \(box shipped pre-ticked\)/);
    assert.match(text, /NOT added to any list: Vercel Blob: Failed to fetch blob: 400 Bad Request\./);
    assert.match(text, /backfilled/, "the consent is still recorded, and the row must say so");
  });

  it("says nothing extra when it landed", () => {
    for (const newsletterNote of [null, undefined]) {
      const text = row(
        buildCustomerLines({ customer: optedIn, newsletterConfigured: true, newsletterNote })
      );

      assert.doesNotMatch(text, /NOT added/);
    }
  });

  it("'no hook configured' keeps its own wording and wins over a note", () => {
    // The two answers are different facts. "Nowhere to put it" is a
    // deployment problem; a note is a write that was tried and refused.
    const text = row(
      buildCustomerLines({
        customer: optedIn,
        newsletterConfigured: false,
        newsletterNote: "something else",
      })
    );

    assert.match(text, /no newsletter hook is configured/i);
    assert.doesNotMatch(text, /something else/);
  });

  it("a customer who declined gets no warning about a list they are not on", () => {
    const text = row(
      buildCustomerLines({
        customer: { ...optedIn, newsletterOptIn: false },
        newsletterNote: "Vercel Blob: Failed to fetch blob: 400 Bad Request",
      })
    );

    assert.match(text, /Declined/);
    assert.doesNotMatch(text, /NOT added/);
  });

  it("both renderings carry it, or the archive disagrees with the inbox", () => {
    const email = buildQuoteEmail({
      quoteNumber: "GS-20261019-AAAAAAAA",
      receivedAt: new Date("2026-10-19T16:46:00Z").toISOString(),
      order: {
        customer: optedIn,
        production: { deliveryMethod: "Pickup", needBy: "2026-11-20" },
        product: { type: "Custom Stickers", quantity: 100 },
        pricing: { total: 122.5 },
      } as never,
      artworkAnalysis: null,
      newsletterConfigured: true,
      newsletterNote: "Vercel Blob: Failed to fetch blob: 400 Bad Request",
    });

    assert.match(email.text, /NOT added to any list: Vercel Blob/);
    assert.match(email.html, /NOT added to any list: Vercel Blob/);
  });
});

describe("what counts as a gap", () => {
  it("a sign-up that landed has none", () => {
    assert.equal(newsletterGap({ sent: true }), null);
  });

  it("a failed write gives its error", () => {
    assert.equal(
      newsletterGap({ sent: false, skipped: false, error: "Vercel Blob: Failed to fetch blob: 400 Bad Request" }),
      "Vercel Blob: Failed to fetch blob: 400 Bad Request"
    );
  });

  it("a skip gives its reason — including the one the shop must act on", () => {
    assert.equal(
      newsletterGap({
        sent: false,
        skipped: true,
        reason: "Previously unsubscribed — not re-added. Ask them directly.",
      }),
      "Previously unsubscribed — not re-added. Ask them directly"
    );
  });

  it("trailing punctuation is trimmed, because the row adds its own full stop", () => {
    assert.equal(newsletterGap({ sent: false, skipped: true, reason: "No usable email address.  " }), "No usable email address");
  });
});

describe("the sign-up is bounded, because it now sits ahead of the shop's email", () => {
  const hangingStore: SubscriberStore = {
    put: () => new Promise<void>(() => {}),
    read: () => new Promise<string | null>(() => {}),
    list: () => new Promise(() => {}),
  };

  const memoryStore = (): SubscriberStore => {
    const records = new Map<string, string>();
    return {
      async put(path, body) { records.set(path, body); },
      async read(path) { return records.get(path) ?? null; },
      async list() { return { pathnames: [...records.keys()] }; },
    };
  };

  it("a store that never answers cannot hold the email past the deadline", async () => {
    const started = Date.now();
    const result = await subscribeWithin(payload, 60, hangingStore);
    const took = Date.now() - started;

    assert.deepEqual(result, { sent: false, skipped: false, error: NEWSLETTER_TIMEOUT_MESSAGE });
    assert.ok(took >= 50, `returned in ${took}ms, before the deadline`);
    assert.ok(took < 1000, `took ${took}ms — the deadline did not hold`);
  });

  it("a healthy store is not delayed to the deadline", async () => {
    const started = Date.now();
    const result = await subscribeWithin(payload, 5_000, memoryStore());

    assert.deepEqual(result, { sent: true });
    assert.ok(Date.now() - started < 1000, "the timer was waited out");
  });

  it("a store that throws becomes a reason, not a rejection", async () => {
    const broken: SubscriberStore = {
      put: async () => { throw new Error("Vercel Blob: Failed to fetch blob: 400 Bad Request"); },
      read: async () => { throw new Error("Vercel Blob: Failed to fetch blob: 400 Bad Request"); },
      list: async () => { throw new Error("nope"); },
    };

    const result = await subscribeWithin(payload, 1_000, broken);

    assert.equal(result.sent, false);
    assert.equal(newsletterGap(result), "Vercel Blob: Failed to fetch blob: 400 Bad Request");
  });
});

describe("the route wires it in the right order", () => {
  const route = readFileSync(new URL("../app/api/quote/route.ts", import.meta.url), "utf8");
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("the sign-up is attempted BEFORE the shop email, so the email can report it", () => {
    const signup = code.indexOf("await subscribeWithin(");
    const email = code.indexOf("await sendQuoteEmail(");

    assert.ok(signup > 0 && email > 0, "expected both calls in the route");
    assert.ok(signup < email, "the email is built before the outcome exists — it would report a store, not a result");
  });

  it("the email is handed the outcome", () => {
    assert.match(code, /newsletterNote: optedIn \? newsletterGap\(newsletter\) : null/);
  });

  it("the route never calls the unbounded version", () => {
    // subscribeToNewsletter has no deadline. On this path a hung store would
    // stop a paid order reaching the shop.
    assert.doesNotMatch(code, /\bsubscribeToNewsletter\(/);
  });

  it("it runs after the duplicate check, so a retry cannot subscribe anyone twice", () => {
    const duplicate = code.indexOf("DUPLICATE SUBMIT");
    const signup = code.indexOf("await subscribeWithin(");

    assert.ok(duplicate > 0 && duplicate < signup);
  });

  it("no refusal sits between the duplicate check and the sign-up", () => {
    // Otherwise someone could be added to a list for an order that was then
    // turned away.
    const between = code.slice(code.indexOf("DUPLICATE SUBMIT"), code.indexOf("await subscribeWithin("));
    const returns = [...between.matchAll(/return NextResponse\.json\(/g)].length;

    assert.equal(returns, 1, `expected only the duplicate's own return, found ${returns}`);
  });
});
