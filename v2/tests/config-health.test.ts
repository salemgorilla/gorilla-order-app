import { test, describe, beforeEach } from "node:test";
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
