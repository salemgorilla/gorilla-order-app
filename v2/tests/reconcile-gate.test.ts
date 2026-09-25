import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { reconcileExitCode, reconcileQuote } from "../lib/reconcile";

/**
 * The merge gate's answer, end to end: note in, exit code out.
 *
 * ── WHY THIS FILE, GIVEN reconcile-tax.test.ts ────────────────────────────
 * That file pins the pre-tax vs tax-inclusive bug class inside
 * `reconcileQuote`, thoroughly, and `lib/reconcile.ts` sits at 98% line
 * coverage because of it. What neither it nor anything else covered is the
 * step AFTER the verdict: the single integer `npm run reconcile` exits with.
 *
 * AGENTS.md makes a green reconciliation the gate for every PR that changes
 * a billed figure. That gate is one ternary, and it lived in a script, which
 * is the one place a node:test suite never looks. Inverted or softened to
 * always-0, every reconciliation from then on reads green — and this repo
 * has already shipped one check that matched nothing and passed quietly for
 * weeks.
 *
 * So these tests drive the WHOLE path a real run takes — the note the app
 * writes, the figures Printavo returns, the verdict, the exit code — for the
 * bug class that has actually bitten: a pre-tax figure compared against a
 * tax-inclusive one.
 */

/** The note shape lib/printavo writes, since #185: both Total lines. */
function noteWith(input: { preTax: number; withTax?: number }) {
  return [
    "WEBSITE ESTIMATE",
    "Stickers: $60.00",
    "Setup: $15.00",
    `Total: $${input.preTax.toFixed(2)}`,
    ...(input.withTax !== undefined
      ? [`Total incl. tax: $${input.withTax.toFixed(2)}`]
      : []),
  ].join("\n");
}

function run(input: {
  preTax: number;
  withTax?: number;
  printavoTotal: number;
  amountOutstanding: number;
}) {
  const result = reconcileQuote({
    quoteNumber: "GS-20260925-GATE1",
    customerNote: noteWith({ preTax: input.preTax, withTax: input.withTax }),
    printavoTotal: input.printavoTotal,
    amountOutstanding: input.amountOutstanding,
  });
  return { ...result, exitCode: reconcileExitCode(result) };
}

describe("the gate answers on the figure Printavo actually bills", () => {
  test("a healthy taxed order exits 0", () => {
    // $75 pre-tax, 6.25% on the $60 of stickers (setup is a fee) = $78.75.
    // Before #185 this exited 1 on every taxable order in the shop.
    const result = run({
      preTax: 75,
      withTax: 78.75,
      printavoTotal: 78.75,
      amountOutstanding: 78.75,
    });

    assert.equal(result.exitCode, 0, "a matching order failed the gate");
    assert.equal(result.ok, true);
  });

  test("a REAL mismatch still exits 1", () => {
    // The check that makes the gate worth having. Printavo billing $95 on a
    // $78.75 quote is the shape of every pricing defect this repo has had.
    const result = run({
      preTax: 75,
      withTax: 78.75,
      printavoTotal: 95,
      amountOutstanding: 95,
    });

    assert.equal(result.exitCode, 1, "a $16.25 discrepancy passed the gate");
    assert.equal(result.ok, false);
  });

  test("an order predating the tax-inclusive note exits 0, not 1", () => {
    // Only a pre-tax `Total:` to read, so the delta IS the sales tax and the
    // harness cannot tell a healthy order from a broken one. That is an
    // unknown, and an unknown must not fail: a tool that fails on its own
    // blind spots gets muted inside a week, and a muted gate looks like
    // coverage while providing none.
    const result = run({ preTax: 75, printavoTotal: 78.75, amountOutstanding: 78.75 });

    assert.equal(result.exitCode, 0, "an unknown was treated as a mismatch");
    assert.equal(result.incomplete, true, "an unknown was not reported as one");
  });

  test("an unknown is never silent — incomplete rides with the zero", () => {
    // The pairing is the point: exit 0 says "do not block", `incomplete`
    // says "and do not believe this proved anything". Losing the second
    // turns every blind spot into a pass.
    const result = run({ preTax: 75, printavoTotal: 78.75, amountOutstanding: 78.75 });
    assert.equal(result.exitCode === 0 && result.incomplete, true);
  });
});

describe("the exit rule itself", () => {
  test("mismatch is 1, match is 0, and incomplete does not change either", () => {
    assert.equal(reconcileExitCode({ ok: true, incomplete: false }), 0);
    assert.equal(reconcileExitCode({ ok: true, incomplete: true }), 0);
    assert.equal(reconcileExitCode({ ok: false, incomplete: false }), 1);
    assert.equal(reconcileExitCode({ ok: false, incomplete: true }), 1);
  });

  test("the script uses it, rather than keeping its own copy", () => {
    // Extracting the rule only helps if the call site actually reads it. A
    // ternary left behind in the script would leave this file testing a
    // function nothing calls — the same shape as a grep that matches
    // nothing, and just as quiet.
    const script = readFileSync(new URL("../scripts/reconcile.ts", import.meta.url), "utf8");
    const code = script
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join("\n");

    assert.match(code, /process\.exit\(reconcileExitCode\(result\)\)/);
    assert.doesNotMatch(
      code,
      /process\.exit\(\s*result\.ok\s*\?/,
      "the script kept its own copy of the exit rule"
    );
  });
});
