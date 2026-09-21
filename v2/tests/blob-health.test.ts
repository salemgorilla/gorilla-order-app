/**
 * "CONFIGURED" HAS TO MEAN THE UPLOAD WILL WORK.
 *
 * ── THE FAILURE THIS EXISTS FOR ───────────────────────────────────────────
 * On 2026-09-01, production logged this on a real customer's submission:
 *
 *   ARTWORK DIRECT UPLOAD FAILED in the customer's browser:
 *   "IMG_0528.jpeg" — Vercel Blob: This store does not exist.
 *
 * At the same moment /api/artwork-upload reported `configured: true`,
 * because it checked that BLOB_READ_WRITE_TOKEN was SET. The token was set.
 * The store it named was gone.
 *
 * The browser reads that boolean, and it decides which ceiling the upload
 * box advertises: 100 MB when configured, 3.5 MB when not. So for a week
 * the app told every customer it would take a 100 MB file while the real
 * ceiling was 3.5 MB and anything over it was dropped from the quote
 * (lib/upload-limits.ts, isArtworkTooLargeToAttach). The oversized warning
 * in the upload box is keyed to the same ceiling — so the wrong boolean
 * also switched that warning off. One boolean, the whole safety net.
 *
 * Stuart Hinton's file was 204 KB and rode the fallback. That is luck, not
 * design.
 *
 * These tests drive the real checkBlobStore() against a stubbed Vercel Blob
 * API, using the SDK's own error envelope, so the sentence the endpoint
 * reports is the sentence the SDK actually produces.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  checkBlobStore,
  describeBlobHealth,
  readTokenStoreId,
  resetBlobHealthCache,
} from "../lib/blob-health";

const realToken = process.env.BLOB_READ_WRITE_TOKEN;

/** How many times the store was actually asked. This is what proves caching. */
let calls = 0;

/**
 * A Vercel Blob store, answering one way.
 *
 * INJECTED, not stubbed on globalThis. The SDK issues its request through
 * `undici.fetch`, so replacing `globalThis.fetch` does nothing at all — the
 * "stubbed" call goes to the real API and hangs on the retry ladder. That
 * cost a debugging round, and the injection point in checkBlobStore exists
 * because of it.
 */
function store(answer: { ok: true } | { ok: false; message: string }) {
  calls = 0;

  return async () => {
    calls += 1;

    if (!answer.ok) {
      // The SDK's own error class carries exactly this message text.
      throw new Error(`Vercel Blob: ${answer.message}`);
    }
  };
}

/** What production actually logged on 1 Sep, word for word. */
const DEAD = { ok: false as const, message: "This store does not exist" };
const LIVE = { ok: true as const };

beforeEach(() => {
  resetBlobHealthCache();
  // A syntactically real read-write token: the SDK parses the store id out
  // of it before it will make a request at all.
  process.env.BLOB_READ_WRITE_TOKEN =
    "vercel_blob_rw_1234567890abcdefg_abcdefghijklmnopqrstuvwxyz";
});

afterEach(() => {
  resetBlobHealthCache();

  if (realToken === undefined) {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  } else {
    process.env.BLOB_READ_WRITE_TOKEN = realToken;
  }
});

describe("a token naming a store that is gone is not configuration", () => {
  test("the store the customer's file would go to is probed, not the env", async () => {
    const health = await checkBlobStore({ ask: store(DEAD) });

    assert.equal(health.reachable, false);
    assert.equal(health.hasToken, true, "the token IS set — that was never the problem");
    assert.equal(calls, 1, "nothing was asked of the store");
  });

  test("the SDK's own sentence is what gets reported", async () => {
    // "This store does not exist" names the fix. A paraphrase would not,
    // and this exact string went a week without being seen by anyone.
    const health = await checkBlobStore({ ask: store(DEAD) });

    assert.match(String(health.error), /store does not exist/i);
  });

  test("the advice names the dashboard action, not the status", async () => {
    const advice = describeBlobHealth(await checkBlobStore({ ask: store(DEAD) }));

    assert.ok(advice);
    assert.match(advice, /Storage/);
    assert.match(advice, /redeploy/i);
    // And it says what the customer experiences meanwhile, so nobody reads
    // this as "uploads are broken".
    assert.match(advice, /collected by email/i);
  });

  test("a live store is reachable and needs no advice", async () => {
    const health = await checkBlobStore({ ask: store(LIVE) });

    assert.equal(health.reachable, true);
    assert.equal(health.error, null);
    assert.equal(describeBlobHealth(health), null);
  });
});

