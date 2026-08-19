import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { asciiSafe, buildPrintavoQuotePlan, type ArtworkLink } from "../lib/printavo";

/**
 * The artwork links in the Printavo record.
 *
 * ── THE LABEL WAS THE BUG ─────────────────────────────────────────────────
 * These URLs have ALWAYS been in the customer note. They sat inside the
 * `Emailed to shop:` sentence, mid-line, after a file size:
 *
 *   Emailed to shop: Design 1: uploaded — logo.ai (2.1 MB): https://…
 *
 * So a human scanning the note read "emailed" and never registered that a
 * permanent link was sitting right there — and a previous reader of this
 * codebase concluded from that heading that the URL never reached Printavo
 * at all. It always had. Nothing needs backfilling; every past order already
 * carries its link. Only the labelling was wrong.
 *
 * Two facts were being rendered as one sentence, and they are different
 * promises: "we mailed you the file" and "here is a link to the file".
 * ──────────────────────────────────────────────────────────────────────────
 */

const LINKS: ArtworkLink[] = [
  {
    design: 1,
    name: "gorilla-logo.ai",
    url: "https://abc.public.blob.vercel-storage.com/gorilla-logo-x1.ai",
  },
  {
    design: 2,
    name: "badge.png",
    url: "https://abc.public.blob.vercel-storage.com/badge-y2.png",
  },
];

function plan(artworkLinks: ArtworkLink[], attachmentInfo: string) {
  return buildPrintavoQuotePlan({
    quoteNumber: "GS-TEST",
    order: {
      customer: { customerName: "Casey", email: "c@example.com" },
      production: { deliveryMethod: "Pickup" },
      product: { type: "Custom Stickers", quantity: 200 },
      items: [
        { id: "a", quantity: 100, material: "Gloss White Vinyl", widthInches: 3, heightInches: 3 },
        { id: "b", quantity: 100, material: "Gloss White Vinyl", widthInches: 2, heightInches: 2 },
      ],
      pricing: { total: 100 },
    },
    artworkAnalysis: { fileName: "gorilla-logo.ai", estimatedColorCount: 3 },
    attachmentInfo,
    artworkLinks,
  });
}

const uploaded = () => plan(LINKS, "Design 1: uploaded — gorilla-logo.ai (2.1 MB)");
const emailed = () => plan([], "Design 1: attached to this email as design-1-logo.png");

describe("the links are under a heading that says what they are", () => {
  const note = uploaded().customerNote;

  test("there is a heading naming them as files to open", () => {
    assert.match(note, /ARTWORK FILES - OPEN THESE/);
  });

  test("every design's link is present, on its own line", () => {
    for (const link of LINKS) {
      assert.ok(note.includes(link.url), `missing ${link.url}`);
      assert.ok(note.includes(`Design ${link.design}: ${link.name}`));
    }
  });

  test("an order with no uploads gets no heading at all", () => {
    // An empty "open these" block is worse than none — it reads as a broken
    // upload rather than as a file that came in by email.
    assert.doesNotMatch(emailed().customerNote, /ARTWORK FILES/);
  });
});

describe("the production note stops contradicting the customer note", () => {
  test("an uploaded order is sent to the links, not to the email", () => {
    // It used to say "Artwork is attached to the quote email, NOT uploaded to
    // Printavo" while the link sat two fields away in the same record.
    const note = uploaded().productionNote;

    assert.match(note, /Artwork links are in the customer note/);
    assert.doesNotMatch(note, /not uploaded to Printavo/);
  });

  test("an emailed order still says to go to the email", () => {
    const note = emailed().productionNote;

    assert.match(note, /email attachment/);
    assert.doesNotMatch(note, /Artwork links are in the customer note/);
  });
});

describe("one line a reorder can parse", () => {
  /**
   * Phase 3 of the repeat-customer spec reads a past order's artwork back.
   * Parsing `Design 1: uploaded — name (2.1 MB): <url>` out of prose is the
   * worse road, and this costs one line.
   */
  function parseLinks(note: string) {
    const line = note
      .split("\n")
      .find((entry) => entry.startsWith("ARTWORK_LINKS_JSON:"));

    assert.ok(line, "no machine-readable line in the note");
    return JSON.parse(line.replace("ARTWORK_LINKS_JSON: ", ""));
  }

  test("it round-trips to exactly what went in", () => {
    assert.deepEqual(parseLinks(uploaded().customerNote), LINKS);
  });

  test("it survives asciiSafe, which runs on the way to Printavo", () => {
    /**
     * asciiSafe DELETES anything outside \x20-\x7E. A URL that lost a
     * character would parse fine and 404 — the worst kind of failure, because
     * it looks like it worked. Vercel Blob percent-encodes, so the bytes are
     * ASCII; this pins that the sanitiser leaves them alone.
     */
    const awkward: ArtworkLink[] = [
      { design: 1, name: "a b.png", url: "https://x/a%20b.png?token=1&v=2" },
    ];

    const sent = asciiSafe(plan(awkward, "x").customerNote);

    assert.deepEqual(parseLinks(sent), awkward);
  });

  test("no line at all when there is nothing to link", () => {
    assert.doesNotMatch(emailed().customerNote, /ARTWORK_LINKS_JSON/);
  });
});
