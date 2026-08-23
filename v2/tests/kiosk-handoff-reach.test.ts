import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * "Send it from your phone" — for every flow, not just one.
 *
 * ── THE GAP ───────────────────────────────────────────────────────────────
 * ArtworkHandoff exists because of one counter scenario, stated in its own
 * header: "the walk-in case is that the artwork is on a phone and the kiosk
 * cannot reach it." Nobody logs into their email on the shop's terminal.
 *
 * It was wired to the STICKER cart and nowhere else — the flow least likely
 * to need it. A walk-in ordering one banner is the archetypal counter job,
 * and that customer met an upload box on a machine that cannot see their
 * photo roll, with no way across. Apparel the same.
 *
 * Not a regression: when the hand-off shipped, signs and apparel had a single
 * order-level upload box and the cart wiring did not fit them. Signs grew a
 * design list this week; the hand-off did not follow it.
 *
 * ── VERIFIED BY DRIVING IT ────────────────────────────────────────────────
 * Chromium against the real dev server, since this is a component this repo
 * has no renderer for:
 *
 *   signs @ /kiosk                    panel present
 *   apparel @ /kiosk                  panel present
 *   signs @ / (the website)           absent — kiosk only, as before
 *   two-design signs @ /kiosk         2 panels, 2 file inputs
 *   ...then a file into design 1      1 panel left, design 2's
 *
 * That last line is the one that matters: the panels are bound per design, so
 * a two-design quote sends each phone file to the card the customer is
 * standing on rather than to design 1. The same binding rule the upload boxes
 * follow, and the same reason — an index has no reliable mapping back to a
 * design.
 */

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

/** The block each flow renders on the artwork step. */
function flowBlock(name: "signs" | "apparel" | "stickers") {
  const artwork = page.split('currentStepId === "artwork"')[1] ?? "";

  const signs = artwork.split("isApparelSelected ? (")[0] ?? "";
  const rest = artwork.split("isApparelSelected ? (")[1] ?? "";
  const [apparel, stickers] = [
    rest.split("              ) : (")[0] ?? "",
    rest.split("              ) : (")[1] ?? "",
  ];

  return { signs, apparel, stickers }[name];
}

describe("every flow can take a file off a phone at the counter", () => {
  for (const flow of ["signs", "apparel", "stickers"] as const) {
    test(`${flow} offers the hand-off`, () => {
      assert.match(flowBlock(flow), /<ArtworkHandoff/);
    });
  }

  test("all three, and no more", () => {
    // Counted so a fourth flow added later is noticed rather than silently
    // shipping without it.
    const uses = page.match(/<ArtworkHandoff/g) ?? [];
    assert.equal(uses.length, 3);
  });
});

describe("it stays a counter feature", () => {
  for (const flow of ["signs", "apparel", "stickers"] as const) {
    test(`${flow} gates on kiosk.enabled`, () => {
      // On the website the customer is already holding their files. Showing a
      // QR code there is noise, and it would mint a bearer token for someone
      // who never reaches for a phone.
      assert.match(
        flowBlock(flow),
        /kiosk\.enabled && !\S+\.artwork\.file && \(\s*\n?\s*<ArtworkHandoff/
      );
    });
  }

  test("it is hidden once that design already has its file", () => {
    // Three separate `!<something>.artwork.file` guards, one per flow. A
    // panel under a design that is already done is an invitation to replace
    // the file by accident.
    const guards = page.match(/kiosk\.enabled && !\S+\.artwork\.file/g) ?? [];
    assert.equal(guards.length, 3);
  });
});

describe("signs bind the file to a design, not to the order", () => {
  test("the signs hand-off passes the design id", () => {
    // Without this the file lands on designs[0] — handleArtworkUpload's
    // documented default — so on a two-design quote the customer sends their
    // second banner and watches it appear on the first card.
    assert.match(
      flowBlock("signs"),
      /<ArtworkHandoff\s*\n?\s*onFileReceived=\{\(file\) =>\s*\n?\s*handleArtworkUpload\(file, design\.id\)/
    );
  });

  test("stickers still pass theirs", () => {
    assert.match(
      flowBlock("stickers"),
      /onFileReceived=\{\(file\) =>\s*\n?\s*handleArtworkUpload\(file, item\.id\)/
    );
  });

  test("apparel deliberately passes none", () => {
    // Apparel is genuinely single-file and keeps the order-level slot. Giving
    // it a design id would invent a cart it does not have.
    assert.match(
      flowBlock("apparel"),
      /<ArtworkHandoff onFileReceived=\{handleArtworkUpload\} \/>/
    );
  });
});

describe("a signs template design is not asked for a file", () => {
  test("the hand-off sits in the upload branch, not beside the template card", () => {
    // A template IS the artwork. Offering to receive a photo of it from a
    // phone invites a customer to upload something we then have to ignore.
    const templateCard = flowBlock("signs").split("design.templateId ? (")[1] ?? "";
    const beforeUpload = templateCard.split("<UploadBox")[0] ?? "";

    assert.doesNotMatch(beforeUpload, /<ArtworkHandoff/);
  });
});