describe("no token at all is a different problem, and says so", () => {
  test("it does not probe, and the advice names the variable", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const health = await checkBlobStore({ ask: store(LIVE) });

    assert.equal(health.reachable, false);
    assert.equal(health.hasToken, false);
    assert.equal(calls, 0, "probed with no credential to probe with");

    const advice = describeBlobHealth(health);
    assert.ok(advice);
    assert.match(advice, /BLOB_READ_WRITE_TOKEN/);
    // The OIDC trap: a connected store can provision credentials that work
    // for server-side calls and NOT for the client upload path.
    assert.match(advice, /OIDC/);
  });
});

describe("the probe is on the page-load path, so it is cached", () => {
  test("a second call inside the window asks the store nothing", async () => {
    const live = store(LIVE);

    await checkBlobStore({ now: 1_000, ask: live });
    await checkBlobStore({ now: 1_500, ask: live });

    assert.equal(calls, 1, "every pageview would probe the store");
  });

  test("a healthy answer is held for a minute", async () => {
    const live = store(LIVE);

    await checkBlobStore({ now: 0, ask: live });
    await checkBlobStore({ now: 59_000, ask: live });
    assert.equal(calls, 1);

    await checkBlobStore({ now: 61_000, ask: live });
    assert.equal(calls, 2);
  });

  test("a FAILURE is held for less, so a fix shows up quickly", async () => {
    // The interesting moment is the one just after someone reconnects a
    // store in the dashboard. Waiting a full minute to see it is how a fix
    // gets mistaken for a non-fix.
    const dead = store(DEAD);

    await checkBlobStore({ now: 0, ask: dead });
    assert.equal(calls, 1);

    await checkBlobStore({ now: 11_000, ask: dead });
    assert.equal(calls, 2, "a failure was cached as long as a success");
  });

  test("a burst on a cold cache shares one probe", async () => {
    const live = store(LIVE);

    const [a, b, c] = await Promise.all([
      checkBlobStore({ now: 0, ask: live }),
      checkBlobStore({ now: 0, ask: live }),
      checkBlobStore({ now: 0, ask: live }),
    ]);

    assert.equal(calls, 1, "three visitors, three probes");
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
  });
});

describe("the probe never becomes the outage", () => {
  test("a store that never answers is given up on, not waited for", async () => {
    /**
     * THE ONE THAT MATTERS FOR LATENCY. This endpoint is called by every
     * visitor's browser on page load. The SDK retries a network error ten
     * times with backoff, and — measured — `list` with an
     * AbortSignal.timeout(3000) had still not returned 45 seconds later
     * against a black-holed network. So the deadline is enforced in
     * lib/blob-health.ts with a race, not delegated to the SDK.
     *
     * A never-resolving probe stands in for that. If the deadline ever
     * stops being enforced here, this test hangs — which is exactly what
     * the endpoint would do.
     */
    const started = Date.now();

    /**
     * The deadline's timer is unref'd — a health check must never hold a
     * serverless invocation open after its response has gone. In a real
     * request the pending response keeps the loop alive; in this test
     * nothing else is pending, so without this the process would exit
     * before the timer could fire. Cleared in `finally`, or it would hold
     * the test runner open instead.
     */
    const keepAlive = setInterval(() => {}, 250);

    let health;
    try {
      health = await checkBlobStore({
        ask: () => new Promise(() => {}),
        // Production's deadline is five seconds; the mechanism is the same
        // at 200ms and the suite does not pay for it.
        timeoutMs: 200,
      });
    } finally {
      clearInterval(keepAlive);
    }

    assert.equal(health.reachable, false);
    assert.match(String(health.error), /did not answer in time/i);
    assert.ok(
      Date.now() - started < 5_000,
      "the health check waited on a store that was never going to answer"
    );
  });

  test("a store that throws is reported, not rethrown", async () => {
    const health = await checkBlobStore({
      ask: async () => {
        throw new Error("getaddrinfo ENOTFOUND blob.vercel-storage.com");
      },
    });

    assert.equal(health.reachable, false);
    assert.match(String(health.error), /ENOTFOUND|fetch/i);
  });
});

