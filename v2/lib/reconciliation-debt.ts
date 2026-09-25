/**
 * Which billed-figure changes have shipped since the last row in HANDOFF.md's
 * `## Reconciled` table — computed, not remembered.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * AGENTS.md: a change touching pricing or checkout ends with one real order
 * reconciled against the Printavo invoice, and no PR that changes a billed
 * figure merges until the previous one has a row in that table. The rule is
 * judgement, not a hook, and judgement drifts: by 25 Sep the table's newest
 * row covered #158 and `main` was thirty commits past it. Nobody decided to
 * skip anything — the debt was simply never visible in one place, so each
 * session added its change to a pile it could not see.
 *
 * This makes the pile countable. It does NOT reconcile anything and cannot:
 * only a real Printavo invoice can do that, and only a human can place the
 * order. It answers the narrower question the table needs answered first —
 * *which* orders are worth placing, and for which flow.
 *
 * ── WHY IT IS A WARNING AND NEVER A BLOCKER ───────────────────────────────
 * The remedy for a debt it reports is "go and sell something and check the
 * invoice", which no CI run can do and no contributor can do at 2am. A gate
 * that cannot be satisfied gets bypassed, and a bypassed gate teaches the
 * next session that this table is optional. So it prints, and it exits 0.
 *
 * The matching is deliberately path-based rather than diff-based. A commit
 * that only reflows a comment in `lib/pricing.ts` is flagged and costs
 * someone ten seconds to dismiss; a commit that moves a number in a file
 * nobody thought to list is missed silently and costs the shop money. The
 * false positive is the cheap error, so the rules err toward it.
 */

/** The four buckets the Reconciled table's `Flow` column uses. */
export type BilledFlow = "stickers" | "signs" | "apparel" | "all flows";

export const BILLED_FLOWS: readonly BilledFlow[] = [
  "stickers",
  "signs",
  "apparel",
  "all flows",
] as const;

type PathRule = {
  /** Matched against the repo-relative path with the `v2/` prefix stripped. */
  test: RegExp;
  flow: BilledFlow;
  /** Printed beside the commit, so a flag explains itself. */
  why: string;
  /**
   * For files that hold billing code AND a lot of other code. When set, the
   * file only counts if the commit's CHANGED, NON-COMMENT lines in it match.
   *
   * Only `lib/printavo.ts` needs this, and it needs it badly: it is the
   * Printavo client as well as the line-item builder, so path-matching alone
   * put ten query-and-tagging commits into the report. A report that is
   * mostly noise gets skimmed, and a skimmed report is the state this script
   * exists to leave behind. Without a diff to test, the file counts — the
   * caller not supplying one must not quietly clear a debt.
   */
  contentTest?: RegExp;
};

/**
 * The money path, file by file, with the reason each one is on the list.
 *
 * Ordered most-specific first: `flowForPath` returns the FIRST match, so
 * `lib/signs-pricing.ts` resolves to signs rather than being swept up by the
 * generic `*pricing*` rule below it.
 */
