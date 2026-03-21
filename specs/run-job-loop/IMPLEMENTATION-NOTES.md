# Implementation Notes: Run-Job Optimization Loop

> **Date:** 2026-03-21

---

## Summary

Implemented `scripts/run-job.ts` — the main optimization loop that iteratively improves a target agent. The script auto-runs baseline if missing, then loops up to N iterations, each spawning Claude Code to analyze failures, implement fixes, run evals, and report. The orchestrator handles branching (CONTINUE advances, ROLLBACK reverts) and SQLite status updates. Added `run-job` script to package.json.

---

## Judgment Calls

- **Baseline branch checkout before loop**: Added a safety check that ensures the target repo is on the baseline branch before the loop starts. The plan didn't mention this explicitly but it's necessary — if the user ran the script before and stopped mid-way, the repo might be on an orphaned hypothesis branch.

- **`execFileSync` for baseline with full script path**: Used `join(projectRoot, "scripts", "run-baseline-evals.ts")` as the argument to node rather than relying on npm scripts, since `execFileSync` is more direct and avoids npm overhead.

---

## Sanity Checks

| Check | Result | Notes |
|-------|--------|-------|
| TypeScript parse (`node --check`) | Pass | No syntax errors |

---

## Remaining Work

- No `specs/CONSTITUTION.md` found — sanity checks beyond syntax parsing were not automated. Run manually if needed.
