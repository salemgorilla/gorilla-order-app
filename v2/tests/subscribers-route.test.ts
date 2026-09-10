/**
 * THE ONE ENDPOINT THAT RETURNS CUSTOMERS' EMAIL ADDRESSES IN BULK.
 *
 * Everything else in this app hands out one order at a time to somebody who
 * already knows the order number. This hands out the whole list, so the only
 * interesting tests are the ones about who is refused and what is refused to
 * them — and the rule that an import cannot resurrect anybody.
 *
 * The store is not reachable from here (no BLOB_READ_WRITE_TOKEN in a test
 * run), which is why the refusals are testable and the reads are not. That
 * is the honest split: lib/subscribers.ts holds the logic and is driven
 * against a Map in its own suite.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import { importList, readList } from "../lib/subscriber-admin";
import { recordSubscription, unsubscribeEmail, type SubscriberStore } from "../lib/subscribers";

const saved = {
  ADMIN_SECRET: process.env.ADMIN_SECRET,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
};

beforeEach(() => {
  process.env.ADMIN_SECRET = "a-long-random-admin-secret";
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const url = (query = "") => `https://labs.gorillasalem.com/api/subscribers${query}`;

/** The blob store, standing in as a Map. See lib/subscribers.ts on why. */
function store(): SubscriberStore & { files: Map<string, string> } {
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

describe("who is refused", () => {
  it("anyone, on a deployment with no ADMIN_SECRET to check against", async () => {
    // Fails CLOSED. A deployment that cannot authenticate the shop must not
    // fall back to authenticating nobody.
    delete process.env.ADMIN_SECRET;

    const response = await readList(new Request(url("?secret=anything")), store());

    assert.equal(response.status, 503);
    assert.equal((await response.json()).ok, false);
  });

  it("a caller with the wrong secret", async () => {
    const response = await readList(new Request(url("?secret=nope")), store());

    assert.equal(response.status, 401);
  });

  it("a caller with no secret at all", async () => {
    const response = await readList(new Request(url()), store());

    assert.equal(response.status, 401);
  });

  it("and the refusal never says how long the real one is", async () => {
    const body = await (
      await readList(new Request(url("?secret=nope")), store())
    ).json();

    assert.doesNotMatch(JSON.stringify(body), /a-long-random-admin-secret/);
  });

  it("an importer with the wrong secret, before the body is even read", async () => {
    const response = await importList(
      new Request(url("?secret=nope"), {
        method: "POST",
        body: "email\nstacey@example.com",
      }),
      store()
    );

    assert.equal(response.status, 401);
  });
});

describe("with the right secret but no store", () => {
  it("says there is no list yet, and how to make one", async () => {
    // The state this deployment is in right now: #147 shipped the list and
    // the blob store has not been connected. The answer has to name the fix
    // rather than look like a fault.
    const response = await readList(
      new Request(url("?secret=a-long-random-admin-secret")),
      store()
    );
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.match(body.error, /Connect one in Vercel > Storage/);
  });

  it("the secret may travel in a header instead of the URL", async () => {
    // '#' truncates a URL value, '&' splits it and '+' arrives as a space.
    // The header is the way round all three, so it has to work.
    const response = await readList(
      new Request(url(), { headers: { "x-admin-secret": "a-long-random-admin-secret" } }),
      store()
    );

    assert.equal(response.status, 503, "the header was not accepted");
  });
});

describe("the rules the import holds", () => {
  const route = readFileSync(
    new URL("../lib/subscriber-admin.ts", import.meta.url),
    "utf8"
  );

  it("it invents no consent date", () => {
    // The temptation is to stamp today so an imported row looks complete.
    // That is the app writing a consent record for an agreement it did not
    // witness, which is the one thing such a record must never hold.
    assert.match(route, /optedInAt: row\.optedInAt \|\| ""/);
  });

  it("an imported row never claims the box was pre-ticked", () => {
    assert.match(route, /preChecked: false/);
  });

  it("it goes through recordSubscription, so it cannot resurrect anybody", () => {
    // Re-importing an old file is the classic way a shop re-mails everyone
    // who ever left. The sticky-unsubscribe rule lives in one place and this
    // route has to use it rather than writing records itself.
    assert.match(route, /recordSubscription\(/);
    assert.doesNotMatch(route, /store\.put\(/);
    assert.match(route, /leftOffBecauseTheyUnsubscribed/);
  });

  it("the export is never cached anywhere", () => {
    assert.match(route, /"Cache-Control": "no-store, private"/);
  });

  it("and the read says plainly when a send would be unlawful", () => {
    // A list with no working unsubscribe is a list that must not be mailed.
    assert.match(route, /canSend/);
    assert.match(route, /Do not send until it is\./);
  });
});

describe("with a store, the numbers somebody reads off a phone", () => {
  /**
   * The point of splitting the handlers out of the route file: this is the
   * arithmetic the shop uses to decide whether the store is working, and in
   * a route file Next forbids the extra export that would let a test reach
   * it at all.
   */
  const SECRET = "?secret=a-long-random-admin-secret";

  async function populated() {
    const files = store();
    const at = "2026-09-10T12:00:00.000Z";

    await recordSubscription(
      { email: "stacey@example.com", name: "Stacey", source: "quote builder", preChecked: true, quoteNumber: "GS-1", at },
      files
    );
    await recordSubscription(
      { email: "dana@example.com", name: "Dana", source: "quote builder", preChecked: true, quoteNumber: "GS-2", at: "2026-09-11T12:00:00.000Z" },
      files
    );
    await recordSubscription(
      { email: "kurt@example.com", name: "Kurt", source: "counter", preChecked: false, quoteNumber: "GS-3", at: "2026-09-09T12:00:00.000Z" },
      files
    );
    await unsubscribeEmail("kurt@example.com", "2026-10-01T00:00:00.000Z", files);

    return files;
  }

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    process.env.NEWSLETTER_SECRET = "a-secret";
  });

  afterEach(() => {
    delete process.env.NEWSLETTER_SECRET;
  });

  it("counts the list, and counts the leavers separately", async () => {
    const body = await (await readList(new Request(url(SECRET)), await populated())).json();

    assert.equal(body.total, 3);
    assert.equal(body.subscribed, 2);
    assert.equal(body.unsubscribed, 1);
  });

  it("shows the most recent first, and never anybody who left", async () => {
    const body = await (await readList(new Request(url(SECRET)), await populated())).json();

    assert.deepEqual(
      body.recent.map((entry: { email: string }) => entry.email),
      ["dana@example.com", "stacey@example.com"]
    );
  });

  it("says out loud when a send would have no working opt-out", async () => {
    delete process.env.NEWSLETTER_SECRET;

    const body = await (await readList(new Request(url(SECRET)), await populated())).json();

    assert.equal(body.canSend, false);
    assert.match(body.warning, /Do not send until it is/);
  });

  it("and says nothing extra when it would", async () => {
    const body = await (await readList(new Request(url(SECRET)), await populated())).json();

    assert.equal(body.canSend, true);
    assert.equal(body.warning, undefined);
  });

  it("the CSV downloads, and is never cached", async () => {
    const response = await readList(
      new Request(url(`${SECRET}&format=csv`)),
      await populated()
    );
    const text = await response.text();

    assert.match(response.headers.get("content-type") || "", /text\/csv/);
    assert.match(response.headers.get("content-disposition") || "", /attachment; filename=/);
    assert.equal(response.headers.get("cache-control"), "no-store, private");

    // The export is the whole list, leavers included — it is the shop's
    // record, and a record that quietly drops the people who left is one
    // that cannot answer "did we mail somebody we shouldn't have".
    assert.match(text, /stacey@example\.com/);
    assert.match(text, /kurt@example\.com/);
  });
});

describe("importing a file", () => {
  const SECRET = "?secret=a-long-random-admin-secret";

  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
  });

  function post(body: string, files: SubscriberStore) {
    return importList(new Request(url(SECRET), { method: "POST", body }), files);
  }

  it("brings people in", async () => {
    const files = store();
    const body = await (
      await post("email,name\nstacey@example.com,Stacey\ndana@example.com,Dana", files)
    ).json();

    assert.equal(body.added, 2);
    assert.equal(files.files.size, 2);
  });

  it("cannot resurrect somebody who unsubscribed", async () => {
    // Export, edit, re-import is exactly how a shop re-mails everyone who
    // ever left. The rule lives in recordSubscription and this route uses it.
    const files = store();
    await unsubscribeEmail("gone@example.com", "2026-10-01T00:00:00.000Z", files);

    const body = await (
      await post("email,name\ngone@example.com,Gone\ndana@example.com,Dana", files)
    ).json();

    assert.equal(body.added, 1);
    assert.equal(body.leftOffBecauseTheyUnsubscribed, 1);
  });

  it("invents no consent date", async () => {
    const files = store();
    await post("email,name\nstacey@example.com,Stacey", files);

    const stored = JSON.parse([...files.files.values()][0]);

    // Empty, not today. A stamped date would be the app writing a consent
    // record for an agreement it did not witness.
    assert.equal(stored.optedInAt, "");
    assert.match(stored.source, /^imported \d{4}-\d{2}-\d{2}$/);
    assert.equal(stored.preChecked, false);
  });

  it("keeps a consent date the file DID carry", async () => {
    const files = store();
    await post(
      "email,optedInAt,source\nstacey@example.com,2024-02-02T00:00:00.000Z,shop counter",
      files
    );

    const stored = JSON.parse([...files.files.values()][0]);

    assert.equal(stored.optedInAt, "2024-02-02T00:00:00.000Z");
    assert.equal(stored.source, "shop counter");
  });

  it("refuses a file that is not a subscriber list", async () => {
    const response = await post("style,colour\n3001,White", store());

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /No "email" column/);
  });
});
