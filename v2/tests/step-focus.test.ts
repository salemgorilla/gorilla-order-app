import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Focus follows the step, not just the viewport.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Pressing "Continue" scrolled the page to the new step but dropped FOCUS to
 * <body>. A keyboard user re-tabbed through the header and the whole step
 * nav on every one of the five steps; a screen reader heard nothing about
 * the change at all. Found by tab-walking the flow in Chromium: after
 * "Continue to details", activeElement was BODY.
 *
 * The fix rides the existing stepScrollToken effect: the shared step
 * heading carries tabIndex={-1} and is focused (preventScroll, so it cannot
 * fight the smooth scroll) — which reads the new step's title aloud and
 * puts the next Tab inside the step. The failed-submit path is untouched:
 * it already focuses the offending control, which is the better landing
 * there.
 *
 * Verified by driving it: after Continue, activeElement is the H2 with
 * "Choose your sticker details". These pin the wiring.
 */

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

describe("step changes move focus to the step heading", () => {
  test("the heading is programmatically focusable and marked", () => {
    assert.match(page, /data-step-heading\s*\n?\s*tabIndex=\{-1\}/);
  });

  test("the scroll effect focuses it, without fighting the scroll", () => {
    const effect = page.split("if (stepScrollToken === 0) return;")[1]?.split("}, [stepScrollToken]);")[0] ?? "";
    assert.match(effect, /\[data-step-heading\]/);
    assert.match(effect, /focus\(\{ preventScroll: true \}\)/);
  });

  test("the failed-submit path keeps its own landing — the broken control", () => {
    const errorEffect = page.split("if (scrollToInvalidToken === 0) return;")[1]?.split("}, [scrollToInvalidToken]);")[0] ?? "";
    assert.match(errorEffect, /control\?\.focus\(\{ preventScroll: true \}\)/);
    assert.doesNotMatch(errorEffect, /data-step-heading/);
  });
});
