/**
 * THE LIST AS LINES IN A GOOGLE DOC - AND THE CONSENT RULES STILL HOLD.
 *
 * The ledger is only a shelf. lib/subscribers.ts still decides everything
 * about consent, and the rule that matters most is that an unsubscribe is
 * sticky: a pre-ticked box on a later order must not put somebody back on
 * the list. So most of this file does not test the ledger in isolation. It
 * drives the REAL consent functions (recordSubscription, unsubscribeEmail,
 * readAllSubscribers) against a ledger whose "Google Doc" is a string.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MARKED_BY_HAND,
  formatLedgerLine,
  ledgerSubscriberStore,
  parseLedgerLine,
  readLedger,
  sameState,
  type LedgerTransport,
} from "../lib/subscriber-ledger";
import { subscribeToNewsletter } from "../lib/newsletter";
import {
  SUBSCRIBER_PREFIX,
  countSubscriberRecords,
  readAllSubscribers,
  readSubscriber,
  recordSubscription,
  subscriberPath,
  unsubscribeEmail,
  type SubscriberRecord,
} from "../lib/subscribers";

/**
 * A Google Doc, as far as the ledger can tell.
 *
 * `append` adds a paragraph the way the real transport does ("\n" + line), the
 * document opens with the explanation the real one has, and every call is
 * counted so a test can say how many round trips something cost.
 */
function fakeDoc(initial?: string) {
  const state = {
    text:
      initial ??
      [
        "Gorilla Salem newsletter sign-ups",
        "The order app writes to this document. Each line records one person.",
        "Each line has these fields, separated by \" | \": status, email, name.",
      ].join("\n"),
    reads: 0,
    appends: 0,
  };

  const transport: LedgerTransport = {
    async readText() {
      state.reads += 1;
      return `${state.text}\n`;
    },
    async append(line) {
      state.appends += 1;
      state.text += `\n${line}`;
    },
  };

  return { state, transport, store: () => ledgerSubscriberStore(transport) };
}

const AT = "2026-10-20T09:00:00.000Z";

const signup = (email: string, over: Record<string, unknown> = {}) => ({
  email,
  name: "Stacey",
  company: "Canal St Print",
  heardAbout: ["Google", "A friend"],
  source: "labs.gorillasalem.com quote builder",
  preChecked: true,
  quoteNumber: "GS-20261020-AAAAAAAA",
  at: AT,
  ...over,
});

const dataLines = (text: string) =>
  text.split("\n").filter((line) => /^(UNSUBSCRIBED|SUBSCRIBED) \| /.test(line));

describe("a line round-trips", () => {
  const record: SubscriberRecord = {
    email: "stacey@example.com",
    name: "Stacey",
    company: "Canal St Print",
    heardAbout: ["Google", "A friend"],
    optedInAt: AT,
    source: "labs.gorillasalem.com quote builder",
    preChecked: true,
    quoteNumber: "GS-20261020-AAAAAAAA",
    updatedAt: AT,
  };

  test("every field survives", () => {
    assert.deepEqual(parseLedgerLine(formatLedgerLine(record)), record);
  });

  test("it reads as a person would read it", () => {
    const line = formatLedgerLine(record);

    assert.match(line, /^SUBSCRIBED \| stacey@example\.com \| Stacey \| Canal St Print \| Google; A friend \|/);
    assert.equal(line.split(" | ").length, 12);
  });

  test("an unsubscribe changes the status and keeps who they were", () => {
    const off = { ...record, unsubscribedAt: "2026-10-21T10:00:00.000Z" };
    const line = formatLedgerLine(off);

    assert.match(line, /^UNSUBSCRIBED \| stacey@example\.com/);
    assert.deepEqual(parseLedgerLine(line), off);
  });

  test("a request to rejoin is kept distinct from the unsubscribe it follows", () => {
    const rejoin = {
      ...record,
      unsubscribedAt: "2026-10-21T10:00:00.000Z",
      resubscribeAttemptedAt: "2026-11-02T10:00:00.000Z",
    };

    assert.deepEqual(parseLedgerLine(formatLedgerLine(rejoin)), rejoin);
  });

  test("empty fields come back empty, not as the dash that stood in for them", () => {
    const bare = { ...record, name: "", company: "", heardAbout: [] };
    const back = parseLedgerLine(formatLedgerLine(bare));

    assert.equal(back?.name, "");
    assert.equal(back?.company, "");
    assert.deepEqual(back?.heardAbout, []);
  });
});