export const BILLED_FIGURE_RULES: readonly PathRule[] = [
  // ── stickers ──────────────────────────────────────────────────────────
  {
    test: /^lib\/sticker-repricing\.ts$/,
    flow: "stickers",
    why: "decides which submissions are stickers AND reprices them",
  },
  {
    test: /^lib\/sticker-geometry\.ts$/,
    flow: "stickers",
    why: "safe-area factors feed the priced area",
  },
  {
    test: /^lib\/pricing\.ts$/,
    flow: "stickers",
    why: "the sticker price sheet: rates, volume curve, setup fees, minimum",
  },
  // ── signs and banners ─────────────────────────────────────────────────
  {
    test: /^lib\/signs-(pricing|pricing-config|repricing|cart|payload)\.ts$/,
    flow: "signs",
    why: "signs and banner rates, repricing and cart arithmetic",
  },
  {
    test: /^lib\/paper-pricing-config\.ts$/,
    flow: "signs",
    why: "paper stock rates feed the signs price",
  },
  // ── apparel ───────────────────────────────────────────────────────────
  {
    test: /^lib\/apparel-(pricing|pricing-config|cart|cart-lines|per-line|blend)\.ts$/,
    flow: "apparel",
    why: "garment estimate arithmetic and the per-line size rows",
  },
  // ── every flow ────────────────────────────────────────────────────────
  {
    test: /^lib\/tax\.ts$/,
    flow: "all flows",
    why: "the single derivation of what the card is actually charged",
  },
  {
    test: /^lib\/auto-bill\.ts$/,
    flow: "all flows",
    why: "the two auto-bill decisions and the shared ceiling",
  },
  {
    test: /^lib\/(discount|discount-codes|shipping)\.ts$/,
    flow: "all flows",
    why: "comes off, or goes onto, every flow's total",
  },
  {
    test: /^lib\/printavo\.ts$/,
    flow: "all flows",
    why: "writes the line items Printavo bills from — #153 changed billing here without changing a rate",
    contentTest: /lineItems|unitPrice|price|taxed|amount|total|discount|deposit|fee/i,
  },
  // Generic catch-alls LAST, so a named file keeps its own flow.
  {
    test: /^lib\/[^/]*pricing[^/]*\.ts$/,
    flow: "all flows",
    why: "matches lib/*pricing*.ts",
  },
  {
    test: /^lib\/[^/]*-cart[^/]*\.ts$/,
    flow: "all flows",
    why: "matches lib/*-cart*.ts",
  },
];

/** Repo-relative, `v2/`-prefixed or not — both shapes come out of git. */
export function normalizePath(path: string): string {
  return path.replace(/^v2\//, "");
}

/** The flow a changed file implicates, or null when it is not a money path. */
export function flowForPath(path: string): BilledFlow | null {
  const normalized = normalizePath(path);
  const rule = BILLED_FIGURE_RULES.find((candidate) => candidate.test.test(normalized));
  return rule ? rule.flow : null;
}

export function reasonForPath(path: string): string | null {
  const normalized = normalizePath(path);
  const rule = BILLED_FIGURE_RULES.find((candidate) => candidate.test.test(normalized));
  return rule ? rule.why : null;
}

export type CommitInput = {
  sha: string;
  subject: string;
  date: string;
  files: readonly string[];
  /**
   * Per-file unified diff, for the files whose rule carries a `contentTest`.
   * Optional: absent means "could not tell", which counts as a hit.
   */
  diffs?: Readonly<Record<string, string>>;
};

/**
 * The lines a diff actually changed, minus its headers and minus comments.
 *
 * Comments are stripped because a rewording is not a repricing, and #168 —
 * a schema-only probe that touched no billing code — was flagged on the
 * single word "price" inside a sentence explaining that it reads no prices.
 */
export function changedCodeLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line))
    .map((line) => line.slice(1).trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^(\/\/|\/\*|\*)/.test(line));
}

export type BilledCommit = CommitInput & {
  /** The PR number from a squash-merge subject, when there is one. */
  pr: number | null;
  /** Every flow this commit touches. Never empty. */
  flows: readonly BilledFlow[];
  /** The money-path files only, paired with why each is on the list. */
  touched: ReadonlyArray<{ path: string; why: string }>;
};

