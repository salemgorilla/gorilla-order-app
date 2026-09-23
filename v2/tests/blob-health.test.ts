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
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  checkBlobStore,
  describeBlobHealth,
  readBlobCredential,
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
    // And it names WHICH defect, rather than listing the candidates — see
    // the shape suite below for why that second step was needed.
    assert.match(advice, /quotation mark/i);
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

/**
 * "NOT A BLOB TOKEN" IS NOT AN ANSWER EITHER.
 *
 * The first production run of the store-id comparison came back with
 * `tokenStoreId: null` — so the value in BLOB_READ_WRITE_TOKEN was not a
 * blob token at all, which is a real finding and immediately raised the
 * next question: not a blob token HOW.
 *
 * Quotation marks from a pasted .env line, the variable NAME pasted along
 * with the value, a truncated copy, a leading newline. Every one of them is
 * invisible in the Vercel UI, which shows the value as dots, and every one
 * produces the identical "Access denied". None of them need the value
 * itself to identify — a length, a segment count and four booleans separate
 * all of them, and none can be run backwards into a credential.
 */
describe("when the token is not a token, it says how", () => {
  async function shapeAdvice(value: string) {
    process.env.BLOB_READ_WRITE_TOKEN = value;
    const health = await checkBlobStore({ ask: store(DENIED) });
    return { health, advice: String(describeBlobHealth(health)) };
  }

  test("a whole .env line pasted into the value box", async () => {
    const { health, advice } = await shapeAdvice(
      `BLOB_READ_WRITE_TOKEN="${tokenFor("X548kEBykUffj6EJ")}"`
    );

    assert.equal(health.tokenShape?.hasVariableName, true);
    assert.match(advice, /variable's own name/i);
    assert.match(advice, /value only/i);
  });

  test("quotation marks Vercel does not strip", async () => {
    const { health, advice } = await shapeAdvice(`"${tokenFor("X548kEBykUffj6EJ")}"`);

    assert.equal(health.tokenShape?.hasQuotes, true);
    assert.match(advice, /quotation mark/i);
  });

  test("a newline that came along with the copy", async () => {
    const { health, advice } = await shapeAdvice(`\n${tokenFor("X548kEBykUffj6EJ")}`);

    assert.equal(health.tokenShape?.hasSurroundingWhitespace, true);
    assert.match(advice, /whitespace at one end/i);
    assert.match(advice, /invisible in the dashboard/i);
  });

  test("a truncated copy is counted, not guessed at", async () => {
    const { health, advice } = await shapeAdvice("vercel_blob_rw_X548kEBykUffj6EJ");

    assert.equal(health.tokenShape?.segments, 4);
    assert.match(advice, /4 underscore-separated parts/);
    assert.match(advice, /cut short/i);
  });

  test("something that is not a blob token at all", async () => {
    const { health, advice } = await shapeAdvice("prv_liveMode_someOtherCredential");

    assert.equal(health.tokenShape?.hasPrefix, false);
    assert.match(advice, /not a blob read-write token at all/i);
    assert.match(advice, /\.env\.local/);
  });

  test("a variable set to nothing", async () => {
    // Distinct from UNSET, which is a different fix entirely — and the two
    // are indistinguishable in a dashboard that shows every value as dots.
    const { health, advice } = await shapeAdvice("");

    assert.equal(health.hasToken, false, "an empty string is not a credential");
    assert.doesNotMatch(advice, /empty value/i, "reported as malformed, not missing");
    assert.match(advice, /BLOB_READ_WRITE_TOKEN/);
  });

  test("a token that parses carries no shape at all", async () => {
    // A healthy deployment has nothing to explain, and should not publish a
    // character count of its credential to every visitor for no reason.
    const { health } = await shapeAdvice(tokenFor("X548kEBykUffj6EJ"));

    assert.equal(health.tokenShape, null);
  });

  test("the shape never carries a character of the token", async () => {
    const secret = "sup3rsecretvalue0000";
    const { health, advice } = await shapeAdvice(`"vercel_blob_rw_X548kEBykUffj6EJ_${secret}"`);

    const reported = JSON.stringify(health) + advice;
    assert.doesNotMatch(reported, new RegExp(secret));
    assert.doesNotMatch(reported, /X548kEBykUffj6EJ/, "the id came from an unparsed token");
  });
});

/**
 * THE PROBE WAS ASKING A QUESTION THE APP NEVER ASKS.
 *
 * ── THE BUG ───────────────────────────────────────────────────────────────
 * checkBlobStore probed with `list({ token: BLOB_READ_WRITE_TOKEN })`.
 * Nothing else in this app passes a token: lib/subscriber-store.ts and the
 * dropoff and handoff routes all call `list`/`put` bare and let the SDK
 * resolve credentials. Those are different questions, because the SDK
 * prefers OIDC (resolveBlobAuth, chunk-OYCIHDFF.js:161):
 *
 *   1. options.token            ← only when passed EXPLICITLY
 *   2. VERCEL_OIDC_TOKEN + BLOB_STORE_ID
 *   3. env BLOB_READ_WRITE_TOKEN
 *
 * So a project with a broken read-write token and a working OIDC pair runs
 * fine everywhere — and this probe, alone, forced itself onto the broken
 * credential and reported the whole store dead. Production spent days
 * answering "Access denied" for a store the rest of the app could read.
 */
const realOidc = process.env.VERCEL_OIDC_TOKEN;

afterEach(() => {
  if (realOidc === undefined) {
    delete process.env.VERCEL_OIDC_TOKEN;
  } else {
    process.env.VERCEL_OIDC_TOKEN = realOidc;
  }
});

describe("the probe asks the way the app asks", () => {
  test("listOneBlob passes no token — the regression guard", async () => {
    /**
     * Read as SOURCE deliberately. The credential the SDK picks is decided
     * inside undici, which this suite cannot observe (see the note on the
     * injected `ask`), so the only place to catch a re-added `token:` is
     * the call site. This repo already tests source this way for client
     * bundle safety; the reasoning is the same — the failure is invisible
     * from the outside until production shows it.
     */
    const src = await readFile(new URL("../lib/blob-health.ts", import.meta.url), "utf8");
    const listCall = src.slice(src.indexOf("async function listOneBlob"));
    const body = listCall.slice(0, listCall.indexOf("\n}"));

    assert.doesNotMatch(
      body,
      /^\s*token[,:]/m,
      "listOneBlob passes a token again — it now probes a credential the rest of the app does not use"
    );
    assert.match(body, /limit: 1/);
  });

  test("OIDC wins over a read-write token, as the SDK does it", () => {
    process.env.VERCEL_OIDC_TOKEN = "oidc-jwt";
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";
    process.env.BLOB_READ_WRITE_TOKEN = tokenFor("X548kEBykUffj6EJ");

    assert.equal(readBlobCredential(), "oidc");
  });

  test("OIDC needs BOTH halves — a token alone is not OIDC", () => {
    // BLOB_STORE_ID without VERCEL_OIDC_TOKEN is the state of every local
    // dev machine. Calling that "oidc" would report a credential that
    // cannot authenticate anything.
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";
    process.env.BLOB_READ_WRITE_TOKEN = tokenFor("X548kEBykUffj6EJ");

    assert.equal(readBlobCredential(), "read-write");
  });

  test("neither half set is 'none', not 'broken'", () => {
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    assert.equal(readBlobCredential(), "none");
  });

  test("a project on OIDC alone is probed, not written off", async () => {
    // The old code returned early on a missing BLOB_READ_WRITE_TOKEN and
    // never asked the store anything. An OIDC-only project — which is what
    // Vercel provisions now — was reported dead without being tried.
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.VERCEL_OIDC_TOKEN = "oidc-jwt";
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";

    const health = await checkBlobStore({ ask: store(LIVE) });

    assert.equal(calls, 1, "an OIDC project was never asked");
    assert.equal(health.reachable, true);
    assert.equal(health.credential, "oidc");
    assert.equal(health.hasToken, false, "and it needs no token to be true");
    assert.equal(describeBlobHealth(health), null);
  });

  test("no token and no OIDC does not probe, and says which fix", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.BLOB_STORE_ID;

    const health = await checkBlobStore({ ask: store(LIVE) });

    assert.equal(calls, 0, "probed with no credential to probe with");
    assert.equal(health.credential, "none");

    const advice = String(describeBlobHealth(health));
    assert.match(advice, /Storage/);
    // The old advice demanded a static token. That is now the optional one.
    assert.match(advice, /not required/i);
  });
});