describe("a name cannot break the line it sits in", () => {
  const base: SubscriberRecord = {
    email: "a@example.com",
    name: "",
    company: "",
    heardAbout: [],
    optedInAt: AT,
    source: "x",
    preChecked: false,
    quoteNumber: "GS-1",
    updatedAt: AT,
  };

  test("a pipe cannot become a second field", () => {
    const line = formatLedgerLine({ ...base, company: "Acme | Sons | Ltd" });

    assert.equal(line.split(" | ").length, 12);
    assert.equal(parseLedgerLine(line)?.company, "Acme / Sons / Ltd");
  });

  test("line breaks, tabs and the Unicode line separators become spaces", () => {
    // U+2028 and U+2029 are line terminators in JavaScript source. A raw one
    // inside a regex literal broke this file's own build once.
    const line = formatLedgerLine({ ...base, name: "Line\nbreak\r\nand\ttab\u2028and\u2029more" });

    assert.doesNotMatch(line, /[\n\r\t\u2028\u2029]/);
    assert.equal(parseLedgerLine(line)?.name, "Line break and tab and more");
  });

  test("a semicolon in a 'heard about us' answer does not split it in two", () => {
    const line = formatLedgerLine({ ...base, heardAbout: ["Instagram; TikTok", "A friend"] });

    assert.deepEqual(parseLedgerLine(line)?.heardAbout, ["Instagram, TikTok", "A friend"]);
  });

  test("an address is stored lowercased, so the same person is one person", () => {
    assert.equal(parseLedgerLine(formatLedgerLine({ ...base, email: "  A@Example.COM " }))?.email, "a@example.com");
  });
});

