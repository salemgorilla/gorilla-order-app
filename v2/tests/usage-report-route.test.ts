/**
 * Who can read the weekly usage report: the shop, by either key, and nobody
 * else. A read-only key exists so a scheduled review never has to hold
 * ADMIN_SECRET, which also guards payment requests.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { GET } from "../app/api/usage/report/route";
import { POST } from "../app/api/usage/route";

const saved = { ...process.env };

beforeEach(() => {
  delete process.env.USAGE_REPORT_KEY;
  delete process.env.ADMIN_SECRET;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.USAGE_TRACKING;
});

afterEach(() => {
  process.env = { ...saved };
});

const get = (query = "", headers: Record<string, string> = {}) =>
  GET(new Request(`https://labs.example/api/usage/report${query}`, { headers }));

describe("GET /api/usage/report", () => {
  it("is shut when no key is configured at all", async () => {
    assert.equal((await get("?key=anything")).status, 503);
  });

  it("refuses a missing or wrong key", async () => {
    process.env.USAGE_REPORT_KEY = "read-only-key";
    process.env.ADMIN_SECRET = "admin-secret";
    assert.equal((await get()).status, 401);
    assert.equal((await get("?key=wrong")).status, 401);
    assert.equal((await get("", { "x-usage-key": "admin-secret" })).status, 401);
  });

  it("takes the read-only key or the admin secret, as a header or in the query", async () => {
    process.env.USAGE_REPORT_KEY = "read-only-key\n";
    process.env.ADMIN_SECRET = "admin-secret";
    // Past the key check, it stops at the missing blob store, not at auth.
    for (const response of [
      await get("?key=read-only-key"),
      await get("", { "x-usage-key": "read-only-key" }),
      await get("?secret=admin-secret"),
      await get("", { "x-admin-secret": "admin-secret" }),
    ]) {
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /Usage tracking is off/);
    }
  });
});

describe("POST /api/usage", () => {
  it("accepts and drops quietly when tracking is off", async () => {
    process.env.USAGE_TRACKING = "off";
    const response = await POST(
      new Request("https://labs.example/api/usage", {
        method: "POST",
        body: JSON.stringify({ beacons: [{ flow: "apparel", steps: ["product_chosen"] }] }),
      })
    );
    assert.equal(response.status, 204);
  });
});
