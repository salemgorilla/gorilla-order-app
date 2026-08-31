import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildOrderConfirmation } from "../lib/order-confirmation";
import { createStallGuard } from "../lib/artwork-upload";

/**
 * 25 Aug: a first-time customer's 10.6 MB apparel artwork was silently
 * dropped. His quote went through, his screen said everything was fine, the
 * only recovery note went to the shop, and the job was lost to its deadline.
 *
 * ── THE DIAGNOSIS, FOR THE RECORD ─────────────────────────────────────────
 * Eliminated with evidence: the apparel flow HAS used the direct-to-blob
 * path since 6 Aug (git; bench-driven); isAllowedUploadPath accepts
 * quote-artwork/<file> and the production route minted a token for exactly
 * Kurt's pathname when driven; vercel.com/api/blob answers CORS with
 * allow-origin * including every multipart header (probed). The remaining
 * cause is the browser→blob-API leg failing in the customer's own
 * environment — unattributable six days later because NOTHING RECORDED THE
 * REASON ANYWHERE. The structural defect is the silence, and these tests
 * pin the three places it was broken:
 *
 *   1. the fallback now names its failure and the reason rides to the shop,
 *   2. the customer is told on the confirmation screen and in their record,
 *   3. the retry storm is bounded by a progress-keyed stall guard.
 */

describe("the customer's confirmation email carries the recovery", () => {
  const base = {
    quoteNumber: "GS-20260825-KURT1",
    customerEmail: "kurt@example.com",
    customerName: "Kurt",
    paymentEmailSent: false,
    printavoCreated: true,
    kiosk: false,
  };
  const dropped = [{ name: "IMG_7454.PNG", size: 11115708 }];

  test("names the file, gives one action, says nothing else is missing", () => {
    const result = buildOrderConfirmation({ ...base, droppedArtwork: dropped });

    assert.equal(result.send, true);
    if (!result.send) return;
    assert.match(result.text, /IMG_7454\.PNG/);
    assert.match(result.text, /10\.6 MB/);
    assert.match(result.text, /Reply to this email with the file/);
    assert.match(result.text, /Nothing else is missing/);
    assert.match(result.subject, /one file still needed/);
    assert.match(result.html, /IMG_7454\.PNG/);
  });

  test("a dropped file overrides the payment-email suppression", () => {
    // Printavo's payment email says nothing about a missing file, so ours
    // stops being a duplicate the moment something was dropped.
    const suppressed = buildOrderConfirmation({ ...base, paymentEmailSent: true });
    assert.equal(suppressed.send, false);

    const withDrop = buildOrderConfirmation({
      ...base,
      paymentEmailSent: true,
      droppedArtwork: dropped,
    });
    assert.equal(withDrop.send, true);
  });

  test("a quote with nothing dropped reads exactly as it always has", () => {
    const result = buildOrderConfirmation(base);
    assert.equal(result.send, true);
    if (!result.send) return;
    assert.doesNotMatch(result.text, /missing|couldn't accept/i);
    assert.equal(result.subject, "We've got your request — GS-20260825-KURT1");
  });

  test("the kiosk and bad-address suppressions still hold, drop or no drop", () => {
    // The handoff's do-not-break list: never route a customer message
    // through a fallback inbox; fail closed instead. The screen covers them.
    assert.equal(
      buildOrderConfirmation({ ...base, kiosk: true, droppedArtwork: dropped }).send,
      false
    );
    assert.equal(
      buildOrderConfirmation({
        ...base,
        customerEmail: "not-an-address",
        droppedArtwork: dropped,
      }).send,
      false
    );
  });
});

describe("the stall guard bounds the retry storm without killing slow uploads", () => {
  test("aborts after stallMs with no progress, and says why", async () => {
    const guard = createStallGuard(50);
    guard.expired.catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 90));
    assert.equal(guard.signal.aborted, true);
    assert.match(String(guard.signal.reason), /no upload progress/);
    guard.settle();
  });

  test("NEW bytes keep a slow upload alive", async () => {
    const guard = createStallGuard(60);
    guard.expired.catch(() => {});
    for (let i = 1; i <= 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      guard.poke(i * 1024);
    }
    // 150ms elapsed — well past stallMs — but never 60ms without progress.
    assert.equal(guard.signal.aborted, false);
    guard.settle();
  });

  test("a retry storm's zero-progress events cannot re-arm it", async () => {
    // The SDK fires loaded:0 at the START of every retry attempt. Found by
    // running the black-hole case: a reset-on-any-event guard was re-armed
    // by the very storm it exists to end, and never fired at all.
    const guard = createStallGuard(50);
    guard.expired.catch(() => {});
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      guard.poke(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(guard.signal.aborted, true);
    guard.settle();
  });

  test("the expired promise rejects on stall — the race's hard stop", async () => {
    const guard = createStallGuard(40);
    await assert.rejects(
      Promise.race([new Promise(() => {}), guard.expired]),
      /no upload progress/
    );
    guard.settle();
  });

  test("settle stops the clock so the timer cannot outlive the upload", async () => {
    const guard = createStallGuard(40);
    guard.expired.catch(() => {});
    guard.settle();
    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.equal(guard.signal.aborted, false);
  });
});

describe("the silence is wired shut end to end", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(
    new URL("../app/api/quote/route.ts", import.meta.url),
    "utf8"
  );
  const confirmation = readFileSync(
    new URL("../features/QuoteConfirmation.tsx", import.meta.url),
    "utf8"
  );
  const uploader = readFileSync(
    new URL("../lib/artwork-upload.ts", import.meta.url),
    "utf8"
  );

  test("the fallback names its failure instead of swallowing it", () => {
    assert.match(uploader, /failure: string \| null/);
    assert.match(uploader, /abortSignal: stall\.signal/);
  });

  test("the failure reason rides with the quote and is logged on the server", () => {
    assert.match(page, /artworkUploadFailures/);
    assert.match(route, /ARTWORK DIRECT UPLOAD FAILED in the customer's browser/);
    assert.match(route, /Direct upload failed first:/);
  });

  test("the confirmation screen tells the customer, prominently", () => {
    assert.match(confirmation, /droppedArtwork/);
    assert.match(confirmation, /role="alert"/);
    assert.match(confirmation, /don&rsquo;t resubmit the order/);
  });

  test("the customer's own copied record carries the gap, in every flow", () => {
    assert.match(page, /STILL NEEDED — YOUR ARTWORK/);
    const uses = page.match(/\$\{artworkGapSection\}/g) ?? [];
    assert.equal(uses.length, 3, "a flow's copy text dropped the artwork gap");
  });
});
