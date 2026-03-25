#!/bin/bash
# Full-scale AppWorld experiments — run with nohup
# Usage: nohup bash docs/papers/run-full-experiments.sh > /tmp/auto-agent-full-run.log 2>&1 &
#
# Monitor: tail -f /tmp/auto-agent-full-run.log
# Check progress: grep "EXPERIMENT COMPLETE\|EXPERIMENT START\|Final:" /tmp/auto-agent-full-run.log
set -euo pipefail

AGENT_DIR="/Users/fnp/Documents/wd/dev/Velocity/src/memories/src/appworld-agent"
AUTO_AGENT_DIR="/Users/fnp/Documents/wd/dev/Velocity/src/memories/src/auto-agent"
VENV="$AGENT_DIR/.venv/bin/python"
RESULTS_DIR="$AUTO_AGENT_DIR/docs/papers/experiment-results-full"
MAX_TASKS=0  # all 90 train tasks
MAX_ITERATIONS=3

mkdir -p "$RESULTS_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

run_experiment() {
    local name=$1
    local model_id=$2
    local kiro_model=${3:-""}  # empty = auto
    local job_id="full-$name"

    log "EXPERIMENT START: $name (target=$model_id, orchestrator=${kiro_model:-auto})"

    # Reset target repo
    cd "$AGENT_DIR"
    git checkout main 2>/dev/null
    git branch | grep "$job_id" | xargs -r git branch -D 2>/dev/null || true

    # Baseline
    log "  Running baseline..."
    APPWORLD_ROOT="$AGENT_DIR" \
    MODEL_ID="$model_id" \
    MAX_TASKS=$MAX_TASKS \
    DATASET_NAME=train \
    EXPERIMENT_NAME="baseline-$job_id" \
    $VENV src/run_eval.py 2>"$RESULTS_DIR/baseline-${name}-stderr.log" \
        > "$RESULTS_DIR/baseline-${name}.json" || true

    local baseline_acc=$(python3 -c "
import json
try:
    d=json.load(open('$RESULTS_DIR/baseline-${name}.json'))
    print(f'{d[\"summary\"][\"accuracy\"]*100:.1f}%')
except: print('ERROR')
" 2>/dev/null)
    log "  Baseline: $baseline_acc"

    # Create job
    cd "$AUTO_AGENT_DIR"
    rm -rf "jobs/$job_id"
    node src/scripts/create-job.ts --id "$job_id" 2>/dev/null

    cat > "jobs/$job_id/JOB.md" << JOBEOF
## Objective
Improve accuracy on AppWorld train tasks (all 90). The agent currently fails most tasks.

## Target Repository
- **Path**: $AGENT_DIR
- **Branch**: main

## Provider
- **Provider**: kiro

## Metrics
- **Primary metric**: accuracy (maximize)
- **Secondary constraints**: none

## Scripts
| Script | Command | When it runs |
|--------|---------|--------------|
| Install dependencies | \`echo ok\` | Once at job start |
| Build | \`echo ok\` | After each hypothesis |
| Run evals | \`APPWORLD_ROOT=$AGENT_DIR MODEL_ID=$model_id MAX_TASKS=$MAX_TASKS DATASET_NAME=train EXPERIMENT_NAME=eval-$job_id $VENV src/run_eval.py\` | After each build |

## Forbidden Files
- \`src/run_eval.py\`
- \`src/llm_call.py\`
- \`data/\`

## Constraints
- Do not change the MODEL_ID — it is set via environment variable
- Do not change the subprocess LLM calling pattern
- Do not modify the eval runner or the LLM call script
- APIs are called via apis.{app_name}.{api_name}(**params)

## Codebase Overview
- \`src/agent.py\` — main agent: SYSTEM_PROMPT, call_llm(), extract_code(), solve_task(). Primary file to modify.
- \`src/llm_call.py\` — subprocess LLM caller using boto3/Bedrock (FORBIDDEN)
- \`src/run_eval.py\` — eval runner outputting JSON (FORBIDDEN)

## What the Agent Can Do
- Modify the system prompt in src/agent.py
- Change the agent loop logic in solve_task()
- Add helper functions or new files in src/
- Change MAX_STEPS

## Starting State
Bare-bones ReAct agent with minimal system prompt. Fails because it doesn't know correct API parameter names, doesn't explore API docs, uses made-up API names.

## Golden Dataset Info
90 train tasks from AppWorld: Spotify, Amazon, Venmo, Todoist, Gmail, etc. Difficulty 1-3.

## Priority Hints
- First: fix system prompt with correct API patterns and teach exploration
- Add a first step in solve_task() that explores APIs and gets passwords
- Key APIs: apis.api_docs.search_api_docs(query="..."), apis.supervisor.show_account_passwords(), apis.supervisor.show_profile()
- Spotify login: apis.spotify.login(username=email, password=password) returns access_token
- Paginated results: keep calling with page parameter until empty
JOBEOF

    # Run optimization
    log "  Running optimization ($MAX_ITERATIONS iterations)..."
    local env_prefix=""
    if [ -n "$kiro_model" ]; then
        env_prefix="KIRO_MODEL=$kiro_model"
    fi

    eval $env_prefix node src/scripts/run-job.ts --id "$job_id" --max-iterations $MAX_ITERATIONS \
        > "$RESULTS_DIR/optimization-${name}.log" 2>&1 || true

    # Extract results
    log "  Results:"
    sed 's/\x1B\[[0-9;]*m//g' "$RESULTS_DIR/optimization-${name}.log" | grep -E "^\s+[123]\s+0" | head -3 | while read line; do
        log "    $line"
    done
    local total_time=$(sed 's/\x1B\[[0-9;]*m//g' "$RESULTS_DIR/optimization-${name}.log" | grep "Total time" | tail -1 | awk '{print $NF}')
    log "  Total time: ${total_time:-unknown}"
    log "EXPERIMENT COMPLETE: $name"
    echo ""
}

log "=========================================="
log "FULL-SCALE APPWORLD EXPERIMENTS"
log "Tasks: all 90 train, Iterations: $MAX_ITERATIONS"
log "=========================================="
echo ""

# Main experiments: auto orchestrator, varying target
run_experiment "haiku-4.5-auto"    "us.anthropic.claude-haiku-4-5-20251001-v1:0"  ""
run_experiment "sonnet-4-auto"     "us.anthropic.claude-sonnet-4-20250514-v1:0"   ""
run_experiment "sonnet-4.5-auto"   "us.anthropic.claude-sonnet-4-5-20250929-v1:0" ""
run_experiment "sonnet-4.6-auto"   "us.anthropic.claude-sonnet-4-6"               ""
run_experiment "opus-4.6-auto"     "us.anthropic.claude-opus-4-6-v1"              ""

# Ablations: Opus orchestrator
run_experiment "haiku-4.5-opus"    "us.anthropic.claude-haiku-4-5-20251001-v1:0"  "claude-opus-4.6"
run_experiment "sonnet-4.6-opus"   "us.anthropic.claude-sonnet-4-6"               "claude-opus-4.6"

log "=========================================="
log "ALL EXPERIMENTS COMPLETE"
log "Results in: $RESULTS_DIR"
log "=========================================="
