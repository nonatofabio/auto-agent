# Hypothesis Report

## Hypothesis ID
<!-- Unique identifier for this hypothesis -->

## Branch
<!-- Git branch name for this hypothesis -->

## Hypothesis Statement
<!-- What is the problem? What change do you believe will improve the target agent? Why? -->

## Changes Made
<!-- List every file created, modified, or deleted. Include a one-line summary of each change. -->

| File | Action | Summary |
|------|--------|---------|
|      |        |         |

## Metrics

| Metric | Value |
|--------|-------|
| accuracy | — |
| latency_avg_ms | — |
| cost_usd | — |
| total_cases | — |
| passed_cases | — |
| failed_cases | — |

## Failing Cases
<!-- One subsection per failing case with id, input, expected output, actual output.
     If no failing cases, write "No failing cases." -->

## Summary
<!-- What works, what fails, patterns observed. Be specific. -->

## Recommendation
<!-- IMPORTANT: You MUST write exactly one of these two values: CONTINUE or ROLLBACK

- CONTINUE — the changes improved accuracy, OR accuracy dipped slightly (within ~1-2pp) but
  the change is structurally sound and fixes a real issue (e.g., a scorer bug, a correct refusal
  now handled properly). Small regressions caused by non-deterministic model behavior are acceptable
  when the underlying change is clearly correct and moves the system in the right direction.
- ROLLBACK — accuracy regressed meaningfully (more than ~2pp) compared to the previous accepted
  hypothesis, OR the targeted failure class was not fixed, OR the change introduced new failures
  that outweigh any gains. When in doubt, ROLLBACK — it is always safer to revert and try a
  different approach than to let a harmful change compound across iterations.

Compare your accuracy against the PREVIOUS ACCEPTED hypothesis (the most recent CONTINUE), not the baseline.
Write your reasoning first, then the decision on its own line in this exact format:
**Decision: CONTINUE** or **Decision: ROLLBACK**
-->
