import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * "Copy Quote Details", for a signs cart — the customer's own record.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * The confirmation screen's copy text (and the Gmail draft, which shares it
 * via getQuoteDetailsText) read `order.artwork.file` for its ARTWORK section
 * — the order-level slot, which for signs holds whichever file was uploaded
 * LAST. A two-design quote copied itself as:
 *
 *     ARTWORK
 *     File Uploaded: yard-art.png
 *
 * one filename presented as THE artwork, design 1's file named nowhere. The
 * same last-writer-wins slot behind the #63 artwork-parts bug and the #67
 * Printavo-note bug, reaching a third surface: the record the customer keeps
 * and forwards.
 *
 * Verified by driving a two-design quote to the confirmation in Chromium and
 * reading the clipboard: both filenames now appear, each under its own
 * design, and the shared section defers to them.
 *
 * These pin the wiring; the component is a closure over page state that no
 * renderer here can drive.
 */

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

/** The signs branch of getQuoteDetailsText. */
const branch = page.split("if (isSignsSubmitted) {")[1]?.split("if (isApparelSubmitted) {")[0] ?? "";

describe("each design names its own file", () => {
  test("the design block carries an Artwork line", () => {
    assert.match(branch, /Artwork: \$\{/);
    assert.match(branch, /design\.artwork\.file\?\.name \|\| "No file uploaded"/);
  });

  test("a template design says wording was supplied, not that a file is missing", () => {
    // "No file uploaded" under a template reads as a fault; there is nothing
    // to chase. Same rule as the shop email and the Printavo note.
    assert.match(branch, /wording supplied, no file owed/);
  });
});

describe("the shared ARTWORK section stops speaking for the cart", () => {
  test("a cart defers to the per-design lines", () => {
    assert.match(
      branch,
      /designs\.length > 1\s*\n?\s*\? `ARTWORK\s*\n?Each design's file is listed with that design above\./
    );
  });

  test("one design keeps the full section, analysis and all", () => {
    // order.artwork and the analysis really do describe the one file, so a
    // single-design quote reads exactly as it always has.
    assert.match(branch, /: artworkSection;/);
    assert.match(branch, /\$\{signsArtworkSection\}/);
  });

  test("the cart branch never prints the order-level file as its own", () => {
    // The exact line that shipped one filename for a two-design quote lives
    // in the SHARED section; the signs cart must not reach it.
    assert.doesNotMatch(branch, /File Uploaded: \$\{order\.artwork\.file/);
  });
});
