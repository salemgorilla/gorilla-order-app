#!/usr/bin/env bash
# .claude/hooks/check-verification-ran.sh
#
# Stop/SubagentStop hook for order-app-builder.
# Blocks the agent from finishing until a fresh gorilla-release-check
# report exists. Exit 2 = "you may not stop yet" (Claude Code re-prompts
# the agent with stderr as feedback). Exit 0 = stop is allowed.
#
# History: this file and the agent that runs it were uploaded through the
# GitHub web UI on 2026-09-18 into `claude/` (no dot), so Claude Code never
# loaded either - the agent's hook path pointed at `.claude/hooks/`, where
# nothing was. Moved and made executable 2026-11-03.

set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
REPORT="$ROOT/.claude/verification/last-check.json"
INPUT="$(cat)"  # hook receives the session JSON on stdin

# --- Deadlock guard -----------------------------------------------------
# stop_hook_active is true if THIS hook already fired once this turn and
# the agent tried to stop again anyway. Don't loop forever - let it stop
# and surface the problem to a human instead of spinning silently.
STOP_HOOK_ACTIVE="$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)"
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  echo "Verification still missing after one retry - stopping to avoid a loop. A human needs to look at this." >&2
  exit 0
fi

# --- Does a report exist at all? ----------------------------------------
if [ ! -f "$REPORT" ]; then
  echo "BLOCKED: no verification report at $REPORT. Run the gorilla-release-check skill and write its result there before finishing." >&2
  exit 2
fi

# --- Is it fresh? -------------------------------------------------------
# Newer than BOTH the newest uncommitted code edit and the newest commit
# touching v2/. Checking only `git diff HEAD` (the original) let an agent
# that committed before stopping pass on a report from before its change.
NEWEST_EDIT="$(cd "$ROOT" && git diff --name-only HEAD -- '*.ts' '*.tsx' '*.js' '*.mjs' 2>/dev/null \
  | while read -r f; do [ -f "$f" ] && stat -c '%Y' "$f"; done | sort -rn | head -1)"
NEWEST_COMMIT="$(cd "$ROOT" && git log -1 --format=%ct -- v2/ 2>/dev/null || true)"
NEWEST="$(printf '%s\n%s\n' "${NEWEST_EDIT:-0}" "${NEWEST_COMMIT:-0}" | sort -rn | head -1)"
REPORT_TIME="$(stat -c '%Y' "$REPORT")"

if [ "${NEWEST:-0}" -gt "$REPORT_TIME" ]; then
  echo "BLOCKED: $REPORT is older than your latest code change. Re-run gorilla-release-check against the current build before finishing." >&2
  exit 2
fi

# --- Did it actually pass? ------------------------------------------------
PASSED="$(jq -r '.passed // false' "$REPORT" 2>/dev/null || echo false)"
if [ "$PASSED" != "true" ]; then
  echo "BLOCKED: last verification report is marked failed/incomplete. Fix the issue and re-verify, or explain to the user why it can't be resolved right now." >&2
  exit 2
fi

exit 0
