import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  adminSecretMatches,
  getAdminSecret,
  isAdminSecretConfigured,
} from "../lib/admin-auth";

/**
 * The shop's own key.
 *
 * Two things depend on this comparison: /api/health, which is how the shop
 * finds out an integration went dark, and /api/payment-request, which asks a
 * customer for money. Getting it wrong in one direction locks the shop out of
 * its own tools during exactly the incident it needs them for; getting it
 * wrong in the other lets someone else in.
 */

const ORIGINAL = process.env.ADMIN_SECRET;

beforeEach(() => {
  delete process.env.ADMIN_SECRET;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = ORIGINAL;
});

describe("whitespace never decides whether the shop gets in", () => {
  /**
   * The bug this pins. ADMIN_SECRET was compared raw, so a trailing newline in
   * the Vercel value — the commonest way a pasted secret goes wrong — made
   * every correct attempt fail, permanently. Trailing whitespace is invisible
   * in the Vercel UI and invisible in the character count /api/health tells
   * you to compare, so nothing about the failure pointed at the cause. The
   * hint then sent the shop to check Production vs Preview, which was not it.
   */
  test("a stored secret with a trailing newline still accepts the real secret", () => {
    process.env.ADMIN_SECRET = "hunter2\n";
    assert.equal(adminSecretMatches("hunter2"), true);
  });

  test("a stored secret with surrounding spaces still accepts the real secret", () => {
    process.env.ADMIN_SECRET = "  hunter2  ";
    assert.equal(adminSecretMatches("hunter2"), true);
  });

  test("a pasted secret carrying a trailing newline is still accepted", () => {
    // The shop reads these off a phone. A copied line very often brings one.
    process.env.ADMIN_SECRET = "hunter2";
    assert.equal(adminSecretMatches("hunter2\n"), true);
  });

  test("trimming cannot turn a wrong secret into a right one", () => {
    process.env.ADMIN_SECRET = "hunter2";
    assert.equal(adminSecretMatches(" hunter3 "), false);
    assert.equal(adminSecretMatches("hunter"), false);
    assert.equal(adminSecretMatches("hunter22"), false);
  });

  test("an interior space is still a mismatch", () => {
    // This is the "+ arrived as a space" case. Trimming must not paper over
    // it — the value really is different, and /api/health says so.
    process.env.ADMIN_SECRET = "hunter+2";
    assert.equal(adminSecretMatches("hunter 2"), false);
  });
});

describe("fail closed means closed", () => {
  test("no secret configured rejects everything, including an empty string", () => {
    assert.equal(isAdminSecretConfigured(), false);
    assert.equal(adminSecretMatches(""), false);
    assert.equal(adminSecretMatches(null), false);
    assert.equal(adminSecretMatches(undefined), false);
    assert.equal(adminSecretMatches("anything"), false);
  });

  test("a whitespace-only secret counts as NOT configured", () => {
    /**
     * `if (!secret)` was the fail-closed check, and "   " is truthy. So a
     * variable that someone blanked by pasting over it read as configured,
     * and the endpoint then accepted "   " as the password — a guessable one.
     * Trimming first is what makes failing closed mean what it says.
     */
    process.env.ADMIN_SECRET = "   \n\t ";

    assert.equal(isAdminSecretConfigured(), false);
    assert.equal(adminSecretMatches("   \n\t "), false);
    assert.equal(adminSecretMatches("   "), false);
    assert.equal(adminSecretMatches(""), false);
  });

  test("a real secret is configured and matches only itself", () => {
    process.env.ADMIN_SECRET = "a-real-long-secret-value";

    assert.equal(isAdminSecretConfigured(), true);
    assert.equal(getAdminSecret(), "a-real-long-secret-value");
    assert.equal(adminSecretMatches("a-real-long-secret-value"), true);
    assert.equal(adminSecretMatches("a-real-long-secret-valu"), false);
  });

  test("comparison survives a non-ASCII secret without throwing", () => {
    // timingSafeEqual works on byte buffers, and multi-byte characters make
    // byte length and character length disagree. A throw here would be a 500
    // on the login path rather than a clean 401.
    process.env.ADMIN_SECRET = "sécret-ünïcode-🦍";

    assert.equal(adminSecretMatches("sécret-ünïcode-🦍"), true);
    assert.equal(adminSecretMatches("secret-unicode"), false);
  });
});
