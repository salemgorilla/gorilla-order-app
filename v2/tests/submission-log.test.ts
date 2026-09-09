/**
 * THE LINE THAT MAKES THE APP COUNTABLE.
 *
 * Every usage report this project has produced was reconstructed by reading
 * the shop's inbox. Nobody can say how many people take the "not listed
 * here" door instead of the priced one, how often artwork falls back to the
 * email path, or how often a need-by date lands exactly on the floor the
 * picker would not let the customer go under. Those are the questions the
 * last three weeks of work kept running into.
 *
 * The route logs richly and inconsistently — a whole quote record, a
 * sentence per refusal, a line per email. None of it can be COUNTED. This
 * line can, and these tests hold the two properties that make it worth
 * having: the fields are always there in the same order, and none of them
 * is a customer's personal information.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

import { describeSubmission, type SubmissionFacts } from "../lib/submission-log";

function facts(overrides: Partial<SubmissionFacts> = {}): SubmissionFacts {
  return {
    quoteNumber: "GS-20260909-AB12C",
    flow: "apparel",
    door: "priced",
    quantity: 36,
    total: 914.52,
    needBy: "2026-12-08",
    earliest: "2026-09-29",
    artwork: "blob",
    delivered: true,
    billed: false,
    deposit: false,
    kiosk: false,
    ...overrides,
  };
}

describe("it can be grepped and counted", () => {
  test("one line, one prefix, no spaces in the prefix", () => {
    const line = describeSubmission(facts());

    assert.equal(line.includes("\n"), false, "a multi-line log line is not one line");
    assert.ok(line.startsWith("QUOTE_SUBMITTED "));
  });

  test("every field is present on every line, in the same order", () => {
    // The whole point. A field that appears only sometimes cannot be
    // counted, and one that moves cannot be cut out with awk.
    const order = [
      "quote=",
      "flow=",
      "door=",
      "qty=",
      "total=",
      "needBy=",
      "earliest=",
      "atFloor=",
      "artwork=",
      "delivered=",
      "billed=",
      "deposit=",
      "kiosk=",
    ];

    for (const shape of [
      facts(),
      facts({ door: "special", flow: "signs", billed: true }),
      facts({ flow: "stickers", billed: true, deposit: true, artwork: "none" }),
      facts({ kiosk: true, needBy: "", earliest: "" }),
      facts({ delivered: false }),
    ]) {
      const line = describeSubmission(shape);
      let at = 0;

      for (const key of order) {
        const found = line.indexOf(key, at);
        assert.ok(found > at - 1, `${key} missing from ${line}`);
        at = found;
      }
    }
  });

  test("a value with a space cannot break the scan", () => {
    const line = describeSubmission(
      facts({ billed: false, reason: "special order — not listed" })
    );

    assert.match(line, /why="special order — not listed"/);
    // And the quoting survives a value that already contains one.
    assert.match(
      describeSubmission(facts({ reason: 'the "spec" was missing' })),
      /why="the 'spec' was missing"/
    );
  });

  test("the reason is only on the lines that need one", () => {
    // On an ordinary order the reason is "it billed". Repeating that on
    // every line is what makes a log go unread.
    assert.doesNotMatch(
      describeSubmission(facts({ billed: true, reason: "priced by the server" })),
      /why=/
    );
    assert.match(
      describeSubmission(facts({ billed: false, reason: "kiosk order" })),
      /why="kiosk order"/
    );
  });

  test("no reason at all is not the same as an empty one", () => {
    // Apparel passes `undefined` — there is no gate it failed. The line
    // must simply end, not carry `why=` with nothing after it.
    const line = describeSubmission(facts({ billed: false, reason: undefined }));

    assert.doesNotMatch(line, /why=/);
    assert.ok(line.endsWith("kiosk=false"), line);
  });

  test("a long reason is trimmed, not wrapped", () => {
    const line = describeSubmission(
      facts({ billed: false, reason: "x".repeat(400) })
    );

    assert.equal(line.includes("\n"), false);
    assert.ok(line.length < 400, `${line.length} characters`);
  });
});

describe("no personal information, ever", () => {
  test("nothing but the quote number identifies the order", () => {
    /**
     * A log line carrying a customer's address is a line that cannot be
     * pasted into a chat, and one that cannot be pasted does not get used.
     * The quote number is the key to the Printavo record that legitimately
     * holds the name, the email and the file.
     */
    const line = describeSubmission(facts());

    for (const pattern of [/@/, /\bDana\b/i, /\.png/i, /\bphone\b/i]) {
      assert.doesNotMatch(line, pattern);
    }
  });

  test("the shape it is built from has no field for one", () => {
    // Enforced on the TYPE, not on one call site: a future caller cannot
    // pass a name through a field that does not exist.
    const source = readFileSync(
      new URL("../lib/submission-log.ts", import.meta.url),
      "utf8"
    );
    const shape = source
      .slice(
        source.indexOf("export type SubmissionFacts"),
        source.indexOf("/** Quotes a value")
      )
      // FIELDS, not prose. The doc comments name the delivery channels —
      // "email OR Printavo" — and a rule that forbids the word anywhere in
      // the file is a rule that gets satisfied by deleting the explanation.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    for (const banned of ["email", "customerName", "phone", "fileName", "notes"]) {
      assert.doesNotMatch(shape, new RegExp(`\\b${banned}\\b`), banned);
    }
  });
});