/**
 * THE SENTENCE THAT COST TWO DAYS.
 *
 * Every one of these failures reports the same thing from the SDK:
 *
 *   Vercel Blob: Access denied, please provide a valid token for this resource.
 *
 * — a revoked token, a rotated one, a token from another store, a paste
 * that brought quotation marks along. The dashboard shows a healthy store
 * row for all four. So the only thing anyone can do with that sentence is
 * guess, and every guess is dashboard work: reconnect the store, redeploy,
 * re-paste the token, redeploy again.
 *
 * The app could always tell them apart. A read-write token spells its store
 * out in the clear, the project names its store in BLOB_STORE_ID, and
 * comparing two strings is not hard. It simply never looked.
 */
const DENIED = {
  ok: false as const,
  message: "Access denied, please provide a valid token for this resource",
};

const realStoreId = process.env.BLOB_STORE_ID;

/** A token for a named store, shaped the way the SDK parses one. */
function tokenFor(storeId: string) {
  return `vercel_blob_rw_${storeId}_abcdefghijklmnopqrstuvwxyz`;
}

afterEach(() => {
  if (realStoreId === undefined) {
    delete process.env.BLOB_STORE_ID;
  } else {
    process.env.BLOB_STORE_ID = realStoreId;
  }
});

describe("the token says which store it is for, so the app can just say so", () => {
  test("a token from another store is named as such, and the store is cleared", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = tokenFor("WRONGSTORE00000a");
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";

    const health = await checkBlobStore({ ask: store(DENIED) });

    assert.equal(health.tokenStoreId, "WRONGSTORE00000a");
    assert.equal(health.projectStoreId, "X548kEBykUffj6EJ");

    const advice = describeBlobHealth(health);
    assert.ok(advice);
    // Both ids, so the reader can match them against the dashboard by eye.
    assert.match(advice, /WRONGSTORE00000a/);
    assert.match(advice, /X548kEBykUffj6EJ/);
    // And the conclusion, stated — not left to be inferred. This is the
    // sentence that would have ended it on day one.
    assert.match(advice, /store is fine/i);
    assert.match(advice, /from a different one/i);
  });

  test("the store_ prefix is not a mismatch", async () => {
    /**
     * THE FALSE POSITIVE THAT WOULD HAVE MADE THIS WORSE THAN SILENCE.
     *
     * Vercel writes BLOB_STORE_ID as `store_X548kEBykUffj6EJ`; the token
     * embeds the same store with no prefix. A raw string comparison calls
     * a correct pair a mismatch and sends someone off to replace a token
     * that was never wrong — which is precisely the loop this is meant to
     * end. The SDK reconciles them the same way (normalizeStoreId).
     */
    process.env.BLOB_READ_WRITE_TOKEN = tokenFor("X548kEBykUffj6EJ");
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";

    const health = await checkBlobStore({ ask: store(DENIED) });

    assert.equal(health.tokenStoreId, health.projectStoreId);

    const advice = describeBlobHealth(health);
    assert.ok(advice);
    assert.doesNotMatch(advice, /different one/i, "a correct pair called wrong");
    // The ids agree, so the credential is the suspect — say that instead.
    assert.match(advice, /credential is/i);
    assert.match(advice, /fresh read-write token/i);
  });

  test("with no BLOB_STORE_ID it does not claim the ids agree", async () => {
    // Nothing was checked, so nothing is asserted. A diagnostic that says
    // "the ID is not the problem" without having looked sends the reader
    // straight past the fault.
    process.env.BLOB_READ_WRITE_TOKEN = tokenFor("X548kEBykUffj6EJ");
    delete process.env.BLOB_STORE_ID;

    const health = await checkBlobStore({ ask: store(DENIED) });

    assert.equal(health.projectStoreId, null);

    const advice = describeBlobHealth(health);
    assert.ok(advice);
    assert.match(advice, /nothing to check it against/i);
  });

  test("a token that is not shaped like one says so, rather than guessing", async () => {
    // A paste that brought quotation marks with it. Invisible in the Vercel
    // UI, which shows the value as dots, and it produces the same "Access
    // denied" as every other cause.
    process.env.BLOB_READ_WRITE_TOKEN = `"${tokenFor("X548kEBykUffj6EJ")}"`;

    const health = await checkBlobStore({ ask: store(DENIED) });

    assert.equal(health.tokenStoreId, null, "a store id was invented from a bad token");

    const advice = describeBlobHealth(health);
    assert.ok(advice);
    assert.match(advice, /not shaped like a blob token/i);
    assert.match(advice, /quotation marks/i);
  });

  test("a store id is also reported when the store is healthy", async () => {
    // A reachable store whose ids disagree is worth seeing too: it means
    // BLOB_STORE_ID no longer describes where files are going, and the next
    // person to trust that variable debugs the wrong store.
    process.env.BLOB_READ_WRITE_TOKEN = tokenFor("X548kEBykUffj6EJ");
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";

    const health = await checkBlobStore({ ask: store(LIVE) });

    assert.equal(health.reachable, true);
    assert.equal(health.tokenStoreId, "X548kEBykUffj6EJ");
    assert.equal(health.projectStoreId, "X548kEBykUffj6EJ");
  });
});