describe("reading the document back", () => {
  test("the title, the explanation and blank paragraphs are skipped, not rejected", () => {
    const text = [
      "Gorilla Salem newsletter sign-ups",
      "Each line has these fields, separated by \" | \": status, email, name.",
      "",
      "SUBSCRIBED | a@example.com | A | - | - | 2026-10-20T00:00:00Z | yes | GS-1 | site | - | - | 2026-10-20T00:00:00Z",
      "",
    ].join("\n");

    assert.deepEqual([...readLedger(text).keys()], ["a@example.com"]);
  });

  test("the LAST line for an address is the one that counts", () => {
    const first = formatLedgerLine({
      email: "a@example.com", name: "A", company: "", heardAbout: [], optedInAt: AT,
      source: "site", preChecked: true, quoteNumber: "GS-1", updatedAt: AT,
    });
    const second = formatLedgerLine({
      email: "a@example.com", name: "A", company: "", heardAbout: [], optedInAt: AT,
      source: "site", preChecked: true, quoteNumber: "GS-1", updatedAt: AT,
      unsubscribedAt: "2026-10-22T00:00:00Z",
    });

    assert.equal(readLedger(`${first}\n${second}`).get("a@example.com")?.unsubscribedAt, "2026-10-22T00:00:00Z");
    assert.equal(readLedger(`${second}\n${first}`).get("a@example.com")?.unsubscribedAt, undefined);
  });

  test("UNSUBSCRIBED is found whole, not as the SUBSCRIBED at its own tail", () => {
    const line = formatLedgerLine({
      email: "a@example.com", name: "", company: "", heardAbout: [], optedInAt: AT, source: "s",
      preChecked: true, quoteNumber: "GS-1", updatedAt: AT, unsubscribedAt: AT,
    });

    assert.match(line, /^UNSUBSCRIBED \| a@example\.com/);
    assert.equal(parseLedgerLine(line)?.unsubscribedAt, AT);
  });

  test("changing the word SUBSCRIBED to UNSUBSCRIBED by hand takes them off the list", () => {
    // Somebody opens the Doc and edits the first word of a line. The date
    // column is still blank, but the instruction is unmistakable, and the
    // safe direction for a consent record is to obey it.
    const line = formatLedgerLine({
      email: "a@example.com", name: "A", company: "", heardAbout: [], optedInAt: AT, source: "s",
      preChecked: true, quoteNumber: "GS-1", updatedAt: AT,
    }).replace(/^SUBSCRIBED/, "UNSUBSCRIBED");

    const record = parseLedgerLine(line);

    assert.equal(record?.unsubscribedAt, MARKED_BY_HAND);
  });

  test("and that edit is sticky: a later pre-ticked order does not undo it", async () => {
    const doc = fakeDoc();
    await recordSubscription(signup("stacey@example.com"), doc.store());
    doc.state.text = doc.state.text.replace(/\nSUBSCRIBED \| stacey/, "\nUNSUBSCRIBED | stacey");

    const again = await recordSubscription(
      signup("stacey@example.com", { at: "2026-11-02T09:00:00.000Z", quoteNumber: "GS-20261102-CCCCCCCC" }),
      doc.store()
    );

    assert.equal(again.stored && again.suppressed, true);
    assert.equal((await readSubscriber("stacey@example.com", doc.store()))?.unsubscribedAt, MARKED_BY_HAND);
  });

  test("a line with a real unsubscribe date keeps it, not the stand-in", () => {
    const line = formatLedgerLine({
      email: "a@example.com", name: "", company: "", heardAbout: [], optedInAt: AT, source: "s",
      preChecked: true, quoteNumber: "GS-1", updatedAt: AT, unsubscribedAt: "2026-10-22T00:00:00Z",
    });

    assert.equal(parseLedgerLine(line)?.unsubscribedAt, "2026-10-22T00:00:00Z");
  });

  test("a line stuck to the end of a heading is still read", () => {
    // If the first line a transport writes ever shares a paragraph with the
    // heading, the sign-up must not vanish with no error.
    const line = formatLedgerLine({
      email: "a@example.com", name: "A", company: "", heardAbout: [], optedInAt: AT, source: "s",
      preChecked: true, quoteNumber: "GS-1", updatedAt: AT,
    });

    assert.equal(parseLedgerLine(`Gorilla Salem newsletter sign-ups${line}`)?.email, "a@example.com");
  });

  test("a line with the wrong number of fields is ignored, not half-read", () => {
    assert.equal(parseLedgerLine("SUBSCRIBED | a@example.com | A | B"), null);
    assert.equal(parseLedgerLine("SUBSCRIBED | not-an-address | - | - | - | - | yes | - | - | - | - | -"), null);
  });
});

