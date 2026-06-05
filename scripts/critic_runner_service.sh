#!/bin/zsh
# ShowX Critic runner — invoked by LaunchAgent every 4 min.
# Reviews tasks in status=done independently of Forge reasoning.

set -euo pipefail

REPO="/Users/machintoshhd/Daniel-local/showX"
cd "$REPO"

mkdir -p docs/agent_exchange/logs

LOG="docs/agent_exchange/logs/critic_runner_service.log"

{
  echo "======================================================================"
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') ShowX Critic runner tick"

  ENABLED=$(/usr/bin/python3 -c "import json; print(json.load(open('docs/agent_exchange/claude_runner_scope.json'))['enabled'])" 2>/dev/null || echo "False")
  if [ "$ENABLED" != "True" ]; then
    echo "Scope disabled — skipping Critic spawn."
    exit 0
  fi

  # Check if there are any tasks in status=done awaiting review
  DONE_COUNT=$(/usr/bin/python3 -c "
import json
state = json.load(open('docs/agent_exchange/state.json'))
scope = json.load(open('docs/agent_exchange/claude_runner_scope.json'))['allowed_task_ids']
n = sum(1 for t in state['tasks'] if t['status'] == 'done' and t['id'] in scope)
print(n)
" 2>/dev/null || echo "0")

  if [ "$DONE_COUNT" = "0" ]; then
    echo "No done tasks awaiting review — skipping Critic spawn."
    exit 0
  fi

  echo "Tasks awaiting review: $DONE_COUNT"
  echo "Spawning Critic (Opus)..."

  /usr/bin/python3 scripts/_run_with_timeout.py 1200 \
    /Users/machintoshhd/.local/bin/claude --model claude-opus-4-7 \
    --print \
    --permission-mode acceptEdits \
    --add-dir /Users/machintoshhd/Daniel-local/bridgeX \
    --add-dir /Users/machintoshhd/Daniel-local/eventx \
    --add-dir /Users/machintoshhd/Daniel-local/xlab-strategy \
    "$(awk '/^## CRITIC/{f=1;next} f && /^---$/{exit} f' docs/agent_exchange/STARTING_PROMPTS.md)" \
    || echo "Critic subprocess exited with code $?"

  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') Critic tick done"
} >> "$LOG" 2>&1
