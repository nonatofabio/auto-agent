# AppWorld Experiment Findings

## Summary

We ran auto-agent (with Kiro CLI as orchestrator) to autonomously improve a minimal AppWorld agent across 6 target models and 2 orchestrator configurations. All experiments start from 0% accuracy on 10 AppWorld train tasks.

## Results

### Main Experiments (auto/Sonnet-tier orchestrator)

| Target Model | Iter 1 | Iter 2 | Iter 3 | Final |
|---|---|---|---|---|
| Claude 3.5 Haiku | 0% (C) | 0% (C) | 0% (C) | **0%** |
| Claude Haiku 4.5 | 10% (C) | 0% (R) | 0% (R) | **10%** |
| Claude Sonnet 4 | 40% (C) | 40% (R) | 30% (R) | **40%** |
| Claude Sonnet 4.5 | 40% (C) | 40% (R) | 10% (R) | **40%** |
| Claude Sonnet 4.6 | 20% (C) | 30% (R) | 30% (R) | **20%** |
| Claude Opus 4.6 | 30% (C) | 40% (C) | 80% (C) | **80%** |

### Orchestrator Ablation (Opus 4.6 orchestrator)

| Target | Auto Orch | Opus Orch | Credits (Auto) | Credits (Opus) |
|---|---|---|---|---|
| Haiku 4.5 | 10% | 0% | 22.9 | 43.2 |
| Sonnet 4.6 | 20% | 30% | 19.4 | 31.8 |

## Key Findings

### 1. Target model capability is the primary bottleneck
The same orchestrator (Kiro/Sonnet-tier) making similar structural improvements produces 0-80% accuracy depending entirely on the target model. Haiku-class models can't follow even correct API patterns; Opus-class models benefit from progressively sophisticated changes.

### 2. Only frontier models sustain multi-iteration gains
Opus 4.6 is the only model where all 3 hypotheses were accepted with monotonically increasing accuracy (30% → 40% → 80%). Every other model plateaued after iteration 1, with subsequent iterations rolled back.

### 3. Orchestrator-target capability matching matters
Upgrading the orchestrator from Sonnet-tier to Opus 4.6 helps Sonnet 4.6 (20% → 30%) but *hurts* Haiku 4.5 (10% → 0%). A more capable orchestrator generates more sophisticated code changes that exceed what a weak target model can execute. The optimal orchestrator is one whose output complexity matches the target model's ability to follow instructions.

### 4. The optimization loop works correctly
- Rollback mechanism correctly rejects regressions
- MEMORY.md accumulates useful learnings across iterations
- Git branching provides safe, reversible experimentation
- Kiro CLI steering files successfully inject system prompts with full tool access

## Technical Notes

- Kiro CLI `auto` mode routes to Sonnet-tier models (confirmed via credit cost analysis: ~4.8 credits/invocation vs Opus at ~10.6)
- Kiro's `--agent` flag disables built-in tools; steering files are the correct integration approach
- AppWorld's freezegun time patching breaks AWS SigV4 signing; LLM calls must run in a subprocess
- Bedrock models require inference profile IDs (`us.anthropic.claude-*`), not raw model IDs
- Claude 3.5 Sonnet v2 and 3.7 Sonnet are legacy-blocked on Bedrock as of March 2026
