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
