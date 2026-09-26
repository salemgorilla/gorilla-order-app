import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BILLED_FIGURE_RULES,
  buildDebtReport,
  changedCodeLines,
  classifyCommit,
  flowForPath,
  formatDebtReport,
  lastCoveredPr,
  parseCoveredPrs,
  parseOwedRows,
  prNumberFromSubject,
} from "../lib/reconciliation-debt";

function commit(overrides: Partial<Parameters<typeof classifyCommit>[0]> = {}) {
  return {
    sha: "abc1234",
    subject: "Something (#200)",
    date: "2026-09-25",
    files: ["lib/tax.ts"],
    ...overrides,
  };
}

test("the money path is recognised, and ordinary files are not", () => {
  assert.equal(flowForPath("lib/tax.ts"), "all flows");
  assert.equal(flowForPath("lib/auto-bill.ts"), "all flows");
  assert.equal(flowForPath("lib/sticker-repricing.ts"), "stickers");
  assert.equal(flowForPath("lib/signs-pricing-config.ts"), "signs");
  assert.equal(flowForPath("lib/apparel-cart-lines.ts"), "apparel");

  // Genuinely off the money path. QuoteConfirmation.tsx used to be here and
  // is not any more — it is the screen that states the figure to the
  // customer, and it has shown the wrong one twice.
  assert.equal(flowForPath("lib/email.ts"), null);
  assert.equal(flowForPath("components/Header.tsx"), null);
  assert.equal(flowForPath("README.md"), null);
});

test("a v2/-prefixed path — the shape git log prints — is recognised too", () => {
  // git log --name-only prints repo-root-relative paths. A rule set that only
  // matched the bare path would have flagged nothing, from a working script.
  assert.equal(flowForPath("v2/lib/tax.ts"), "all flows");
  assert.equal(flowForPath("v2/lib/signs-pricing.ts"), "signs");
});

test("a named flow file beats the generic *pricing* catch-all", () => {
  // Rule order carries this. Reversed, every signs and apparel rate change
  // would land in "all flows" and no flow would ever be told to go and
  // reconcile its own order.
  assert.equal(flowForPath("lib/signs-pricing.ts"), "signs");
  assert.equal(flowForPath("lib/apparel-pricing.ts"), "apparel");
  assert.equal(flowForPath("lib/paper-pricing-config.ts"), "signs");
});

test("PR numbers come off a squash-merge subject, and only off the end", () => {
  assert.equal(prNumberFromSubject("A $45 order minimum (#158)"), 158);
  assert.equal(prNumberFromSubject("Fix #158 in the note text"), null);
  assert.equal(prNumberFromSubject("No number at all"), null);
});

test("a commit touching nothing billed is not in the report", () => {
  assert.equal(classifyCommit(commit({ files: ["lib/email.ts", "README.md"] })), null);
});

test("a commit is filed under every flow it touches", () => {
  const classified = classifyCommit(
    commit({ files: ["lib/sticker-repricing.ts", "lib/signs-pricing.ts", "lib/tax.ts"] })
  );
  assert.ok(classified);
  assert.deepEqual([...classified.flows], ["stickers", "signs", "all flows"]);
});

test("the Covers column is read, and the Result column's invoice numbers are not", () => {
  // The bug this guards: the Result column carries "#102567" (a Printavo
  // invoice) and "Request #10568". Read as PR references they put the anchor
  // a hundred thousand PRs into the future, and the script reports a debt of
  // zero — which is indistinguishable from good news and is the one wrong
  // answer this must never give.
  const table = [
    "## Reconciled",
    "",
    "| Quote | Date | Flow | Covers | Result |",
    "|---|---|---|---|---|",
    "| GS-1 | 2026-09-10 | stickers | #108 #129 | matched — Printavo invoice #102567 collected $55.60 |",
    "| GS-2 | 2026-09-12 | stickers | **#149 #151** | matched — Request #10568 asked for $87.81 |",
    "",
    "## Live right now",
    "| not | a | reconciled | #99999 | row |",
  ].join("\n");

  assert.deepEqual(parseCoveredPrs(table), [108, 129, 149, 151]);
  assert.equal(lastCoveredPr(table), 151);
});

