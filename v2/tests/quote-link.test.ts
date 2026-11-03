import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  CARD_FEE_RATE,
  createQuoteToken,
  depositFor,
  isValidQuoteToken,
  priceQuoteLink,
  toPublicQuote,
  validateSizes,
  type QuoteLinkSize,
  type QuoteLinkSpec,
} from "../lib/quote-link";
import { DEPOSIT_FRACTION, FULL_PAYMENT_CEILING } from "../lib/auto-bill";
import { quoteLinkStore, type BlobBackend } from "../lib/quote-link-store";
import {
  approveLink,
  createLink,
  handleStripeEvent,
  pushToPrintavo,
  regenerateLink,
  startPayment,
  unlockLink,
  updateSizes,
  viewLink,
  type Deps,
} from "../lib/quote-link-service";
import { formEncode, verifyStripeSignature } from "../lib/stripe";
import type { PaidOrderInput } from "../lib/printavo";

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
  { sizeName: "S", markedUpPrice: 4.5, priceByMarkup: price(4.5), available: true },
  { sizeName: "M", markedUpPrice: 4.5, priceByMarkup: price(4.5), available: true },
  { sizeName: "L", markedUpPrice: 4.5, priceByMarkup: price(4.5), available: true },
  { sizeName: "XL", markedUpPrice: 4.5, priceByMarkup: price(4.5), available: true },
  { sizeName: "2XL", markedUpPrice: 6.5, priceByMarkup: price(6.5), available: true },
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

function setup() {
  const backend = memory();
  const store = quoteLinkStore(backend);
  const sent: string[] = [];
  const sessions: Array<{ amountCents: number; idempotencyKey: string }> = [];
  const expired: string[] = [];
  const created: PaidOrderInput[] = [];
  const state = {
    stripeConfigured: true,
    expireFails: false,
    printavoSearchable: true,
    printavoFails: false,
    existing: new Set<string>(),
  };

  const deps: Deps = {
    store,
    origin: "https://example.test",
    stripe: {
      get configured() { return state.stripeConfigured; },
      createSession: async (input) => {
        sessions.push({ amountCents: input.amountCents, idempotencyKey: input.idempotencyKey });
        return { id: `cs_${sessions.length}`, url: `https://checkout.stripe.com/c/cs_${sessions.length}` };
      },
      expireSession: async (id) => {
        if (state.expireFails) throw new Error("network down");
        expired.push(id);
      },
    },
    printavo: {
      find: async (orderNumber) =>
        !state.printavoSearchable
          ? { searched: false, found: false }
          : state.existing.has(orderNumber)
          ? { searched: true, found: true, id: "pv-1", visualId: "15001" }
          : { searched: true, found: false },
      create: async (input) => {
        if (state.printavoFails) return { created: false, error: "Printavo: HTTP 500" };
        created.push(input);
        state.existing.add(input.orderNumber);
        return { created: true, id: "pv-1", visualId: "15001" };
      },
    },
    notifyShop: async (subject) => { sent.push(subject); },
  };

  return { deps, store, backend, sent, sessions, expired, created, state };
}

type T = ReturnType<typeof setup>;

async function newLink(t: T, opts: { deposit?: number | null; sizes?: Record<string, number>; min?: number } = {}) {
  const made = await createLink(t.deps, {
    customer: { name: "Pat Customer", email: "pat@example.com" },
    spec: SPEC,
    catalogSizes: SIZES,
    sizes: opts.sizes ?? { M: 12, L: 12 },
    minimumPieces: opts.min ?? 24,
    depositPercent: opts.deposit ?? null,
    turnaroundNote: "Ready in 10 business days.",
  });
  assert.ok(made.ok, made.ok ? "" : made.error);
  return made;
}

const WHO = { name: "Pat Customer", email: "pat@example.com", agreed: true, ip: "203.0.113.9" };

