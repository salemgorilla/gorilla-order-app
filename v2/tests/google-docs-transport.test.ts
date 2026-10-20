/**
 * TALKING TO GOOGLE - WITHOUT TALKING TO GOOGLE.
 *
 * Nothing here reaches the network; `fetch` is injected. What it can prove is
 * everything the code controls: that the sign-in is a correctly SIGNED
 * request (checked against the matching public key, not just its shape),
 * that a token is reused rather than fetched on every call, that the write
 * is the exact request Google documents, and that a refusal comes back with
 * Google's own explanation in it.
 *
 * What it cannot prove is that Google accepts any of it. That needs the real
 * credential, and the first real sign-up is the test - which is why every
 * failure here carries the reason, so that first run teaches something even
 * when it fails.
 */
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, test } from "node:test";

import {
  GOOGLE_CALL_TIMEOUT_MS,
  googleDocTransport,
  readGoogleDocConfig,
  resetGoogleTokenCache,
  signServiceAccountJwt,
  textOfDocument,
} from "../lib/google-docs-transport";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const ACCOUNT = { clientEmail: "orders@gorilla-app.iam.gserviceaccount.com", privateKey };
const keyFile = JSON.stringify({ client_email: ACCOUNT.clientEmail, private_key: privateKey });

beforeEach(() => resetGoogleTokenCache());

type Call = { url: string; init: RequestInit };

/** A fetch that records what it was asked and answers from a script. */
function scripted(replies: Array<(call: Call) => Response>) {
  const calls: Call[] = [];
  let index = 0;

  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return replies[Math.min(index++, replies.length - 1)](call);
  }) as typeof fetch;

  return { calls, impl };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const token = (value = "tok-1", expires = 3600) => json({ access_token: value, expires_in: expires });

describe("reading the configuration", () => {
  test("nothing set is simply off", () => {
    assert.deepEqual(readGoogleDocConfig({}), { state: "off" });
    assert.deepEqual(readGoogleDocConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: "  ", SUBSCRIBER_DOC_ID: "" }), { state: "off" });
  });

  test("both set and valid is ready", () => {
    const config = readGoogleDocConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: keyFile, SUBSCRIBER_DOC_ID: "doc-123" });

    assert.equal(config.state, "ready");
    if (config.state === "ready") {
      assert.equal(config.docId, "doc-123");
      assert.equal(config.account.clientEmail, ACCOUNT.clientEmail);
    }
  });

  test("a pasted value with a trailing newline still works", () => {
    // The paste that has already cost this project days once.
    const config = readGoogleDocConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: `${keyFile}\n`, SUBSCRIBER_DOC_ID: "doc-123\n" });

    assert.equal(config.state, "ready");
    if (config.state === "ready") assert.equal(config.docId, "doc-123");
  });

  test("a private key whose newlines were pasted as backslash-n is repaired", () => {
    const mangled = JSON.stringify({
      client_email: ACCOUNT.clientEmail,
      private_key: privateKey.replace(/\n/g, "\\n"),
    });
    const config = readGoogleDocConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: mangled, SUBSCRIBER_DOC_ID: "d" });

    assert.equal(config.state, "ready");
    if (config.state === "ready") assert.doesNotThrow(() => signServiceAccountJwt(config.account, 1_000));
  });

  test("HALF set is broken and says which half, not silently off", () => {
    const onlyDoc = readGoogleDocConfig({ SUBSCRIBER_DOC_ID: "doc-123" });
    const onlyKey = readGoogleDocConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: keyFile });

    assert.equal(onlyDoc.state, "broken");
    assert.match(onlyDoc.state === "broken" ? onlyDoc.reason : "", /GOOGLE_SERVICE_ACCOUNT_JSON is not/);
    assert.equal(onlyKey.state, "broken");
    assert.match(onlyKey.state === "broken" ? onlyKey.reason : "", /SUBSCRIBER_DOC_ID is not/);
  });

  test("a key file that is not JSON, or is missing its parts, is broken with a reason", () => {
    for (const [raw, expected] of [
      ["not json at all", /not valid JSON/],
      [JSON.stringify({ private_key: privateKey }), /no client_email/],
      [JSON.stringify({ client_email: ACCOUNT.clientEmail }), /no private_key/],
    ] as const) {
      const config = readGoogleDocConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: raw, SUBSCRIBER_DOC_ID: "d" });

      assert.equal(config.state, "broken");
      assert.match(config.state === "broken" ? config.reason : "", expected);
    }
  });

  test("the reason never contains the key", () => {
    const config = readGoogleDocConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "x@y", private_key: "nope" }), SUBSCRIBER_DOC_ID: "d" });

    assert.doesNotMatch(JSON.stringify(config), /BEGIN|nope/);
  });
});

