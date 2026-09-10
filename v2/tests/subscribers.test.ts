/**
 * THE LIST THE SHOP NOW KEEPS ITSELF.
 *
 * Gabe, 2026-09-10: "I quit constant contact. Is there an app you can build
 * that works on my website but behind the scenes?"
 *
 * Every sign-up this app ever took went to a Zapier hook and then to
 * Constant Contact. The app kept nothing. So the interesting cases here are
 * not "does it write a file" — they are the ones that decide whether the
 * shop can still be trusted with an address a year from now:
 *
 *   · two people signing up in the same second (why it is one blob each)
 *   · somebody who unsubscribed being handed back by a PRE-TICKED box
 *   · when they first agreed, which is what answers a complaint
 *   · an unsubscribe for an address the store has never seen
 *
 * The store is a Map. lib/subscribers.ts never imports the Vercel SDK for
 * exactly this reason — the SDK talks through undici's fetch, so a test that
 * stubs the global one does not intercept it, it hangs (lib/blob-health.ts
 * learned that by being killed).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SUBSCRIBER_PREFIX,
  countSubscriberRecords,
  mailable,
  normaliseEmail,
  readAllSubscribers,
  readSubscriber,
  recordSubscription,
  subscriberPath,
  unsubscribeEmail,
  type SubscriberStore,
} from "../lib/subscribers";

function memoryStore(): SubscriberStore & { files: Map<string, string> } {
  const files = new Map<string, string>();

  return {
    files,
    async put(pathname, body) {
      files.set(pathname, body);
    },
    async read(pathname) {
      return files.get(pathname) ?? null;
    },
    async list(prefix) {
      return {
        pathnames: [...files.keys()].filter((key) => key.startsWith(prefix)),
      };
    },
  };
}

const SIGNUP = {
  email: "Stacey@Example.com",
  name: "Stacey",
  company: "Salem Rowing",
  heardAbout: ["Google"],
  source: "labs.gorillasalem.com quote builder",
  preChecked: true,
  quoteNumber: "GS-20260910-AB12C",
  at: "2026-09-10T12:00:00.000Z",
};

describe("one address is one person", () => {
  it("case and whitespace do not make a second subscriber", () => {
    assert.equal(normaliseEmail("  Stacey@Example.COM "), "stacey@example.com");
    assert.equal(
      subscriberPath("STACEY@example.com"),
      subscriberPath("stacey@example.com  ")
    );
  });

  it("the pathname is a hash, not the address", () => {
    const path = subscriberPath("stacey@example.com");

    // A pathname is metadata: it shows up in listings, logs and dashboards.
    // "the store contains stacey@example.com" is the fact being protected.
    assert.ok(path.startsWith(SUBSCRIBER_PREFIX));
    assert.doesNotMatch(path, /stacey/i);
    assert.doesNotMatch(path, /@/);
    assert.match(path, /[0-9a-f]{64}\.json$/);
  });

  it("signing up twice rewrites one record, it does not make two", async () => {
    const store = memoryStore();

    await recordSubscription(SIGNUP, store);
    await recordSubscription({ ...SIGNUP, at: "2026-11-01T09:00:00.000Z" }, store);

    assert.equal(store.files.size, 1);
  });

  it("two different people written at once cannot clobber each other", async () => {
    // The reason this is one blob per subscriber rather than one list file.
    // A single subscribers.json needs read-modify-write, and two quotes in
    // the same second silently drop one — a loss nobody notices for months
    // because it looks exactly like "not many people signed up".
    const store = memoryStore();

    await Promise.all([
      recordSubscription(SIGNUP, store),
      recordSubscription({ ...SIGNUP, email: "dana@example.com" }, store),
      recordSubscription({ ...SIGNUP, email: "kurt@example.com" }, store),
    ]);

    assert.equal(store.files.size, 3);
    assert.equal((await countSubscriberRecords(store)).records, 3);
  });
});

describe("when they agreed is not overwritten by the next order", () => {
  it("the FIRST opt-in is the one kept", async () => {
    const store = memoryStore();

    await recordSubscription(SIGNUP, store);
    await recordSubscription({ ...SIGNUP, at: "2027-03-04T10:00:00.000Z" }, store);

    const record = await readSubscriber(SIGNUP.email, store);

    // When they agreed is the fact a complaint is answered with. A later
    // order restating it as today is how a shop loses that argument.
    assert.equal(record?.optedInAt, "2026-09-10T12:00:00.000Z");
    assert.equal(record?.updatedAt, "2027-03-04T10:00:00.000Z");
  });

  it("a deliberate tick outranks a pre-ticked one, permanently", async () => {
    const store = memoryStore();

    await recordSubscription(SIGNUP, store);
    // The kiosk box starts EMPTY, so this one was ticked on purpose.
    await recordSubscription({ ...SIGNUP, preChecked: false }, store);

    const record = await readSubscriber(SIGNUP.email, store);

    assert.equal(record?.preChecked, false, "the stronger consent was lost");

    // And it cannot be downgraded again by a later pre-ticked box.
    await recordSubscription({ ...SIGNUP, preChecked: true }, store);
    assert.equal((await readSubscriber(SIGNUP.email, store))?.preChecked, false);
  });
});

describe("an unsubscribe is sticky, and this is the important one", () => {
  it("a pre-ticked box does not put somebody back on the list", async () => {
    /**
     * The whole reason the rule exists. The box arrives PRE-TICKED, so
     * without this, somebody who unsubscribes and later orders again is
     * silently re-added by a control they never touched — and the second
     * time, they do not unsubscribe, they press "spam". Gmail throttles a
     * sending domain at a complaint rate of 0.3%: three people in a
     * thousand.
     */
    const store = memoryStore();

    await recordSubscription(SIGNUP, store);
    await unsubscribeEmail(SIGNUP.email, "2026-10-01T00:00:00.000Z", store);

    const outcome = await recordSubscription(
      { ...SIGNUP, at: "2026-12-01T00:00:00.000Z" },
      store
    );

    assert.deepEqual(outcome, { stored: true, created: false, suppressed: true });

    const record = await readSubscriber(SIGNUP.email, store);
    assert.equal(record?.unsubscribedAt, "2026-10-01T00:00:00.000Z");
  });

  it("but the attempt is recorded, so the shop can ask them properly", () => {
    // Silently dropping it would mean nobody ever finds out that somebody
    // appears to want back in. Recorded is not the same as honoured.
    return (async () => {
      const store = memoryStore();

      await recordSubscription(SIGNUP, store);
      await unsubscribeEmail(SIGNUP.email, "2026-10-01T00:00:00.000Z", store);
      await recordSubscription({ ...SIGNUP, at: "2026-12-01T00:00:00.000Z" }, store);

      const record = await readSubscriber(SIGNUP.email, store);
      assert.equal(record?.resubscribeAttemptedAt, "2026-12-01T00:00:00.000Z");
    })();
  });

  it("works for an address the store has never seen", async () => {
    // Somebody forwarded the email, or the list was imported elsewhere. The
    // tombstone is what makes the stickiness above work for them too.
    const store = memoryStore();

    const result = await unsubscribeEmail(
      "stranger@example.com",
      "2026-10-01T00:00:00.000Z",
      store
    );

    assert.equal(result.ok, true);
    assert.equal(result.alreadyOff, false);

    const outcome = await recordSubscription(
      { ...SIGNUP, email: "stranger@example.com" },
      store
    );
    assert.equal(outcome.stored && outcome.suppressed, true);
  });

  it("clicking it twice is not an error", async () => {
    const store = memoryStore();

    await recordSubscription(SIGNUP, store);
    await unsubscribeEmail(SIGNUP.email, "2026-10-01T00:00:00.000Z", store);
    const second = await unsubscribeEmail(
      SIGNUP.email,
      "2026-10-02T00:00:00.000Z",
      store
    );

    assert.deepEqual(second, { ok: true, alreadyOff: true });

    // And the original date survives — when they left is a fact, not a
    // running total of how many times they said it.
    const record = await readSubscriber(SIGNUP.email, store);
    assert.equal(record?.unsubscribedAt, "2026-10-01T00:00:00.000Z");
  });
});

