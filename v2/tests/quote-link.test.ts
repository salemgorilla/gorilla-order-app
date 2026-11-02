import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  createQuoteToken,
  isValidQuoteToken,
  paymentGate,
  priceQuoteLink,
  toPublicQuote,
  validateSizes,
  type QuoteLinkSize,
  type QuoteLinkSpec,
} from "../lib/quote-link";
import { quoteLinkStore, type BlobBackend } from "../lib/quote-link-store";
import {
  approveLink,
  createLink,
  regenerateLink,
  releasePayment,
  startPayment,
  unlockLink,
  updateSizes,
  viewLink,
  type Deps,
} from "../lib/quote-link-service";

/** Quote #14431 style: 24 x BELLA + CANVAS 3001 Black, front print 1 colour. */
const SPEC: QuoteLinkSpec = {
  brand: "BELLA + CANVAS",
  styleLabel: "BELLA + CANVAS 3001",
  catalogStyle: "3001",
  colorName: "Black",
  method: "Screen print",
  printLocations: ["Front"],
  inkColors: "1 color",
  hasUnderbase: true,
};

const price = (base: number): Record<string, number> => ({
  "150": base,
  "140": Math.round(base * 0.95 * 100) / 100,
  "130": Math.round(base * 0.9 * 100) / 100,
});

const SIZES: QuoteLinkSize[] = [
  { sizeName: "S", markedUpPrice: 4.5, priceByMarkup: price(4.5), available: true, stock: 500 },
  { sizeName: "M", markedUpPrice: 4.5, priceByMarkup: price(4.5), available: true, stock: 500 },
  { sizeName: "L", markedUpPrice: 4.5, priceByMarkup: price(4.5), available: true, stock: 500 },
  { sizeName: "XL", markedUpPrice: 4.5, priceByMarkup: price(4.5), available: true, stock: 30 },
  { sizeName: "2XL", markedUpPrice: 6.5, priceByMarkup: price(6.5), available: true, stock: 500 },
  { sizeName: "3XL", markedUpPrice: 7.5, priceByMarkup: price(7.5), available: false },
];

function memory(): BlobBackend & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async put(p, b) { files.set(p, b); },
    async read(p) { return files.get(p) ?? null; },
    async list(prefix) { return [...files.keys()].filter((k) => k.startsWith(prefix)); },
    async del(p) { files.delete(p); },
  };
}

function setup(printavoSizes: Record<string, number> = { M: 12, L: 12 }) {
  const backend = memory();
  const store = quoteLinkStore(backend);
  const sent: string[] = [];
  const paymentCalls: Array<{ quoteId: string; fraction?: number }> = [];
  let outstanding: number | null = 600;

  const deps: Deps = {
    store,
    origin: "https://example.test",
    findQuote: async () => ({
      found: true,
      id: "pq-1",
      visualId: "14431",
      total: 600,
      amountOutstanding: 600,
      customerName: "Pat Customer",
      customerEmail: "pat@example.com",
      sizes: printavoSizes,
    }),
    outstanding: async () => outstanding,
    requestPayment: async (input) => {
      paymentCalls.push(input);
      const amount = 600 * (input.fraction ?? 1);
      return { sent: true, amount, paymentRequestId: "pr-1" };
    },
    notifyShop: async (subject) => { sent.push(subject); },
  };

  return {
    deps, store, backend, sent, paymentCalls,
    setOutstanding: (n: number | null) => { outstanding = n; },
  };
}

async function newLink(t: ReturnType<typeof setup>, opts: { deposit?: number | null; min?: number } = {}) {
  const made = await createLink(t.deps, {
    printavoQuote: "14431",
    spec: SPEC,
    catalogSizes: SIZES,
    minimumPieces: opts.min ?? 24,
    depositPercent: opts.deposit ?? null,
    turnaroundNote: "Ready in 10 business days.",
  });
  assert.ok(made.ok, made.ok ? "" : made.error);
  return made;
}

