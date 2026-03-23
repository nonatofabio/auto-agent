# Implementation Notes: Job Changelog Report

> **Date:** 2026-03-23

---

## Summary

Added a standalone `generate-changelog` script that computes diffs between the base branch and final hypothesis branch, assembles all hypothesis context (reports, per-hypothesis diffs, git log, MEMORY.md), and invokes Claude Code to produce a `CHANGELOG.md` in the job folder. The prompt instructs Claude to write a concise report with inline code diffs, accuracy progression, and cherry-pick guidance.

---

## Judgment Calls

- **`maxBuffer` for git commands**: Set to 50MB in the `git()` helper. Large target repos with many iterations could produce substantial diffs. The default Node.js `execFileSync` buffer (1MB) would silently truncate. 50MB is generous but safe for this use case.
- **Branch name fallback**: Each hypothesis's branch name is extracted from REPORT.md's `## Branch` section. If parsing fails, falls back to the `{jobId}-hyp-{dirName}` convention. This handles both well-formed reports and edge cases where the report might have been manually edited.
- **Three-dot diff (`...`) for per-hypothesis and full diffs**: Uses `git diff A...B` (three dots) which shows changes on B since it diverged from A. This matches what the user expects — "what did this hypothesis change?" — rather than the symmetric difference.

---

## Sanity Checks

| Check | Result | Notes |
|-------|--------|-------|
| Node syntax check (`--check`) | Pass | Both `generate-changelog.ts` and `prompts.ts` parse cleanly |

---

## Steering

| # | User feedback | Changes made |
|---|---------------|--------------|
|   |               |              |

---

## Remaining Work

- No `specs/CONSTITUTION.md` exists, so full project sanity checks (lint, test, build) were not run. Manual verification recommended.