describe("the sign-in request", () => {
  const jwt = signServiceAccountJwt(ACCOUNT, 1_700_000_000);
  const [header, claim, signature] = jwt.split(".");
  const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

  test("it has the three parts Google expects", () => {
    assert.equal(jwt.split(".").length, 3);
    assert.deepEqual(decode(header), { alg: "RS256", typ: "JWT" });
  });

  test("the claim names the robot, the one scope it needs, and Google's token address", () => {
    assert.deepEqual(decode(claim), {
      iss: ACCOUNT.clientEmail,
      scope: "https://www.googleapis.com/auth/documents",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
  });

  test("the signature verifies against the matching PUBLIC key", () => {
    // The strongest thing checkable without Google: that what was signed is
    // exactly `header.claim`, with RSA-SHA256, by the key in the file.
    const verifier = createVerify("RSA-SHA256").update(`${header}.${claim}`);

    assert.equal(verifier.verify(publicKey, Buffer.from(signature, "base64url")), true);
  });

  test("it asks only for the Docs scope, not Drive", () => {
    assert.doesNotMatch(claim, /drive/);
    assert.doesNotMatch(Buffer.from(claim, "base64url").toString(), /drive/);
  });
});

describe("reading the document", () => {
  const doc = {
    body: {
      content: [
        { sectionBreak: {} },
        { paragraph: { elements: [{ textRun: { content: "Gorilla Salem newsletter sign-ups\n" } }] } },
        { paragraph: { elements: [{ textRun: { content: "SUBSCRIBED | a@example.com | " } }, { textRun: { content: "A | - | - | x | yes | GS-1 | s | - | - | t\n" } }] } },
        { table: {} },
      ],
    },
  };

  test("paragraphs are joined, other blocks are skipped", () => {
    assert.equal(
      textOfDocument(doc),
      "Gorilla Salem newsletter sign-ups\nSUBSCRIBED | a@example.com | A | - | - | x | yes | GS-1 | s | - | - | t\n"
    );
  });

  test("an empty or odd document is empty text, not a crash", () => {
    assert.equal(textOfDocument({}), "");
    assert.equal(textOfDocument(null), "");
    assert.equal(textOfDocument({ body: { content: [{}] } }), "");
  });

  test("one sign-in, then the read carries the token and the document id", async () => {
    const fetchMock = scripted([() => token("tok-1"), () => json(doc)]);
    const transport = googleDocTransport({ account: ACCOUNT, docId: "doc/with space" }, fetchMock.impl);

    const text = await transport.readText();

    assert.match(text, /SUBSCRIBED \| a@example\.com/);
    assert.equal(fetchMock.calls.length, 2);

    const [signIn, read] = fetchMock.calls;
    assert.equal(signIn.url, "https://oauth2.googleapis.com/token");
    assert.equal(signIn.init.method, "POST");

    const form = new URLSearchParams(String(signIn.init.body));
    assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    assert.equal(form.get("assertion")?.split(".").length, 3);

    assert.equal(read.url, "https://docs.googleapis.com/v1/documents/doc%2Fwith%20space");
    assert.equal((read.init.headers as Record<string, string>).Authorization, "Bearer tok-1");
  });
});

describe("writing a line", () => {
  test("it is exactly the batchUpdate Google documents, with the break BEFORE the line", async () => {
    const fetchMock = scripted([() => token(), () => json({})]);
    const transport = googleDocTransport({ account: ACCOUNT, docId: "doc-123" }, fetchMock.impl);

    await transport.append("SUBSCRIBED | a@example.com | A");

    const write = fetchMock.calls[1];
    assert.equal(write.url, "https://docs.googleapis.com/v1/documents/doc-123:batchUpdate");
    assert.equal(write.init.method, "POST");
    assert.deepEqual(JSON.parse(String(write.init.body)), {
      requests: [{ insertText: { endOfSegmentLocation: {}, text: "\nSUBSCRIBED | a@example.com | A" } }],
    });
  });

  test("every call is bounded", async () => {
    const fetchMock = scripted([() => token(), () => json({})]);
    await googleDocTransport({ account: ACCOUNT, docId: "d" }, fetchMock.impl).append("x");

    for (const call of fetchMock.calls) assert.ok(call.init.signal, `${call.url} has no timeout`);
    assert.ok(GOOGLE_CALL_TIMEOUT_MS <= 10_000);
  });
});

describe("the token is reused, then renewed", () => {
  test("two operations, one sign-in", async () => {
    const fetchMock = scripted([() => token(), () => json({ body: { content: [] } }), () => json({})]);
    const transport = googleDocTransport({ account: ACCOUNT, docId: "d" }, fetchMock.impl);

    await transport.readText();
    await transport.append("x");

    assert.equal(fetchMock.calls.filter((call) => call.url.includes("oauth2")).length, 1);
  });

  test("an expired token is replaced, one minute early", async () => {
    let clock = 1_000_000;
    const fetchMock = scripted([() => token("tok-1", 3600), () => json({}), () => token("tok-2", 3600), () => json({})]);
    const transport = googleDocTransport({ account: ACCOUNT, docId: "d" }, fetchMock.impl, () => clock);

    await transport.append("a");
    clock += 3600_000 - 30_000; // inside the one-minute margin
    await transport.append("b");

    const signIns = fetchMock.calls.filter((call) => call.url.includes("oauth2"));
    assert.equal(signIns.length, 2);
    assert.equal((fetchMock.calls[3].init.headers as Record<string, string>).Authorization, "Bearer tok-2");
  });
});

describe("a refusal says why", () => {
  test("a Doc that was never shared with the robot", async () => {
    const fetchMock = scripted([
      () => token(),
      () => json({ error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } }, 403),
    ]);

    await assert.rejects(
      googleDocTransport({ account: ACCOUNT, docId: "d" }, fetchMock.impl).append("x"),
      /Google Docs write: 403 .*The caller does not have permission/
    );
  });

  test("the Docs API not being switched on", async () => {
    const fetchMock = scripted([
      () => token(),
      () => json({ error: { message: "Google Docs API has not been used in project 123 before or it is disabled." } }, 403),
    ]);

    await assert.rejects(
      googleDocTransport({ account: ACCOUNT, docId: "d" }, fetchMock.impl).readText(),
      /Google Docs read: 403 .*has not been used in project/
    );
  });

  test("a key Google does not recognise", async () => {
    const fetchMock = scripted([() => json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, 400)]);

    await assert.rejects(
      googleDocTransport({ account: ACCOUNT, docId: "d" }, fetchMock.impl).readText(),
      /Google sign-in: 400 .*invalid_grant: Invalid JWT Signature\./
    );
  });

  test("a sign-in that answers 200 with no token is an error, not a silent undefined", async () => {
    const fetchMock = scripted([() => json({})]);

    await assert.rejects(
      googleDocTransport({ account: ACCOUNT, docId: "d" }, fetchMock.impl).readText(),
      /no access token/
    );
  });

  test("a reply that is not JSON still reports its status", async () => {
    const fetchMock = scripted([() => token(), () => new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway" })]);

    await assert.rejects(
      googleDocTransport({ account: ACCOUNT, docId: "d" }, fetchMock.impl).append("x"),
      /Google Docs write: 502 Bad Gateway/
    );
  });

  test("the key never appears in an error", async () => {
    const fetchMock = scripted([() => json({ error: "invalid_grant" }, 400)]);

    await googleDocTransport({ account: ACCOUNT, docId: "d" }, fetchMock.impl).readText().catch((error: Error) => {
      assert.doesNotMatch(error.message, /BEGIN PRIVATE KEY/);
    });
  });
});