/** `#158` out of "A $45 order minimum for stickers, as its own line (#158)". */
export function prNumberFromSubject(subject: string): number | null {
  const match = (subject || "").match(/\(#(\d+)\)\s*$/);
  return match ? Number(match[1]) : null;
}

/** Null when the commit touches nothing that can move a billed figure. */
export function classifyCommit(commit: CommitInput): BilledCommit | null {
  const touched: Array<{ path: string; why: string }> = [];
  const flows: BilledFlow[] = [];

  for (const file of commit.files) {
    const normalized = normalizePath(file);
    const rule = BILLED_FIGURE_RULES.find((candidate) => candidate.test.test(normalized));
    if (!rule) continue;

    if (rule.contentTest) {
      const diff = commit.diffs?.[normalized];
      // No diff supplied → keep it. Only a diff we HAVE read and found
      // billing-free may drop a file from the report.
      if (diff !== undefined) {
        const changed = changedCodeLines(diff);
        if (!changed.some((line) => rule.contentTest!.test(line))) continue;
      }
    }

    touched.push({ path: normalized, why: rule.why });
    if (!flows.includes(rule.flow)) flows.push(rule.flow);
  }

  if (touched.length === 0) return null;

  return {
    ...commit,
    pr: prNumberFromSubject(commit.subject),
    // Stable order, so two runs over the same history read identically.
    flows: BILLED_FLOWS.filter((flow) => flows.includes(flow)),
    touched,
  };
}

/**
 * Every `#NNN` in the table's **Covers** column — that column only.
 *
 * The Result column carries Printavo invoice and request numbers (`#102567`,
 * `Request #10568`) that look exactly like PR references and are not. Reading
 * the whole row would have put the anchor 100,000 PRs into the future and
 * reported a debt of zero, which is the one failure mode this must not have.
 */
export function parseCoveredPrs(handoff: string): number[] {
  const lines = handoff.split("\n");
  const start = lines.findIndex((line) => /^##\s+Reconciled\b/.test(line));
  if (start === -1) return [];

  const found = new Set<number>();

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s/.test(line)) break; // next section — the table is over
    if (!line.trimStart().startsWith("|")) continue;

    const cells = line.split("|").map((cell) => cell.trim());
    // ["", Quote, Date, Flow, Covers, Result, ""] — Covers is index 4.
    const covers = cells[4];
    if (!covers || /^-+$/.test(covers)) continue; // separator row

    for (const match of covers.matchAll(/#(\d+)/g)) {
      found.add(Number(match[1]));
    }
  }

  return [...found].sort((a, b) => a - b);
}

/** The highest PR any row claims to cover — the anchor to walk forward from. */
export function lastCoveredPr(handoff: string): number | null {
  const covered = parseCoveredPrs(handoff);
  return covered.length ? covered[covered.length - 1] : null;
}

/**
 * The rows already in the table that are still marked `**owed**`.
 *
 * Two different debts live in this table and only one of them is a git
 * question. RECORDED debt is what the anchor tracks: a commit that has
 * reached a row. RECONCILED debt is what `**owed**` tracks: whether anyone
 * has put that row's figures beside a real Printavo invoice.
 *
 * Pasting the punch list clears the first and not the second, so a report
 * that only knew about the anchor would say "the table is current" the
 * moment the rows were written — while every one of them was still owed an
 * order. That sentence is worth more than the script.
 */
export function parseOwedRows(handoff: string): Array<{ flow: string; covers: string }> {
  const lines = handoff.split("\n");
  const start = lines.findIndex((line) => /^##\s+Reconciled\b/.test(line));
  if (start === -1) return [];

  const owed: Array<{ flow: string; covers: string }> = [];

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s/.test(line)) break;
    if (!line.trimStart().startsWith("|")) continue;

    const cells = line.split("|").map((cell) => cell.trim());
    const [, , , flow, covers, result] = cells;
    if (!result || /^-+$/.test(covers ?? "")) continue;
    if (!/\bowed\b/i.test(result)) continue;

    owed.push({ flow: flow || "(unstated)", covers: covers || "(unstated)" });
  }

  return owed;
}

export type DebtReport = {
  anchorPr: number | null;
  anchorSha: string | null;
  commits: readonly BilledCommit[];
  byFlow: ReadonlyArray<{ flow: BilledFlow; commits: readonly BilledCommit[] }>;
  /** Rows already written but not yet checked against a real invoice. */
  owedRows: ReadonlyArray<{ flow: string; covers: string }>;
};

export function buildDebtReport(input: {
  anchorPr: number | null;
  anchorSha: string | null;
  commits: readonly CommitInput[];
  owedRows?: ReadonlyArray<{ flow: string; covers: string }>;
}): DebtReport {
  const classified = input.commits
    .map(classifyCommit)
    .filter((commit): commit is BilledCommit => commit !== null);

  const byFlow = BILLED_FLOWS.map((flow) => ({
    flow,
    commits: classified.filter((commit) => commit.flows.includes(flow)),
  })).filter((group) => group.commits.length > 0);

  return {
    anchorPr: input.anchorPr,
    anchorSha: input.anchorSha,
    commits: classified,
    byFlow,
    owedRows: input.owedRows ?? [],
  };
}

function prList(commits: readonly BilledCommit[]): string {
  const numbers = commits
    .map((commit) => commit.pr)
    .filter((pr): pr is number => pr !== null);
  return numbers.length ? numbers.map((pr) => `#${pr}`).join(" ") : "(no PR numbers)";
}

/**
 * The report, and beneath it the rows to paste into HANDOFF.md.
 *
 * Pasteable on purpose: the previous attempt at keeping this table current
 * was "add rows by memory", and the rows that got added by memory are the
 * ones the audit found wrong.
 */
export function formatDebtReport(report: DebtReport): string {
  const out: string[] = [];

  out.push("RECONCILIATION DEBT");
  out.push("===================");
  out.push("");

  if (report.anchorPr === null) {
    out.push(
      "No `#NNN` reference found in HANDOFF.md's Reconciled table, so there is"
    );
    out.push("no anchor to walk from. Fix the table, not this script.");
    return out.join("\n");
  }

  out.push(
    `Newest PR covered by a row: #${report.anchorPr}` +
      (report.anchorSha ? ` (${report.anchorSha})` : " — commit not found in history")
  );

  if (report.commits.length === 0) {
    out.push("");
    out.push("No billed-figure commits since — every one has reached a row.");
    out.push(...formatOwedRows(report));
    return out.join("\n");
  }

  out.push(
    `Billed-figure commits since: ${report.commits.length}, across ${report.byFlow.length} flow(s).`
  );
  out.push("");

  for (const group of report.byFlow) {
    out.push(`── ${group.flow} ${"─".repeat(Math.max(0, 66 - group.flow.length))}`);
    for (const commit of group.commits) {
      out.push(`  ${commit.sha}  ${commit.date}  ${commit.subject}`);
      for (const file of commit.touched) {
        out.push(`      ${file.path} — ${file.why}`);
      }
    }
    out.push("");
  }

  out.push("Rows to paste into HANDOFF.md's `## Reconciled` table:");
  out.push("");
  for (const group of report.byFlow) {
    out.push(
      `| _(none yet)_ | | ${group.flow} | ${prList(group.commits)} | **owed** — ` +
        `${group.commits.length} commit(s) since #${report.anchorPr} moved a billed figure for this flow |`
    );
  }
  out.push("");
  out.push(
    "Each row is owed ONE real order, reconciled to the cent: " +
      "npm run reconcile -- GS-XXXXXXXX-XXXXX"
  );
  out.push(...formatOwedRows(report));

  return out.join("\n");
}

function formatOwedRows(report: DebtReport): string[] {
  const out: string[] = [""];

  if (report.owedRows.length === 0) {
    out.push("No row is marked **owed**. This table is genuinely current.");
    return out;
  }

  out.push(
    `STILL UNRECONCILED: ${report.owedRows.length} row(s) in the table are ` +
      "marked **owed** — written down, never checked against a real invoice:"
  );
  for (const row of report.owedRows) {
    out.push(`  ${row.flow.padEnd(10)} ${row.covers}`);
  }
  out.push("");
  out.push(
    "Writing a row records the debt. Only a Printavo invoice clears it."
  );
  return out;
}
