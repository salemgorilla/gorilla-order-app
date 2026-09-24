/**
 * ONE UPLOAD PATH FOR EVERY FILE SIZE.
 *
 * ── WHY MULTIPART IS OFF ──────────────────────────────────────────────────
 * The client-upload route is presigned now, and multipart does not survive
 * it in @vercel/blob 2.7.0. handleUploadPresigned takes the caller's
 * `multipart` flag, hands it to getSignedToken — and then never passes it
 * to presign:
 *
 *     const presignedUrlPayload = await presign(token, {
 *       ...urlOptionsWithCallback, operation: "put", pathname
 *     });                                  // client.js:347
 *
 * `operation` is always "put", and PresignPutUrlOptions omits `operation`,
 * so there is no supported way to return the presigned POST to /mpu that
 * the SDK's docs say multipart requires.
 *
 * ── WHY IT MATTERS BEYOND 8 MB ────────────────────────────────────────────
 * Gabe asked for 20 MB artwork. The ceiling was already 100 MB — but at
 * the old 8 MB threshold a 20 MB file took a DIFFERENT path than a 5 MB
 * one, so a passing test at 5 MB proved nothing about 20 MB. Collapsing
 * them means testing any size tests them all.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MAX_ATTACHED_ARTWORK_BYTES,
  MAX_BLOB_ARTWORK_BYTES,
  MULTIPART_THRESHOLD_BYTES,
} from "../lib/upload-limits";

const MB = 1024 * 1024;

describe("every size a customer can send takes the same path", () => {
  test("nothing under the ceiling triggers multipart", () => {
    // The sizes that have actually come up: the 4.8 MB PDF from 23 Sep,
    // the 20 MB Gabe asked for, and the ceiling itself.
    for (const size of [3.5 * MB, 4.8 * MB, 8 * MB, 20 * MB, MAX_BLOB_ARTWORK_BYTES]) {
      assert.equal(
        size > MULTIPART_THRESHOLD_BYTES,
        false,
        `${(size / MB).toFixed(1)} MB would upload by multipart, which the presigned route drops`
      );
    }
  });

  test("the threshold is past the ceiling, not merely large", () => {
    // A number that is merely big invites someone to "tidy" it back down
    // to something plausible. Infinity states the intent.
    assert.ok(MULTIPART_THRESHOLD_BYTES > MAX_BLOB_ARTWORK_BYTES);
  });
});

describe("20 MB needed no new ceiling", () => {
  test("the direct path already covers it five times over", () => {
    // The answer to "how do we accept 20 MB" was never a limit change —
    // it was that the direct path had never once completed an upload.
    assert.ok(MAX_BLOB_ARTWORK_BYTES >= 20 * MB);
    assert.equal(MAX_BLOB_ARTWORK_BYTES, 100 * MB);
  });

  test("and the inline fallback still cannot, which is why it must work", () => {
    // 20 MB through the fallback is a dropped file and an email asking the
    // customer to send it again. The fallback is a safety net, not a route.
    assert.ok(20 * MB > MAX_ATTACHED_ARTWORK_BYTES);
  });
});
