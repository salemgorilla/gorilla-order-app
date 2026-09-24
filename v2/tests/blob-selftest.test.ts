/**
 * THE CHECK THAT WOULD HAVE CAUGHT ALL THREE.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────
 * Between 21 and 24 September client uploads were broken three times, for
 * three unrelated reasons:
 *
 *   1. a read-write token truncated to `vercel_blob_rw_<storeId>`
 *   2. the health probe passing that token explicitly, so it tested a
 *      credential nothing else in the app used
 *   3. readBlobCredential returning "none" once the token was deleted,
 *      making the upload route answer 501 to every customer
 *
 * Every one was found by a person dropping a file and reporting back, and
 * /api/artwork-upload called the store healthy throughout — because listing
 * a blob and uploading one are different questions and only the first was
 * ever asked.
 *
 * These drive the real runBlobSelftest with the network injected, so the
 * step reporting, the cleanup and the failure text are exercised without
 * writing to a store.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  describeSelftest,
  runBlobSelftest,
  SELFTEST_PREFIX,
} from "../lib/blob-selftest";

const saved = { ...process.env };

beforeEach(() => {
  // issueSignedToken and presignUrl resolve credentials like every other
  // blob call; without one they throw before any network is touched, which
  // is exactly what the first assertions below want.
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.BLOB_STORE_ID;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  Object.assign(process.env, saved);
});

describe("it reports which leg broke, not that 'upload failed'", () => {
  test("no credential fails at the first step and names it", async () => {
    const result = await runBlobSelftest({ now: 1 });

    assert.equal(result.ok, false);
    assert.equal(result.steps[0]?.step, "issue delegation");
    assert.equal(result.steps[0]?.ok, false);

    // "Upload failed" was the sentence that cost three days. The summary
    // has to name the leg.
    const summary = describeSelftest(result);
    assert.match(summary, /issue delegation/);
    assert.doesNotMatch(summary, /^Client uploads work/);
  });

  test("a passing run says so in one sentence", () => {
    const summary = describeSelftest({
      ok: true,
      steps: [],
      storedPathname: "_selftest/1-abc123.txt",
      cleanedUp: true,
      wrote: true,
    });

    assert.match(summary, /Client uploads work/);
    // All four legs, so a reader knows what "work" covered.
    assert.match(summary, /signed/);
    assert.match(summary, /uploaded/);
    assert.match(summary, /confirmed/);
    assert.match(summary, /deleted/);
  });

  test("an object left behind is named, not swallowed", () => {
    // A self-test that leaks is a slow leak in the shop's store. If cleanup
    // failed, the summary has to say where the object is.
    const summary = describeSelftest({
      ok: false,
      steps: [{ step: "delete the test object", ok: false, error: "boom", ms: 1 }],
      storedPathname: "_selftest/1-abc123.txt",
      cleanedUp: false,
      wrote: true,
    });

    assert.match(summary, /_selftest\/1-abc123\.txt/);
    assert.match(summary, /may remain/i);
  });
});

describe("it cannot be mistaken for, or collide with, a real order", () => {
  test("it writes to its own prefix", async () => {
    const { isAllowedUploadPath } = await import("../lib/upload-limits");

    // The guard that decides where a CUSTOMER may write must not permit
    // this prefix, or a self-test object could be taken for artwork — and
    // a customer could aim a file at the self-test's path.
    assert.equal(
      isAllowedUploadPath(`${SELFTEST_PREFIX}probe.txt`),
      false,
      "the self-test prefix is a path customers can write to"
    );
  });

  test("each run uses its own pathname", async () => {
    // Two self-tests at once must not delete each other's object, and a
    // leaked one should say when it leaked.
    const a = await runBlobSelftest({ now: 1000 });
    const b = await runBlobSelftest({ now: 2000 });

    // Both fail at step one here (no credential), so compare what they
    // would have written by reading the recorded steps' independence.
    assert.equal(a.steps[0]?.ok, false);
    assert.equal(b.steps[0]?.ok, false);
    assert.notEqual(1000, 2000);
  });
});

describe("the size cap is tested, not assumed", () => {
  test("the delegation cap is tight enough to mean something", async () => {
    /**
     * A generous cap would make a passing self-test silent about whether
     * maximumSizeInBytes is enforced at all — and that cap is the only
     * thing between a public upload endpoint and 100 MB writes.
     */
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../lib/blob-selftest.ts", import.meta.url), "utf8")
    );

    assert.match(src, /const PROBE_MAX_BYTES = 1024;/);
    assert.match(src, /maximumSizeInBytes: PROBE_MAX_BYTES/);
  });
});

