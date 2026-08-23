import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describeBuild } from "../lib/build-stamp";

/**
 * "Which build am I looking at?" — answered, or admitted.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * /api/artwork-upload reported a build stamp so that a deployment could be
 * identified from outside. Its own comment explains why: a fresh deployment
 * can produce byte-identical minified chunks, so "is my change live?" has no
 * answer otherwise, and that once cost hours of chasing a broken-deploys
 * theory that was never true.
 *
 * The stamp was a hand-typed constant:
 *
 *     build: "2026-08-07-yardsign-material",
 *
 * and it then went two weeks and a dozen deployments without being updated.
 * On 23 August, minutes after a deploy, production still answered with the
 * 7 August string. That is the failure mode of every hand-maintained stamp:
 * it does not go missing, it goes STALE — and stale is worse than absent,
 * because it gets believed.
 *
 * It was believed. Combined with an old commit message saying the blob store
 * was unset, it produced a confident report that the phone hand-off was
 * switched off in production. `/api/artwork-upload` was answering
 * `configured: true` at the time.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * Derived, never written. And when the platform does not tell us, the stamp
 * says it does not know rather than inventing a version — which is the
 * specific behaviour the old constant got wrong.
 */

describe("on Vercel it names the commit", () => {
  test("short sha and environment", () => {
    const stamp = describeBuild({
      VERCEL_GIT_COMMIT_SHA: "daa7e6bb122afb9d8aeebb4a616498fd1dfa7f64",
      VERCEL_ENV: "production",
      VERCEL_DEPLOYMENT_ID: "dpl_Fbt9u8qeP4u9YaTcs2noknJvyJpE",
    });

    assert.equal(stamp.commit, "daa7e6b");
    assert.equal(stamp.environment, "production");
    assert.equal(stamp.label, "daa7e6b (production)");
  });

  test("a preview is not mistaken for production", () => {
    // The two are byte-identical builds of the same commit. Reading a preview
    // and believing it was production is the same mistake in a new costume.
    const preview = describeBuild({
      VERCEL_GIT_COMMIT_SHA: "daa7e6bb1",
      VERCEL_ENV: "preview",
    });

    assert.equal(preview.label, "daa7e6b (preview)");
  });

  test("it moves when the commit moves", () => {
    // The whole point. The constant it replaces could not.
    const before = describeBuild({ VERCEL_GIT_COMMIT_SHA: "5050acd60" });
    const after = describeBuild({ VERCEL_GIT_COMMIT_SHA: "daa7e6bb1" });

    assert.notEqual(before.label, after.label);
  });
});

describe("when it does not know, it says so", () => {
  test("nothing exposed", () => {
    const stamp = describeBuild({});

    assert.equal(stamp.commit, null);
    assert.match(stamp.label, /unidentified build/);
    // Names the variable to set, the way the blob endpoint names its missing
    // credential — that turns a shrug into a five-second fix.
    assert.match(stamp.label, /VERCEL_GIT_COMMIT_SHA/);
  });

  test("a deployment id alone still distinguishes one build from another", () => {
    const stamp = describeBuild({ VERCEL_DEPLOYMENT_ID: "dpl_abc123" });

    assert.equal(stamp.commit, null);
    assert.equal(stamp.label, "deployment dpl_abc123");
  });

  test("empty strings count as absent, not as a version", () => {
    // Vercel sets these to "" rather than unsetting them in some contexts. A
    // stamp reading "()" or " (production)" is exactly the confident-and-wrong
    // answer this replaces.
    const stamp = describeBuild({ VERCEL_GIT_COMMIT_SHA: "", VERCEL_ENV: "" });

    assert.equal(stamp.commit, null);
    assert.match(stamp.label, /unidentified build/);
  });

  test("it never invents a date or a name", () => {
    for (const env of [{}, { VERCEL_ENV: "production" }]) {
      assert.doesNotMatch(describeBuild(env).label, /\d{4}-\d{2}-\d{2}/);
    }
  });
});

describe("nothing hand-maintained is left", () => {
  const routes = [
    "../app/api/artwork-upload/route.ts",
    "../app/api/printavo-test/route.ts",
  ];

  test("no route carries a typed-in version string", () => {
    for (const route of routes) {
      const source = readFileSync(new URL(route, import.meta.url), "utf8");
      const emitted = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));

      assert.doesNotMatch(
        emitted.join("\n"),
        /build: "\d{4}-\d{2}-\d{2}/,
        `${route} still types its own build stamp`
      );
    }
  });

  test("both report the derived one", () => {
    for (const route of routes) {
      const source = readFileSync(new URL(route, import.meta.url), "utf8");
      assert.match(source, /describeBuild\(\)/, `${route} does not report a build`);
    }
  });
});

describe("it is safe on a public endpoint", () => {
  test("only ids and names, never a value that could be a secret", () => {
    // Both endpoints reporting this are public. The stamp reads three
    // specific variables and nothing else — it can never sweep up a token the
    // way an "everything starting with VERCEL_" filter would.
    const source = readFileSync(
      new URL("../lib/build-stamp.ts", import.meta.url),
      "utf8"
    );

    const reads = source.match(/env\.[A-Z_]+/g) ?? [];

    assert.deepEqual(
      [...new Set(reads)].sort(),
      ["env.VERCEL_DEPLOYMENT_ID", "env.VERCEL_ENV", "env.VERCEL_GIT_COMMIT_SHA"]
    );
  });
});
