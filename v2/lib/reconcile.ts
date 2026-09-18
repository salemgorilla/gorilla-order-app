/**
 * DID PRINTAVO BILL WHAT THE WEBSITE QUOTED?
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * AGENTS.md: "Any change touching pricing or checkout ends with one real
 * order reconciled against the Printavo invoice, to the cent. Never with a
 * passing test." Every pricing defect this project has shipped was caught by
 * a human comparing two numbers; none were caught by reading code.
 *
 * That rule has been honoured with a manual comparison — open the shop
 * email, open Printavo, read across. It is slow enough that between 4 and 8
 * September SEVEN changes to billed figures shipped without one: the fee tax
 * basis (#108), sign minimums (#112), finishing services (#113), the rigid
 * second side (#114), signs starting to bill at all (#122), the ceiling
 * (#129) and the 50% deposit (#133). The reconciliation did not stop being
 * important; it stopped being cheap.
 *
 * So this makes it one command. It does NOT replace the human — it puts the
 * two numbers side by side so the human's job is reading a verdict rather
 * than transcribing figures.
 *
 * ── WHERE THE "WEBSITE" NUMBER COMES FROM ─────────────────────────────────
 * There is no database. The app posts a quote to Printavo and forgets it.
 * But createPrintavoQuote writes the app's own figure INTO the Printavo
 * customer note, under "WEBSITE ESTIMATE / Total: $X" — so the quote carries
 * both sides of the comparison, and one API call fetches them both. That is
 * why this reads the note rather than asking for a payload nobody stored.
 *
 * ── PROVEN FIELDS AND UNPROVEN ONES ───────────────────────────────────────
 * `total` and `amountOutstanding` on a read are PROVEN: createPaymentRequest
 * bills against them live, every sticker order that has ever been paid.
 * `customerNote` and the line-item shape on a READ are not — the app writes
 * line items through lineItemGroupCreate and has never read them back (see
 * fetchRecentInvoicesForPress, which carries the same caveat).
 *
 * So every check states its own footing, and a field that did not arrive is
 * reported as UNKNOWN — never as a pass, and never as a failure. A harness
 * that cried wolf about its own query would be worse than no harness: the
 * one thing it must never do is make a correct invoice look wrong.
 */

export type ReconcileStatus = "ok" | "mismatch" | "unknown";

export type ReconcileCheck = {
  name: string;
  status: ReconcileStatus;
  /** What the website said. */
  quoted?: string;
  /** What Printavo holds. */
  billed?: string;
  /**
   * Column names, when "website" and "printavo" would be a lie.
   *
   * The line-item check compares two figures that are BOTH Printavo's — the
   * sum of its lines against its own total — and printing "website $52.32"
   * over the sum invented a website figure that does not exist. A report
   * whose labels are wrong is worse than one that omits them.
   */
  columns?: [string, string];
  /** One sentence: what it means, or what to do about it. */
  detail: string;
};