describe("atFloor is the question it can actually answer", () => {
  test("true only when the customer picked the earliest allowed date", () => {
    /**
     * The honest version — what they ASKED for against what was allowed —
     * cannot be logged: the picker's `min` means they cannot express an
     * earlier date at all. Stuart Hinton typed 18 Sep twice in a free-text
     * box because the calendar refused it, and the record kept the floor,
     * 21 Sep, as his firm deadline.
     *
     * So this counts how often the floor and the answer coincide. Not proof
     * anyone wanted sooner; the number that says how often it is worth
     * asking.
     */
    assert.match(
      describeSubmission(facts({ needBy: "2026-09-29", earliest: "2026-09-29" })),
      /atFloor=true/
    );
    assert.match(
      describeSubmission(facts({ needBy: "2026-12-08", earliest: "2026-09-29" })),
      /atFloor=false/
    );
  });

  test("no date at all is not 'at the floor'", () => {
    // An empty date matching an empty floor must not read as a customer
    // pinned to the earliest we allow.
    assert.match(
      describeSubmission(facts({ needBy: "", earliest: "" })),
      /atFloor=false/
    );
  });
});

describe("the numbers are the shape a counter expects", () => {
  test("money always has cents, quantity never does", () => {
    const line = describeSubmission(facts({ total: 60, quantity: 1 }));

    assert.match(line, /total=60\.00/);
    assert.match(line, /qty=1\b/);
  });

  test("a nonsense quantity cannot go negative", () => {
    assert.match(describeSubmission(facts({ quantity: -5 })), /qty=0\b/);
  });
});

describe("a failed submission is still a submission", () => {
  test("the line says so instead of going missing", () => {
    // Driving two real quotes through a local server produced NO lines at
    // all: with neither email nor Printavo configured the route returns 502
    // UNDELIVERED, and the first draft logged beside the success response.
    // An order that reached nobody is the one worth counting.
    assert.match(describeSubmission(facts({ delivered: false })), /delivered=false\b/);
    assert.match(describeSubmission(facts()), /delivered=true\b/);
  });

  test("a delivered order that did not bill is not the same as an undelivered one", () => {
    const undelivered = describeSubmission(facts({ delivered: false, billed: false }));
    const unbilled = describeSubmission(facts({ delivered: true, billed: false }));

    assert.notEqual(undelivered, unbilled);
    assert.match(undelivered, /delivered=false billed=false/);
    assert.match(unbilled, /delivered=true billed=false/);
  });
});

describe("the route emits it", () => {
  const route = readFileSync(
    new URL("../app/api/quote/route.ts", import.meta.url),
    "utf8"
  );

  test("once, after the outcome is known", () => {
    assert.match(route, /describeSubmission\(\{/);
    assert.equal(
      route.split("describeSubmission({").length - 1,
      1,
      "two call sites means two lines per submission, and a double count"
    );

    // AFTER the checkout call — a line emitted earlier would report what
    // was about to be attempted rather than what happened.
    assert.ok(
      route.indexOf("describeSubmission({") > route.indexOf("createCheckout({"),
      "the line is logged before the payment link is raised"
    );
  });

  test("BEFORE the undelivered gate, so a 502 is still counted", () => {
    // The regression this ordering exists to prevent: the route returns 502
    // when neither email nor Printavo took the quote, so anything logged
    // after that gate never fires for the submissions that failed.
    assert.ok(
      route.indexOf("describeSubmission({") < route.indexOf("if (!reachedShop) {"),
      "the line is emitted after the 502 return and cannot fire for it"
    );
    assert.ok(
      route.indexOf("const reachedShop") < route.indexOf("describeSubmission({"),
      "delivered= cannot be reported before it is known"
    );
  });

  test("it reports the real outcome, not the intention", () => {
    // `checkout.ready` is what actually happened; the auto-bill decision is
    // only what the gate allowed. The two differ whenever Printavo failed.
    const call = route.slice(
      route.indexOf("describeSubmission({"),
      route.indexOf("if (!reachedShop) {")
    );

    assert.match(call, /billed: Boolean\(checkout\?\.ready\)/);
    assert.match(call, /deposit: Boolean\(checkout\?\.deposit\)/);
    assert.match(call, /delivered: reachedShop/);
  });

  test("the reason comes from the gate that applies to this flow", () => {
    // Observed on the first real drive: every apparel line carried
    // why="not a signs order" — the signs gate's answer, borrowed by a flow
    // that has no gate. Apparel is an estimate the shop confirms; there is
    // nothing for it to have failed.
    const call = route.slice(
      route.indexOf("describeSubmission({"),
      route.indexOf("if (!reachedShop) {")
    );
    const reason = call.slice(call.indexOf("reason: "));

    assert.match(reason, /reason: isStickers\s*\?\s*stickersAutoBill\.reason/);
    assert.match(reason, /isSignsOrder\(pricedOrder\)\s*\?\s*signsAutoBill\.reason/);
    assert.match(reason, /:\s*undefined/);
  });
});
