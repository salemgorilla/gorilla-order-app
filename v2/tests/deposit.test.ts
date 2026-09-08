/**
 * THE 50% DEPOSIT.
 *
 * Gabe, 2026-09-07: "All orders over $4999.99 should ask for 50% deposit, and
 * the remaining balance is due before or upon shipping or pickup."
 *
 * That replaced a refusal. Until this rule, an order over the ceiling raised
 * no payment link at all and the shop invoiced it by hand — so the biggest
 * jobs got the least automation and the slowest cash. Now they still pay
 * online; they pay half.
 *
 * ── WHAT THIS FILE IS ACTUALLY GUARDING ───────────────────────────────────
 * A deposit is the first time this app asks for an amount that is NOT simply
 * "what is outstanding". Two ways that goes wrong, and both are here:
 *
 *   1. The half is computed from a figure the APP worked out. The standing
 *      rule on createPaymentRequest is that the app never passes a total it
 *      derived itself — the authority is Printavo's own `amountOutstanding`.
 *      Half of the shop's number is still the shop's number; half of ours is
 *      not, and it would be billed to a card unattended. So these tests drive
 *      the real function against a stubbed Printavo and read the amount off
 *      the MUTATION, which is the figure that would reach a customer.
 *
 *   2. The customer is charged half and told nothing. Somebody who pays what
 *      looks like the invoice and then receives a second bill has been
 *      misled, even when the second bill was always the arrangement. Every
 *      surface that shows the figure has to say what it is.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";

import { DEPOSIT_FRACTION, FULL_PAYMENT_CEILING } from "../lib/auto-bill";
import { createCheckout, createPaymentRequest } from "../lib/printavo";

const confirmation = readFileSync(
  new URL("../features/QuoteConfirmation.tsx", import.meta.url),
  "utf8"
);

/** Every GraphQL call the run made, in order, with its variables. */
type Call = { query: string; variables: Record<string, unknown> };

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };

let calls: Call[] = [];

/**
 * A Printavo that answers with ONE outstanding figure, so the amount the
 * mutation carries can only have come from it.
 */
function stubPrintavo(outstanding: number) {
  calls = [];

  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const sent = JSON.parse(init.body) as Call;
    calls.push(sent);

    const data = sent.query.includes("GorillaQuoteForPayment")
      ? {
          quote: {
            id: "q1",
            visualId: "1234",
            nickname: "Test",
            // Deliberately different from amountOutstanding: a fraction taken
            // off `total` instead would be wrong here, and visibly so.
            total: outstanding + 111,
            amountOutstanding: outstanding,
            contact: { id: "c1", fullName: "Dana", email: "dana@example.com" },
          },
        }
      : {
          paymentRequestCreate: {
            id: "pr1",
            visualId: "9",
            // Echo what was asked for, as Printavo does.
            amount: (sent.variables.input as { amount: number }).amount,
            status: "sent",
          },
        };

    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data }),
    };
  }) as unknown as typeof fetch;
}

/** The payment mutation's own variables — the money that would be charged. */
function requested() {
  const mutation = calls.find((c) => c.query.includes("GorillaPaymentRequest"));
  assert.ok(mutation, "no payment request was raised");
  return mutation.variables.input as {
    amount: number;
    email: { subject: string; body: string };
  };
}

