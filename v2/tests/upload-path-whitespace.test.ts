/**
 * THE GUARD MUST CHECK THE STRING THAT GETS WRITTEN.
 *
 * ── THE HOLE ──────────────────────────────────────────────────────────────
 * isAllowedUploadPath trimmed its input and ran every check — prefix,
 * traversal, control characters, length — against the trimmed value. The
 * upload route then passed the ORIGINAL, untrimmed pathname to
 * issueSignedToken, and the SDK signs and writes exactly that.
 *
 * So `" quote-artwork/x.png"` — one leading space — passed a guard whose
 * only job is to confine a public, unauthenticated endpoint to two
 * prefixes, and yielded a presigned PUT for a key in neither of them.
 *
 * Not a privilege escalation: `handoff/` and `dropoff/` still need a
 * shape-valid token, and a whitespace-prefixed variant is a different
 * namespace anyway. It is a namespace escape, and the module's stated
 * contract is "two shapes are legitimate and nothing else is".
 *
 * The length cap had the same split: measured on the trimmed value, so the
 * string actually written was bounded only by the SDK's own limit.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isAllowedUploadPath, QUOTE_ARTWORK_PREFIX } from "../lib/upload-limits";

describe("whitespace cannot smuggle a write outside the prefixes", () => {
  const legit = `${QUOTE_ARTWORK_PREFIX}logo.png`;

  test("the legitimate path still passes", () => {
    assert.equal(isAllowedUploadPath(legit), true);
  });

  test("every leading whitespace form is refused", () => {
    // Each of these trims to a permitted path and would have been written
    // to a key that is not under any permitted prefix.
    for (const ws of [" ", "\t", "\n", "\r", "\u000b", "\u000c", "﻿"]) {
      assert.equal(
        isAllowedUploadPath(`${ws}${legit}`),
        false,
        `${JSON.stringify(ws)} before the path was accepted`
      );
    }
  });

  test("trailing whitespace is refused too", () => {
    // A trailing space is a DIFFERENT blob key from the one reviewed, and
    // it is invisible in every log and dashboard that shows it.
    for (const ws of [" ", "\t", "\n", "﻿"]) {
      assert.equal(isAllowedUploadPath(`${legit}${ws}`), false);
    }
  });

  test("the length cap applies to the string that gets written", () => {
    /**
     * The cap is 400 on the whole pathname, prefix included — the prefix
     * is 14 characters, which this test got wrong first time out and the
     * suite caught.
     *
     * The cap used to be measured on the TRIMMED value, so a key padded
     * past 400 with whitespace trimmed back under the limit while the
     * string actually written stayed over it. Whitespace is now refused
     * outright, which closes that route; what remains to pin is that the
     * boundary itself is measured on the real value.
     */
    const room = 400 - QUOTE_ARTWORK_PREFIX.length;

    assert.equal(isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}${"a".repeat(room)}`), true);
    assert.equal(isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}${"a".repeat(room + 1)}`), false);
  });

  test("it is refused, not silently repaired", () => {
    /**
     * Trimming here would make the function return true for a string the
     * caller must then remember to normalise identically — which is the
     * exact split that opened the hole. A pathname with whitespace on
     * either end is not a filename anyone meant to send.
     */
    assert.equal(isAllowedUploadPath(` ${legit}`), false);
  });
});
