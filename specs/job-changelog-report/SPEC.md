# Spec: Job Changelog Report

> **Status:** Complete
> **Created:** 2026-03-23
> **Folder:** specs/job-changelog-report

---

## User input

I want a command which after a job run generates the diff between the initial branch (main/master as described in JOB.md) and the final branch with the main hypothesis — the final branch where I have the better metrics, where I didn't do a revert. Once I have this diff, I want to generate via Claude Code with a specialized prompt — that code reads all the hypotheses, reads everything, goes through the git history of all the branches between master and the final hypothesis, and it tells me what changes what parts of the big diff are because of a specific change. So if it changed the system prompt in three places I would like to know what this first change is solving, what the other change is solving, and on what branch it's related. I want a final report which contains all the information I need to understand what fix is fixing what kind of problem. Every hypothesis tries to fix only one specific problem, so I want this tool which takes as input everything generated so far from the target repo and the job folder, and generates a final report with all the code so that I can understand what's needed, what's not needed, where I can keep, and where I'm getting more performance.

I want the actual code diffs inline within a code block. Include cherry-pick guidance, but note that branches build on top of each other so cherry-picking may not work cleanly. For rollback hypotheses, add a short paragraph for each attempt. Feed all available context to Claude — use subagents if needed for context management. This must be a standalone script.

---

## Context

After a job run completes, the developer is left with a final "best branch" containing accumulated changes from all accepted (CONTINUE) hypotheses. The problem: there's no way to understand the cumulative diff as a whole. The developer must manually cross-reference hypothesis branches, REPORT.md files, MEMORY.md, and git history to understand which change solves which problem, what's essential, and what's optional.

This feature generates a `CHANGELOG.md` in the job folder — a single document that breaks down the full diff (base branch → final best branch) into attributed, explained sections. Each code change is linked to the hypothesis that introduced it, the problem it solved, and its accuracy impact. Rolled-back hypotheses are also documented as failed attempts.

The audience is the developer who ran the job and wants to understand, review, and potentially cherry-pick the results.

---

## Non-Goals

- Not a replacement for individual hypothesis REPORT.md files — those remain the source of truth per iteration
- Not an automated cherry-pick tool — guidance is provided but the developer applies changes manually
- Does not re-run evals or validate that the final branch still passes
- Does not modify the target repo or any hypothesis branches
- Does not generate visualizations (the accuracy-chart skill already handles that)

---

## Acceptance Criteria

- Running `npm run generate-changelog -- --job <jobId>` produces a `CHANGELOG.md` file in `jobs/<jobId>/`
- The script accepts an optional `--branch <branchName>` CLI parameter to specify the final best branch directly
- If `--branch` is not provided, the script reads the current checked-out branch in the target repo and prompts the user for confirmation: "The target repo is currently on branch `<branch>`. Use this as the final branch? (y/n)". If the user enters "y", it proceeds; if "n", the user is prompted to input the correct branch name
- The script reads JOB.md to determine the target repo path and base branch
- The script refuses to run if any hypothesis folder is incomplete (has no REPORT.md or no decision parsed) — it prints an error and exits non-zero
- The full diff between base branch and final best branch is computed from the target repo's git history
- Each per-hypothesis diff (what that specific hypothesis changed compared to its parent branch) is computed and included
- The CHANGELOG.md includes a brief baseline section showing starting metrics from `000-baseline/REPORT.md`
- Each accepted hypothesis (CONTINUE) gets a section containing: hypothesis ID, branch name, one-line summary of the problem it solved, accuracy before/after, and the actual code diff in a fenced code block
- Each rejected hypothesis (ROLLBACK) gets a short paragraph: what was attempted, why it failed
- A cumulative accuracy progression table shows how accuracy changed across accepted iterations
- A brief cherry-pick guidance note lists hypothesis branches in order with a caveat that branches build incrementally
- The report is concise — no lengthy narratives or redundant explanations. For deeper details on any hypothesis, the reader refers to the individual REPORT.md files
- The script uses Claude Code (via the existing `runClaude` utility) with a specialized analysis prompt to generate the content
- The script works as a standalone command — it does not require `run-job.ts` to be running
- The script exits with a non-zero code if the job folder doesn't exist or if Claude Code invocation fails