test("the real HANDOFF.md parses, and its anchor is a plausible PR number", () => {
  // Pinning the parser to the live document: a table reformat that silently
  // stops matching would otherwise read as "no debt".
  const handoff = readFileSync(new URL("../HANDOFF.md", import.meta.url), "utf8");
  const anchor = lastCoveredPr(handoff);

  assert.ok(anchor !== null, "no #NNN found in the Reconciled table");
  assert.ok(anchor > 100 && anchor < 100_000, `implausible anchor #${anchor}`);
});

test("changed lines exclude diff headers and comments", () => {
  const diff = [
    "--- a/lib/printavo.ts",
    "+++ b/lib/printavo.ts",
    "@@ -1,2 +1,3 @@",
    "+ * It cannot read an order, a customer, a price or a total.",
    "+// price is not touched here",
    "+  const amountOutstanding = total;",
    "-  const old = 1;",
  ].join("\n");

  assert.deepEqual(changedCodeLines(diff), [
    "const amountOutstanding = total;",
    "const old = 1;",
  ]);
});

test("REGRESSION: the two commits this script used to miss, on real history", () => {
  /**
   * Both found by an adversarial review, not by this file, and both are
   * false NEGATIVES — the failure that matters. A billed-figure commit the
   * script misses never reaches a row, and the table drifts exactly the way
   * this script exists to stop.
   *
   *   #186  a keyword contentTest on lib/printavo.ts dropped it. Its whole
   *         diff there is a classification bail — `includes("sticker")`,
   *         `return false` — containing none of the keywords, and its own
   *         header says it fixed "$99.00 priced, $84.00 invoiced".
   *   #187  every rule was anchored ^lib/, and it touches
   *         app/api/quote/route.ts and features/QuoteConfirmation.tsx.
   *
   * Driven off real `git show --name-only` output rather than a fixture:
   * a fixture would have been written from the same misunderstanding that
   * produced the bug.
   */
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  }).trim();

  for (const [sha, why] of [
    ["213922f", "#186 — billing moved by classification, not arithmetic"],
    ["46ee6dd", "#187 — the money path outside lib/"],
  ] as const) {
    const subject = execFileSync("git", ["log", "--format=%s", "-1", sha], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    const files = execFileSync("git", ["show", "--format=", "--name-only", sha], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    assert.ok(files.length > 0, `${sha} listed no files — history not deep enough?`);
    assert.ok(
      classifyCommit({ sha, subject, date: "", files }) !== null,
      `${sha} is not flagged as a billed-figure commit — ${why}`
    );
  }
});

test("a row written by the health check cannot break the anchor", () => {
  /**
   * The scheduled production health check appends rows to this table and
   * pushes to `main`. Two of the three shapes it might plausibly write used
   * to be hazards:
   *
   *   - an `**owed**` row with no PR to cite — it reports on a DEPLOYMENT,
   *     not a code change — turned CI red on the assertion above.
   *   - a Printavo quote or invoice number in the COVERS column becomes the
   *     anchor, finds no matching commit, and the script reports a shallow
   *     clone. To anyone skimming, that reads as "no debt".
   *
   * The second is the dangerous one, and it is the same class as the bug
   * this file already guards in the Result column — just arriving through a
   * writer that did not exist when that guard was written.
   */
  const table = [
    "## Reconciled",
    "| Quote | Date | Flow | Covers | Result |",
    "|---|---|---|---|---|",
    "| _(none yet)_ | | stickers | #158 | **owed** \u2014 a real PR |",
    "| GS-1 | 2026-09-26 | stickers | (scheduled health check) | \u2705 **matched** \u2014 Printavo #109432 |",
    "| _(none yet)_ | | signs | #109432 | **owed** \u2014 an invoice number in the wrong column |",
  ].join("\n");

  assert.equal(
    lastCoveredPr(table),
    158,
    "a Printavo number in the Covers column became the anchor"
  );

  const owed = parseOwedRows(table);
  assert.equal(owed.length, 2, "the matched health-check row was counted as owed");
  for (const row of owed) {
    assert.ok(row.covers.length > 0, `${row.flow} says nothing about what it covers`);
  }
});

