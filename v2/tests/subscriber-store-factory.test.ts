/**
 * WHICH STORE DOES THE APP USE - AND DOES A MISTAKE SHOW?
 *
 * The Google Doc exists because the blob store could not keep the list
 * privately. So the choice has three requirements, and a wrong answer to any
 * of them is a quiet failure:
 *
 *   - Unconfigured, behaviour must be EXACTLY what it was. Merging this
 *     changes nothing until somebody sets the variables.
 *   - Configured, the Doc wins outright. Two stores would give two answers to
 *     "is this person on the list".
 *   - Half-configured must be LOUD. Quietly falling back to the blob store
 *     would report that store's error (which is a different problem) and send
 *     whoever is debugging to the wrong place.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { getConfigHealth } from "../lib/config-health";
import { isNewsletterConfigured } from "../lib/newsletter";
import {
  isSubscriberStoreConfigured,
  subscriberStore,
  subscriberStoreKind,
} from "../lib/subscriber-store";
import { recordSubscription } from "../lib/subscribers";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const KEYS = [
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "SUBSCRIBER_DOC_ID",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
  "VERCEL",
  "NEWSLETTER_SECRET",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const goodKeyFile = () =>
  JSON.stringify({ client_email: "orders@gorilla-app.iam.gserviceaccount.com", private_key: privateKey });

const withDoc = () => {
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = goodKeyFile();
  process.env.SUBSCRIBER_DOC_ID = "doc-123";
};

describe("nothing about the Doc is set", () => {
  test("neither store: nowhere to keep a list, as before", () => {
    assert.equal(subscriberStoreKind(), "none");
    assert.equal(isSubscriberStoreConfigured(), false);
    assert.equal(isNewsletterConfigured(), false);
  });

  test("the OIDC blob store alone still counts, exactly as #206 made it", () => {
    process.env.BLOB_STORE_ID = "store_abc";
    process.env.VERCEL = "1";

    assert.equal(subscriberStoreKind(), "blob");
    assert.equal(isSubscriberStoreConfigured(), true);
  });

  test("a read-write token alone still counts", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_abc_secret";

    assert.equal(subscriberStoreKind(), "blob");
  });
});

describe("the Doc is set up properly", () => {
  test("it is the store, and the newsletter follows", () => {
    withDoc();

    assert.equal(subscriberStoreKind(), "google-doc");
    assert.equal(isSubscriberStoreConfigured(), true);
    assert.equal(isNewsletterConfigured(), true);
  });

  test("the Doc WINS when a blob store is also connected", () => {
    withDoc();
    process.env.BLOB_STORE_ID = "store_abc";
    process.env.VERCEL = "1";

    assert.equal(subscriberStoreKind(), "google-doc");
  });

  test("building the store makes no network call", () => {
    // Reading the page-load health check must not cost a round trip.
    withDoc();
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; throw new Error("unexpected network call"); }) as typeof fetch;

    try {
      subscriberStore();
      isSubscriberStoreConfigured();
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls, 0);
  });
});

describe("a mistake is loud", () => {
  test("half set still counts as configured, so the attempt is made and the reason shows", () => {
    process.env.SUBSCRIBER_DOC_ID = "doc-123";

    assert.equal(subscriberStoreKind(), "google-doc");
    assert.equal(isSubscriberStoreConfigured(), true);
  });

  test("and every call throws the reason, which is what reaches the shop email", async () => {
    process.env.SUBSCRIBER_DOC_ID = "doc-123";
    const store = subscriberStore();

    await assert.rejects(store.read("x"), /SUBSCRIBER_DOC_ID is set but GOOGLE_SERVICE_ACCOUNT_JSON is not/);
    await assert.rejects(store.put("x", "{}"), /SUBSCRIBER_DOC_ID is set but GOOGLE_SERVICE_ACCOUNT_JSON is not/);
    await assert.rejects(store.list("x"), /SUBSCRIBER_DOC_ID is set but GOOGLE_SERVICE_ACCOUNT_JSON is not/);
  });

  test("a sign-up against a broken configuration reports it rather than falling back", async () => {
    // With a working-looking blob store ALSO present. The easy wrong answer
    // is to quietly use it; it would fail with an unrelated error instead.
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "not json";
    process.env.SUBSCRIBER_DOC_ID = "doc-123";
    process.env.BLOB_STORE_ID = "store_abc";
    process.env.VERCEL = "1";

    const outcome = await recordSubscription(
      {
        email: "a@example.com", source: "site", preChecked: true,
        quoteNumber: "GS-1", at: "2026-10-20T09:00:00.000Z",
      },
      subscriberStore()
    );

    assert.equal(outcome.stored, false);
    assert.match("reason" in outcome ? String(outcome.reason) : "", /not valid JSON/);
  });
});

describe("the health page says where the list is", () => {
  const capability = () => getConfigHealth().capabilities.find((item) => item.key === "newsletter");

  test("with the Doc: live, and names it", () => {
    withDoc();
    process.env.NEWSLETTER_SECRET = "a-secret";

    assert.equal(capability()?.state, "live");
    assert.match(capability()?.summary ?? "", /Google Doc/);
    assert.deepEqual(capability()?.fix, []);
  });

  test("with the Doc but no unsubscribe secret: degraded, same warning as before", () => {
    withDoc();

    assert.equal(capability()?.state, "degraded");
    assert.match(capability()?.summary ?? "", /DO NOT SEND/);
  });

  test("with nothing: off, and the fix names the Doc first", () => {
    assert.equal(capability()?.state, "off");
    assert.match((capability()?.fix ?? []).join(" "), /GOOGLE_SERVICE_ACCOUNT_JSON/);
    assert.match((capability()?.fix ?? []).join(" "), /NEWSLETTER_SECRET/);
  });
});