describe("who a campaign may go to", () => {
  it("everybody except the people who left", async () => {
    const store = memoryStore();

    await recordSubscription(SIGNUP, store);
    await recordSubscription({ ...SIGNUP, email: "dana@example.com" }, store);
    await recordSubscription({ ...SIGNUP, email: "kurt@example.com" }, store);
    await unsubscribeEmail("dana@example.com", "2026-10-01T00:00:00.000Z", store);

    const all = await readAllSubscribers(store);
    const send = mailable(all);

    assert.equal(all.length, 3);
    assert.deepEqual(
      send.map((record) => record.email).sort(),
      ["kurt@example.com", "stacey@example.com"]
    );
  });
});

describe("nothing here may break a quote", () => {
  it("a store that throws is an answer, not an exception", async () => {
    const broken: SubscriberStore = {
      async put() {
        throw new Error("This store does not exist");
      },
      async read() {
        return null;
      },
      async list() {
        return { pathnames: [] };
      },
    };

    const outcome = await recordSubscription(SIGNUP, broken);

    assert.deepEqual(outcome, {
      stored: false,
      reason: "This store does not exist",
    });
  });

  it("so is an address that is not one", async () => {
    const store = memoryStore();

    assert.equal((await recordSubscription({ ...SIGNUP, email: "" }, store)).stored, false);
    assert.equal((await recordSubscription({ ...SIGNUP, email: "nope" }, store)).stored, false);
    assert.equal(store.files.size, 0);
  });

  it("a corrupt record is replaced, not thrown over", async () => {
    const store = memoryStore();
    store.files.set(subscriberPath(SIGNUP.email), "{ this is not json");

    const outcome = await recordSubscription(SIGNUP, store);

    assert.equal(outcome.stored, true);
    assert.equal((await readSubscriber(SIGNUP.email, store))?.email, "stacey@example.com");
  });
});

describe("what is kept, and what deliberately is not", () => {
  it("no phone number", async () => {
    const store = memoryStore();
    await recordSubscription(SIGNUP, store);

    const raw = store.files.get(subscriberPath(SIGNUP.email)) ?? "";

    // It rides in the newsletter payload because the shop email and Printavo
    // want it. A marketing list has no use for it, and PII kept without a
    // use is PII kept for a breach.
    assert.doesNotMatch(raw, /phone/i);
    assert.doesNotMatch(raw, /555/);
  });

  it("the address is stored normalised, so a send cannot double up", async () => {
    const store = memoryStore();
    await recordSubscription(SIGNUP, store);

    assert.equal((await readSubscriber(SIGNUP.email, store))?.email, "stacey@example.com");
  });
});
