/**
 * THE DROP-OFF STATION — the session token, the path guard, and the throttle.
 *
 * Gabe's brief, 2026-09-17: a screen on the counter where a walk-in looks up
 * an order and sends artwork for it, from a USB stick or from their phone.
 *
 * What is pinned here is everything that decides WHO can put a file in the
 * shop's store and under whose order:
 *
 *   1. a session token names one order and cannot be forged, tampered with
 *      or replayed after it expires;
 *   2. the blob path guard admits the drop-off shape and nothing adjacent to
 *      it — no traversal, no second segment, no invented token;
 *   3. the lookup is throttled per IP, and the two throttled endpoints do not
 *      share a budget.
 *
 * The identity check itself (order number AND the email on the order) is
 * lookupOrderStatus, already covered where /track's tests live. This file
 * does not re-test Printavo; it tests what the app does with the answer.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  DROPOFF_IDLE_MS,
  DROPOFF_TTL_MS,
  dropoffPrefix,
  isQuoteNumberShape,
  normaliseQuoteNumber,
} from "../lib/dropoff";
import {
  createDropoffToken,
  isDropoffConfigured,
  isDropoffTokenShape,
  readDropoffToken,
} from "../lib/dropoff-token";
import { KIOSK_IDLE_MS } from "../lib/kiosk";
import { rateLimited, resetRateLimits } from "../lib/rate-limit";
import { isAllowedUploadPath } from "../lib/upload-limits";

const SECRET = "dropoff-test-secret";
const ORDER = "GS-20260914-T6JBK";

/** The module reads process.env on every call, so a test can set it per case. */
function withSecret<T>(value: string | undefined, run: () => T): T {
  const beforeDropoff = process.env.DROPOFF_SECRET;
  const beforeAdmin = process.env.ADMIN_SECRET;

  if (value === undefined) delete process.env.DROPOFF_SECRET;
  else process.env.DROPOFF_SECRET = value;
  delete process.env.ADMIN_SECRET;

  try {
    return run();
  } finally {
    if (beforeDropoff === undefined) delete process.env.DROPOFF_SECRET;
    else process.env.DROPOFF_SECRET = beforeDropoff;
    if (beforeAdmin === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = beforeAdmin;
  }
}

describe("the order number a customer types", () => {
  test("a receipt read aloud, typed without dashes, is the same order", () => {
    for (const typed of [
      "GS-20260914-T6JBK",
      "gs 20260914 t6jbk",
      "GS20260914T6JBK",
      "  GS-20260914-T6JBK  ",
    ]) {
      assert.equal(normaliseQuoteNumber(typed), ORDER, `"${typed}"`);
    }
  });

  test("shape is checked before the value reaches a token, a path or a log", () => {
    assert.equal(isQuoteNumberShape(ORDER), true);
    for (const bad of [
      "",
      "GS-2026-T6JBK",
      "XX-20260914-T6JBK",
      "GS-20260914-",
      "GS-20260914-t6jbk!",
      "GS-20260914-T6JBK/../other",
      null,
      42,
    ]) {
      assert.equal(isQuoteNumberShape(bad as unknown), false, String(bad));
    }
  });
});

describe("the session token", () => {
  test("names its order, and reads back", () => {
    withSecret(SECRET, () => {
      const token = createDropoffToken(ORDER)!;
      assert.ok(token, "no token minted");
      assert.equal(isDropoffTokenShape(token), true);
      assert.equal(readDropoffToken(token)?.quoteNumber, ORDER);
    });
  });

  test("is one path segment — it becomes a blob key and a QR URL", () => {
    withSecret(SECRET, () => {
      const token = createDropoffToken(ORDER)!;
      assert.doesNotMatch(token, /[/\\?#%+= ]/, "token is not URL- and path-safe");
      assert.equal(isAllowedUploadPath(`${dropoffPrefix(token)}logo.eps`), true);
    });
  });

  test("a tampered payload or signature is refused", () => {
    withSecret(SECRET, () => {
      const token = createDropoffToken(ORDER)!;
      const [payload, signature] = token.split(".");

      // Re-point the token at a different order, keeping the signature.
      const forged = Buffer.from(`GS-20260101-AAAAA|${Date.now() + 1000}`).toString(
        "base64url"
      );
      assert.equal(readDropoffToken(`${forged}.${signature}`), null);

      // Keep the payload, invent a signature of the same length.
      const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
      assert.equal(readDropoffToken(`${payload}.${flipped}`), null);

      // A signature of a different length must not throw — timingSafeEqual
      // does on a length mismatch, and a 500 here is a customer at a counter.
      assert.equal(readDropoffToken(`${payload}.${signature}xx`), null);
      assert.doesNotThrow(() => readDropoffToken(`${payload}.x`));
    });
  });

  test("a token minted under one secret is worthless under another", () => {
    const token = withSecret(SECRET, () => createDropoffToken(ORDER)!);
    assert.equal(withSecret("a-different-secret", () => readDropoffToken(token)), null);
  });

  test("it expires, and the expiry is enforced on read", () => {
    withSecret(SECRET, () => {
      const mintedAt = 1_000_000_000_000;
      const token = createDropoffToken(ORDER, mintedAt)!;

      assert.ok(readDropoffToken(token, mintedAt + DROPOFF_TTL_MS - 1));
      assert.equal(readDropoffToken(token, mintedAt + DROPOFF_TTL_MS + 1), null);
    });
  });

  test("no secret means no session at all — never an unsigned one", () => {
    withSecret(undefined, () => {
      assert.equal(isDropoffConfigured(), false);
      assert.equal(createDropoffToken(ORDER), null);
      assert.equal(readDropoffToken("anything.atall"), null);
    });
  });

  test("ADMIN_SECRET is the fallback, and only for these short-lived tokens", () => {
    const before = { d: process.env.DROPOFF_SECRET, a: process.env.ADMIN_SECRET };
    delete process.env.DROPOFF_SECRET;
    process.env.ADMIN_SECRET = "admin-fallback";

    try {
      assert.equal(isDropoffConfigured(), true);
      const token = createDropoffToken(ORDER)!;
      assert.equal(readDropoffToken(token)?.quoteNumber, ORDER);
    } finally {
      if (before.d === undefined) delete process.env.DROPOFF_SECRET;
      else process.env.DROPOFF_SECRET = before.d;
      if (before.a === undefined) delete process.env.ADMIN_SECRET;
      else process.env.ADMIN_SECRET = before.a;
    }
  });

  test("a shapeless token never reaches the crypto, or a path", () => {
    withSecret(SECRET, () => {
      for (const bad of [
        "",
        "nodot",
        "two.dots.here",
        "../../etc/passwd.sig",
        "a/b.sig",
        `${"x".repeat(500)}.sig`,
        null,
        {},
      ]) {
        assert.equal(isDropoffTokenShape(bad as unknown), false, String(bad));
        assert.equal(readDropoffToken(bad as unknown), null, String(bad));
      }
    });
  });
});

describe("the blob path guard", () => {
  test("admits a drop-off file and refuses everything shaped nearly like one", () => {
    const token = withSecret(SECRET, () => createDropoffToken(ORDER)!);

    assert.equal(isAllowedUploadPath(`dropoff/${token}/logo.png`), true);

    for (const bad of [
      `dropoff/${token}`,
      `dropoff/${token}/`,
      `dropoff/${token}/nested/logo.png`,
      `dropoff//logo.png`,
      `dropoff/../quote-artwork/logo.png`,
      `dropoff/${token}/../../secret.png`,
      `/dropoff/${token}/logo.png`,
      `dropoff/not a token/logo.png`,
      `dropoff/a/b/c`,
    ]) {
      assert.equal(isAllowedUploadPath(bad), false, bad);
    }
  });

  test("the two shapes that were already allowed still are", () => {
    assert.equal(isAllowedUploadPath("quote-artwork/logo.png"), true);
    assert.equal(
      isAllowedUploadPath(`handoff/${"a1b2c3d4e5".repeat(3)}/logo.png`),
      true
    );
  });
});

describe("the throttle", () => {
  afterEach(resetRateLimits);

  test("lets the limit through and stops the next one", () => {
    const now = 1_000;
    for (let i = 0; i < 5; i += 1) {
      assert.equal(rateLimited("dropoff-lookup", "1.2.3.4", 5, now), false, `hit ${i}`);
    }
    assert.equal(rateLimited("dropoff-lookup", "1.2.3.4", 5, now), true);
  });

  test("the window rolls", () => {
    const now = 1_000;
    for (let i = 0; i < 6; i += 1) rateLimited("dropoff-lookup", "5.6.7.8", 5, now);

    assert.equal(rateLimited("dropoff-lookup", "5.6.7.8", 5, now), true);
    assert.equal(rateLimited("dropoff-lookup", "5.6.7.8", 5, now + 60_001), false);
  });

  test("buckets and keys are independent — one shop does not lock out the next", () => {
    const now = 1_000;
    for (let i = 0; i < 6; i += 1) rateLimited("dropoff-lookup", "1.1.1.1", 5, now);

    assert.equal(rateLimited("dropoff-lookup", "1.1.1.1", 5, now), true);
    assert.equal(rateLimited("dropoff-lookup", "2.2.2.2", 5, now), false);
    // /track and the station must not spend each other's budget.
    assert.equal(rateLimited("order-status", "1.1.1.1", 10, now), false);
  });
});

describe("the station clears itself sooner than the order desk", () => {
  test("idle timeouts are set deliberately, not copied", () => {
    assert.ok(
      DROPOFF_IDLE_MS < KIOSK_IDLE_MS,
      "a drop-off is a two-minute errand; a quote is a decision worth protecting"
    );
    assert.ok(DROPOFF_IDLE_MS >= 60_000, "not so brisk it wipes somebody mid-upload");
    assert.ok(DROPOFF_TTL_MS > DROPOFF_IDLE_MS, "the token must outlive the screen");
  });
});

describe("no way out of the appliance", () => {
  /**
   * The device is locked to one URL with no address bar, no tabs and no
   * back gesture. A single link out of this flow strands a customer in the
   * marketing site with no way home short of a member of staff rebooting
   * the Pi — which is why "no navigation" is an acceptance criterion and
   * not a styling preference.
   *
   * Checked in the SOURCE rather than the rendered page because the failure
   * arrives as somebody adding a convenient "back to the shop" link months
   * from now, and that edit should fail here.
   */
  const SOURCES = [
    "app/dropoff/page.tsx",
    "app/dropoff/send/[token]/page.tsx",
    "components/dropoff/DropoffStation.tsx",
    "components/dropoff/TouchKeyboard.tsx",
  ];

  test("nothing in the drop-off flow links anywhere", async () => {
    const { readFile } = await import("node:fs/promises");

    for (const file of SOURCES) {
      const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");

      // Comments describe routes on purpose ("/kiosk is the order desk").
      // Strip them so prose cannot fail the test and cannot hide a link.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      assert.doesNotMatch(code, /from "next\/link"/, `${file} imports Link`);
      assert.doesNotMatch(code, /<a[\s>]/, `${file} renders an anchor`);
      assert.doesNotMatch(code, /href=/, `${file} sets an href`);
      assert.doesNotMatch(
        code,
        /window\.location\s*=|location\.href\s*=|router\.push/,
        `${file} navigates`
      );
    }
  });

  test("the station never renders the site's own chrome", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../components/dropoff/DropoffStation.tsx", import.meta.url),
      "utf8"
    );

    // Importing the quote flow, the header or the footer would drag the whole
    // site — and its links — onto a screen that must not have them.
    for (const forbidden of ["../Header", "components/Header", "../../app/page"]) {
      assert.ok(!source.includes(forbidden), `station imports ${forbidden}`);
    }
  });
});

describe("the browser bundle stays free of node builtins", () => {
  /**
   * The phone page imported the token module for one regex, and that module
   * imports node:crypto — so the page died at build time with "Reading from
   * node:crypto is not handled by plugins". `tsc` passes on that happily;
   * only loading the page finds it.
   *
   * The bigger exposure was lib/upload-limits.ts, which reached for the same
   * regex: it is imported by lib/artwork-upload.ts, which EVERY quote in the
   * app uploads through. A server-only import there takes the upload path
   * down for stickers, signs and apparel at once.
   *
   * So the rule is a test: the modules a client component may import must not
   * reach a node builtin, directly or one hop away.
   */
  const CLIENT_SAFE = ["lib/dropoff.ts", "lib/upload-limits.ts", "lib/handoff.ts"];

  test("client-reachable modules import no node: builtin, one hop out", async () => {
    const { readFile } = await import("node:fs/promises");

    for (const file of CLIENT_SAFE) {
      const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /from "node:/, `${file} imports a node builtin`);

      // One hop: whatever it pulls from lib/ must be clean too.
      for (const [, dep] of source.matchAll(/from "\.\/([a-z0-9-]+)"/g)) {
        const depSource = await readFile(
          new URL(`../lib/${dep}.ts`, import.meta.url),
          "utf8"
        );
        assert.doesNotMatch(
          depSource,
          /from "node:/,
          `${file} imports ./${dep}, which imports a node builtin`
        );
      }
    }
  });
});

describe("touch targets", () => {
  /**
   * The brief's one hard number: nothing smaller than about 48px, because
   * this is operated standing up, at arm's length, by somebody who may be
   * holding a bag and a phone.
   *
   * It is a test because the floor was nearly lost to a layout fix: on a
   * 600px-tall Pi screen the keyboard had to shrink for the exit button to
   * stay reachable, and the obvious way to find those pixels is to keep
   * taking them off the keys. 48 is where that stops.
   */
  test("no tap target in the drop-off flow is under 48px", async () => {
    const { readFile } = await import("node:fs/promises");

    for (const file of [
      "components/dropoff/TouchKeyboard.tsx",
      "components/dropoff/DropoffStation.tsx",
    ]) {
      const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");

      for (const [, px] of source.matchAll(/min-h-\[(\d+)px\]/g)) {
        assert.ok(
          Number(px) >= 48,
          `${file} has a ${px}px tap target — the floor is 48`
        );
      }
      for (const [, px] of source.matchAll(/min-w-\[(\d+)px\]/g)) {
        assert.ok(Number(px) >= 48, `${file} has a ${px}px-wide tap target`);
      }
    }
  });
});