describe("the consent rules, run against the Doc", () => {
  test("a first sign-up appends exactly one line", async () => {
    const doc = fakeDoc();
    const outcome = await recordSubscription(signup("stacey@example.com"), doc.store());

    assert.deepEqual(outcome, { stored: true, created: true, suppressed: false });
    assert.equal(doc.state.appends, 1);
    assert.equal(dataLines(doc.state.text).length, 1);
    assert.match(dataLines(doc.state.text)[0], /^SUBSCRIBED \| stacey@example\.com \| Stacey/);
  });

  test("the same person ordering again adds nothing", async () => {
    // Only `updatedAt` differs on a repeat order, and a line for that would
    // fill the Doc with entries nobody can act on.
    const doc = fakeDoc();
    await recordSubscription(signup("stacey@example.com"), doc.store());
    await recordSubscription(signup("stacey@example.com", { at: "2026-10-25T09:00:00.000Z", quoteNumber: "GS-20261025-BBBBBBBB" }), doc.store());

    assert.equal(doc.state.appends, 1);
  });

  test("a changed detail is a new line, and the first opt-in date is kept", async () => {
    const doc = fakeDoc();
    await recordSubscription(signup("stacey@example.com"), doc.store());
    await recordSubscription(signup("stacey@example.com", { name: "Stacey Moore", at: "2026-10-25T09:00:00.000Z" }), doc.store());

    assert.equal(doc.state.appends, 2);
    const now = await readSubscriber("stacey@example.com", doc.store());
    assert.equal(now?.name, "Stacey Moore");
    assert.equal(now?.optedInAt, AT, "when they first agreed must not be restated as the second order");
  });

  test("an unsubscribe is recorded as its own line", async () => {
    const doc = fakeDoc();
    await recordSubscription(signup("stacey@example.com"), doc.store());
    const result = await unsubscribeEmail("stacey@example.com", "2026-10-26T09:00:00.000Z", doc.store());

    assert.deepEqual(result, { ok: true, alreadyOff: false });
    assert.match(dataLines(doc.state.text).at(-1) ?? "", /^UNSUBSCRIBED \| stacey@example\.com/);
  });

  test("clicking unsubscribe twice is harmless and writes nothing the second time", async () => {
    const doc = fakeDoc();
    await recordSubscription(signup("stacey@example.com"), doc.store());
    await unsubscribeEmail("stacey@example.com", "2026-10-26T09:00:00.000Z", doc.store());
    const before = doc.state.appends;

    assert.deepEqual(await unsubscribeEmail("stacey@example.com", "2026-10-27T09:00:00.000Z", doc.store()), { ok: true, alreadyOff: true });
    assert.equal(doc.state.appends, before);
  });

  test("STICKY: a pre-ticked box on a later order does not put them back", async () => {
    // The rule the whole design exists for. Each step below is a separate
    // store, as it is in production (one per request), so this also proves
    // the state lives in the DOCUMENT and not in memory.
    const doc = fakeDoc();
    await recordSubscription(signup("stacey@example.com"), doc.store());
    await unsubscribeEmail("stacey@example.com", "2026-10-26T09:00:00.000Z", doc.store());

    const again = await recordSubscription(
      signup("stacey@example.com", { at: "2026-11-02T09:00:00.000Z", quoteNumber: "GS-20261102-CCCCCCCC" }),
      doc.store()
    );

    assert.equal(again.stored, true);
    assert.equal(again.suppressed, true);

    const now = await readSubscriber("stacey@example.com", doc.store());
    assert.equal(now?.unsubscribedAt, "2026-10-26T09:00:00.000Z");
    assert.equal(now?.resubscribeAttemptedAt, "2026-11-02T09:00:00.000Z");
    assert.match(dataLines(doc.state.text).at(-1) ?? "", /^UNSUBSCRIBED \| stacey@example\.com/);
  });

  test("through the real entry point, a sign-up reports sent", async () => {
    const doc = fakeDoc();
    const result = await subscribeToNewsletter(
      {
        email: "Stacey@Example.com",
        name: "Stacey",
        company: "",
        phone: "555-0100",
        heardAbout: [],
        quoteNumber: "GS-20261020-AAAAAAAA",
        consent: { optedIn: true, at: AT, source: "labs.gorillasalem.com quote builder", preChecked: true },
      },
      doc.store()
    );

    assert.deepEqual(result, { sent: true });
    assert.doesNotMatch(doc.state.text, /555-0100/, "the phone number is deliberately never kept");
  });
});

