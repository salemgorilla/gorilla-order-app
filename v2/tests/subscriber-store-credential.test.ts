/**
 * THE SAME STORE, WORKING AND "NOT CONFIGURED" IN ONE REQUEST.
 *
 * The health check's 13 October run placed two orders a few minutes apart.
 * Both logged `artwork=blob delivered=true` — the blob store took a 9 MB
 * file — and both logged, from the same request:
 *
 *   NEWSLETTER NOT SENT for GS-20261013-3OUQES6F: No subscriber store configured.
 *
 * isSubscriberStoreConfigured checked BLOB_READ_WRITE_TOKEN and nothing else.
 * Production authenticates with OIDC (VERCEL_OIDC_TOKEN + BLOB_STORE_ID),
 * which the SDK prefers and every other blob call rides. So the newsletter,
 * /api/unsubscribe and the subscriber export were all dark on a store that
 * was answering.
 *
 * These tests drive the env shapes that actually occur, the first being the
 * one production is in.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { isNewsletterConfigured } from "../lib/newsletter";
import { isSubscriberStoreConfigured } from "../lib/subscriber-store";

const KEYS = ["BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "VERCEL_OIDC_TOKEN", "VERCEL"] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("the subscriber store is configured exactly when the SDK can reach it", () => {
  test("PRODUCTION: a connected store on Vercel, no read-write token", () => {
    // The OIDC token arrives per request as a header on Vercel, so the env
    // var is empty there too. BLOB_STORE_ID plus a Vercel runtime is the case.
    process.env.BLOB_STORE_ID = "store_abc123";
    process.env.VERCEL = "1";

    assert.equal(
      isSubscriberStoreConfigured(),
      true,
      "this is the shape production is in, and the one that silently dropped every opt-in"
    );
  });

  test("the newsletter follows the store, so the opt-in is actually kept", () => {
    process.env.BLOB_STORE_ID = "store_abc123";
    process.env.VERCEL = "1";

    assert.equal(isNewsletterConfigured(), true);
  });

  test("local development with a read-write token still counts", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_abc123_secret";

    assert.equal(isSubscriberStoreConfigured(), true);
  });

  test("nothing configured is still nothing — the honest 'not added' row survives", () => {
    // Gabe, 2026-09-09: "Don't hide the box." The shop email saying the
    // sign-up went nowhere is the fix for a store that genuinely is not
    // there, and it must keep firing in that case.
    assert.equal(isSubscriberStoreConfigured(), false);
    assert.equal(isNewsletterConfigured(), false);
  });

  test("a whitespace-only token is not a credential", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "   \n";

    assert.equal(isSubscriberStoreConfigured(), false);
  });
});