test("the money path reaches outside lib/", () => {
  // The whole of finding 4 in one assertion: an ^lib/-only rule set cannot
  // see the route that assembles the priced order or the screen that states
  // the figure to the customer.
  for (const path of [
    "app/api/quote/route.ts",
    "app/api/discount-code/route.ts",
    "app/api/payment-request/route.ts",
    "features/QuoteConfirmation.tsx",
    "features/QuoteReviewCard.tsx",
    "lib/order-flow.ts",
    "lib/rush.ts",
    "lib/addons.ts",
  ]) {
    assert.ok(flowForPath(path) !== null, `${path} is not on the money path`);
  }
});

test("no rule carries a contentTest any more", () => {
  // The mechanism is kept for the record; using it again on a file whose
  // billing changes can be classification-only reintroduces the #186 miss.
  // If a future rule needs one, it needs a reason in writing first.
  for (const rule of BILLED_FIGURE_RULES) {
    assert.equal(
      rule.contentTest,
      undefined,
      `${rule.test} sets a contentTest — see the field's note before adding one`
    );
  }
});

test("printavo.ts counts whatever changed in it", () => {
  /**
   * It used to count only when the changed lines matched a keyword list.
   * That list dropped #186, whose whole diff there is a classification bail
   * — see the REGRESSION test above. `lib/printavo.ts` is the line-item
   * builder; a change to it warrants ten seconds of triage, and ten seconds
   * beats a commit that silently short-bills a customer.
   */
  const billing = classifyCommit(
    commit({
      files: ["lib/printavo.ts"],
      diffs: { "lib/printavo.ts": "+++ b/lib/printavo.ts\n+  price: money(0),\n" },
    })
  );
  assert.ok(billing, "a changed line-item price must count");

  const classificationOnly = classifyCommit(
    commit({
      files: ["lib/printavo.ts"],
      diffs: {
        "lib/printavo.ts":
          '+++ b/lib/printavo.ts\n+  if (str(product.type).toLowerCase().includes("sticker")) {\n+    return false;\n+  }\n',
      },
    })
  );
  assert.ok(
    classificationOnly,
    "#186's exact diff must count — no keyword in it, and it moved $15 a quote"
  );
});

test("a missing or empty diff counts the file rather than clearing it", () => {
  // The first run of this script ran `git show` from v2/ with repo-root
  // paths, got an empty diff for every file, and dropped four real
  // billed-figure commits. A lookup that matched nothing must never be the
  // quiet answer, so "could not tell" resolves toward flagging.
  const noDiffs = classifyCommit(commit({ files: ["lib/printavo.ts"] }));
  assert.ok(noDiffs, "no diff supplied must still count");

  const otherFileOnly = classifyCommit(
    commit({ files: ["lib/printavo.ts"], diffs: { "lib/tax.ts": "+ nothing" } })
  );
  assert.ok(otherFileOnly, "a diff for a different file must not clear this one");
});

