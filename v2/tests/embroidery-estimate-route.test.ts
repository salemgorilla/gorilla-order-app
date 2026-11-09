/**
 * /api/embroidery-estimate: a public endpoint that can spend money, so the
 * bounds around it are the thing under test.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import { POST } from "../app/api/embroidery-estimate/route";
import { resetRateLimits } from "../lib/rate-limit";

beforeEach(() => {
  resetRateLimits();
  delete process.env.ANTHROPIC_API_KEY;
});

function post(fields: Record<string, string | Blob>, headers: Record<string, string> = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);

  return POST(new Request("https://labs.gorillasalem.com/api/embroidery-estimate", { method: "POST", body, headers }));
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
const good = () => ({ logo: png(), placement: "left-chest", widthInches: "3.5", heightInches: "2" });

describe("a valid request", () => {
  test("with no key configured still answers, from the calculator, and says so", async () => {
    const response = await post(good());
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.source, "calculator");
    assert.equal(body.stitches, 6900);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(JSON.stringify(body), /sk-ant/);
  });
});

describe("a bad request is refused before any model call", () => {
  test("unknown placement", async () => {
    assert.equal((await post({ ...good(), placement: "forehead" })).status, 400);
  });

  test("missing or nonsense size", async () => {
    assert.equal((await post({ ...good(), widthInches: "0" })).status, 400);
    assert.equal((await post({ ...good(), heightInches: "abc" })).status, 400);
  });

  test("no file", async () => {
    const { logo: _logo, ...rest } = good();
    assert.equal((await post(rest)).status, 400);
  });

  test("a file that is not an image", async () => {
    const pdf = new File(["%PDF"], "logo.pdf", { type: "application/pdf" });
    assert.equal((await post({ ...good(), logo: pdf })).status, 400);
  });

  test("an image over the size cap", async () => {
    const big = new File([new Uint8Array(3_500_001)], "big.png", { type: "image/png" });
    assert.equal((await post({ ...good(), logo: big })).status, 413);
  });

  test("a logo bigger than its placement is a hand quote, not a guess", async () => {
    const r = await post({ ...good(), widthInches: "9", heightInches: "9" });
    assert.equal(r.status, 422);
  });
});

describe("it is rate limited", () => {
  test("the seventh call in a minute from one caller is refused", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    const statuses: number[] = [];

    for (let i = 0; i < 7; i += 1) statuses.push((await post(good(), headers)).status);

    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429]);
  });
});

describe("the instance-wide hourly ceiling stops the spend", () => {
  // Per-caller limits are in-process and per instance, so a spread-out run is
  // not stopped by them. This ceiling is what caps the model calls.
  test("past it the model is no longer called, and customers still get an answer", async () => {
    const realFetch = globalThis.fetch;
    let modelCalls = 0;

    globalThis.fetch = (async () => {
      modelCalls += 1;
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: '{"stitches": 6400, "confidence": "high", "colors": 2, "note": "ok"}' }] }),
        { status: 200 }
      );
    }) as typeof fetch;
    process.env.ANTHROPIC_API_KEY = "sk-ant-TEST";

    try {
      let last: Record<string, unknown> = {};

      for (let i = 0; i < 140; i += 1) {
        const response = await post(good(), { "x-forwarded-for": `198.51.100.${i % 250}-${i}` });
        assert.equal(response.status, 200);
        last = (await response.json()) as Record<string, unknown>;
      }

      assert.ok(modelCalls > 0, "the model was used while under the ceiling");
      assert.ok(modelCalls < 140, `the ceiling never stopped a call (${modelCalls} of 140)`);
      assert.equal(last.source, "calculator");
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});
