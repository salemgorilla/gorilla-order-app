#!/usr/bin/env bash
# .claude/hooks/check-verification-ran.sh
#
# Stop/SubagentStop hook for order-app-builder.
# Blocks the agent from finishing until a fresh gorilla-release-check
# report exists. Exit 2 = "you may not stop yet" (Claude Code re-prompts
# the agent with stderr as feedback). Exit 0 = stop is allowed.

set -euo pipefail

REPORT=".claude/verification/last-check.json"
INPUT="$(cat)"  # hook receives the transcript/session JSON on stdin

# --- Deadlock guard -----------------------------------------------------
# stop_hook_active is true if THIS hook already fired once this turn and
# the agent tried to stop again anyway. Don't loop forever — let it stop
# and surface the problem to a human instead of spinning silently.
STOP_HOOK_ACTIVE="$(echo "$INPUT" | jq -r '.stop_hook_active // false')"
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  echo "Verification still missing after one retry — stopping to avoid a loop. A human needs to look at this." >&2
  exit 0
fi

# --- Does a report exist at all? ----------------------------------------
if [ ! -f "$REPORT" ]; then
  echo "BLOCKED: no verification report at $REPORT. Run the gorilla-release-check skill and write its result there before finishing." >&2
  exit 2
fi

# --- Is it fresh? (newer than the newest edited source file) -----------
NEWEST_SRC="$(git diff --name-only HEAD -- '*.ts' '*.tsx' '*.js' 2>/dev/null | \
  xargs -I{} stat -c '%Y {}' {} 2>/dev/null | sort -rn | head -1 | cut -d' ' -f1 || echo 0)"
REPORT_TIME="$(stat -c '%Y' "$REPORT")"

if [ "${NEWEST_SRC:-0}" -gt "$REPORT_TIME" ]; then
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
