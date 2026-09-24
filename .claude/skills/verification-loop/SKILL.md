---
name: verification-loop
description: "A comprehensive verification system for Claude Code sessions. Use when verifying a Claude Code session's work before claiming it is complete."
license: MIT
---

# Verification Loop Skill

A comprehensive verification system for Claude Code sessions.

> **Adapted for this repo, 2026-09-24.** The commands below are the ones that
> actually work here. Three of the original's phases assumed a project shape
> this repo does not have — a `src/` tree, a coverage-enabled test runner,
> `npm run lint` — and a phase that silently does nothing reads in the report
> as a phase that passed. Structure, name and report format are unchanged.

## When to Use

Invoke this skill:
- After completing a feature or significant code change
- Before creating a PR
- When you want to ensure quality gates pass
- After refactoring

## The rule that outranks every phase

**A check you could not run is not a check that passed.** Say which, and why,
in the report. Sandbox egress, a missing credential, no browser — all of those
are honest answers. "PASS" is not.

Everything in `v2/`. Run from there unless a phase says otherwise.

## Verification Phases

### Phase 1: Build Verification
```bash
cd v2 && npm run build 2>&1 | tail -20
```

If build fails, STOP and fix before continuing.

`AGENTS.md` says this fails in restricted sandboxes on the Google Fonts fetch.
**Check before believing it** — it passed cleanly on 2026-09-24. If it does
fail, confirm the failure is the fonts fetch and not your code, and say which
in the report.

### Phase 2: Type Check
```bash
cd v2 && npx tsc --noEmit 2>&1 | head -30
```

Report all type errors. Fix critical ones before continuing.

### Phase 3: Lint Check
```bash
cd v2 && npx eslint . 2>&1 | grep problems
```

**The baseline is 13 problems, 0 errors.** A different number means this change
moved it — find out which and why before continuing. `grep problems`, not
`tail -1`: the last line is not reliably the summary.

There is no `npm run lint` script in this repo.

### Phase 4: Test Suite
```bash
cd v2 && npx tsx --test tests/*.test.ts 2>&1 | grep -E "^# (tests|pass|fail|skipped|todo)"

# Coverage, when the number is wanted (slower):
cd v2 && npx tsx --test --experimental-test-coverage tests/*.test.ts 2>&1 \
  | grep -E "^# all files"
```

**`tsx`, never `node --test`** — the suite is TypeScript and `node --test`
cannot load it.

Report:
- Total tests: X
- Passed: X
- Failed: X
- **Skipped / todo: X** — these are not passes. A suite that goes green by
  skipping is the failure this skill exists to catch.
- Coverage: X% (was 90.27% line / 91.97% branch on 2026-09-24)

### Phase 5: Security Scan
```bash
cd v2
# Secret-shaped literals
grep -rnE "(sk-[A-Za-z0-9]{12,}|api_key\s*[:=]\s*[\"'][^\"']{8,})" \
  --include="*.ts" --include="*.tsx" app/ lib/ components/ features/ | head -10

# THIS project's credential names, hardcoded
grep -rnE "(PRINTAVO_TOKEN|PRINTAVO_EMAIL|SS_API_KEY|ADMIN_SECRET|KIOSK_PIN|GMAIL_APP_PASSWORD|BLOB_READ_WRITE_TOKEN|NEWSLETTER_SECRET|DROPOFF_SECRET)\s*=\s*[\"'][^\"']+[\"']" \
  --include="*.ts" --include="*.tsx" app/ lib/ components/ features/ | head -10

# Stray debugging in CLIENT code. console.log in app/api/ is deliberate
# server logging; in a component it is something someone forgot.
grep -rn "console\.log" --include="*.ts" --include="*.tsx" components/ features/ | head -10
```

There is no `src/` directory — the original's paths match nothing here, which
is the quietest way for this phase to pass while checking nothing.

**Also ask, of any endpoint the change touches:** does it return more than its
caller needs? `/api/artwork-upload` served every anonymous visitor both store
ids, every `BLOB*` variable name and an operational runbook, while the browser
read one boolean. No secret leaked; it was still wrong.

### Phase 6: Diff Review
```bash
git diff --stat
git diff <base>..HEAD --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Potential edge cases
- **Lowered bars** — tests deleted, `.skip`/`.only` added, assertions loosened
  (exact → approximate, specific → truthy), snapshots regenerated, mocks
  replacing the thing under test, errors swallowed, thresholds relaxed. Any of
  these without a stated reason is a FAIL.

**Review per commit, not across a range.** A line added in one commit and
changed in the next cancels out in a range diff and shows as untouched. That
hid a loosened assertion on 2026-09-24 until it was checked commit by commit.

## Beyond the six phases

The phases above check that the code is sound. They cannot tell you it is
**right**, and on this repo that gap is where the money goes.

- **Verify by running, not by reading.** Every pricing defect this project has
  shipped was caught by a human running the real thing. None were caught by
  reading code.
  ```bash
  cd v2 && (setsid nohup npm run dev -- -p 3005 > /tmp/dev.log 2>&1 &)
  SMOKE_URL=http://localhost:3005 \
    SMOKE_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
    npm run test:e2e
  ```
  Never `pkill -f` to clean up — it matches the agent's own shell. Use a
  different port.

- **Anything touching a billed figure ends with a Printavo reconciliation**,
  not a passing test: `npm run reconcile -- GS-XXXXXXXX-XXXXX`, recorded in
  HANDOFF.md's `## Reconciled` table. See AGENTS.md.

- **Mutation-test every new guard.** A check that has never failed is unproven.
  Reintroduce the bug, confirm that test fails and only that test, revert.

- **Read production, don't wait to be told.** `get_runtime_errors` and
  `get_runtime_logs` name the failing call in one request. Three rounds of
  asking the user when they ran their test were spent before that was tried.

- **For customer-facing changes, hand the claim to a fresh reviewer** that sees
  the output and not the reasoning. On 2026-09-24 that found eight defects in
  work that had passed 2,357 tests, including a public guard validating a
  string the caller never wrote.

## Output Format

After running all phases, produce a verification report:

```
VERIFICATION REPORT
==================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings, baseline 13)
Tests:     [PASS/FAIL] (X/Y passed, Z skipped, C% coverage)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY] for PR

Not checked:
- ...  (required whenever anything could not be run)

Issues to Fix:
1. ...
2. ...
```

## Continuous Mode

For long sessions, run verification every 15 minutes or after major changes:

```markdown
Set a mental checkpoint:
- After completing each function
- After finishing a component
- Before moving to next task

Run: /verification-loop
```

## Integration with Hooks

This skill complements PostToolUse hooks but provides deeper verification.
Hooks catch issues immediately; this skill provides comprehensive review.
CI (`.github/workflows/ci.yml`) enforces phases 1–4 on every PR, and the daily
canary (`canary.yml`) checks production between deploys. Both are backstops for
the session that forgets — not substitutes for running these yourself.