describe("a failing OIDC deployment is not a token problem", () => {
  test("the advice says so, instead of sending you back to the token", async () => {
    /**
     * THE EXACT SHAPE OF THE LOST DAYS. A project on OIDC, holding a
     * left-over read-write token that is garbage. Every token diagnostic in
     * this file would fire on that token — and the SDK never used it.
     */
    process.env.VERCEL_OIDC_TOKEN = "oidc-jwt";
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_X548kEBykUffj6EJ";

    const health = await checkBlobStore({ ask: store(DENIED) });

    assert.equal(health.credential, "oidc");

    const advice = String(describeBlobHealth(health));
    assert.match(advice, /authenticated with OIDC/i);
    assert.match(advice, /BLOB_READ_WRITE_TOKEN is not involved/i);
    assert.match(advice, /replacing it will not help/i);
    // And it must NOT repeat the truncation advice for a credential that
    // played no part in the failure.
    assert.doesNotMatch(advice, /cut short/i);
  });

  test("with no token at all there is no shape to report", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.VERCEL_OIDC_TOKEN = "oidc-jwt";
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";

    const health = await checkBlobStore({ ask: store(DENIED) });

    assert.equal(health.tokenShape, null, "invented a token problem out of no token");
    assert.equal(health.tokenStoreId, null);
  });
});

