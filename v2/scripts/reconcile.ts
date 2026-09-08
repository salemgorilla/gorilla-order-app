/**
 * npm run reconcile -- GS-20260908-TT40U
 *
 * Puts the website's figure and Printavo's figure side by side for one
 * order, and exits non-zero on a mismatch.
 *
 * ── WHY A SCRIPT AND NOT A TEST ───────────────────────────────────────────
 * AGENTS.md: "Any change touching pricing or checkout ends with one real
 * order reconciled against the Printavo invoice, to the cent. Never with a
 * passing test." A test cannot see Printavo's rounding, its tax engine or
 * its line-item behaviour — it can only see what we believe about them.
 * This talks to the real account, so it is a script a human runs against a
 * real order, not something CI can pretend to have done.
 *
 * ── IT DOES NOT REPLACE THE HUMAN ─────────────────────────────────────────
 * It reads back what Printavo holds and compares it to the figure the app
 * wrote into that same record. It cannot see the shop email, the customer's
 * intent, or whether the order should have been placed at all. It turns
 * "transcribe eight figures between two browser tabs" into "read a verdict",
 * which is the part that was stopping this from happening.
 *
 *   npm run reconcile -- GS-20260908-TT40U
 *   npm run reconcile -- GS-20260908-TT40U --raw    # dump Printavo's reply
 *
 * Needs PRINTAVO_EMAIL and PRINTAVO_TOKEN in the environment. It only ever
 * READS: no quote is created, no payment is requested, nothing is voided.
 */
import {
  fetchQuoteForReconciliation,
  type ReconcileQuoteResult,
} from "../lib/printavo";
import { formatReconcileReport, reconcileQuote } from "../lib/reconcile";

function usage(message: string): never {
  console.error(`\n${message}\n`);
  console.error("  npm run reconcile -- GS-20260908-TT40U");
  console.error("  npm run reconcile -- GS-20260908-TT40U --raw\n");
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  const showRaw = args.includes("--raw");
  const quoteNumber = args.find((arg) => !arg.startsWith("--"));

  if (!quoteNumber) usage("Give me a quote number.");

  // Said before the network call, so a missing credential reads as a setup
  // problem rather than as a missing order.
  if (!process.env.PRINTAVO_EMAIL || !process.env.PRINTAVO_TOKEN) {
    usage(
      "PRINTAVO_EMAIL and PRINTAVO_TOKEN must be set — this talks to the real account."
    );
  }

  const order: ReconcileQuoteResult = await fetchQuoteForReconciliation(
    quoteNumber
  );

  if (showRaw) {
    console.log(JSON.stringify(order.raw, null, 2));
  }

  if (!order.found) {
    console.error(`\nCould not read ${order.quoteNumber}: ${order.error}\n`);
    process.exit(1);
  }

  /**
   * A detail-query failure is loud but NOT fatal: the search proved the
   * order exists and gave us its Printavo number, which is enough for a
   * human to open it and finish by eye. Exiting here would throw that away.
   */
  if (order.error) {
    console.error(
      `\nPrintavo answered the search but not the detail query: ${order.error}` +
        "\nThe read shape has never been proven against the live account — " +
        "run again with --raw and settle it.\n"
    );
  }

  const result = reconcileQuote({
    quoteNumber: order.quoteNumber,
    visualId: order.visualId,
    printavoTotal: order.total,
    amountOutstanding: order.amountOutstanding,
    customerNote: order.customerNote,
    lineItems: order.lineItems,
  });

  console.log(formatReconcileReport({ ...order }, result));

  /**
   * Non-zero on a MISMATCH only.
   *
   * An unknown exits 0 on purpose. Unknowns mean this harness could not see
   * something — an unproven query shape, an order predating the note — and
   * a tool that fails on its own blind spots gets muted within a week, which
   * is exactly how the manual reconciliation stopped happening.
   */
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
