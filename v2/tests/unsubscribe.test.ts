/**
 * THE OPT-OUT, WHICH IS THE PART THAT IS NOT OPTIONAL.
 *
 * CAN-SPAM requires a working opt-out and a physical postal address in
 * marketing mail. Gmail and Yahoo have required the one-click
 * List-Unsubscribe header from bulk senders since February 2024. And the
 * practical stake is larger than the legal one: an unsubscribe link that
 * does not work is the fastest way to turn a subscriber into a spam
 * complaint, and a complaint rate of 0.3% — three people in a thousand —
 * gets a sending domain throttled, which takes the shop's QUOTE emails down
 * with the newsletter.
 *
 * Two things are tested here, and the second is the one people get wrong:
 * the token cannot be forged, and the link cannot be triggered by a machine
 * that merely fetched it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  SITE_ORIGIN,
  isUnsubscribeConfigured,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "../lib/unsubscribe-token";

const before = process.env.NEWSLETTER_SECRET;

beforeEach(() => {
  process.env.NEWSLETTER_SECRET = "a-real-secret-value";
});

afterEach(() => {
  if (before === undefined) delete process.env.NEWSLETTER_SECRET;
  else process.env.NEWSLETTER_SECRET = before;
});

describe("the token", () => {
  it("verifies for the address it was made for", () => {
    const token = unsubscribeToken("stacey@example.com");

    assert.ok(token);
    assert.equal(verifyUnsubscribeToken("stacey@example.com", token), true);
  });

  it("does not verify for anybody else", () => {
    const token = unsubscribeToken("stacey@example.com")!;

    // Without this, one bored person could walk the customer list and
    // silently remove everybody, and nobody would find out until the sends
    // stopped mattering.
    assert.equal(verifyUnsubscribeToken("dana@example.com", token), false);
  });

  it("is the same however the address was typed", () => {
    // The link has to keep working when a mail client lowercases it, or the
    // customer copies it out of a search result two years later.
    assert.equal(
      unsubscribeToken("Stacey@Example.com"),
      unsubscribeToken("  stacey@example.com ")
    );
  });

  it("survives a round trip through a URL", () => {
    const url = new URL(unsubscribeUrl("stacey+news@example.com")!);

    assert.equal(
      verifyUnsubscribeToken(
        url.searchParams.get("e") || "",
        url.searchParams.get("t") || ""
      ),
      true
    );
  });

  it("is URL-safe, so no mail client can break it in half", () => {
    // base64url. A "+" or "/" in a query string is a support email that
    // starts "your unsubscribe link doesn't work".
    for (const address of ["a@b.com", "stacey+news@example.com", "K@x.co"]) {
      assert.match(unsubscribeToken(address)!, /^[A-Za-z0-9_-]+$/);
    }
  });

  it("garbage does not throw — it answers no", () => {
    // timingSafeEqual raises on a length mismatch, which would be a 500 on
    // a customer pressing unsubscribe.
    assert.equal(verifyUnsubscribeToken("stacey@example.com", "short"), false);
    assert.equal(verifyUnsubscribeToken("stacey@example.com", ""), false);
    assert.equal(verifyUnsubscribeToken("", "anything"), false);
  });
});

describe("no secret means no link, never a link that does nothing", () => {
  it("mints nothing and verifies nothing", () => {
    delete process.env.NEWSLETTER_SECRET;

    assert.equal(isUnsubscribeConfigured(), false);
    assert.equal(unsubscribeToken("stacey@example.com"), null);
    assert.equal(unsubscribeUrl("stacey@example.com"), null);
    assert.equal(verifyUnsubscribeToken("stacey@example.com", "anything"), false);
  });

  it("a trailing newline is not a secret", () => {
    // Invisible in the Vercel UI and invisible in the error it causes. Here
    // it would mint tokens that verify today and stop verifying the day
    // somebody re-pastes the value cleanly.
    process.env.NEWSLETTER_SECRET = "  \n ";
    assert.equal(isUnsubscribeConfigured(), false);

    process.env.NEWSLETTER_SECRET = "real\n";
    const token = unsubscribeToken("stacey@example.com")!;

    process.env.NEWSLETTER_SECRET = "real";
    assert.equal(verifyUnsubscribeToken("stacey@example.com", token), true);
  });

  it("its own secret, not the admin password", () => {
    // These tokens live in customers' inboxes forever. Rotating the admin
    // password must not break every unsubscribe link the shop has sent.
    const source = readFileSync(
      new URL("../lib/unsubscribe-token.ts", import.meta.url),
      "utf8"
    );
    // CODE, not prose. The header explains at length why ADMIN_SECRET is
    // the wrong key here, and a rule that bans the word outright is a rule
    // satisfied by deleting the explanation.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    assert.match(code, /NEWSLETTER_SECRET/);
    assert.doesNotMatch(code, /ADMIN_SECRET/);
  });
});

describe("the link points at a page, not at an endpoint that acts", () => {
  const route = readFileSync(
    new URL("../app/api/unsubscribe/route.ts", import.meta.url),
    "utf8"
  );

  it("the emailed URL is /unsubscribe", () => {
    const url = unsubscribeUrl("stacey@example.com")!;

    assert.ok(url.startsWith(`${SITE_ORIGIN}/unsubscribe?`));
  });

  it("and the endpoint has no GET at all", () => {
    /**
     * The one that gets missed. Mail clients, corporate link scanners and
     * preview generators fetch URLs found in a message with no human
     * involved — an unsubscribe that acts on GET is an unsubscribe that
     * happens to people who never clicked. RFC 8058 makes one-click a POST
     * for the same reason.
     */
    assert.doesNotMatch(route, /export async function GET/);
    assert.match(route, /export async function POST/);
  });

  it("a bad token is refused, and refused the same way as an unknown one", () => {
    // A different answer for "wrong token" and "unknown address" would turn
    // this into a way to test whether an address is on the list.
    assert.match(route, /verifyUnsubscribeToken/);
    assert.match(route, /That unsubscribe link is not valid\./);
  });

  it("a storage failure still tells the customer they are off", () => {
    // They must never see an error. The shop's job is to make it true,
    // which is what the console.error is for.
    assert.match(route, /UNSUBSCRIBE FAILED TO STORE/);
    assert.match(route, /\{ ok: true, recorded: false \}/);
  });

  it("the page asks before it acts", () => {
    const page = readFileSync(
      new URL("../app/unsubscribe/page.tsx", import.meta.url),
      "utf8"
    );

    assert.match(page, /Unsubscribe me/);
    assert.match(page, /method: "POST"/);
    // And it says the thing somebody with an order in the shop needs to
    // hear before they press it.
    assert.match(page, /aren&rsquo;t affected|aren&rsquo;t marketing/);
  });
});
