/**
 * A FILE THE BROWSER CANNOT DRAW IS NOT A FAILED UPLOAD.
 *
 * ── THE REPORT ────────────────────────────────────────────────────────────
 * 2026-09-23, Gabe: "i dropped a 5mb file and it acepted it. but no
 * preview". The file had uploaded perfectly — at 5 MB it could only have
 * gone through the direct blob path, which is how the presigned migration
 * got confirmed. What was missing was the thumbnail.
 *
 * app/page.tsx creates an object URL for EVERY chosen file, unconditionally
 * (handleArtworkUpload). UploadBox then rendered `<img src={previewUrl}>`
 * whenever that URL existed, with no onError. A print shop is sent PDF, AI,
 * EPS, PSD and TIFF all day and an <img> renders none of them — so the
 * thumbnail branch always fired and a customer dropping a PDF got an empty
 * green square under a heading reading "Artwork received".
 *
 * This box has already been reported as broken twice for looking like it
 * had done nothing, which is the whole reason it shows the chosen file at
 * all. An empty square is the same failure wearing a different hat.
 *
 * These pin the SOURCE, because the behaviour lives in a browser event
 * (<img onError>) that a DOM-free suite cannot fire. The smoke run covers
 * the box rendering; this covers the branch existing at all.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

/** Read lazily: a top-level await does not survive the test transform. */
let cached: string | null = null;
async function source(): Promise<string> {
  cached ??= await readFile(
    new URL("../components/upload/UploadBox.tsx", import.meta.url),
    "utf8"
  );
  return cached;
}

describe("the thumbnail has a way to give up", () => {
  test("the img carries an onError", async () => {
    const box = await source();
    assert.match(
      box,
      /onError=\{\(\) => setUndecodable\(/,
      "an undecodable format leaves an empty square that reads as a failed upload"
    );
  });

  test("the fallback mark is still reachable", async () => {
    const box = await source();
    // The ✓ is what says "your file arrived" when there is no thumbnail.
    assert.match(box, /fileName \? "✓" : "📁"/);
  });

  test("the thumbnail is gated on more than the URL existing", async () => {
    const box = await source();
    // `previewUrl && fileName` was the bug: the URL always exists, so the
    // branch always won and the fallback was unreachable.
    assert.match(box, /const canPreview = Boolean\(previewUrl\) && undecodable !== previewUrl;/);
    assert.doesNotMatch(
      box,
      /\{previewUrl && fileName \?/,
      "back to gating the thumbnail on a URL that is always set"
    );
  });

  test("the failure is keyed to the file, not latched for the page", async () => {
    const box = await source();
    /**
     * A boolean here would mean one PDF suppresses the thumbnail of every
     * image chosen after it, for the life of the page. Keyed to the URL,
     * a new file clears it by being a different URL.
     */
    assert.match(box, /useState<string \| null>\(null\)/);
    assert.doesNotMatch(
      box,
      /setUndecodable\(true\)/,
      "a latched boolean suppresses every later thumbnail"
    );
  });
});