---

## Constraints

- Must use the existing `runClaude` utility from `src/utils/run-claude.ts` for Claude Code invocation
- Must follow the existing script pattern (see `src/scripts/run-job.ts` and `src/scripts/create-job.ts`)
- All git operations target the **target repo** (path from JOB.md), not the orchestrator repo
- Read-only operation: must not modify the target repo, hypothesis folders, or any existing files (only creates `CHANGELOG.md`)
- Must handle large diffs gracefully — if the total context (all REPORTs + full diff + MEMORY.md + git log) is too large for a single Claude call, use subagents to process sections independently and combine results
- The script must be added to `package.json` scripts as `generate-changelog`

---

## Technical Notes

- The "final best branch" is provided via `--branch` CLI param or resolved interactively by checking the target repo's current branch and asking the user to confirm. This avoids brittle replay logic and gives the user explicit control
- Per-hypothesis diffs can be computed with `git diff <parent-branch>..<hypothesis-branch>` in the target repo. The parent of hypothesis N is the bestBranch at the time it was created (base branch for the first, previous CONTINUE branch for subsequent ones)
- The full diff is `git diff <base-branch>..<final-best-branch>`
- Git log between base and final: `git log <base-branch>..<final-best-branch>` shows the commit history
- The specialized Claude prompt should receive: the full diff, per-hypothesis diffs, all REPORT.md contents, MEMORY.md, and the git log — then produce structured markdown matching the CHANGELOG format
- For context management: if total input exceeds reasonable limits, the script can split the work — e.g., have Claude analyze each hypothesis independently (subagent per hypothesis), then a final Claude call to synthesize the executive summary and recommendations from the per-hypothesis analyses
- REPORT.md decision parsing regex already exists in run-job.ts: `\*\*Decision:\s*(CONTINUE|ROLLBACK)\*\*` and accuracy: `\|\s*accuracy\s*\|\s*(.+?)\s*\|`

---

## Open Questions

| # | Question | Affects | Owner | Status |
|---|----------|---------|-------|--------|
| 1 | Should the CHANGELOG.md include a section for the baseline (000-baseline) hypothesis, or start from hypothesis 001? | Report structure | Alfonso | Resolved — include a brief baseline section |
| 2 | If a job is still running (incomplete hypotheses exist), should the script refuse to run or generate a partial report? | Script behavior | Alfonso | Resolved — refuse to run |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Standalone script, not integrated into run-job.ts | Decouples report generation from the optimization loop — can be re-run, iterated on, or run after manual inspection |
| Include inline code diffs in fenced blocks | Developer needs to see actual code changes without switching to a terminal or git tool |
| Short paragraph per ROLLBACK (not full section) | Rolled-back changes aren't in the final diff — enough to document what was tried and why it failed, but not worth equal weight |
| Cherry-pick guidance with caveat | Branches are incremental (each builds on previous best), so cherry-picking is unreliable — but listing the branches in order still helps the developer understand the change history |
| Use subagents for context management | Total context (all REPORTs + diffs + git log) may exceed single-call limits; splitting per-hypothesis analysis into subagents then synthesizing is a natural fit |
| Final branch via CLI param or interactive prompt, not replay | Replaying hypothesis decisions to reconstruct bestBranch is brittle and duplicates run-job.ts logic. Instead, let the user specify the branch directly or confirm the target repo's current branch — simpler, more reliable, and gives the user explicit control |
| Include brief baseline section | Gives the reader a starting point to understand the delta — shows where accuracy began |
| Refuse to run on incomplete jobs | Partial reports would be confusing and unreliable — the developer should wait for the job to finish |
| Concise output, defer to individual REPORTs for detail | The changelog should be a quick-read summary with diffs, not a novel. Individual REPORT.md files already have the deep analysis |
| Dropped standalone "recommendations" section | Adds verbosity without clear value — the per-hypothesis sections already show impact, and the developer can judge what to keep from the diffs |
