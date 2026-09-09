/**
 * THE FUNNEL EVENTS, AND THE FACT THAT THEY CANNOT CARRY A CUSTOMER.
 *
 * lib/submission-log.ts made SUBMISSIONS countable. It cannot see anybody
 * who did not submit, because this app is entirely client-side until the
 * button — somebody can configure a run, read an estimate and close the
 * tab, and the server never hears a word. Five events close that gap.
 *
 * Five events are also five new chances to send a customer's email to a
 * third party, which is the failure mode of every analytics wrapper ever
 * written. So most of this file is about what CANNOT be sent: the values
 * are re-checked at runtime rather than trusted to the compiler, totals go
 * as bands rather than figures, and the upload reason — free text from the
 * SDK, which can carry a store id or a signed URL — is classified onto a
 * closed set before it leaves the page.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  classifyUploadFailure,
  estimateBand,
  sendAnalyticsEvent,
  type AnalyticsEvent,
} from "../lib/analytics";

type Sent = { name: string; data?: Record<string, unknown> };

const globals = globalThis as unknown as {
  window?: { va?: (kind: string, payload: Sent) => void };
};

let sent: Sent[] = [];

beforeEach(() => {
  sent = [];
  // The real SDK posts to window.va when the script has loaded. Standing in
  // for it is the only way to see what would actually leave the page.
  globals.window = {
    va: (kind, payload) => {
      if (kind === "event") sent.push(payload);
    },
  };
});

afterEach(() => {
  delete globals.window;
});

describe("it ships dark", () => {
  it("sends nothing when the Vercel script has not loaded", () => {
    // The per-project toggle is off: the script is never served, window.va
    // is undefined, and every call is a no-op. This is the state the code
    // ships in, so it has to be the state that cannot throw.
    globals.window = {};

    assert.doesNotThrow(() =>
      sendAnalyticsEvent({ name: "product_selected", flow: "stickers" })
    );
  });

  it("sends nothing on the server", () => {
    delete globals.window;

    assert.doesNotThrow(() =>
      sendAnalyticsEvent({ name: "product_selected", flow: "apparel" })
    );
    assert.equal(sent.length, 0);
  });

  it("never throws, whatever the page does to it", () => {
    globals.window = {
      va: () => {
        throw new Error("blocked by an extension");
      },
    };

    // A customer mid-quote must not lose a step transition to an analytics
    // call, and a browser with tracking blocked is most of them.
    assert.doesNotThrow(() =>
      sendAnalyticsEvent({ name: "step_reached", flow: "signs", step: "review" })
    );
  });
});

describe("the five events, and only those", () => {
  const events: AnalyticsEvent[] = [
    { name: "product_selected", flow: "stickers" },
    { name: "step_reached", flow: "apparel", step: "artwork" },
    { name: "estimate_shown", flow: "signs", band: "500_1500" },
    { name: "submit_ok", flow: "banners", door: "special" },
    { name: "upload_failed", flow: "apparel", reason: "no_store" },
  ];

  it("each one goes out under its own name", () => {
    for (const event of events) sendAnalyticsEvent(event);

    assert.deepEqual(
      sent.map((entry) => entry.name),
      [
        "product_selected",
        "step_reached",
        "estimate_shown",
        "submit_ok",
        "upload_failed",
      ]
    );
  });

  it("carrying only the fields that event is allowed", () => {
    for (const event of events) sendAnalyticsEvent(event);

    assert.deepEqual(Object.keys(sent[0].data ?? {}), ["flow"]);
    assert.deepEqual(Object.keys(sent[1].data ?? {}), ["flow", "step"]);
    assert.deepEqual(Object.keys(sent[2].data ?? {}), ["flow", "band"]);
    assert.deepEqual(Object.keys(sent[3].data ?? {}), ["flow", "door"]);
    assert.deepEqual(Object.keys(sent[4].data ?? {}), ["flow", "reason"]);
  });

  it("an extra field smuggled onto an event does not travel", () => {
    // The compiler refuses this; a cast, a JSON payload or a future caller
    // in a hurry does not. The allowlist is read at runtime for that reason.
    sendAnalyticsEvent({
      name: "product_selected",
      flow: "stickers",
      email: "stacey@example.com",
    } as unknown as AnalyticsEvent);

    assert.deepEqual(sent[0].data, { flow: "stickers" });
  });
});

describe("nothing that looks like a person can be sent", () => {
  const nasty = [
    "stacey@example.com",
    "logo-final-v2.png",
    "GS-20260909-AB12C",
    "Stacey Miller",
    "https://blob.vercel-storage.com/abc123",
    "x".repeat(64),
  ];

  it("a malformed value drops the whole event, not just the field", () => {
    for (const value of nasty) {
      sent = [];
      sendAnalyticsEvent({
        name: "step_reached",
        flow: "stickers",
        step: value,
      } as AnalyticsEvent);

      assert.equal(sent.length, 0, `${value} was sent`);
    }
  });

  it("refused rather than trimmed — a truncated email is still an email", () => {
    sendAnalyticsEvent({
      name: "upload_failed",
      flow: "apparel",
      reason: "stacey@example.com",
    } as unknown as AnalyticsEvent);

    assert.equal(sent.length, 0);
  });

  it("the quote number is deliberately absent from every event", () => {
    const source = readFileSync(
      new URL("../lib/analytics.ts", import.meta.url),
      "utf8"
    );
    const shape = source.slice(
      source.indexOf("export type AnalyticsEvent"),
      source.indexOf("const ALLOWED")
    );

    // In the server log it is a key to the shop's own Printavo record. Here
    // it would be a key handed to a third party that could join a browsing
    // session to a person.
    assert.doesNotMatch(shape, /quoteNumber/);
    assert.doesNotMatch(shape, /\btotal\b/);
    assert.doesNotMatch(shape, /email|name.*customer/i);
  });
});

describe("money goes as a band, never as a figure", () => {
  it("the bands", () => {
    assert.equal(estimateBand(0), "under_100");
    assert.equal(estimateBand(99.99), "under_100");
    assert.equal(estimateBand(100), "100_500");
    assert.equal(estimateBand(461.12), "100_500");
    assert.equal(estimateBand(500), "500_1500");
    assert.equal(estimateBand(914.52), "500_1500");
    assert.equal(estimateBand(1500), "1500_5000");
  });

  it("the top boundary is the one the app already thinks in", () => {
    // FULL_PAYMENT_CEILING is $4,999.99 — above it an order takes a 50%
    // deposit instead of the whole amount. A band boundary in the same
    // place makes the count of deposit-sized quotes readable off the chart.
    assert.equal(estimateBand(4999.99), "1500_5000");
    assert.equal(estimateBand(5000), "over_5000");
  });

  it("no exact figure survives into the event", () => {
    sendAnalyticsEvent({
      name: "estimate_shown",
      flow: "apparel",
      band: estimateBand(7027.13),
    });

    assert.deepEqual(sent[0].data, { flow: "apparel", band: "over_5000" });
    assert.doesNotMatch(JSON.stringify(sent[0]), /7027|7,027/);
  });
});

describe("the upload reason is classified, never forwarded", () => {
  it("each failure the app can produce lands on a word", () => {
    assert.equal(
      classifyUploadFailure("file exceeds the 100 MB direct-upload cap"),
      "too_large"
    );
    assert.equal(
      classifyUploadFailure("Vercel Blob: This store does not exist"),
      "no_store"
    );
    assert.equal(
      classifyUploadFailure("Blob storage is not configured on this deployment."),
      "no_store"
    );
    assert.equal(classifyUploadFailure("the upload timed out after 30s"), "timeout");
    assert.equal(classifyUploadFailure("TypeError: fetch failed"), "network");
  });

  it("an unrecognised failure is 'unknown', which is a real answer", () => {
    assert.equal(classifyUploadFailure("something nobody has seen yet"), "unknown");
    assert.equal(classifyUploadFailure(""), "unknown");
  });

  it("the SDK's own sentence never travels with it", () => {
    // The real hazard: the failure text comes from whichever layer failed
    // and has carried store ids and signed URLs before now.
    const leaky =
      "PUT https://abc123.public.blob.vercel-storage.com/logo-final.png failed";

    sendAnalyticsEvent({
      name: "upload_failed",
      flow: "stickers",
      reason: classifyUploadFailure(leaky),
    });

    const payload = JSON.stringify(sent[0]);

    assert.doesNotMatch(payload, /blob\.vercel-storage/);
    assert.doesNotMatch(payload, /logo-final/);
    assert.doesNotMatch(payload, /abc123/);
  });
});

describe("the page wires all five", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  it("every event has a call site", () => {
    for (const name of [
      "product_selected",
      "step_reached",
      "estimate_shown",
      "submit_ok",
      "upload_failed",
    ]) {
      assert.match(page, new RegExp(`name: "${name}"`), name);
    }
  });

  it("the upload failure is classified at the call site", () => {
    // Not `reason: uploaded.failure`. That string is right for the shop
    // email and for the server log, and wrong for a third party.
    assert.match(page, /reason: classifyUploadFailure\(uploaded\.failure\)/);

    // And the raw string is NOT inside the analytics call — it stays on the
    // uploadFailures record, which is what the shop email and the server
    // log read. Both are correct; only one of them is a third party.
    const call = page.slice(
      page.indexOf('name: "upload_failed"'),
      page.indexOf("});", page.indexOf('name: "upload_failed"'))
    );

    assert.doesNotMatch(call, /reason: uploaded\.failure/);
    assert.match(page, /reason: uploaded\.failure/); // still on the shop record
  });

  it("the estimate is banded at the call site", () => {
    assert.match(page, /band: estimateBand\(estimateBar\.total\)/);
  });

  it("the layout mounts the component that ships dark", () => {
    const layout = readFileSync(
      new URL("../app/layout.tsx", import.meta.url),
      "utf8"
    );

    assert.match(layout, /<Analytics \/>/);
    assert.match(layout, /@vercel\/analytics\/next/);
  });
});
