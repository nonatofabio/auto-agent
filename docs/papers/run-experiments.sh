#!/bin/bash
# Run AppWorld baseline + auto-agent optimization for multiple models
set -e

AGENT_DIR="/Users/fnp/Documents/wd/dev/Velocity/src/memories/src/appworld-agent"
AUTO_AGENT_DIR="/Users/fnp/Documents/wd/dev/Velocity/src/memories/src/auto-agent"
VENV="$AGENT_DIR/.venv/bin/python"
RESULTS_DIR="$AUTO_AGENT_DIR/docs/papers/experiment-results"

mkdir -p "$RESULTS_DIR"

# Models to test
declare -A MODELS
MODELS[claude-3.5-haiku]="anthropic.claude-3-5-haiku-20241022-v1:0"
MODELS[claude-haiku-4.5]="anthropic.claude-haiku-4-5-20251001-v1:0"
MODELS[claude-3.5-sonnet-v2]="anthropic.claude-3-5-sonnet-20241022-v2:0"
MODELS[claude-sonnet-4]="anthropic.claude-sonnet-4-20250514-v1:0"

run_baseline() {
    local name=$1
    local model_id=$2
    echo "=== BASELINE: $name ($model_id) ==="

    cd "$AGENT_DIR"
    git checkout main 2>/dev/null

    APPWORLD_ROOT="$AGENT_DIR" \
    MODEL_ID="$model_id" \
    MAX_TASKS=10 \
    DATASET_NAME=train \
    EXPERIMENT_NAME="baseline-$name" \
    $VENV src/run_eval.py 2>"$RESULTS_DIR/baseline-${name}-stderr.log" \
        > "$RESULTS_DIR/baseline-${name}.json"

    echo "  Done. Results in $RESULTS_DIR/baseline-${name}.json"
    cat "$RESULTS_DIR/baseline-${name}.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Accuracy: {d[\"summary\"][\"accuracy\"]}')"
}

run_optimization() {
    local name=$1
    local model_id=$2
    local job_id="appworld-$name"
    echo "=== OPTIMIZATION: $name ($model_id) ==="

    cd "$AGENT_DIR"
    git checkout main 2>/dev/null
    # Clean up any previous branches for this job
    git branch | grep "$job_id" | xargs -r git branch -D 2>/dev/null || true

    cd "$AUTO_AGENT_DIR"
    # Remove previous job if exists
    rm -rf "jobs/$job_id"

    # Create job
    node src/scripts/create-job.ts --id "$job_id" 2>/dev/null

    # Write JOB.md
    cat > "jobs/$job_id/JOB.md" << JOBEOF
## Objective
Improve accuracy on AppWorld train tasks. The agent currently fails most tasks because it doesn't know correct API signatures and doesn't explore API documentation.

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
| Run evals | \`APPWORLD_ROOT=$AGENT_DIR MODEL_ID=$model_id MAX_TASKS=10 DATASET_NAME=train EXPERIMENT_NAME=eval-$job_id $VENV src/run_eval.py\` | After each build |

## Forbidden Files
- \`src/run_eval.py\`
- \`src/llm_call.py\`
- \`data/\`

## Constraints
- Do not change the MODEL_ID — it is set via environment variable
- Do not change the subprocess LLM calling pattern (call_llm must use llm_call.py via subprocess)
- Do not modify the eval runner or the LLM call script
- The agent runs inside AppWorld's sandbox — code in world.execute() can only use Python stdlib + pendulum
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
Bare-bones ReAct agent with minimal system prompt. Fails because:
1. Doesn't know correct API parameter names (uses email instead of username for login)
2. Doesn't explore API docs before attempting tasks
3. Doesn't know password list format from show_account_passwords()
4. Uses made-up API names instead of real ones

## Golden Dataset Info
10 train tasks from AppWorld: Spotify queries, mutations, multi-app workflows. Difficulty 1-3.

## Priority Hints
- First: fix system prompt with correct API patterns and teach exploration
- Add a first step in solve_task() that explores APIs and gets passwords
- The agent should print intermediate results
- Key APIs: apis.api_docs.search_api_docs(query="..."), apis.supervisor.show_account_passwords(), apis.supervisor.show_profile()
JOBEOF

    # Run optimization
    node src/scripts/run-job.ts --id "$job_id" --max-iterations 3 \
        > "$RESULTS_DIR/optimization-${name}.log" 2>&1

    echo "  Done. Log in $RESULTS_DIR/optimization-${name}.log"

    # Extract final summary
    tail -20 "$RESULTS_DIR/optimization-${name}.log" | sed 's/\x1B\[[0-9;]*m//g' > "$RESULTS_DIR/summary-${name}.txt"
    cat "$RESULTS_DIR/summary-${name}.txt"
}

# Run all baselines first (fast)
echo "========================================"
echo "PHASE 1: BASELINES"
echo "========================================"
for name in "${!MODELS[@]}"; do
    run_baseline "$name" "${MODELS[$name]}"
done

# Run optimizations (slow — ~30min each)
echo ""
echo "========================================"
echo "PHASE 2: OPTIMIZATIONS"
echo "========================================"
for name in "${!MODELS[@]}"; do
    run_optimization "$name" "${MODELS[$name]}"
done

echo ""
echo "========================================"
echo "ALL EXPERIMENTS COMPLETE"
echo "========================================"
echo "Results in: $RESULTS_DIR"
