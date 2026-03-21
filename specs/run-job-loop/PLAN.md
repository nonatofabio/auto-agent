# Plan: Run-Job Optimization Loop

> **Status:** Complete
> **Created:** 2026-03-21

---

## Acceptance Criteria Reference

For traceability, the spec's ACs are numbered here:

1. `npm run run-job -- --id <job-id>` starts the optimization loop
2. Script exits with error if job folder doesn't exist
3. If baseline (`000-baseline`) doesn't exist, runs it automatically
4. Each iteration creates a hypothesis folder with random 6-char hex ID
5. Each iteration copies `REPORT-TEMPLATE.md` as `REPORT.md` into the hypothesis folder
6. Each iteration creates a git branch `<job-id>-hyp-<id>` from current branch
7. Claude Code spawned with system prompt injecting: JOB.md, MEMORY.md, baseline REPORT.md, hypothesis ID, REPORT.md path
8. System prompt mandates Claude Code update MEMORY.md before finishing
9. Claude Code fills all REPORT.md sections including `**Decision: CONTINUE**` or `**Decision: ROLLBACK**`
10. Orchestrator parses Recommendation from REPORT.md after Claude exits
11. CONTINUE: record current branch as new "best", proceed from it
12. ROLLBACK: checkout previous "best" branch before next iteration
13. `--max-iterations <n>` CLI arg (default: 5)
14. Each hypothesis recorded in SQLite with status updated to `accepted`/`rejected`
15. NDJSON streaming to stdout (same as baseline script)
16. Summary printed after each iteration: hypothesis ID, decision, accuracy

---

## Approach

Create a new script `scripts/run-job.ts` following the same patterns as `scripts/run-baseline-evals.ts` (CLI parsing, JOB.md parsing, git helper, Claude Code spawn, NDJSON streaming). The script has two phases:

**Phase 1 — Setup**: Parse CLI args (`--id`, `--max-iterations`), load JOB.md, resolve target repo, read baseline REPORT.md and MEMORY.md. If `000-baseline` doesn't exist, shell out to `run-baseline-evals.ts` via `execFileSync("node", ["scripts/run-baseline-evals.ts", "--id", jobId])` and wait for it to finish.

**Phase 2 — Loop**: Run up to `maxIterations` iterations. Each iteration: generate a 6-char hex ID via `crypto.randomBytes(3).toString("hex")`, create hypothesis folder + SQLite row via `createHypothesis`, copy REPORT-TEMPLATE.md, create a git branch, spawn Claude Code with the hypothesis system prompt, stream output, wait for exit. Then read REPORT.md, regex-parse `**Decision: CONTINUE**` or `**Decision: ROLLBACK**`, update the SQLite hypothesis status, and either advance the "best branch" pointer or checkout the previous best. Print a per-iteration summary line.

The system prompt for Claude Code uses EARS syntax with a VERIFY checklist (matching the prompt-engineering skill). It injects: JOB.md contents, MEMORY.md contents, baseline REPORT.md contents, hypothesis ID, and the REPORT.md path. The VERIFY checklist includes mandatory MEMORY.md update.

---

## Trade-offs

- **Spawning baseline as a child process vs. extracting shared logic into a util**: Chose spawning `run-baseline-evals.ts` as a subprocess. Extracting shared logic would be cleaner but requires refactoring the baseline script. Spawning keeps both scripts independent and avoids a refactor that isn't in scope.

- **Wrapping Claude Code spawn in a Promise vs. sequential await with callbacks**: Chose wrapping in a Promise so the loop can `await` each iteration cleanly. The baseline script uses raw callbacks (`on("close")`), but a loop needs sequential control flow.

---

## Tasks

- [x] **Task 1: Create `scripts/run-job.ts` with CLI parsing and job loading** **(AC 1, 2, 13)**. Parse `--id` (required) and `--max-iterations` (optional, default 5) via `parseArgs`. Load JOB.md, parse target repo path and branch (same regex as baseline script). Validate job folder exists. **Done when:** `npm run run-job -- --id my-job` parses args and prints the loaded job config, exits with error if folder missing.

- [x] **Task 2: Add `run-job` script to `package.json`** **(AC 1)**. Add `"run-job": "node scripts/run-job.ts"` to the scripts section. **Done when:** `npm run run-job -- --id my-job` invokes the script.

- [x] **Task 3: Auto-run baseline if `000-baseline` doesn't exist** **(AC 3)**. Check for `jobs/<id>/hypotheses/000-baseline/` directory. If missing, run `execFileSync("node", ["scripts/run-baseline-evals.ts", "--id", jobId], { cwd: projectRoot, stdio: "inherit" })`. **Done when:** running `run-job` on a job without a baseline creates the `000-baseline` folder and REPORT.md before entering the loop.

- [x] **Task 4: Read baseline REPORT.md and MEMORY.md for injection** **(AC 7)**. After baseline exists, read `jobs/<id>/hypotheses/000-baseline/REPORT.md` and `jobs/<id>/MEMORY.md` into strings. These are injected into the system prompt each iteration. Re-read MEMORY.md at the start of each iteration (since Claude updates it). **Done when:** both files are read and available as template variables.

