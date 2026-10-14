import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * THE GUARD THAT GUARDS THE GUARD.
 *
 * ── WHAT WENT WRONG ──────────────────────────────────────────────────────
 * A test pinned an order's `needBy` to the literal 2026-10-01. On 2 October
 * that date arrived, `isOrderReady` began returning false, and the suite
 * went red for four days with nothing broken.
 *
 * The red was the cheap part. The green check already recorded on the open
 * PR predated the expiry, so the one signal that would have caught a real
 * regression on a live billing app had been spent on the calendar — and
 * nothing re-ran it, because checks do not re-run themselves.
 *
 * `npm run test:future` closes that: the suite runs a second time with the
 * clock 400 days ahead, so a fixture that is only valid for a while fails in
 * the pull request that introduces it rather than on a later Tuesday.
 * Verified by planting a date 30 days out — `npm test` passed, the skewed
 * run failed at exactly the assertion that went red in October.
 *
 * ── WHY THIS FILE EXISTS ON TOP OF THAT ──────────────────────────────────
 * The guard is three loose parts: a shim, an npm script, and a CI step. Any
 * one of them can go missing without a single test failing — delete the CI
 * step and every suite still passes, which is precisely the shape of
 * problem this repo has shipped before (`reconcile-gate.test.ts` was written
 * after a check that matched nothing passed quietly for weeks).
 *
 * So these tests assert the wiring, not the behaviour. They are source
 * assertions on purpose: the thing being protected is a build
 * configuration, and nothing else in the suite can see it.
 */

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("the forward-clock run is wired up end to end", () => {
  test("the shim exists and pushes the clock forward by default", () => {
    const shim = read("./helpers/future-clock.mjs");

    assert.match(
      shim,
      /globalThis\.Date = FakeDate/,
      "the shim must actually install itself over the global Date"
    );
    assert.match(
      shim,
      /DEFAULT_SKEW_DAYS = \d+/,
      "the shim must carry its own default skew, so the script cannot run it at zero by omission"
    );

    const skew = Number(/DEFAULT_SKEW_DAYS = (\d+)/.exec(shim)?.[1]);
    assert.ok(
      skew >= 180,
      `a skew of ${skew} days is too short to expire a plausible fixture — the whole point is that nobody pins a date that far out by accident`
    );
  });

  test("the shim refuses to pass vacuously", () => {
    // A shim that silently stops taking effect is worse than no shim: the
    // second run reports green while testing nothing. It measures its own
    // installation and exits non-zero when the clock did not move.
    const shim = read("./helpers/future-clock.mjs");

    assert.match(shim, /process\.exit\(1\)/);
    assert.match(
      shim,
      /the clock did not move/,
      "the self-check must say what happened, not just fail"
    );
  });

  test("an explicit date still means that date", () => {
    // The shim may only answer the question "what time is it now?"
    // differently. If it rewrote `new Date("2026-08-31")` as well, every
    // fixed-clock test in the suite would become meaningless, which is the
    // opposite of the point.
    const shim = read("./helpers/future-clock.mjs");
    const body = /if \(!new\.target\)[\s\S]*?return new RealDate\(\.\.\.args\);/.exec(shim);

    assert.ok(body, "the constructor must pass non-empty arguments straight through");
    assert.match(body[0], /args\.length === 0/);
  });

  test("npm run test:future runs the whole suite under the shim", () => {
    const pkg = JSON.parse(read("../package.json")) as {
      scripts: Record<string, string>;
    };

    const script = pkg.scripts["test:future"];
    assert.ok(script, "package.json must carry a test:future script");
    assert.match(script, /future-clock\.mjs/);

    // Both globs, or a .tsx test could sit outside the guard — the same
    // omission that kept confirmation-render.test.tsx out of `npm test`
    // until the glob was fixed.
    assert.match(script, /tests\/\*\.test\.ts\b/);
    assert.match(script, /tests\/\*\.test\.tsx\b/);
  });

  test("CI gates on it, and does not merely mention it", () => {
    const ci = read("../../.github/workflows/ci.yml");

    assert.match(
      ci,
      /run: npm run test:future/,
      "the forward-clock run must be a CI step — without it this only protects whoever remembers to type it"
    );

    // `|| true` is how the reconciliation-debt step is deliberately made a
    // warning. This one is a gate, so the same suffix would silently
    // disarm it.
    assert.doesNotMatch(
      ci,
      /npm run test:future\s*\|\|\s*true/,
      "test:future is a gate, not a warning — a passing suite under a future clock is a claim, and `|| true` makes it an empty one"
    );
  });

  test("AGENTS.md tells the next session the rule, not just the command", () => {
    // The command catches the mistake. The rule prevents it, and this repo
    // is read by sessions that will never see this test file.
    const agents = read("../AGENTS.md");

    assert.match(agents, /test:future/);
    assert.match(
      agents,
      /explicit `today`/,
      "the guidance must name the correct pattern, not only forbid the wrong one"
    );
  });
});
