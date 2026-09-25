/**
 * npm run reconcile:debt
 *
 * Prints every billed-figure commit that has landed since the newest row in
 * HANDOFF.md's `## Reconciled` table, grouped by flow, with the rows to paste
 * into that table underneath.
 *
 *   npm run reconcile:debt            # report, exit 0 always
 *   npm run reconcile:debt -- --check # exit 1 when debt exists (not used in CI)
 *
 * ── IT EXITS 0 ────────────────────────────────────────────────────────────
 * By design, and CI calls it without `--check`. The remedy for a reported
 * debt is placing a real order and reading a real invoice; a gate nobody can
 * satisfy from a PR branch gets bypassed, and a bypassed gate teaches the
 * next session the table is optional. `--check` exists for a human who wants
 * a non-zero exit locally, and for nothing else.
 *
 * Reads the repo and nothing else: no network, no credentials. See
 * lib/reconciliation-debt.ts for which paths count and why.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BILLED_FIGURE_RULES,
  buildDebtReport,
  formatDebtReport,
  lastCoveredPr,
  normalizePath,
  parseOwedRows,
  type CommitInput,
} from "../lib/reconciliation-debt";

const here = dirname(fileURLToPath(import.meta.url));
const v2Root = join(here, "..");

/**
 * Every git command runs from the REPO ROOT, not from `v2/`.
 *
 * `git log --name-only` prints paths relative to the repo root (`v2/lib/…`)
 * whatever directory it was run from, but a `git show -- <path>` pathspec is
 * relative to the CWD. Run from `v2/`, the two disagree and every per-file
 * diff comes back empty — which read as "this commit changed no billing
 * lines" and dropped four real billed-figure commits from the first run of
 * this script. A lookup that matches nothing must never be the quiet answer.
 */
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: v2Root,
  encoding: "utf8",
}).trim();

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

/** The squash-merge commit for `(#nnn)`, or null when history does not reach it. */
function findPrCommit(pr: number): string | null {
  // --fixed-strings: the subject is literal text, and a PR number is not a
  // regex the way a grep pattern would read it.
  const found = git(
    "log",
    "--format=%h",
    "--fixed-strings",
    `--grep=(#${pr})`,
    "-1"
  );
  return found || null;
}

/** Does this path's rule need the diff read before it counts? */
function needsDiff(path: string): boolean {
  const normalized = normalizePath(path);
  const rule = BILLED_FIGURE_RULES.find((candidate) => candidate.test.test(normalized));
  return Boolean(rule?.contentTest);
}

/**
 * The diff for one file in one commit.
 *
 * `--unified=0` because only the changed lines are being tested: context
 * lines are unchanged by definition, and including them would let a commit
 * that merely sits NEAR a price line read as one that moved it.
 */
function diffForFile(sha: string, path: string): string | undefined {
  const diff = execFileSync(
    "git",
    ["show", "--format=", "--unified=0", sha, "--", path],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );

  // git listed this file as changed by this commit, so an empty diff means
  // the pathspec missed, not that nothing changed. Undefined, so the file
  // counts rather than being cleared by a failed lookup.
  return diff.trim() ? diff : undefined;
}

function commitsSince(sha: string): CommitInput[] {
  // %x01 STARTS each record and %x00 separates its fields. The record mark
  // leads rather than trails because --name-only prints the file list AFTER
  // the format line: a trailing mark would split each commit's header away
  // from its own files and onto the next commit's.
  //
  // A commit subject can hold anything a person typed — tabs, pipes, newlines
  // — but not a NUL, which is why the field separator is one.
  const raw = git(
    "log",
    "--format=%x01%h%x00%ad%x00%s",
    "--date=short",
    "--name-only",
    `${sha}..HEAD`
  );

  if (!raw) return [];

  return raw
    .split("\x01")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [header, ...fileLines] = block.split("\n");
      const [commitSha, date, subject] = header.split("\x00");
      const files = fileLines.map((line) => line.trim()).filter(Boolean);

      const diffs: Record<string, string> = {};
      for (const file of files.filter(needsDiff)) {
        const diff = diffForFile(commitSha, file);
        if (diff !== undefined) diffs[normalizePath(file)] = diff;
      }

      return { sha: commitSha, date, subject, files, diffs };
    });
}

function main() {
  const strict = process.argv.slice(2).includes("--check");

  const handoff = readFileSync(join(v2Root, "HANDOFF.md"), "utf8");
  const anchorPr = lastCoveredPr(handoff);

  if (anchorPr === null) {
    console.log(
      formatDebtReport(
        buildDebtReport({ anchorPr: null, anchorSha: null, commits: [], owedRows: [] })
      )
    );
    process.exit(strict ? 1 : 0);
  }

  const anchorSha = findPrCommit(anchorPr);

  if (!anchorSha) {
    // A shallow clone — CI checks out with depth 1 unless told otherwise.
    // Saying so beats reporting a debt of zero, which is what a silent
    // failure here would look like and is indistinguishable from good news.
    console.log("RECONCILIATION DEBT");
    console.log("===================");
    console.log("");
    console.log(
      `HANDOFF.md's newest covered PR is #${anchorPr}, and no commit in this ` +
        "checkout's history mentions it."
    );
    console.log(
      "Most likely a shallow clone: fetch more history (actions/checkout " +
        "with fetch-depth: 0) and run again."
    );
    process.exit(strict ? 1 : 0);
  }

  const report = buildDebtReport({
    anchorPr,
    anchorSha,
    commits: commitsSince(anchorSha),
    owedRows: parseOwedRows(handoff),
  });

  console.log(formatDebtReport(report));

  process.exit(strict && report.commits.length > 0 ? 1 : 0);
}

main();