export type ReconcileInput = {
  quoteNumber: string;
  /** Printavo's own visual id, for the human to open the record. */
  visualId?: string;
  /** Printavo's total. Proven field. */
  printavoTotal?: number;
  /** Printavo's outstanding balance. Proven field — what a link would bill. */
  amountOutstanding?: number;
  /** The customer note, which carries the app's own figure. */
  customerNote?: string;
  /**
   * Set when the record itself could not be read — the detail query came
   * back empty. Every field above is then absent because nothing arrived,
   * NOT because the order lacks it, and each check says so rather than
   * guessing at a cause it cannot see.
   */
  detailUnavailable?: string;
  /** Line items as read back. Shape unproven — absent is UNKNOWN, not a fail. */
  lineItems?: Array<{
    description?: string;
    itemNumber?: string;
    price?: number;
    quantity?: number;
    sizes?: Array<{ size?: string; count?: number }>;
  }>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * The app's own total, out of the note it wrote.
 *
 * Deliberately anchored to the "WEBSITE ESTIMATE" heading rather than
 * grabbing the first dollar figure in the note: the note also carries a
 * per-unit price, a shipping line and, on some orders, add-on prices. A
 * loose match would compare the wrong number and pass.
 */
export function quotedTotalFromNote(note: string): number | null {
  const section = note.split("WEBSITE ESTIMATE")[1];
  if (!section) return null;

  const match = section.match(/Total:\s*\$([\d,]+\.\d{2})/);
  if (!match) return null;

  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** The shipping figure the app recorded, when it recorded one. */
export function quotedShippingFromNote(note: string): number | null {
  const section = note.split("WEBSITE ESTIMATE")[1];
  if (!section) return null;

  if (/Shipping:\s*Free/i.test(section)) return 0;

  const match = section.match(/Shipping:\s*\$([\d,]+\.\d{2})/);
  if (!match) return null;

  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * Every garment row's size counts, or the absence of them.
 *
 * The check that #134 exists for: before it, a cart filed every garment row
 * under one `size_other` bucket even when the customer had typed S/M/L/XL.
 * Nothing but reading the invoice back can prove that is fixed.
 */
function sizeRowsCheck(input: ReconcileInput): ReconcileCheck {
  const rows = input.lineItems;

  if (!rows) {
    return {
      name: "Size rows",
      status: "unknown",
      detail: input.detailUnavailable
        ? "The record was not read at all — see the Total line above."
        : "No line items came back — see the line-item check for what to do.",
    };
  }

  const apparel = rows.filter((row) =>
    String(row.itemNumber || "").startsWith("GORILLA-APPAREL")
  );

  if (apparel.length === 0) {
    return {
      name: "Size rows",
      status: "ok",
      detail: "No garment rows on this order — nothing to size.",
    };
  }

  const bucketed = apparel.filter(
    (row) =>
      (row.sizes || []).length === 1 && row.sizes?.[0]?.size === "size_other"
  );

  if (bucketed.length === apparel.length) {
    return {
      name: "Size rows",
      status: "unknown",
      columns: ["garment rows", "filed as"],
      quoted: `${apparel.length}`,
      billed: "all size_other",
      detail:
        "Every garment row is one 'other' bucket. That is CORRECT when the " +
        "customer entered no sizes, and the bug #134 fixed when they did — " +
        "check the shop email for a size breakdown before calling it either.",
    };
  }

  return {
    name: "Size rows",
    status: "ok",
    columns: ["garment rows", "with real sizes"],
    quoted: `${apparel.length}`,
    billed: `${apparel.length - bucketed.length}`,
    detail: "Garment rows are filed under the sizes the customer entered.",
  };
}

/** Do the line items add up to what Printavo says the order is worth? */
function lineSumCheck(input: ReconcileInput): ReconcileCheck {
  const rows = input.lineItems;

  if (!rows || rows.length === 0) {
    return {
      name: "Line items add up",
      status: "unknown",
      detail: input.detailUnavailable
        ? "The record was not read at all — see the Total line above."
        : "Printavo returned no line items for this order. Either the read " +
          "query's shape is wrong (it has never been proven — see " +
          "fetchQuoteForReconciliation) or the order really has none. Run " +
          "with --raw and settle it once.",
    };
  }

  const sum = round2(
    rows.reduce(
      (total, row) => total + Number(row.price || 0) * Number(row.quantity || 0),
      0
    )
  );

  if (input.printavoTotal === undefined) {
    return {
      name: "Line items add up",
      status: "unknown",
      columns: ["line sum", "order total"],
      quoted: money(sum),
      detail: "No Printavo total to compare the line items against.",
    };
  }

  /**
   * Tax and shipping live outside the line items, so the sum is expected to
   * be AT OR BELOW the total, never above it. Above means a line is being
   * counted that the total does not include — the one direction that would
   * bill a customer for something nobody quoted.
   */
  if (sum > input.printavoTotal + 0.005) {
    return {
      name: "Line items add up",
      status: "mismatch",
      columns: ["line sum", "order total"],
      quoted: money(sum),
      billed: money(input.printavoTotal),
      detail:
        "The line items sum to MORE than the order total. A line is being " +
        "counted that the total does not include.",
    };
  }

  return {
    name: "Line items add up",
    status: "ok",
    columns: ["line sum", "order total"],
    quoted: money(sum),
    billed: money(input.printavoTotal),
    detail:
      "Line items sit at or under the total, as they should — tax and " +
      "shipping are added on top of them.",
  };
}

/**
 * The whole comparison, as a list of checks.
 *
 * Ordered by what it costs to get wrong: the total first, because that is
 * the figure a customer's card is charged.
 */
export function reconcileQuote(input: ReconcileInput): {
  checks: ReconcileCheck[];
  /** True when nothing MISMATCHED. Unknowns do not fail the run. */
  ok: boolean;
  /** True when something could not be checked at all. */
  incomplete: boolean;
} {
  const checks: ReconcileCheck[] = [];

  const note = input.customerNote || "";
  const quotedTotal = note ? quotedTotalFromNote(note) : null;

  // ── The headline ────────────────────────────────────────────────────────
  if (quotedTotal === null || input.printavoTotal === undefined) {
    checks.push({
      name: "Total",
      status: "unknown",
      quoted: quotedTotal === null ? undefined : money(quotedTotal),
      billed:
        input.printavoTotal === undefined
          ? undefined
          : money(input.printavoTotal),
      detail: input.detailUnavailable
        ? input.detailUnavailable
        : quotedTotal === null
        ? "The Printavo customer note carries no 'WEBSITE ESTIMATE / Total:' " +
          "line. Orders created before that note existed will not have one; " +
          "a recent order that does not is worth looking at."
        : "Printavo returned no total for this order.",
    });
  } else {
    const delta = round2(input.printavoTotal - quotedTotal);

    checks.push({
      name: "Total",
      status: delta === 0 ? "ok" : "mismatch",
      quoted: money(quotedTotal),
      billed: money(input.printavoTotal),
      detail:
        delta === 0
          ? "The invoice matches the website quote to the cent."
          : `Printavo is ${money(Math.abs(delta))} ${
              delta > 0 ? "ABOVE" : "BELOW"
            } the quote. This is the figure the customer's card is charged.`,
    });
  }

  // ── What a payment link would actually take ─────────────────────────────
  if (input.amountOutstanding !== undefined && quotedTotal !== null) {
    const delta = round2(input.amountOutstanding - quotedTotal);
    const settled = input.amountOutstanding === 0;

    checks.push({
      name: "Outstanding",
      status: settled || delta === 0 ? "ok" : "mismatch",
      quoted: money(quotedTotal),
      billed: money(input.amountOutstanding),
      detail: settled
        ? "Nothing outstanding — this order has been paid or zeroed."
        : delta === 0
        ? "A payment link raised now would ask for exactly the quoted figure."
        : `A payment link raised now would ask for ${money(
            input.amountOutstanding
          )}, not ${money(quotedTotal)}. createPaymentRequest bills this ` +
          "field, so this is what the customer would be charged.",
    });
  }

  // ── Shipping, when the app recorded one ─────────────────────────────────
  const quotedShipping = note ? quotedShippingFromNote(note) : null;

  if (quotedShipping !== null && input.lineItems) {
    const shippingRow = input.lineItems.find(
      (row) => String(row.itemNumber || "") === "GORILLA-SHIPPING"
    );
    const billedShipping = shippingRow
      ? round2(Number(shippingRow.price || 0) * Number(shippingRow.quantity || 1))
      : 0;

    checks.push({
      name: "Shipping",
      status: billedShipping === quotedShipping ? "ok" : "mismatch",
      quoted: money(quotedShipping),
      billed: money(billedShipping),
      detail:
        billedShipping === quotedShipping
          ? "Delivery is billed at the figure the website quoted."
          : "The shipping line does not match what the website charged for it.",
    });
  }

  checks.push(lineSumCheck(input));
  checks.push(sizeRowsCheck(input));

  return {
    checks,
    ok: !checks.some((check) => check.status === "mismatch"),
    incomplete: checks.some((check) => check.status === "unknown"),
  };
}

/** The report, as the terminal should print it. */
export function formatReconcileReport(
  input: ReconcileInput,
  result: ReturnType<typeof reconcileQuote>
): string {
  const mark = (status: ReconcileStatus) =>
    status === "ok" ? "PASS" : status === "mismatch" ? "FAIL" : "????";

  const lines: string[] = [
    "",
    `RECONCILIATION — ${input.quoteNumber}${
      input.visualId ? ` (Printavo #${input.visualId})` : ""
    }`,
    "",
  ];

  for (const check of result.checks) {
    lines.push(`${mark(check.status)}  ${check.name}`);

    if (check.quoted !== undefined || check.billed !== undefined) {
      const [left, right] = check.columns ?? ["website", "printavo"];

      lines.push(
        `        ${left} ${check.quoted ?? "—"}    ${right} ${
          check.billed ?? "—"
        }`
      );
    }

    lines.push(`        ${check.detail}`);
    lines.push("");
  }

  /**
   * "No mismatches" is true of a run that checked nothing, and reads as a
   * near-pass. It is not one: a blackout proves nothing at all, and the
   * reconciliation is still owed. Said separately so the two cannot be
   * mistaken for each other at a glance.
   *
   * Keyed off the record being unread, NOT off every check being unknown.
   * Those are different: an order predating the WEBSITE ESTIMATE note has
   * no check that can land either, and it was still genuinely read — the
   * total came back. Calling that a blackout would be the same species of
   * lie this whole change is fixing.
   */
  const nothingChecked = Boolean(input.detailUnavailable);

  lines.push(
    result.ok
      ? nothingChecked
        ? "NOTHING WAS CHECKED — this order is still unreconciled. Read the ???? lines."
        : result.incomplete
        ? "No mismatches — but something could not be checked. Read the ???? lines."
        : "Everything checked matches."
      : "MISMATCH. Do not ship another billed-figure change until this is understood."
  );

  // The rule from AGENTS.md, restated where it is about to be acted on.
  lines.push("");
  lines.push(
    "Test quotes: never pay one, and void it in Printavo when you are done."
  );
  lines.push("");

  return lines.join("\n");
}