beforeEach(() => {
  process.env.PRINTAVO_EMAIL = "shop@example.com";
  process.env.PRINTAVO_TOKEN = "token";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

describe("the half comes off Printavo's figure, never ours", () => {
  test("a deposit asks for half of amountOutstanding", async () => {
    stubPrintavo(6000);

    const result = await createPaymentRequest({
      quoteId: "q1",
      fraction: DEPOSIT_FRACTION,
    });

    assert.equal(result.sent, true, result.error);
    // Not 3055.50, which is half of `total`, and not 6000.
    assert.equal(requested().amount, 3000);
  });

  test("no fraction still asks for the whole outstanding amount", async () => {
    // The ordinary path, unchanged. Every order under the ceiling — which is
    // nearly all of them — goes through this branch.
    stubPrintavo(6000);

    await createPaymentRequest({ quoteId: "q1" });

    assert.equal(requested().amount, 6000);
  });

  test("the two halves add up to the invoice, to the cent", async () => {
    // A deposit that rounds up leaves a balance that is short by a cent; one
    // that rounds down leaves the shop a cent light. Printavo computes the
    // balance itself as what is still outstanding, so the only thing that
    // has to be right here is that the deposit is a real cent figure.
    for (const outstanding of [5000.01, 7333.33, 12345.67, 9999.99]) {
      stubPrintavo(outstanding);

      await createPaymentRequest({ quoteId: "q1", fraction: DEPOSIT_FRACTION });

      const deposit = requested().amount;
      const balance = Math.round((outstanding - deposit) * 100) / 100;

      assert.equal(
        Math.round(deposit * 100) / 100,
        deposit,
        `$${deposit} is not a whole number of cents`
      );
      assert.equal(Math.round((deposit + balance) * 100) / 100, outstanding);
      assert.ok(balance > 0, `nothing left to collect on $${outstanding}`);
    }
  });

  test("an explicit amount still wins, and a nonsense fraction is ignored", async () => {
    // The guarded /api/payment-request route passes a figure a human typed.
    stubPrintavo(6000);
    await createPaymentRequest({ quoteId: "q1", amount: 42, fraction: 0.5 });
    assert.equal(requested().amount, 42);

    for (const fraction of [0, 1, 1.5, -0.5]) {
      stubPrintavo(6000);
      await createPaymentRequest({ quoteId: "q1", fraction });
      assert.equal(
        requested().amount,
        6000,
        `fraction ${fraction} changed the amount`
      );
    }
  });
});

describe("the customer is told it is a deposit", () => {
  test("the payment email says so, and says when the rest is due", async () => {
    stubPrintavo(6000);

    const checkout = await createCheckout({
      quoteId: "q1",
      customerEmail: "dana@example.com",
      publicUrl: "https://printavo.example/q1",
      flow: "signs",
      deposit: true,
    });

    const email = requested().email;

    assert.match(email.subject, /deposit/i);
    assert.match(email.body, /50% deposit/i);
    assert.match(email.body, /balance/i);
    assert.match(email.body, /ships or is collected/i);

    assert.equal(checkout.ready, true, checkout.error);
    assert.equal(checkout.deposit, true);
    // Printavo's echo of its own half, not a number this app worked out.
    assert.equal(checkout.amount, 3000);
  });

  test("an ordinary checkout says none of it", async () => {
    // The failure worth catching in the other direction: every customer under
    // the ceiling reading about a balance that does not exist.
    stubPrintavo(200);

    const checkout = await createCheckout({
      quoteId: "q1",
      customerEmail: "dana@example.com",
      publicUrl: "https://printavo.example/q1",
      flow: "stickers",
    });

    const email = requested().email;

    assert.doesNotMatch(email.subject, /deposit/i);
    assert.doesNotMatch(email.body, /deposit/i);
    assert.equal(checkout.deposit, false);
    assert.equal(checkout.amount, 200);
  });
});

describe("the confirmation screen says the same thing the email does", () => {
  /**
   * Read from source: the screen is a server-rendered React component and
   * what matters is the wiring — that the deposit copy is gated on the flag
   * the route sets, and cannot appear on an order nobody was asked to pay.
   */
  test("the flag comes from the checkout, not from the total", () => {
    // If this screen decided "over $4,999.99, so it must be a deposit" on its
    // own, it would say deposit on an order the gate refused, and would keep
    // saying it after the ceiling next moves.
    assert.match(confirmation, /const isDeposit = canPayNow && Boolean\(checkout\?\.deposit\)/);
  });

  test("the button names the deposit and the paragraph names the balance", () => {
    assert.match(confirmation, /isDeposit \? "Pay 50% deposit" : "Pay now"/);
    assert.match(confirmation, /isDeposit && \(/);
    assert.match(confirmation, /balance is\s*\n?\s*due before your order ships or is collected/);
  });
});

describe("the rule is one number, in one place", () => {
  test("the ceiling and the fraction are exported, not typed twice", () => {
    assert.equal(FULL_PAYMENT_CEILING, 4999.99);
    assert.equal(DEPOSIT_FRACTION, 0.5);

    // The customer-facing copy says "50%" in words, in three places. If the
    // fraction ever moves, that copy is what goes stale — so pin the pairing
    // rather than the prose.
    assert.equal(Math.round(DEPOSIT_FRACTION * 100), 50);
  });
});