describe("tokens", () => {
  test("are 256 bits, URL-safe, and unique", () => {
    const a = createQuoteToken();
    assert.equal(a.length, 43);
    assert.match(a, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(a, createQuoteToken());
    assert.ok(isValidQuoteToken(a));
    assert.ok(!isValidQuoteToken("short"));
    assert.ok(!isValidQuoteToken("../../etc/passwd" + "a".repeat(30)));
  });

  test("regenerating kills the old link and the new one works", async () => {
    const t = setup();
    const made = await newLink(t);
    assert.ok(await t.store.getByToken(made.token));

    const next = await regenerateLink(t.deps, made.link.id, made.token);
    assert.ok(next.ok);
    assert.equal(await t.store.getByToken(made.token), null);
    assert.ok(await t.store.getByToken(next.token));
  });

  test("a stale pointer that survived a failed delete is still dead", async () => {
    const t = setup();
    const made = await newLink(t);
    // Regenerate WITHOUT deleting the old pointer (the delete failed).
    await regenerateLink(t.deps, made.link.id);
    assert.equal(await t.store.getByToken(made.token), null);
  });

  test("expired links do not open", async () => {
    const t = setup();
    const made = await newLink(t);
    await t.store.save({ ...made.link, expiresAt: "2020-01-01T00:00:00Z" });
    assert.equal(await t.store.getByToken(made.token), null);
  });

  test("only a hash of the token is stored", async () => {
    const t = setup();
    const made = await newLink(t);
    for (const [path, body] of t.backend.files) {
      assert.ok(!path.includes(made.token) && !body.includes(made.token));
    }
  });
});

describe("sizes", () => {
  test("starts from the Printavo quote's sizes", async () => {
    const made = await newLink(setup());
    assert.deepEqual(made.link.sizes, { M: 12, L: 12 });
  });

  test("refuses a Printavo quote whose sizes this garment can't be", async () => {
    const t = setup({ M: 12, "5XL": 12 });
    const made = await createLink(t.deps, {
      printavoQuote: "14431", spec: SPEC, catalogSizes: SIZES,
      minimumPieces: 24, depositPercent: null, turnaroundNote: "",
    });
    assert.ok(!made.ok);
  });

  test("rejects unknown, negative, fractional, out-of-stock and over-stock", async () => {
    const made = await newLink(setup());
    for (const bad of [{ "9XL": 1 }, { M: -1 }, { M: 1.5 }, { M: "x" }, { "3XL": 2 }, { XL: 31 }, [], null]) {
      const r = validateSizes(made.link, bad);
      assert.ok(!r.ok, JSON.stringify(bad));
    }
  });

  test("zeros are dropped and low stock warns", async () => {
    const made = await newLink(setup());
    const r = validateSizes(made.link, { M: 0, XL: 28 });
    assert.ok(r.ok);
    assert.deepEqual(r.sizes, { XL: 28 });
    assert.equal(r.warnings.length, 1);
  });
});

describe("pricing (server side)", () => {
  test("2XL costs more, and the breakdown adds up", async () => {
    const made = await newLink(setup());
    const p = priceQuoteLink(made.link, { M: 12, L: 10, "2XL": 2 });
    const twoXl = p.perSize.find((s) => s.sizeName === "2XL")!;
    assert.ok(twoXl.upcharge > 0);
    assert.equal(p.pieces, 24);
    assert.equal(
      Math.round((p.garmentTotal + p.decorationTotal + p.setupTotal + p.rushTotal) * 100),
      Math.round(p.total * 100)
    );
  });

  test("never charges more for 23 pieces than for 24", async () => {
    const made = await newLink(setup());
    const p23 = priceQuoteLink(made.link, { M: 12, L: 11 });
    const p24 = priceQuoteLink(made.link, { M: 12, L: 12 });
    assert.ok(p23.total <= p24.total);
  });

  test("deposit is a share of the computed total", async () => {
    const made = await newLink(setup(), { deposit: 50 });
    const p = priceQuoteLink(made.link, made.link.sizes);
    assert.equal(p.depositAmount, Math.round(p.total * 50) / 100);
  });

  test("an empty order costs nothing", async () => {
    const made = await newLink(setup());
    assert.equal(priceQuoteLink(made.link, {}).total, 0);
  });
});

describe("the public view", () => {
  test("carries no internal ids, IPs, or emails of approvers", async () => {
    const t = setup();
    const made = await newLink(t);
    const approved = await approveLink(t.deps, made.token, {
      name: "Pat", email: "pat@example.com", agreed: true, ip: "203.0.113.9",
    });
    assert.ok(approved.ok);

    const json = JSON.stringify(toPublicQuote(approved.link));
    for (const secret of ["pq-1", "203.0.113.9", "wholesale", "baseOutstanding", "stripe", made.link.id]) {
      assert.ok(!json.includes(secret), `leaked ${secret}`);
    }
  });
});

describe("approval", () => {
  test("below-minimum cannot be approved", async () => {
    const t = setup({ M: 10 });
    const made = await newLink(t);
    const r = await approveLink(t.deps, made.token, {
      name: "Pat", email: "pat@example.com", agreed: true, ip: "1.1.1.1",
    });
    assert.ok(!r.ok);
    assert.match(r.error, /minimum/i);
  });

  test("needs a name, an email and the tick", async () => {
    const t = setup();
    const made = await newLink(t);
    for (const bad of [
      { name: "", email: "pat@example.com", agreed: true },
      { name: "Pat", email: "nope", agreed: true },
      { name: "Pat", email: "pat@example.com", agreed: false },
    ]) {
      const r = await approveLink(t.deps, made.token, { ...bad, ip: "1.1.1.1" });
      assert.ok(!r.ok, JSON.stringify(bad));
    }
  });

  test("approving locks sizes and stores the snapshot", async () => {
    const t = setup();
    const made = await newLink(t);
    const r = await approveLink(t.deps, made.token, {
      name: "Pat", email: "pat@example.com", agreed: true, ip: "1.1.1.1",
    });
    assert.ok(r.ok);
    assert.equal(r.link.status, "approved");
    assert.equal(r.link.approvedSnapshot?.pieces, 24);
    assert.deepEqual(r.link.approvedSnapshot?.approvedSizes, { M: 12, L: 12 });

    const edit = await updateSizes(t.deps, made.token, { M: 20 });
    assert.ok(!edit.ok);
    assert.equal(edit.status, 409);

    const again = await approveLink(t.deps, made.token, {
      name: "Pat", email: "pat@example.com", agreed: true, ip: "1.1.1.1",
    });
    assert.ok(!again.ok);
    assert.deepEqual(t.sent, ["Quote #14431 approved"]);
  });

  test("approves the sizes sent with the request, not a stale save", async () => {
    const t = setup();
    const made = await newLink(t);
    const r = await approveLink(t.deps, made.token, {
      name: "Pat", email: "pat@example.com", agreed: true, ip: "1.1.1.1",
      sizes: { M: 12, L: 10, "2XL": 2 },
    });
    assert.ok(r.ok);
    assert.equal(r.link.approvedSnapshot?.sizes["2XL"], 2);
  });

  test("shop unlock clears approval and logs it", async () => {
    const t = setup();
    const made = await newLink(t);
    await approveLink(t.deps, made.token, { name: "Pat", email: "pat@example.com", agreed: true, ip: "1" });
    assert.ok((await unlockLink(t.deps, made.link.id)).ok);

    const link = await t.store.getById(made.link.id);
    assert.equal(link?.approval, undefined);
    assert.equal(link?.approvedSnapshot, undefined);
    assert.ok((await t.store.events(made.link.id)).some((e) => e.event === "unlocked"));
    assert.ok((await updateSizes(t.deps, made.token, { M: 30 })).ok);
  });
});

describe("payment - Printavo stays the billing authority", () => {
  const who = { name: "Pat", email: "pat@example.com", agreed: true, ip: "1.1.1.1" };

  test("unchanged sizes: payment link goes out for Printavo's own outstanding", async () => {
    const t = setup();
    const made = await newLink(t);
    await approveLink(t.deps, made.token, who);

    const r = await startPayment(t.deps, made.token);
    assert.ok(r.ok);
    assert.deepEqual(t.paymentCalls, [{ quoteId: "pq-1", fraction: undefined }]);
    assert.equal((await t.store.getById(made.link.id))?.status, "payment_requested");
  });

  test("deposit asks Printavo for a FRACTION, never a figure", async () => {
    const t = setup();
    const made = await newLink(t, { deposit: 50 });
    await approveLink(t.deps, made.token, who);
    const r = await startPayment(t.deps, made.token);
    assert.ok(r.ok);
    assert.equal(r.amount, 300);
    assert.equal(t.paymentCalls[0].fraction, 0.5);
    assert.ok(!("amount" in t.paymentCalls[0]));
  });

  test("changed sizes HOLD payment until the shop releases it", async () => {
    const t = setup();
    const made = await newLink(t);
    await approveLink(t.deps, made.token, { ...who, sizes: { M: 12, L: 10, "2XL": 2 } });

    const held = await startPayment(t.deps, made.token);
    assert.ok(!held.ok);
    assert.equal(held.status, 409);
    assert.equal(t.paymentCalls.length, 0);
    assert.equal(paymentGate((await t.store.getById(made.link.id))!).state, "held");

    assert.ok((await releasePayment(t.deps, made.link.id)).ok);
    assert.ok((await startPayment(t.deps, made.token)).ok);
    assert.equal(t.paymentCalls.length, 1);
  });

  test("cannot pay before approving", async () => {
    const t = setup();
    const made = await newLink(t);
    const r = await startPayment(t.deps, made.token);
    assert.ok(!r.ok);
    assert.equal(t.paymentCalls.length, 0);
  });

  test("a second click does not raise a second payment request", async () => {
    const t = setup();
    const made = await newLink(t);
    await approveLink(t.deps, made.token, who);
    await startPayment(t.deps, made.token);
    const again = await startPayment(t.deps, made.token);
    assert.ok(!again.ok);
    assert.equal(t.paymentCalls.length, 1);
  });

  test("Printavo unreachable raises no request", async () => {
    const t = setup();
    const made = await newLink(t);
    await approveLink(t.deps, made.token, who);
    t.setOutstanding(null);
    const r = await startPayment(t.deps, made.token);
    assert.ok(!r.ok);
    assert.equal(t.paymentCalls.length, 0);
  });

  test("becomes paid only when Printavo's outstanding drops - and tells the shop once", async () => {
    const t = setup();
    const made = await newLink(t);
    await approveLink(t.deps, made.token, who);
    await startPayment(t.deps, made.token);

    t.setOutstanding(600);
    assert.equal((await viewLink(t.deps, made.token))?.status, "payment_requested");

    t.setOutstanding(null); // unknown is not paid
    assert.equal((await viewLink(t.deps, made.token))?.status, "payment_requested");

    t.setOutstanding(0);
    assert.equal((await viewLink(t.deps, made.token))?.status, "paid");
    await viewLink(t.deps, made.token);
    assert.equal(t.sent.filter((s) => s.includes("paid")).length, 1);
  });

  test("a deposit leaves a balance and still counts as the request being paid", async () => {
    const t = setup();
    const made = await newLink(t, { deposit: 50 });
    await approveLink(t.deps, made.token, who);
    await startPayment(t.deps, made.token);
    t.setOutstanding(300);
    assert.equal((await viewLink(t.deps, made.token))?.status, "paid");
  });
});

describe("events", () => {
  test("viewing is logged once, on the first open", async () => {
    const t = setup();
    const made = await newLink(t);
    await viewLink(t.deps, made.token);
    await viewLink(t.deps, made.token);
    const views = (await t.store.events(made.link.id)).filter((e) => e.event === "viewed");
    assert.equal(views.length, 1);
  });
});
