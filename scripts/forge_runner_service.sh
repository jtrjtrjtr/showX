#!/bin/zsh
# ShowX Forge runner — invoked by LaunchAgent every 4 min.
# Spawns a Claude Code subprocess in Forge role, scoped to allowed task IDs.

set -euo pipefail

REPO="/Users/machintoshhd/Daniel-local/showX"
cd "$REPO"

mkdir -p docs/agent_exchange/logs

LOG="docs/agent_exchange/logs/forge_runner_service.log"

{
  echo "======================================================================"
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') ShowX Forge runner tick"

  # Quick scope check — exit early if disabled
  ENABLED=$(/usr/bin/python3 -c "import json; print(json.load(open('docs/agent_exchange/claude_runner_scope.json'))['enabled'])" 2>/dev/null || echo "False")
  if [ "$ENABLED" != "True" ]; then
    echo "Scope disabled — skipping Forge spawn."
    exit 0
  fi

  ALLOWED=$(/usr/bin/python3 -c "import json; print(','.join(json.load(open('docs/agent_exchange/claude_runner_scope.json'))['allowed_task_ids']))" 2>/dev/null || echo "")
  if [ -z "$ALLOWED" ]; then
    echo "No allowed task IDs — skipping Forge spawn."
    exit 0
  fi

  echo "Allowed IDs: $ALLOWED"
  echo "Spawning Forge (Sonnet)..."

  # 1200s (20 min) timeout per attempt.
  # NO --add-dir flags by default — they cause Claude to index sibling repos at startup,
  # which 2x Forge cycles 2026-06-05T01:38Z and 02:02Z both timed out trying. Forge can
  # request specific files from sibling repos via Read tool on absolute paths if needed.
  /usr/bin/python3 scripts/_run_with_timeout.py 1200 \
    /Users/machintoshhd/.local/bin/claude --model claude-sonnet-4-6 \
    --print \
    --permission-mode acceptEdits \
    "$(cat docs/agent_exchange/STARTING_PROMPTS.md | sed -n '/^## FORGE/,/^---/p')" \
    || echo "Forge subprocess exited with code $? (may be timeout, normal completion, or scope-empty)"

  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') Forge tick done"
} >> "$LOG" 2>&1