test("the report groups by flow and offers one pasteable row per flow", () => {
  const report = buildDebtReport({
    anchorPr: 158,
    anchorSha: "47ff968",
    commits: [
      commit({ sha: "aaa", subject: "Rigid signs: +$4/sqft (#161)", files: ["lib/signs-pricing-config.ts"] }),
      commit({ sha: "bbb", subject: "Ceiling (#189)", files: ["lib/tax.ts"] }),
      commit({ sha: "ccc", subject: "Copy tweak (#190)", files: ["README.md"] }),
    ],
  });

  assert.equal(report.commits.length, 2, "the README commit must not be debt");
  assert.deepEqual(report.byFlow.map((group) => group.flow), ["signs", "all flows"]);

  const text = formatDebtReport(report);
  assert.match(text, /\| _\(none yet\)_ \| \| signs \| #161 \| \*\*owed\*\*/);
  assert.match(text, /\| _\(none yet\)_ \| \| all flows \| #189 \| \*\*owed\*\*/);
  assert.doesNotMatch(text, /#190/);
});

test("a table with nothing left to record and nothing owed says both", () => {
  const text = formatDebtReport(
    buildDebtReport({ anchorPr: 158, anchorSha: "47ff968", commits: [], owedRows: [] })
  );
  assert.match(text, /every one has reached a row/);
  assert.match(text, /genuinely current/);
  assert.doesNotMatch(text, /Rows to paste/);
});

test("recording a row does not read as reconciling it", () => {
  // The trap this closes: pasting the punch list moves the anchor forward,
  // so the very next run finds no unrecorded commits. Without the owed-rows
  // half, that prints as "current" while every row is still owed an invoice
  // — the script would have manufactured exactly the false comfort it was
  // written to remove.
  const text = formatDebtReport(
    buildDebtReport({
      anchorPr: 189,
      anchorSha: "b33ede3",
      commits: [],
      owedRows: [{ flow: "signs", covers: "#160 #161" }],
    })
  );
  assert.match(text, /STILL UNRECONCILED: 1 row/);
  assert.match(text, /signs\s+#160 #161/);
  assert.match(text, /Only a Printavo invoice clears it/);
  assert.doesNotMatch(text, /genuinely current/);
});

test("owed rows are read from the Result column, matched rows are not", () => {
  const table = [
    "## Reconciled",
    "| Quote | Date | Flow | Covers | Result |",
    "|---|---|---|---|---|",
    "| GS-1 | 2026-09-10 | stickers | #108 | \u2705 **matched** \u2014 to the cent |",
    "| _(none yet)_ | | signs | #160 #161 | **owed** \u2014 Dibond at $15/sqft |",
    "| _(none yet)_ | | apparel | #98 | **owed** \u2014 one catalogue garment |",
  ].join("\n");

  assert.deepEqual(parseOwedRows(table), [
    { flow: "signs", covers: "#160 #161" },
    { flow: "apparel", covers: "#98" },
  ]);
});

test("the real HANDOFF.md still has owed rows, and they say what they cover", () => {
  /**
   * An owed row must name what it covers. It does NOT have to name a PR.
   *
   * This asserted `/#\d+/` and would have turned CI red on `main` the first
   * time the scheduled production health check appended a row — which it
   * pushes directly. A run reports on a DEPLOYMENT, not a code change, so it
   * legitimately has a quote number or "scheduled health check" in that
   * column and no PR at all. Caught by simulating the row before the first
   * run, not by the first run failing.
   *
   * The real requirement was always "an owed row is not blank" — a row that
   * says nothing about what it covers cannot be acted on by anybody.
   */
  const handoff = readFileSync(new URL("../HANDOFF.md", import.meta.url), "utf8");
  const owed = parseOwedRows(handoff);

  assert.ok(owed.length > 0, "the table claims nothing is owed — verify that is true");
  for (const row of owed) {
    assert.notEqual(
      row.covers,
      "(unstated)",
      `the owed row for ${row.flow} has an empty Covers column`
    );
    assert.ok(
      row.covers.length > 0,
      `the owed row for ${row.flow} says nothing about what it covers`
    );
  }
});

test("no anchor is reported as a broken table, not as zero debt", () => {
  const text = formatDebtReport(
    buildDebtReport({ anchorPr: null, anchorSha: null, commits: [] })
  );
  assert.match(text, /no anchor to walk from/);
  assert.doesNotMatch(text, /table is current/i);
});

test("every rule's path pattern matches a file that exists today", () => {
  // The failure this repo has been bitten by: a scripted check whose pattern
  // matches nothing, passing quietly forever. A rule pointed at a file that
  // has been renamed is exactly that.
  const tracked = execFileSync("git", ["ls-files", "lib", "app", "features", "components"], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim().replace(/^v2\//, ""))
    .filter(Boolean);

  for (const rule of BILLED_FIGURE_RULES) {
    assert.ok(
      tracked.some((path) => rule.test.test(path)),
      `no tracked file matches ${rule.test} — renamed out from under the rule?`
    );
  }
});

test("the script itself runs, and exits 0 even when debt exists", () => {
  // Exercised end to end because the two bugs it has had so far were both in
  // the git plumbing, where no unit test was looking.
  const output = execFileSync("npx", ["tsx", "scripts/reconciliation-debt.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.match(output, /RECONCILIATION DEBT/);
  assert.match(output, /Newest PR covered by a row: #\d+ \([0-9a-f]{7,}\)/);
  // The end-to-end run must reach the owed-rows half. When the git plumbing
  // broke, everything above this line still printed.
  assert.match(output, /STILL UNRECONCILED|genuinely current/);
});
