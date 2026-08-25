import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { sameOriginGarmentPhotoUrl } from "../lib/garment-photo";

/**
 * The same-origin rewrite that keeps the mockup compositor's canvas legal.
 *
 * ── THE DEFECT THIS PREVENTS ──────────────────────────────────────────────
 * composeGarmentMockup loads the garment photo with crossOrigin="anonymous"
 * and exports the canvas. Loaded straight from S&S — a host that promises no
 * CORS headers — the export taints and resolves null, so the mockup would
 * silently never render for customers even after Gabe calibrates every zone.
 * Routing the photo through our own /_next/image (the passthrough #81
 * enabled) makes the load same-origin, which can never taint.
 */

const SS = "https://www.ssactivewear.com/Images/Color/17130_f_fl.jpg";

describe("S&S photos are rewritten to our own optimizer", () => {
  test("www.ssactivewear.com goes through /_next/image, URL-encoded", () => {
    assert.equal(
      sameOriginGarmentPhotoUrl(SS),
      `/_next/image?url=${encodeURIComponent(SS)}&w=1080&q=75`
    );
  });

  test("cdn.ssactivewear.com is the other allowed host", () => {
    const cdn = "https://cdn.ssactivewear.com/Images/Color/19750_b_fl.jpg";
    assert.match(sameOriginGarmentPhotoUrl(cdn) ?? "", /^\/_next\/image\?url=/);
  });

  test("the width is one next.config.ts actually serves", () => {
    // /_next/image rejects widths outside the configured sizes with a 400 —
    // a broken photo where the raw URL at least displayed. 1080 is in Next's
    // default deviceSizes, which the config does not override.
    assert.match(sameOriginGarmentPhotoUrl(SS) ?? "", /&w=1080&/);
  });
});

describe("everything else passes through untouched", () => {
  test("an unknown host is NOT sent to the optimizer", () => {
    // next.config.ts allows exactly two hosts, deliberately; any other would
    // come back 400 from /_next/image. Passing it through keeps the <img>
    // working and lets the compositor's null contract handle the taint.
    const other = "https://images.example.com/shirt.jpg";
    assert.equal(sameOriginGarmentPhotoUrl(other), other);
  });

  test("a non-URL string survives rather than throwing", () => {
    assert.equal(sameOriginGarmentPhotoUrl("not a url"), "not a url");
  });

  test("null and undefined stay null — the no-photo placeholder path", () => {
    assert.equal(sameOriginGarmentPhotoUrl(null), null);
    assert.equal(sameOriginGarmentPhotoUrl(undefined), null);
  });
});
