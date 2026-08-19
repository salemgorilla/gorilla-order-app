import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createHandoffToken, handoffPrefix } from "../lib/handoff";
import { isAllowedUploadPath, QUOTE_ARTWORK_PREFIX } from "../lib/upload-limits";

/**
 * What this guards: /api/artwork-upload mints a blob write token and must be
 * public, because a customer uploading artwork has no account and no session.
 * The scope of that token is the only control there is, and it used to be a
 * size and nothing else — the requested pathname was ignored, so the endpoint
 * would authorise writing anywhere in the shop's store, 100 MB at a time.
 */

describe("paths the app itself asks for", () => {
  it("accepts a quote-form upload", () => {
    assert.equal(isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}logo.png`), true);
  });

  it("accepts a hand-off from a real generated token", () => {
    // Generated rather than hardcoded, so the guard and the generator cannot
    // drift apart without this failing.
    const token = createHandoffToken();

    assert.equal(isAllowedUploadPath(`${handoffPrefix(token)}photo.jpg`), true);
  });

  it("accepts the awkward filenames print work actually arrives with", () => {
    for (const name of [
      "Gorilla Logo FINAL v2 (1).eps",
      "artwork.ai",
      "scan 2026-08-19.pdf",
      "café-menu.png",
      "50% off.svg",
    ]) {
      assert.equal(
        isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}${name}`),
        true,
        `expected ${name} to be allowed`
      );
    }
  });
});

describe("paths nobody legitimate asks for", () => {
  it("refuses a bare filename at the root of the store", () => {
    // The old quote-form path. Indistinguishable from an arbitrary write, and
    // that ambiguity is what made the endpoint unguardable.
    assert.equal(isAllowedUploadPath("logo.png"), false);
  });

  it("refuses an unknown prefix", () => {
    assert.equal(isAllowedUploadPath("anything/else.png"), false);
    assert.equal(isAllowedUploadPath("quote-artwork-evil/x.png"), false);
  });

  it("refuses a hand-off path whose token is not one of ours", () => {
    for (const token of [
      "short",
      "",
      "UPPERCASE00000000000000000000000",
      "a".repeat(61),
    ]) {
      assert.equal(
        isAllowedUploadPath(`handoff/${token}/photo.jpg`),
        false,
        `expected token ${JSON.stringify(token)} to be refused`
      );
    }
  });

  it("refuses traversal, absolute paths and backslashes", () => {
    const token = createHandoffToken();

    for (const path of [
      `${QUOTE_ARTWORK_PREFIX}../secret.png`,
      `/${QUOTE_ARTWORK_PREFIX}logo.png`,
      `${QUOTE_ARTWORK_PREFIX}sub\\dir.png`,
      `handoff/${token}/../../root.png`,
      "../../etc/passwd",
    ]) {
      assert.equal(
        isAllowedUploadPath(path),
        false,
        `expected ${JSON.stringify(path)} to be refused`
      );
    }
  });

  it("refuses a tree — one segment after the prefix, not a directory", () => {
    assert.equal(isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}a/b.png`), false);
  });

  it("refuses a segment that IS a traversal, not merely one containing dots", () => {
    assert.equal(isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}..`), false);
    assert.equal(isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}.`), false);
  });

  it("still allows a filename that happens to contain two dots", () => {
    // The reason the traversal check reads segments rather than characters.
    // Refusing "logo..png" would cost a real customer their upload for nothing.
    assert.equal(
      isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}logo..png`),
      true
    );
    assert.equal(
      isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}v1..final.eps`),
      true
    );
  });

  it("refuses control characters, which a blob key should never carry", () => {
    // Built from char codes rather than typed, so the case survives being
    // copied through an editor that would silently drop it.
    for (const code of [0, 1, 9, 10, 13, 31]) {
      const name = `logo${String.fromCharCode(code)}.png`;

      assert.equal(
        isAllowedUploadPath(`${QUOTE_ARTWORK_PREFIX}${name}`),
        false,
        `expected char code ${code} to be refused`
      );
    }
  });

  it("refuses empties, non-strings and absurd lengths", () => {
    for (const value of [
      "",
      "   ",
      null,
      undefined,
      42,
      {},
      `${QUOTE_ARTWORK_PREFIX}${"a".repeat(500)}.png`,
      QUOTE_ARTWORK_PREFIX,
    ]) {
      assert.equal(
        isAllowedUploadPath(value),
        false,
        `expected ${JSON.stringify(value)} to be refused`
      );
    }
  });
});

describe("the hand-off token itself", () => {
  it("is long, unguessable and its own validator agrees", () => {
    const seen = new Set<string>();

    for (let i = 0; i < 200; i++) {
      const token = createHandoffToken();

      assert.ok(!seen.has(token), "generated the same token twice");
      seen.add(token);

      assert.equal(isAllowedUploadPath(`${handoffPrefix(token)}f.png`), true);
    }
  });
});