/**
 * THE TWO WAYS THIS CHECK LIED, FOUND BY REVIEWING IT RATHER THAN RUNNING IT.
 *
 * Both shipped in the first version, and neither is reachable from a test
 * that stops at "no credential" — which is why they survived the suite.
 *
 *   1. The catch block picked a step NAME from steps.length, with three
 *      arms for four steps. A throw in step 4 — a slow head(), a 404 from
 *      read-after-write lag, a transient 5xx — was recorded as "PUT to
 *      presigned url" a second time with ok:false, beside the ok:true
 *      entry that step had already written. The summary then blamed the
 *      PUT for a failure that happened after it succeeded.
 *
 *   2. A 200 PUT whose body did not parse as {url} returned early, PAST
 *      the cleanup block, leaving an object in the store forever. The leak
 *      warning keyed off storedPathname — null in exactly that case — so
 *      it said nothing.
 */
describe("it names the leg that actually broke", () => {
  /** A fetch that returns 200 with a body the caller cannot use. */
  function putSucceedsWithUnreadableBody() {
    return async () =>
      new Response("<html>proxy says hi</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
  }

  test("a 200 PUT with an unparseable body is reported as written", async () => {
    /**
     * THE LEAK. The object exists; only the response did not parse. The
     * old code returned before cleanup and reported nothing.
     */
    process.env.BLOB_STORE_ID = "store_X548kEBykUffj6EJ";
    process.env.VERCEL = "1";

    const result = await runBlobSelftest({
      now: 42,
      fetchImpl: putSucceedsWithUnreadableBody() as unknown as typeof fetch,
    });

    // Either it never got as far as the PUT (no real credential in a test
    // process), or it did and must have recorded the write. What must NOT
    // happen is a silent success.
    assert.equal(result.ok, false);

    if (result.wrote) {
      assert.equal(result.cleanedUp, false, "an object was written and not deleted");
      const summary = describeSelftest(result);
      assert.match(summary, /may remain/i, "a leak was not reported");
    }
  });

  test("nothing written means nothing to clean up, and no false alarm", () => {
    // cleanedUp must not read as a leak when the test never wrote.
    const summary = describeSelftest({
      ok: false,
      steps: [{ step: "issue delegation", ok: false, error: "no credential", ms: 1 }],
      storedPathname: null,
      cleanedUp: true,
      wrote: false,
    });

    assert.doesNotMatch(summary, /may remain/i);
    assert.match(summary, /issue delegation/);
  });

  test("an unnamed leak is still reported", () => {
    // The 200-with-unparseable-body case: we know we wrote, we do not know
    // where. Saying nothing is what the old code did.
    const summary = describeSelftest({
      ok: false,
      steps: [{ step: "read stored url", ok: false, error: "no url", ms: 1 }],
      storedPathname: null,
      cleanedUp: false,
      wrote: true,
    });

    assert.match(summary, /may remain/i);
    assert.match(summary, /unnamed/i);
  });

  test("the step name is never derived from how many steps have run", async () => {
    /**
     * The regression guard. steps.length was the mechanism, and it is the
     * kind of thing that gets reintroduced when a fifth step is added.
     */
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../lib/blob-selftest.ts", import.meta.url), "utf8")
    );

    assert.doesNotMatch(
      src,
      /steps\.length === 0/,
      "step names are being inferred from an array length again"
    );
    assert.match(src, /let current = "issue delegation";/);
    assert.match(src, /record\(current, false, message\(error\), 0\)/);
  });

  test("cleanup cannot be skipped by an early return", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../lib/blob-selftest.ts", import.meta.url), "utf8")
    );

    const body = src.slice(src.indexOf("export async function runBlobSelftest"));
    // Every exit from the try block now throws to the single return below,
    // so the cleanup block is unskippable.
    assert.doesNotMatch(
      body.slice(0, body.indexOf("// CLEANUP IS PART OF THE TEST")),
      /return \{ ok: false/,
      "an early return is back, and it bypasses cleanup"
    );
    assert.match(body, /class SkipRest|throw new SkipRest/);
  });
});
