# Plan: Job Changelog Report

> **Status:** Complete
> **Created:** 2026-03-23

---

## Approach

Create a new script at `src/scripts/generate-changelog.ts` following the patterns in `create-job.ts` and `run-job.ts`. The script takes `--job <id>` (required) and `--branch <name>` (optional). It parses JOB.md for target repo path and base branch, scans `hypotheses/` for completed hypothesis folders (reusing the `^\d{3}-[a-f0-9]{6}$` pattern from `run-job.ts`), validates all are complete, then computes per-hypothesis diffs and the full diff via `git diff` in the target repo.

All context (diffs, REPORT.md contents, MEMORY.md, git log) is assembled into a single system prompt for `runClaude` from `src/utils/run-claude.ts`. The prompt instructs Claude to produce the CHANGELOG.md content in a strict markdown format. The script captures Claude's output and writes it to `jobs/<jobId>/CHANGELOG.md`.

For the interactive branch confirmation (when `--branch` is omitted), the script uses Node.js built-in `readline` to prompt the user via stdin. A new prompt function `getChangelogSystemPrompt` will be added to `src/utils/prompts.ts` alongside the existing prompt builders.

---

## Trade-offs

- **Single Claude call vs. per-hypothesis subagent calls** — chose single call first. The total context (all REPORTs + diffs + git log + MEMORY.md) will typically fit within Claude's context window for jobs with 5–15 iterations. If a job produces an exceptionally large diff, the script can be extended later to split work. Starting simple avoids premature complexity.
- **Capture Claude stdout vs. let Claude write the file directly** — chose letting Claude write the file via `--add-dir`. This reuses the existing `runClaude` pattern where Claude has filesystem access to the job dir and can write `CHANGELOG.md` directly, just like how hypothesis agents write REPORT.md. No stdout parsing needed.
- **Interactive branch prompt vs. auto-detection only** — chose interactive with `--branch` override. Auto-detecting the "best branch" by replaying decisions is brittle. Asking the user to confirm the current branch (or type one) is simpler and more reliable.

---

## Tasks

- [x] **1. Add `getChangelogSystemPrompt` to `src/utils/prompts.ts`** **(AC 6, 7, 8, 9, 10, 11, 12)**. Define a new exported function that takes the assembled context (full diff, per-hypothesis diffs with REPORT.md data, MEMORY.md, git log, baseline report, job config) and returns a system prompt. The prompt instructs Claude to write a concise `CHANGELOG.md` with: baseline section, per-CONTINUE sections (with inline code diffs), per-ROLLBACK paragraphs, accuracy progression table, and cherry-pick guidance note. **Done when:** function exported, accepts all required params, prompt text references the exact CHANGELOG structure from the spec.

- [x] **2. Create `src/scripts/generate-changelog.ts`** **(AC 1, 2, 3, 4, 5, 13, 14)**. New script with:
  - CLI parsing via `parseArgs` for `--job` (required, string) and `--branch` (optional, string)
  - Load JOB.md → parse target repo path + base branch (same regex as `run-job.ts` lines 64–65)
  - If `--branch` provided, use it; else read current branch from target repo via `git rev-parse --abbrev-ref HEAD`, prompt user via readline for confirmation, accept alternate input on "n"
  - Scan `hypotheses/` for dirs matching `^\d{3}-[a-f0-9]{6}$` plus `000-baseline`, validate each has a REPORT.md with a parseable decision
  - Compute full diff: `git diff <baseBranch>...<finalBranch>` in target repo
  - Compute per-hypothesis diffs: for each hypothesis in order, diff against its parent (baseline for first CONTINUE, previous CONTINUE branch for subsequent ones — branch names follow the `<jobId>-hyp-<hypId>` pattern, readable from REPORT.md "Branch" section)
  - Collect git log: `git log --oneline <baseBranch>..<finalBranch>` in target repo
  - Read all REPORT.md files and MEMORY.md
  - Call `getChangelogSystemPrompt` with all assembled data
  - Call `runClaude` with system prompt, user prompt, target repo cwd, job dir as addDir
  - Exit non-zero on any failure (missing job dir, incomplete hypotheses, Claude failure)

  **Done when:** script runs end-to-end, produces `CHANGELOG.md` in job folder with all sections from the spec.

- [x] **3. Add `generate-changelog` script to `package.json`** **(AC 1)**. Add `"generate-changelog": "node src/scripts/generate-changelog.ts"` to the scripts section. **Done when:** `npm run generate-changelog -- --job <id>` invokes the script.

---

## Technical Notes

### Files to change

| File | Change |
|------|--------|
| `src/utils/prompts.ts` | Add `getChangelogSystemPrompt` function and its params interface |
| `src/scripts/generate-changelog.ts` _(new)_ | Main script: CLI, context assembly, Claude invocation |
| `package.json` | Add `generate-changelog` script entry |

### Key references

- JOB.md parsing (path + branch regex): `src/scripts/run-job.ts` lines 64–76
- Hypothesis dir scanning pattern: `src/scripts/run-job.ts` lines 161–164 (`/^\d{3}-[a-f0-9]{6}$/`)
- Decision parsing: `src/scripts/run-job.ts` lines 142–147 (`parseDecision`, `parseAccuracy`)
- `runClaude` signature: `src/utils/run-claude.ts` line 14 — `runClaude(systemPrompt, userPrompt, cwd, addDir): Promise<number>`
- `assertClaudeInstalled`: `src/utils/run-claude.ts` line 4
- Hypothesis branch naming: `{jobId}-hyp-{hypId}` (e.g., `agent-1-hyp-001-a1b2c3`)
- Baseline branch naming: `{jobId}-baseline`
- REPORT.md branch field can be parsed with: `/## Branch\n(.+)/` to extract the branch name per hypothesis

### Git commands (run in target repo cwd)

```bash
# Current branch
git rev-parse --abbrev-ref HEAD

# Full diff (base to final)
git diff <baseBranch>...<finalBranch>

# Per-hypothesis diff
git diff <parentBranch>...<hypBranch>

# Commit log
git log --oneline <baseBranch>..<finalBranch>
```

### Notes

- The script does NOT need the logger utility — it's a one-shot report generator, not a long-running loop. Simple `console.log` / `console.error` is sufficient.
- `readline` from `node:readline/promises` provides `rl.question()` for interactive stdin prompts — available in Node 22+ without dependencies.
- The per-hypothesis parent branch chain is: baseline → first CONTINUE → second CONTINUE → ... → final. ROLLBACK hypotheses branch off the same parent as the next hypothesis (since the best branch didn't change). The branch name for each hypothesis can be extracted from its REPORT.md `## Branch` section rather than reconstructed.
- Claude writes CHANGELOG.md directly to the job dir (via `--add-dir` giving it access). The user prompt tells Claude the exact output path.

### Planning Observations

- The existing `runClaude` streams stdout events to the terminal, which means the user will see Claude's thinking/tool calls in real-time during changelog generation. This is consistent with how `run-job.ts` works and provides useful progress feedback.
- REPORT.md files contain a `## Branch` section with the hypothesis branch name. This is more reliable than reconstructing branch names from hypothesis folder names, since the format is already established by the hypothesis agent.