describe("listing and counting", () => {
  test("the whole list is read once, however many people are on it", async () => {
    // readAllSubscribers lists, then reads each person. Against a Doc that
    // would be one fetch of the whole document PER PERSON, quadratic in the
    // size of the list, if the store did not answer from memory.
    const doc = fakeDoc();
    const writer = doc.store();

    for (let i = 0; i < 200; i += 1) {
      await recordSubscription(signup(`person${i}@example.com`, { name: `Person ${i}` }), writer);
    }

    doc.state.reads = 0;
    const all = await readAllSubscribers(doc.store());

    assert.equal(all.length, 200);
    assert.equal(doc.state.reads, 1);
  });

  test("count and list agree, and only count people once", async () => {
    const doc = fakeDoc();
    await recordSubscription(signup("a@example.com"), doc.store());
    await recordSubscription(signup("b@example.com"), doc.store());
    await unsubscribeEmail("b@example.com", "2026-10-26T09:00:00.000Z", doc.store());

    assert.deepEqual(await countSubscriberRecords(doc.store()), { ok: true, records: 2 });
    assert.equal((await readAllSubscribers(doc.store())).length, 2);
  });

  test("an address nobody has used reads as absent", async () => {
    assert.equal(await readSubscriber("nobody@example.com", fakeDoc().store()), null);
  });

  test("list honours the prefix", async () => {
    const doc = fakeDoc();
    await recordSubscription(signup("a@example.com"), doc.store());

    assert.equal((await doc.store().list(SUBSCRIBER_PREFIX)).pathnames.length, 1);
    assert.equal((await doc.store().list("something/else/")).pathnames.length, 0);
  });
});

describe("the store refuses to file one person under another", () => {
  test("a path that is not the hash of the record's address", async () => {
    await assert.rejects(
      fakeDoc().store().put(subscriberPath("someone-else@example.com"), JSON.stringify({ email: "a@example.com" })),
      /does not match/
    );
  });

  test("a body that is not a record", async () => {
    await assert.rejects(fakeDoc().store().put(subscriberPath("a@example.com"), "not json"), /not valid JSON/);
    await assert.rejects(fakeDoc().store().put(subscriberPath("a@example.com"), JSON.stringify({ name: "no email" })), /no usable email/);
  });
});

describe("when the document cannot be reached", () => {
  const broken: LedgerTransport = {
    readText: async () => { throw new Error("Google Docs read: 403 Forbidden - The caller does not have permission"); },
    append: async () => { throw new Error("Google Docs write: 403 Forbidden - The caller does not have permission"); },
  };

  test("the reason reaches the caller, which is what puts it in the shop email", async () => {
    const outcome = await recordSubscription(signup("a@example.com"), ledgerSubscriberStore(broken));

    assert.equal(outcome.stored, false);
    assert.match("reason" in outcome ? String(outcome.reason) : "", /The caller does not have permission/);
  });

  test("an unsubscribe says so rather than pretending it worked", async () => {
    const result = await unsubscribeEmail("a@example.com", AT, ledgerSubscriberStore(broken));

    assert.equal(result.ok, false);
  });
});

describe("what counts as the same state", () => {
  const record: SubscriberRecord = {
    email: "a@example.com", name: "A", company: "", heardAbout: [], optedInAt: AT, source: "s",
    preChecked: true, quoteNumber: "GS-1", updatedAt: AT,
  };

  test("only the last-touched time is ignored", () => {
    assert.equal(sameState(record, { ...record, updatedAt: "2027-01-01T00:00:00Z" }), true);
    assert.equal(sameState(record, { ...record, name: "B" }), false);
    assert.equal(sameState(record, { ...record, unsubscribedAt: AT }), false);
    assert.equal(sameState(record, { ...record, resubscribeAttemptedAt: AT }), false);
    assert.equal(sameState(record, { ...record, preChecked: false }), false);
  });

  test("characters the line cannot hold do not make a state look new every time", () => {
    const piped = { ...record, company: "Acme | Sons" };
    const readBack = parseLedgerLine(formatLedgerLine(piped)) as SubscriberRecord;

    assert.equal(sameState(piped, readBack), true);
  });
});