- [x] **Task 5: Implement the iteration loop with hypothesis creation** **(AC 4, 5, 6, 14)**. Loop from 0 to `maxIterations - 1`. Each iteration: generate `crypto.randomBytes(3).toString("hex")` as the hypothesis ID, call `createHypothesis({ jobDir, id, statement: "pending", branchName })`, copy REPORT-TEMPLATE.md to hypothesis folder as REPORT.md, create git branch `<jobId>-hyp-<id>` from current HEAD. **Done when:** each iteration creates a hypothesis folder with REPORT.md and a new git branch.

- [x] **Task 6: Build the Claude Code system prompt** **(AC 7, 8, 9)**. Construct an EARS-syntax prompt with: context (target repo, hypothesis ID, branch, REPORT.md path), injected JOB.md, injected MEMORY.md, injected baseline REPORT.md, rules (analyze failures, implement fix, run evals, fill REPORT.md, update MEMORY.md), and a VERIFY checklist (REPORT.md filled, MEMORY.md updated, project builds, `**Decision:**` line present). Use the prompt-engineering skill to optimize this prompt. **Done when:** the system prompt string is constructed with all injected content and follows EARS + VERIFY format.

- [x] **Task 7: Spawn Claude Code and stream output, wrapped in a Promise** **(AC 15)**. Extract the spawn + NDJSON streaming pattern from `run-baseline-evals.ts` into a function `runClaude(systemPrompt, userPrompt, targetRepoPath, jobDir): Promise<number>` that resolves with the exit code. The loop `await`s this. **Done when:** Claude Code is spawned, NDJSON streams to stdout, and the Promise resolves with exit code.

- [x] **Task 8: Parse decision from REPORT.md after Claude exits** **(AC 10)**. Read `hypotheses/<id>/REPORT.md`, regex match `/\*\*Decision:\s*(CONTINUE|ROLLBACK)\*\*/`. If no match or Claude exited non-zero, default to ROLLBACK. **Done when:** decision is parsed as `"CONTINUE"` or `"ROLLBACK"` string.

- [x] **Task 9: Handle CONTINUE — advance best branch** **(AC 11, 14)**. If CONTINUE: update SQLite hypothesis status to `accepted` (and `completed_at`). Set `bestBranch = currentHypBranch`. **Done when:** after a CONTINUE, the next iteration's git branch is created from the accepted hypothesis branch.

- [x] **Task 10: Handle ROLLBACK — revert to previous best** **(AC 12, 14)**. If ROLLBACK: `git checkout <bestBranch>` in target repo. Update SQLite hypothesis status to `rejected` (and `completed_at`). **Done when:** after a ROLLBACK, the target repo is on the previous best branch and the next iteration branches from there.

- [x] **Task 11: Print per-iteration summary** **(AC 16)**. After each decision, print: `[iteration N/max] Hypothesis <id>: <DECISION>`. Optionally parse accuracy from REPORT.md metrics table and include it. **Done when:** each iteration prints a one-line summary with hypothesis ID, decision, and accuracy if available.

---

## Technical Notes

### Files to change

| File | Change |
|------|--------|
| `scripts/run-job.ts` _(new)_ | Main loop script — CLI parsing, baseline auto-run, iteration loop, Claude Code spawn, decision parsing, branch management |
| `package.json` | Add `"run-job": "node scripts/run-job.ts"` to scripts |

### Key references

- CLI parsing pattern: `scripts/run-baseline-evals.ts#L8-L13` — `parseArgs` with `--id`
- JOB.md parsing (path + branch regex): `scripts/run-baseline-evals.ts#L34-L35`
- Git helper function: `scripts/run-baseline-evals.ts#L59-L64` — `execFileSync("git", args, { cwd, encoding: "utf-8" })`
- Claude Code spawn pattern: `scripts/run-baseline-evals.ts#L135-L154`
- NDJSON stream handler: `scripts/run-baseline-evals.ts#L157-L176`
- Hypothesis creation: `utils/create-hypothesis.ts#createHypothesis`
- SQLite schema: `scripts/create-job.ts#L47-L87` — `hypotheses` table has `status`, `completed_at`, `reasoning` columns
- Report template: `templates/REPORT-TEMPLATE.md`
- Decision format in template: `**Decision: CONTINUE**` or `**Decision: ROLLBACK**`

### SQLite updates needed

```sql
-- After CONTINUE:
UPDATE hypotheses SET status = 'accepted', completed_at = datetime('now') WHERE id = ?
-- After ROLLBACK:
UPDATE hypotheses SET status = 'rejected', completed_at = datetime('now') WHERE id = ?
```

### Notes

- MEMORY.md must be re-read at the **start of each iteration**, not just once — Claude Code updates it during each run, so subsequent iterations get the accumulated learnings.
- The baseline REPORT.md is read once and stays constant across all iterations (it's the fixed reference point).
- The `runClaude` Promise wrapper is the only structural departure from the baseline script pattern. The baseline uses raw `on("close")` callbacks, but the loop requires `await`.
- The `--add-dir jobDir` flag already gives Claude Code read/write access to MEMORY.md (it lives in the job dir). No extra flag needed.
- `crypto.randomBytes(3).toString("hex")` produces lowercase hex (a-f, 0-9). This satisfies the "6-char alphanumeric" requirement from the spec.
