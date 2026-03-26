# Experiment Reference Sheet

## Provenance

All experiments ran on `dev-dsk-fnp-2b-59786e27.us-west-2.amazon.com` inside Docker container `auto-agent-v2` (image `auto-agent-experiments`), from 2026-03-25 21:46 UTC to 2026-03-26 13:15 UTC (~15.5 hours).

- **Orchestrator**: Kiro CLI 1.28.1 (auto mode = Sonnet-tier, or explicit Opus 4.6)
- **Target agent**: AppWorld agent (`src/agent.py`) using Bedrock models via `llm_call.py` subprocess
- **Benchmark**: AppWorld train split, 90 tasks, `EVAL_CONCURRENCY=5`
- **Iterations**: 3 per experiment
- **AWS Account**: 224331632558 (Bedrock us-east-1)

## Validation

All baselines verified with `real_work` metric (cases where >1 test passed, proving real LLM calls):
- Haiku 4.5: 24 cases with real work
- Sonnet 4: 23 cases
- Sonnet 4.5: 21 cases
- Sonnet 4.6: 18 cases
- Opus 4.6: 27 cases

All CONTINUE iteration accuracies cross-checked against `"passed_cases"` values in raw eval JSON captured in optimization logs.

## File Locations

### Baseline eval outputs (JSON)
| File | Content |
|------|---------|
| `experiment-results-full/baseline-haiku-4.5-auto.json` | Haiku 4.5 baseline: 0/90 |
| `experiment-results-full/baseline-sonnet-4-auto.json` | Sonnet 4 baseline: 0/90 |
| `experiment-results-full/baseline-sonnet-4.5-auto.json` | Sonnet 4.5 baseline: 0/90 |
| `experiment-results-full/baseline-sonnet-4.6-auto.json` | Sonnet 4.6 baseline: 0/90 |
| `experiment-results-full/baseline-opus-4.6-auto.json` | Opus 4.6 baseline: 4/90 |
| `experiment-results-full/baseline-haiku-4.5-opus.json` | Haiku 4.5 (Opus orch) baseline: 0/90 |
| `experiment-results-full/baseline-sonnet-4.6-opus.json` | Sonnet 4.6 (Opus orch) baseline: 0/90 |

### Optimization logs (contain full kiro agent output, eval results, report diffs)
| File | Content |
|------|---------|
| `experiment-results-full/optimization-haiku-4.5-auto.log` | 3 iters → 31.11% |
| `experiment-results-full/optimization-sonnet-4-auto.log` | 3 iters → 40.00% |
| `experiment-results-full/optimization-sonnet-4.5-auto.log` | 3 iters → 43.33% |
| `experiment-results-full/optimization-sonnet-4.6-auto.log` | 3 iters → 90.00% |
| `experiment-results-full/optimization-opus-4.6-auto.log` | 3 iters → 93.33% |
| `experiment-results-full/optimization-haiku-4.5-opus.log` | 3 iters → 31.11% |
| `experiment-results-full/optimization-sonnet-4.6-opus.log` | 3 iters → 77.78% |

### Validation script
| File | Purpose |
|------|---------|
| `validate_results.py` | Cross-checks baseline JSONs against optimization logs |

## Results Table

### Main experiments (auto/Sonnet-tier orchestrator)

| Target Model | Baseline | Iter 1 | Iter 2 | Iter 3 | Final | Δ |
|---|---|---|---|---|---|---|
| Haiku 4.5 | 0.0% | 27.78% (C) | 27.78% (R) | 31.11% (C) | **31.11%** | +31.11pp |
| Sonnet 4 | 0.0% | 8.89% (C) | 22.22% (C) | 40.00% (C) | **40.00%** | +40.00pp |
| Sonnet 4.5 | 0.0% | 42.22% (C) | 43.33% (C) | 43.33% (R) | **43.33%** | +43.33pp |
| Sonnet 4.6 | 0.0% | 84.44% (C) | 90.00% (C) | 83.33% (R) | **90.00%** | +90.00pp |
| Opus 4.6 | 4.4% | 83.33% (C) | 93.33% (C) | 92.22% (R) | **93.33%** | +88.89pp |

### Orchestrator ablation (Opus 4.6 orchestrator)

| Target | Auto Orch Final | Opus Orch Final | Δ Orch |
|---|---|---|---|
| Haiku 4.5 | 31.11% | 31.11% | 0pp |
| Sonnet 4.6 | 90.00% | 77.78% | -12.22pp |

## Key Observations

1. **Sonnet 4.6 and Opus 4.6 reach >90% from 0%** in just 2 accepted iterations
2. **Sonnet 4 is the only model to improve monotonically** across all 3 iterations (all CONTINUE)
3. **Opus 4.6 is the only model with a non-zero baseline** (4.4%) — it can solve some tasks even without scaffolding
4. **The Opus orchestrator does NOT help Sonnet 4.6** — auto orchestrator reaches 90% vs Opus orchestrator's 77.78%
5. **The Opus orchestrator matches auto for Haiku 4.5** — both reach 31.11%
6. **Iteration 3 frequently regresses** — 4 of 7 experiments had iter 3 rolled back, suggesting diminishing returns