describe("nothing past the store id is ever read", () => {
  test("the secret half of the token does not appear anywhere", async () => {
    /**
     * THE LINE THIS FEATURE IS NOT ALLOWED TO CROSS.
     *
     * The store id is public — it is a plain environment variable and it
     * shows in the dashboard. Everything after it is the credential. This
     * endpoint is read by the customer's browser on page load, so a leak
     * here is a leak to everyone who opens the order form.
     */
    const secret = "sup3rsecretvalue0000";
    process.env.BLOB_READ_WRITE_TOKEN = `vercel_blob_rw_X548kEBykUffj6EJ_${secret}`;
    process.env.BLOB_STORE_ID = "store_OTHERSTORE00000";

    const health = await checkBlobStore({ ask: store(DENIED) });
    const reported = JSON.stringify(health) + String(describeBlobHealth(health));

    assert.doesNotMatch(reported, new RegExp(secret));
    assert.equal(health.tokenStoreId, "X548kEBykUffj6EJ");
  });

  test("a token with underscores in the secret still reads one segment", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_X548kEBykUffj6EJ_aa_bb_cc";

    const health = await checkBlobStore({ ask: store(DENIED) });

    assert.equal(health.tokenStoreId, "X548kEBykUffj6EJ");
  });

  test("readTokenStoreId refuses to guess", () => {
    // A wrong store id in a diagnostic is worse than none — it is the kind
    // of wrong answer that gets believed and acted on.
    assert.equal(readTokenStoreId(undefined), null);
    assert.equal(readTokenStoreId(""), null);
    assert.equal(readTokenStoreId("vercel_blob_rw_onlythreeparts"), null);
    // A client token, not a read-write one. Different prefix, same shape.
    assert.equal(readTokenStoreId("vercel_blob_client_X548kEBykUffj6EJ_x"), null);
    assert.equal(readTokenStoreId("vercel_blob_rw_short_secretsecret"), null);
  });
});
