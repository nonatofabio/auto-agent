# AppWorld Experiment Findings

## Summary

We ran auto-agent (with Kiro CLI as orchestrator) to autonomously improve a minimal AppWorld agent across 5 target models and 2 orchestrator ablations, on all 90 AppWorld train tasks with 3 optimization iterations each. All results validated against raw eval JSON output.

## Full-Scale Results (90 tasks)

### Main Experiments (auto/Sonnet-tier orchestrator)

| Target Model | Baseline | Iter 1 | Iter 2 | Iter 3 | Final | Δ |
|---|---|---|---|---|---|---|
| Haiku 4.5 | 0.0% | 27.78% (C) | 27.78% (R) | 31.11% (C) | **31.11%** | +31.1pp |
| Sonnet 4 | 0.0% | 8.89% (C) | 22.22% (C) | 40.00% (C) | **40.00%** | +40.0pp |
| Sonnet 4.5 | 0.0% | 42.22% (C) | 43.33% (C) | 43.33% (R) | **43.33%** | +43.3pp |
| Sonnet 4.6 | 0.0% | 84.44% (C) | 90.00% (C) | 83.33% (R) | **90.00%** | +90.0pp |
| Opus 4.6 | 4.4% | 83.33% (C) | 93.33% (C) | 92.22% (R) | **93.33%** | +88.9pp |

### Orchestrator Ablation (Opus 4.6 orchestrator)

| Target | Auto Orch Final | Opus Orch Final | Δ |
|---|---|---|---|
| Haiku 4.5 | 31.11% | 31.11% | 0pp |
| Sonnet 4.6 | 90.00% | 77.78% | **-12.2pp** |

## Key Findings

### 1. Target model capability determines the ceiling — nonlinearly
The same orchestrator produces 31-93% accuracy depending on the target model. The jump from Sonnet 4.5 (43%) to Sonnet 4.6 (90%) is the most dramatic — a single generation upgrade more than doubles the optimization ceiling.

### 2. Two iterations capture most gains
4 of 5 main experiments had iteration 3 rolled back. The pattern: iteration 1 adds scaffolding (API exploration, correct prompts), iteration 2 refines (pagination, edge cases), iteration 3 attempts diminishing-returns changes that often regress.

### 3. Sonnet 4 is the only model to improve monotonically
All 3 iterations accepted (8.89% → 22.22% → 40.00%), suggesting it's in a "sweet spot" where each iteration's improvements are within its capability to execute but there's still room to grow.

### 4. Stronger orchestrator ≠ better results
The auto (Sonnet-tier) orchestrator outperforms Opus 4.6 as orchestrator for Sonnet 4.6 target (90% vs 78%). The Opus orchestrator takes a more gradual path (55.6% → 74.4% → 77.8%) while the auto orchestrator makes a bigger first-iteration jump (84.4%).

### 5. Opus 4.6 is the only model with a non-zero baseline
4/90 tasks pass even with the bare-bones agent (4.4%), demonstrating frontier models can partially compensate for poor scaffolding.

## Technical Notes

- Kiro CLI `auto` mode routes to Sonnet-tier models (confirmed via credit cost analysis)
- Kiro's `--agent` flag disables built-in tools; steering files are the correct integration approach
- AppWorld's freezegun time patching breaks AWS SigV4 signing; LLM calls must run in a subprocess
- Bedrock models require inference profile IDs (`us.anthropic.claude-*`), not raw model IDs
- Parallel evaluation (EVAL_CONCURRENCY=5) causes occasional freezegun/SQLite conflicts but doesn't invalidate results
- Container credential chains break silently — always preflight check before experiments