async function approvedAndStarted(t: T, opts: Parameters<typeof newLink>[1] = {}) {
  const made = await newLink(t, opts);
  const approved = await approveLink(t.deps, made.token, WHO);
  assert.ok(approved.ok);
  const started = await startPayment(t.deps, made.token);
  assert.ok(started.ok);
  const link = (await t.store.getById(made.link.id))!;
  return { made, link };
}

function paidEvent(sessionId: string, amountCents: number, linkId: string) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        payment_status: "paid",
        amount_total: amountCents,
        payment_intent: "pi_123",
        metadata: { linkId },
      },
    },
  };
}

describe("tokens", () => {
  test("are 256 bits, URL-safe, and unique", () => {
    const a = createQuoteToken();
    assert.equal(a.length, 43);
    assert.match(a, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(a, createQuoteToken());
    assert.ok(isValidQuoteToken(a));
    assert.ok(!isValidQuoteToken("short"));
  });

  test("regenerating kills the old link; a stale pointer stays dead", async () => {
    const t = setup();
    const made = await newLink(t);
    const next = await regenerateLink(t.deps, made.link.id);
    assert.ok(next.ok);
    assert.equal(await t.store.getByToken(made.token), null);
    assert.ok(await t.store.getByToken(next.token));
  });

  test("expired links do not open, and only a hash of the token is stored", async () => {
    const t = setup();
    const made = await newLink(t);
    for (const [path, body] of t.backend.files) {
      assert.ok(!path.includes(made.token) && !body.includes(made.token));
    }
    await t.store.save({ ...made.link, expiresAt: "2020-01-01T00:00:00Z" });
    assert.equal(await t.store.getByToken(made.token), null);
  });

  test("order numbers are GQ- numbers, never GS- (website orders)", async () => {
    const made = await newLink(setup());
    assert.match(made.link.orderNumber, /^GQ-[2-9A-Z]{8}$/);
  });
});

describe("creating a quote", () => {
  test("refuses a bad email, unknown sizes, or no print location", async () => {
    const t = setup();
    const base = {
      customer: { name: "Pat", email: "pat@example.com" }, spec: SPEC, catalogSizes: SIZES,
      sizes: { M: 24 }, minimumPieces: 24, depositPercent: null, turnaroundNote: "",
    };
    assert.ok((await createLink(t.deps, base)).ok);
    assert.ok(!(await createLink(t.deps, { ...base, customer: { name: "Pat", email: "nope" } })).ok);
    assert.ok(!(await createLink(t.deps, { ...base, sizes: { "9XL": 2 } })).ok);
    assert.ok(!(await createLink(t.deps, { ...base, spec: { ...SPEC, printLocations: [] } })).ok);
  });
});

describe("sizes", () => {
  test("rejects unknown, negative, fractional and out-of-stock", async () => {
    const made = await newLink(setup());
    for (const bad of [{ "9XL": 1 }, { M: -1 }, { M: 1.5 }, { M: "x" }, { "3XL": 2 }, [], null]) {
      assert.ok(!validateSizes(made.link, bad).ok, JSON.stringify(bad));
    }
    const ok = validateSizes(made.link, { M: 0, XL: 28 });
    assert.ok(ok.ok);
    assert.deepEqual(ok.sizes, { XL: 28 });
  });
});

describe("pricing - one price, from our engine", () => {
  test("adds the 3% card fee and no tax, and the parts add up", async () => {
    const made = await newLink(setup());
    const p = priceQuoteLink(made.link, { M: 12, L: 10, "2XL": 2 });
    assert.equal(CARD_FEE_RATE, 0.03);
    assert.equal(p.tax, 0);
    assert.equal(p.cardFee, Math.round(p.subtotal * 0.03 * 100) / 100);
    assert.equal(Math.round((p.subtotal + p.cardFee) * 100), Math.round(p.total * 100));
    assert.equal(
      Math.round((p.garmentTotal + p.decorationTotal + p.setupTotal + p.rushTotal) * 100),
      Math.round(p.subtotal * 100)
    );
    assert.equal(Math.round(p.garmentUnitPrice * p.pieces * 100), Math.round(p.garmentTotal * 100));
    assert.ok(p.perSize.find((s) => s.sizeName === "2XL")!.upcharge > 0);
  });

  test("never charges more for 23 pieces than for 24", async () => {
    const made = await newLink(setup());
    assert.ok(
      priceQuoteLink(made.link, { M: 12, L: 11 }).total <=
        priceQuoteLink(made.link, { M: 12, L: 12 }).total
    );
  });

  test("deposit: the shop's percent wins, else 50% over the app-wide ceiling", () => {
    assert.deepEqual(depositFor(300, 25), { percent: 25, reason: "shop" });
    assert.equal(depositFor(FULL_PAYMENT_CEILING, null), null);
    assert.deepEqual(depositFor(FULL_PAYMENT_CEILING + 0.01, null), {
      percent: DEPOSIT_FRACTION * 100,
      reason: "large-order",
    });
  });

  test("a large order is due at half", async () => {
    const made = await newLink(setup(), { sizes: { M: 500, L: 500 } });
    const p = priceQuoteLink(made.link, made.link.sizes);
    assert.ok(p.total > FULL_PAYMENT_CEILING);
    assert.equal(p.amountDue, Math.round(p.total * 50) / 100);
  });
});

describe("the public view", () => {
  test("carries no Stripe, Printavo, IP or approver-email internals", async () => {
    const t = setup();
    const { made } = await approvedAndStarted(t);
    await handleStripeEvent(t.deps, paidEvent("cs_1", (await t.store.getById(made.link.id))!.payment!.amountCents, made.link.id));
    const json = JSON.stringify(toPublicQuote((await t.store.getById(made.link.id))!));
    for (const secret of ["cs_1", "pi_123", "pv-1", "203.0.113.9", "pat@example.com", made.link.id, "wholesale"]) {
      assert.ok(!json.includes(secret), `leaked ${secret}`);
    }
  });

  test("once approved, shows the frozen snapshot that will be charged", async () => {
    const t = setup();
    const made = await newLink(t);
    await approveLink(t.deps, made.token, WHO);
    const link = (await t.store.getById(made.link.id))!;
    assert.equal(toPublicQuote(link).price.total, link.approvedSnapshot!.total);
  });
});

describe("approval", () => {
  test("below-minimum cannot be approved", async () => {
    const t = setup();
    const made = await newLink(t, { sizes: { M: 10 } });
    const r = await approveLink(t.deps, made.token, WHO);
    assert.ok(!r.ok);
    assert.match(r.error, /minimum/i);
  });

  test("needs a name, an email and the tick", async () => {
    const t = setup();
    const made = await newLink(t);
    for (const bad of [{ name: "" }, { email: "nope" }, { agreed: false }]) {
      assert.ok(!(await approveLink(t.deps, made.token, { ...WHO, ...bad })).ok);
    }
  });

  test("locks the sizes and approves the sizes sent with it", async () => {
    const t = setup();
    const made = await newLink(t);
    const r = await approveLink(t.deps, made.token, { ...WHO, sizes: { M: 12, L: 10, "2XL": 2 } });
    assert.ok(r.ok);
    assert.equal(r.link.approvedSnapshot?.approvedSizes["2XL"], 2);
    assert.equal((await updateSizes(t.deps, made.token, { M: 20 })).ok, false);
    assert.equal((await approveLink(t.deps, made.token, WHO)).ok, false);
    assert.deepEqual(t.sent, [`${made.link.orderNumber} approved`]);
  });
});

describe("checkout", () => {
  test("refused when Stripe is not configured, or before approval", async () => {
    const t = setup();
    const made = await newLink(t);
    assert.equal((await startPayment(t.deps, made.token)).ok, false);
    await approveLink(t.deps, made.token, WHO);
    t.state.stripeConfigured = false;
    const r = await startPayment(t.deps, made.token);
    assert.ok(!r.ok);
    assert.equal(r.status, 503);
    assert.equal(t.sessions.length, 0);
  });

  test("charges exactly the snapshot's amount due, in cents", async () => {
    const t = setup();
    const { link } = await approvedAndStarted(t);
    assert.equal(t.sessions[0].amountCents, Math.round(link.approvedSnapshot!.amountDue * 100));
    assert.equal(link.status, "payment_started");
  });

  test("a second click reuses the open session instead of opening another", async () => {
    const t = setup();
    const { made } = await approvedAndStarted(t);
    const again = await startPayment(t.deps, made.token);
    assert.ok(again.ok);
    assert.equal(t.sessions.length, 1);
  });

  test("unlock closes the open payment page first, or unlocks nothing", async () => {
    const t = setup();
    const { made } = await approvedAndStarted(t);

    t.state.expireFails = true;
    assert.equal((await unlockLink(t.deps, made.link.id)).ok, false);
    assert.equal((await t.store.getById(made.link.id))!.status, "payment_started");

    t.state.expireFails = false;
    assert.ok((await unlockLink(t.deps, made.link.id)).ok);
    assert.deepEqual(t.expired, ["cs_1"]);
    const link = (await t.store.getById(made.link.id))!;
    assert.equal(link.payment, undefined);
    assert.ok((await updateSizes(t.deps, made.token, { M: 30 })).ok);
  });
});

describe("Stripe webhook", () => {
  test("paid: marks paid, then files ONE Printavo order whose lines add up to the charge", async () => {
    const t = setup();
    const { link } = await approvedAndStarted(t, { sizes: { M: 12, L: 10, "2XL": 2 } });
    const cents = link.payment!.amountCents;

    const r = await handleStripeEvent(t.deps, paidEvent("cs_1", cents, link.id));
    assert.equal(r.note, "paid");

    const after = (await t.store.getById(link.id))!;
    assert.equal(after.status, "paid");
    assert.equal(after.payment!.amountPaid, cents / 100);
    assert.equal(after.printavo!.state, "created");

    assert.equal(t.created.length, 1);
    const order = t.created[0];
    const pieces = Object.values(order.sizes).reduce((a, b) => a + b, 0);
    const lines = Math.round(order.garmentUnitPrice * pieces * 100) +
      order.feeLines.reduce((sum, f) => sum + Math.round(f.amount * 100), 0);
    assert.equal(lines, cents, "Printavo lines must equal what Stripe charged, to the cent");
    assert.ok(order.feeLines.some((f) => f.itemNumber === "GORILLA-CARD-FEE"));
    assert.match(order.paymentNote, /PAID ONLINE BY CARD/);
    assert.ok(t.sent.some((s) => s.includes("PAID")));
  });

  test("the same event twice creates one Printavo order", async () => {
    const t = setup();
    const { link } = await approvedAndStarted(t);
    const event = paidEvent("cs_1", link.payment!.amountCents, link.id);
    await handleStripeEvent(t.deps, event);
    await handleStripeEvent(t.deps, event);
    assert.equal(t.created.length, 1);
  });

  test("an order Printavo already has (a lost save) is found, not duplicated", async () => {
    const t = setup();
    const { link } = await approvedAndStarted(t);
    t.state.existing.add(link.orderNumber);
    await handleStripeEvent(t.deps, paidEvent("cs_1", link.payment!.amountCents, link.id));
    assert.equal(t.created.length, 0);
    assert.equal((await t.store.getById(link.id))!.printavo!.state, "created");
  });

  test("Printavo unsearchable: paid is recorded, nothing is created, the shop is told", async () => {
    const t = setup();
    const { link } = await approvedAndStarted(t);
    t.state.printavoSearchable = false;
    await handleStripeEvent(t.deps, paidEvent("cs_1", link.payment!.amountCents, link.id));
    const after = (await t.store.getById(link.id))!;
    assert.equal(after.status, "paid");
    assert.equal(after.printavo!.state, "failed");
    assert.equal(t.created.length, 0);
  });

  test("Printavo failure can be retried from the admin page", async () => {
    const t = setup();
    const { link } = await approvedAndStarted(t);
    t.state.printavoFails = true;
    await handleStripeEvent(t.deps, paidEvent("cs_1", link.payment!.amountCents, link.id));
    assert.equal((await t.store.getById(link.id))!.printavo!.state, "failed");

    t.state.printavoFails = false;
    const retry = await pushToPrintavo(t.deps, link.id);
    assert.ok(retry.ok);
    assert.equal(t.created.length, 1);
  });

  test("a delivery mid-create does not start a second create", async () => {
    const t = setup();
    const { link } = await approvedAndStarted(t);
    await t.store.save({ ...link, status: "paid", payment: { ...link.payment!, amountPaid: 1 },
      printavo: { state: "creating", at: new Date().toISOString() } });
    const r = await pushToPrintavo(t.deps, link.id);
    assert.ok(!r.ok);
    assert.equal(t.created.length, 0);
  });

  test("wrong amount or wrong session: NOT marked paid, NOT filed, shop told", async () => {
    for (const [session, delta] of [["cs_1", 1], ["cs_other", 0]] as const) {
      const t = setup();
      const { link } = await approvedAndStarted(t);
      await handleStripeEvent(t.deps, paidEvent(session, link.payment!.amountCents + delta, link.id));
      assert.equal((await t.store.getById(link.id))!.status, "payment_started");
      assert.equal(t.created.length, 0);
      assert.ok(t.sent.some((s) => s.includes("NEEDS A LOOK")));
    }
  });

  test("a completed but unpaid session changes nothing", async () => {
    const t = setup();
    const { link } = await approvedAndStarted(t);
    const event = paidEvent("cs_1", link.payment!.amountCents, link.id);
    event.data.object.payment_status = "unpaid";
    await handleStripeEvent(t.deps, event);
    assert.equal((await t.store.getById(link.id))!.status, "payment_started");
  });

  test("payment failed is logged and the shop is told", async () => {
    const t = setup();
    const { link } = await approvedAndStarted(t);
    await handleStripeEvent(t.deps, {
      type: "payment_intent.payment_failed",
      data: { object: { metadata: { linkId: link.id }, last_payment_error: { message: "card declined" } } },
    });
    assert.ok(t.sent.some((s) => s.includes("FAILED")));
    assert.equal((await t.store.getById(link.id))!.status, "payment_started");
  });

  test("events for other things are ignored", async () => {
    const t = setup();
    assert.equal((await handleStripeEvent(t.deps, { type: "charge.refunded", data: { object: {} } })).handled, false);
  });
});

describe("Stripe signatures", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';
  const sign = (t: number, b = body, s = secret) =>
    `t=${t},v1=${createHmac("sha256", s).update(`${t}.${b}`).digest("hex")}`;

  test("accepts a fresh, correct signature", () => {
    assert.ok(verifyStripeSignature(body, sign(1000), secret, 1000));
  });

  test("rejects tampering, the wrong secret, staleness, and nothing", () => {
    assert.ok(!verifyStripeSignature('{"id":"evt_2"}', sign(1000), secret, 1000));
    assert.ok(!verifyStripeSignature(body, sign(1000, body, "whsec_other"), secret, 1000));
    assert.ok(!verifyStripeSignature(body, sign(1000), secret, 1000 + 301));
    assert.ok(!verifyStripeSignature(body, null, secret, 1000));
    assert.ok(!verifyStripeSignature(body, "t=1000", secret, 1000));
  });

  test("form encoding uses Stripe's bracketed keys", () => {
    assert.equal(
      decodeURIComponent(formEncode({ a: 1, line_items: [{ price_data: { unit_amount: 500 } }] })),
      "a=1&line_items[0][price_data][unit_amount]=500"
    );
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
