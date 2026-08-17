import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { looksLikeEmailAddress } from "../lib/email";
import { getConfigHealth } from "../lib/config-health";

/**
 * A health check that reports presence as correctness is worse than none,
 * because it is trusted. This suite exists because the first version did
 * exactly that: it called LEAD_TO_EMAIL "live" while it was set to an address
 * with two "@" signs, which every mail provider rejects.
 */

describe("recipient validation", () => {
  for (const good of [
    "quote@gorillasalem.com",
    "gorillaprinting@gmail.com",
    "leads+web@salemgorilla.co.uk",
  ]) {
    test(`accepts ${good}`, () => assert.equal(looksLikeEmailAddress(good), true));
  }

  for (const bad of [
    "LEADS@salemgorilla@gmail.com", // the real one, from production
    "leads@gmail",                   // no dot in the domain
    "leads at gmail.com",
    "@gmail.com",
    "leads@",
    "two addresses@a.com, b@b.com",
    "",
    null,
    undefined,
  ]) {
    test(`rejects ${JSON.stringify(bad)}`, () =>
      assert.equal(looksLikeEmailAddress(bad), false));
  }
});

describe("a malformed address is reported, not passed off as working", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  });

  test("LEAD_TO_EMAIL with two @ signs reads as degraded, naming the value", () => {
    process.env.GMAIL_USER = "shop@example.com";
    process.env.GMAIL_APP_PASSWORD = "x";
    process.env.LEAD_TO_EMAIL = "LEADS@salemgorilla@gmail.com";

    const lead = getConfigHealth().capabilities.find(
      (c) => c.key === "lead-notices"
    );

    assert.equal(lead?.state, "degraded");
    assert.match(lead!.summary, /LEADS@salemgorilla@gmail\.com/);
    assert.deepEqual(lead?.fix, ["LEAD_TO_EMAIL (currently unusable)"]);
  });

  test("a good LEAD_TO_EMAIL reads as live", () => {
    process.env.GMAIL_USER = "shop@example.com";
    process.env.GMAIL_APP_PASSWORD = "x";
    process.env.LEAD_TO_EMAIL = "leads@salemgorilla.com";

    const lead = getConfigHealth().capabilities.find(
      (c) => c.key === "lead-notices"
    );

    assert.equal(lead?.state, "live");
    assert.deepEqual(lead?.fix, []);
  });

  test("no provider outranks a bad address — name the thing to fix first", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    process.env.LEAD_TO_EMAIL = "nonsense@@x";

    const lead = getConfigHealth().capabilities.find(
      (c) => c.key === "lead-notices"
    );

    assert.equal(lead?.state, "off");
    assert.match(lead!.summary, /no email provider/i);
  });
});

describe("the apparel catalogue reports why it is dark", () => {
  /**
   * S&S credentials are concatenated into a Basic auth token, so a trailing
   * newline on either one is sent as part of the credential and comes back as
   * a 401 byte-identical to a wrong key. Invisible in the Vercel UI, invisible
   * in the error — so "re-paste the key" reproduces it exactly.
   *
   * This section had a header and no capability under it, so the one
   * integration that was actually failing in production was the one the
   * health check could not report at all.
   */
  const KEYS = ["SS_ACCOUNT_NUMBER", "SS_API_KEY"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function apparel() {
    return getConfigHealth().capabilities.find((c) => c.key === "apparel-catalog")!;
  }

  test("the capability exists at all", () => {
    // It did not, which is why a 401ing catalogue went unreported.
    assert.ok(apparel(), "no apparel-catalog capability in the health report");
  });

  test("neither credential set reads as off, and names both", () => {
    const c = apparel();

    assert.equal(c.state, "off");
    assert.deepEqual(c.fix, ["SS_ACCOUNT_NUMBER", "SS_API_KEY"]);
  });

  test("half a pair is still off — the trap that produces this exact failure", () => {
    process.env.SS_ACCOUNT_NUMBER = "12345";

    assert.equal(apparel().state, "off");
  });

  test("both set stops blaming a missing variable", () => {
    process.env.SS_ACCOUNT_NUMBER = "12345";
    process.env.SS_API_KEY = "abcdef";

    const c = apparel();
    assert.equal(c.state, "degraded");
    assert.match(c.summary, /S&S rejecting them rather than a missing variable/);
    assert.deepEqual(c.fix, []);
  });

  test("surrounding whitespace is called out by name", () => {
    // The whole point: this is the difference between "your key is wrong" and
    // "your key has a newline on it", which look identical from S&S.
    process.env.SS_ACCOUNT_NUMBER = "12345";
    process.env.SS_API_KEY = "abcdef\n";

    assert.match(apparel().summary, /CARRIED SURROUNDING WHITESPACE/);
  });

  test("clean values say so, so the shop stops looking there", () => {
    process.env.SS_ACCOUNT_NUMBER = "12345";
    process.env.SS_API_KEY = "abcdef";

    assert.match(apparel().summary, /Neither carries stray whitespace/);
  });

  test("counts are reported, contents never are", () => {
    process.env.SS_ACCOUNT_NUMBER = "12345";
    process.env.SS_API_KEY = "supersecretkey";

    const summary = apparel().summary;

    assert.match(summary, /5 characters/);
    assert.match(summary, /14 characters/);
    assert.ok(
      !summary.includes("supersecretkey") && !summary.includes("12345"),
      "the health report leaked a credential value"
    );
  });
});
