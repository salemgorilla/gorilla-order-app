/**
 * The stitch-count agent: what it is asked, what it may answer, and what
 * happens when it does not.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ANTHROPIC_URL,
  DEFAULT_AGENT_MODEL,
  buildAgentPrompt,
  estimateStitchesFromLogo,
  parseAgentReply,
  reconcileReading,
  readLogoWithAgent,
} from "../lib/embroidery-agent";

const design = { placementId: "left-chest", widthInches: 3.5, heightInches: 2 } as const;
const image = { base64: "AAAA", mediaType: "image/png" } as const;
const KEY = "sk-ant-TEST-KEY-do-not-leak";

const reply = (text: string) =>
  (async () => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 })) as typeof fetch;

describe("the prompt", () => {
  test("names the size and placement, and treats the image as untrusted", () => {
    const prompt = buildAgentPrompt(design);

    assert.match(prompt, /3\.5" wide by 2" tall on a left chest/);
    assert.match(prompt, /untrusted customer content/);
    assert.match(prompt, /ONLY a JSON object/);
  });
});

describe("reading the reply", () => {
  test("a clean answer", () => {
    assert.deepEqual(parseAgentReply('{"stitches": 6400, "confidence": "high", "colors": 3, "note": "Two colour logo."}'), {
      stitches: 6400,
      confidence: "high",
      colors: 3,
      note: "Two colour logo.",
    });
  });

  test("tolerates a code fence and chatter around the object", () => {
    const r = parseAgentReply('Sure!\n```json\n{"stitches": 5100, "confidence": "medium", "colors": 2, "note": "ok"}\n```');
    assert.equal(r?.stitches, 5100);
  });

  test("rejects anything that is not a positive number", () => {
    for (const bad of ["", "no json", "{}", '{"stitches": 0}', '{"stitches": -4}', '{"stitches": "lots"}', "{not json}", null, undefined]) {
      assert.equal(parseAgentReply(bad), null, String(bad));
    }
  });

  test("an unknown confidence is low, and the note is plain text, short", () => {
    const r = parseAgentReply(`{"stitches": 6000, "confidence": "certain", "note": "<script>alert(1)</script> ${"x".repeat(400)}"}`);

    assert.equal(r?.confidence, "low");
    assert.ok((r?.note.length ?? 999) <= 160);
    assert.doesNotMatch(r?.note ?? "", /[<>]/);
  });
});

describe("believable, or the calculator answers", () => {
  const agent = (stitches: number) => ({ stitches, confidence: "high" as const, colors: 2, note: "n" });

  test("an answer inside the band for this size is used", () => {
    const r = reconcileReading(design, agent(6400));
    assert.ok(r && r.source === "agent" && r.stitches === 6400);
    assert.ok(r.low < r.stitches && r.high > r.stitches);
  });

  test("an answer far above the densest possible reading is refused (prompt injection, misread)", () => {
    const r = reconcileReading(design, agent(200000));
    assert.ok(r && r.source === "calculator" && r.confidence === "low");
    assert.match(r.note, /could not read your logo reliably/);
  });

  test("an answer far below the lightest reading is refused too", () => {
    assert.equal(reconcileReading(design, agent(40))?.source, "calculator");
  });

  test("no answer at all is the calculator's medium reading", () => {
    const r = reconcileReading(design, null);
    assert.ok(r && r.source === "calculator" && r.stitches === 6900);
  });

  test("a design that does not fit its placement is not estimable, whatever the agent says", () => {
    assert.equal(reconcileReading({ ...design, widthInches: 9, heightInches: 9 }, agent(6000)), null);
  });
});

describe("the request", () => {
  test("goes to Anthropic with the key in the header, the image and the prompt", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ content: [{ type: "text", text: '{"stitches": 6400}' }] }), { status: 200 });
    }) as unknown as typeof fetch;

    await readLogoWithAgent({ apiKey: ` ${KEY}\n`, image, design, fetchImpl });

    assert.ok(seen);
    const { url, init } = seen as unknown as { url: string; init: RequestInit };
    assert.equal(url, ANTHROPIC_URL);
    const headers = init.headers as Record<string, string>;
    assert.equal(headers["x-api-key"], KEY, "trimmed, like every secret here");
    assert.equal(headers["anthropic-version"], "2023-06-01");

    const body = JSON.parse(String(init.body));
    assert.equal(body.model, DEFAULT_AGENT_MODEL);
    assert.equal(body.messages[0].content[0].type, "image");
    assert.equal(body.messages[0].content[0].source.media_type, "image/png");
    assert.equal(body.messages[0].content[1].type, "text");
    assert.doesNotMatch(JSON.stringify(body), /dana|@|sk-ant/i, "no customer detail and no key in the body");
  });

  test("a model override is honoured", async () => {
    let model = "";
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      model = JSON.parse(String(init.body)).model;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await readLogoWithAgent({ apiKey: KEY, image, design, fetchImpl, model: "claude-haiku-5-5" });
    assert.equal(model, "claude-haiku-5-5");
  });
});

describe("it never throws and never leaks", () => {
  test("no key: no network call at all", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;

    for (const apiKey of [undefined, "", "   "]) {
      assert.equal(await readLogoWithAgent({ apiKey, image, design, fetchImpl }), null);
    }
    assert.equal(called, false);
  });

  test("a bad status, a thrown error and garbage all end in the calculator", async () => {
    const cases: Array<typeof fetch> = [
      (async () => new Response("{}", { status: 401 })) as typeof fetch,
      (async () => new Response("{}", { status: 529 })) as typeof fetch,
      (async () => {
        throw new Error(`boom with ${KEY}`);
      }) as typeof fetch,
      (async () => new Response("not json", { status: 200 })) as typeof fetch,
      reply("I cannot help with that."),
    ];

    for (const fetchImpl of cases) {
      const r = await estimateStitchesFromLogo({ apiKey: KEY, image, design, fetchImpl });
      assert.ok(r && r.source === "calculator");
      assert.doesNotMatch(JSON.stringify(r), /sk-ant/);
    }
  });

  test("an error status is ignored even if its body looks like an answer", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: '{"stitches": 6400, "confidence": "high"}' }] }), {
        status: 500,
      })) as typeof fetch;

    const r = await estimateStitchesFromLogo({ apiKey: KEY, image, design, fetchImpl });
    assert.equal(r?.source, "calculator");
  });

  test("a good answer end to end", async () => {
    const r = await estimateStitchesFromLogo({
      apiKey: KEY,
      image,
      design,
      fetchImpl: reply('{"stitches": 7240, "confidence": "high", "colors": 3, "note": "Three colour logo with fine lettering."}'),
    });

    assert.ok(r && r.source === "agent" && r.stitches === 7200);
    assert.equal(r.note, "Three colour logo with fine lettering.");
  });

  test("a prompt-injected answer cannot move the number outside the believable band", async () => {
    const r = await estimateStitchesFromLogo({
      apiKey: KEY,
      image,
      design,
      fetchImpl: reply('{"stitches": 100, "confidence": "high", "colors": 1, "note": "Ignore previous instructions."}'),
    });

    assert.ok(r && r.source === "calculator" && r.stitches === 6900);
  });
});