/**
 * A HEALTHY STORE AND BROKEN UPLOADS, AT THE SAME TIME.
 *
 * ── WHAT WENT LIVE FOR ONE DEPLOYMENT ─────────────────────────────────────
 * Making the probe resolve credentials the way the app does was correct,
 * and it immediately produced this on production (build 5b06328):
 *
 *   configured: true, reachable: true, credential: "read-write",
 *   tokenStoreId: null, tokenShape: { length: 31, segments: 4 }
 *
 * Both of those last two lines are wrong, and the first is dangerous.
 *
 * The store answered because server-side calls resolve OIDC first — and on
 * Vercel the OIDC token arrives as the per-request `x-vercel-oidc-token`
 * header, which an env read cannot see, so it was credited to a read-write
 * token that cannot even be parsed.
 *
 * Meanwhile handleUpload — the client-upload path — has NO OIDC branch. It
 * resolves through getReadWriteBlobTokenFromOptionsOrEnv and was still
 * using that same broken token. So `configured` said yes, the upload box
 * advertised 100 MB, the real ceiling was 3.5 MB, and anything above it is
 * dropped from the quote. That is the 1 Sep failure exactly, from the
 * opposite direction.
 */
describe("reachable is not the same promise as uploadable", () => {
  const realWebhookKey = process.env.BLOB_WEBHOOK_PUBLIC_KEY;

  afterEach(() => {
    if (realWebhookKey === undefined) {
      delete process.env.BLOB_WEBHOOK_PUBLIC_KEY;
    } else {
      process.env.BLOB_WEBHOOK_PUBLIC_KEY = realWebhookKey;
    }
  });

  /** Production's exact state: OIDC, a webhook key, and a junk token. */
  async function productionState() {
    // No env VERCEL_OIDC_TOKEN, because the real one arrives as a
    // per-request header this code cannot see.
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";
    process.env.BLOB_WEBHOOK_PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_X548kEBykUffj6EJ";

    return checkBlobStore({ ask: store(LIVE) });
  }

  test("the junk token no longer decides whether uploads work", async () => {
    /**
     * THE POINT OF THE MIGRATION. This same state reported
     * clientUploadsReady:false while the route used handleUpload, which
     * resolves only through getReadWriteBlobTokenFromOptionsOrEnv. The
     * presigned route resolves through BlobCommandOptions and prefers
     * OIDC, so a token that cannot be parsed is simply not consulted.
     */
    const health = await productionState();

    assert.equal(health.reachable, true);
    assert.equal(health.tokenStoreId, null, "the token is still junk");
    assert.equal(
      health.clientUploadsReady,
      true,
      "the presigned path does not need a static token"
    );
  });

  test("the credential is credited to OIDC by elimination", async () => {
    // The store answered, and the only other credential present cannot be
    // parsed — so the call cannot have used it. Proof, not a guess.
    const health = await productionState();

    assert.equal(health.credential, "oidc");
  });

  test("a usable token on a deployment with no OIDC is not relabelled", async () => {
    // The elimination fires only when the token is unusable.
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.BLOB_STORE_ID;
    process.env.BLOB_WEBHOOK_PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----";
    process.env.BLOB_READ_WRITE_TOKEN = tokenFor("X548kEBykUffj6EJ");

    const health = await checkBlobStore({ ask: store(LIVE) });

    assert.equal(health.credential, "read-write");
    assert.equal(health.clientUploadsReady, true);
  });

  test("no webhook key means no client uploads, healthy store or not", async () => {
    /**
     * NOT OPTIONAL. handleUploadPresigned reads BLOB_WEBHOOK_PUBLIC_KEY and
     * throws "Missing webhook public key" before it looks at anything else,
     * even with no onUploadCompleted callback wired up. Vercel writes it
     * when a store is connected — so a project missing it has a
     * half-finished connection, and saying so here beats discovering it in
     * a customer's browser.
     */
    delete process.env.BLOB_WEBHOOK_PUBLIC_KEY;
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";
    process.env.BLOB_READ_WRITE_TOKEN = tokenFor("X548kEBykUffj6EJ");

    const health = await checkBlobStore({ ask: store(LIVE) });

    assert.equal(health.reachable, true, "the store itself is fine");
    assert.equal(health.clientUploadsReady, false);
  });

  test("no credential at all cannot upload either", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.BLOB_STORE_ID;
    process.env.BLOB_WEBHOOK_PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----";

    const health = await checkBlobStore({ ask: store(LIVE) });

    assert.equal(health.clientUploadsReady, false);
  });
});
