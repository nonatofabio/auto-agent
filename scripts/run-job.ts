import { parseArgs, styleText } from "node:util";
import { readFile, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createHypothesis } from "../utils/create-hypothesis.ts";
import { runClaude } from "../utils/run-claude.ts";
import { runBaselineEvals } from "./run-baseline-evals.ts";

// --- CLI parsing ---

const { values } = parseArgs({
  options: {
    id: { type: "string", short: "i" },
    "max-iterations": { type: "string", short: "m" },
  },
  strict: true,
});

if (!values.id) {
  console.error(
    styleText("red", "Usage: npm run run-job -- --id <job-id> [--max-iterations <n>]")
  );
  process.exit(1);
}

const jobId = values.id;
const maxIterations = parseInt(values["max-iterations"] ?? "5", 10);
const projectRoot = resolve(import.meta.dirname, "..");
const jobDir = join(projectRoot, "jobs", jobId);

if (!existsSync(jobDir)) {
  console.error(styleText("red", `Error: Job folder not found at ${jobDir}`));
  console.error(`Run: ${styleText("yellow", `npm run create-job -- --id ${jobId}`)}`);
  process.exit(1);
}

// --- Load JOB.md ---

const jobMdPath = join(jobDir, "JOB.md");
const jobMd = await readFile(jobMdPath, "utf-8");

const pathMatch = jobMd.match(/\*\*Path\*\*:\s*(.+)/);
const branchMatch = jobMd.match(/\*\*Branch\*\*:\s*(.+)/);

if (!pathMatch || !branchMatch) {
  console.error(
    styleText("red", "Error: Could not parse Target Repository path or branch from JOB.md")
  );
  process.exit(1);
}

const targetRepoRelative = pathMatch[1].trim();
const baseBranch = branchMatch[1].trim();
const targetRepoPath = resolve(jobDir, targetRepoRelative);

if (!existsSync(targetRepoPath)) {
  console.error(styleText("red", `Error: Target repo not found at ${targetRepoPath}`));
  process.exit(1);
}

// --- Git helper ---

function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: targetRepoPath,
    encoding: "utf-8",
  }).trim();
}

// --- Auto-run baseline if missing ---

const baselineDir = join(jobDir, "hypotheses", "000-baseline");
const baselineBranch = `${jobId}-baseline`;

if (!existsSync(baselineDir)) {
  console.log(styleText("yellow", "Baseline not found. Running baseline evals...\n"));
  await runBaselineEvals({
    jobId,
    jobDir,
    jobMd,
    targetRepoPath,
    baseBranch,
    projectRoot,
  });
  console.log();
}

// --- Read baseline REPORT.md (read once, constant across iterations) ---

const baselineReportPath = join(baselineDir, "REPORT.md");
if (!existsSync(baselineReportPath)) {
  console.error(
    styleText("red", `Error: Baseline REPORT.md not found at ${baselineReportPath}`)
  );
  process.exit(1);
}
const baselineReport = await readFile(baselineReportPath, "utf-8");

// --- Ensure we're on the baseline branch ---

const currentBranch = git("rev-parse", "--abbrev-ref", "HEAD");
if (currentBranch !== baselineBranch) {
  try {
    git("checkout", baselineBranch);
  } catch {
    git("checkout", baseBranch);
  }
}

// --- Helpers ---

function parseDecision(
  reportContent: string
): "CONTINUE" | "ROLLBACK" | null {
  const match = reportContent.match(/\*\*Decision:\s*(CONTINUE|ROLLBACK)\*\*/);
  return (match?.[1] as "CONTINUE" | "ROLLBACK") ?? null;
}

function parseAccuracy(reportContent: string): string {
  const match = reportContent.match(/\|\s*accuracy\s*\|\s*(.+?)\s*\|/);
  return match?.[1]?.trim() ?? "N/A";
}

// --- Main loop ---

let bestBranch = baselineBranch;
const reportTemplatePath = join(projectRoot, "templates", "REPORT-TEMPLATE.md");

console.log(styleText("bold", `Starting optimization loop for job "${jobId}"`));
console.log(`  Max iterations: ${styleText("cyan", String(maxIterations))}`);
console.log(`  Target repo:    ${styleText("cyan", targetRepoPath)}`);
console.log(`  Best branch:    ${styleText("cyan", bestBranch)}`);
console.log();

for (let i = 0; i < maxIterations; i++) {
  const seq = String(i + 1).padStart(3, "0");
  const hexId = randomBytes(3).toString("hex");
  const hypId = `${seq}-${hexId}`;
  const hypBranch = `${jobId}-hyp-${hypId}`;

  console.log(`\n${styleText("cyan", "=".repeat(60))}`);
  console.log(styleText("bold", `[iteration ${i + 1}/${maxIterations}] Starting hypothesis ${hypId}`));
  console.log(`${styleText("cyan", "=".repeat(60))}\n`);

  // Create hypothesis folder
  const hypothesis = await createHypothesis({
    jobDir,
    id: hypId,
    statement: "pending",
    branchName: hypBranch,
  });

  // Copy REPORT template
  await copyFile(reportTemplatePath, join(hypothesis.dir, "REPORT.md"));

  // Create git branch from current best
  git("checkout", bestBranch);
  try {
    git("checkout", "-b", hypBranch);
  } catch {
    git("checkout", hypBranch);
  }

  // Re-read MEMORY.md each iteration
  const memoryMd = await readFile(join(jobDir, "MEMORY.md"), "utf-8");

  // Build system prompt — EARS syntax + VERIFY checklist
  const systemPrompt = `You are an autonomous agent improver. You study a target agent's codebase, understand how it works, identify why evals fail, and implement fixes.

## How to work
1. **Study the codebase first.** Read the agent's source code, understand its architecture, how it processes inputs, what tools it has, how the system prompt is structured, and how to modify it. Check the job configuration below for codebase overview and constraints.
2. **Analyze failures.** Read the baseline report and job memory. Group failing eval cases by root cause — look for classes of errors (e.g., "all arithmetic fails because there's no calculator tool" rather than treating each case individually).
3. **Formulate a hypothesis.** Target one class of failures (or a few related ones). Your hypothesis should be specific and testable: "Adding X will fix cases Y, Z because they all fail for reason W."
4. **Implement the fix.** Make changes in the target repo. You can add tools, modify the system prompt, refactor logic, add dependencies, create helper functions — whatever the job configuration allows. Ensure the project builds before proceeding.
5. **Run the full eval suite exactly once** using the eval command from the job configuration. Compare results to the baseline.
6. **Fill in REPORT.md and update MEMORY.md.** Record the results as-is. Do NOT attempt further refinements.

IMPORTANT: You get ONE shot per iteration. Make your changes, run evals once, then write the report and stop. Do NOT re-edit code and re-run evals trying to improve results within this iteration. If there are regressions or remaining failures, note them in the report — the next iteration will address them. Your job is to make a single, well-reasoned change and report the outcome honestly.

## Context
- Target repository: ${targetRepoPath} (branch: "${hypBranch}")
- Hypothesis ID: ${hypId}
- REPORT.md: ${hypothesis.dir}/REPORT.md (exists from template — update in place)
- MEMORY.md: ${join(jobDir, "MEMORY.md")}

## Rules
1. The system shall not modify any files matching the forbidden paths listed in the job configuration.
2. When implementation is complete, the system shall verify the project builds and the eval command exits successfully before writing the report.
3. The system shall fill in every section of REPORT.md, replacing all placeholders, and end the Recommendation section with exactly **Decision: CONTINUE** or **Decision: ROLLBACK** on its own line.
4. The system shall update MEMORY.md before finishing — recording the hypothesis, outcome, metrics changes, and patterns observed.
5. If the system identifies an improvement it cannot execute, it shall note it in the REPORT.md Summary section instead of attempting it.

VERIFY before finishing:
1. No forbidden files were modified.
2. The project builds and evals ran exactly once.
3. Every section of REPORT.md is filled in and the Recommendation ends with **Decision: CONTINUE** or **Decision: ROLLBACK**.
4. MEMORY.md has been updated with learnings from this hypothesis.
5. The hypothesis statement in REPORT.md is specific and testable — not vague.
6. You did NOT re-edit code or re-run evals after the first eval run. One change, one eval, one report.

## Baseline Report
${baselineReport}

## Job Memory
${memoryMd}

## Job Configuration
${jobMd}`;

  const userPrompt = `Run hypothesis ${hypId} (iteration ${i + 1}/${maxIterations}) for job "${jobId}". Analyze the failures, implement an improvement, run evals, and fill in the report.`;

  // Spawn Claude Code
  const exitCode = await runClaude(
    systemPrompt,
    userPrompt,
    targetRepoPath,
    jobDir
  );

  // Parse decision from REPORT.md
  const reportPath = join(hypothesis.dir, "REPORT.md");

  if (exitCode !== 0) {
    console.error(styleText("red", `\nClaude Code exited with code ${exitCode}.`));
    process.exit(1);
  }

  if (!existsSync(reportPath)) {
    console.error(styleText("red", `\nREPORT.md not found at ${reportPath}.`));
    process.exit(1);
  }

  const reportContent = await readFile(reportPath, "utf-8");
  const decision = parseDecision(reportContent);
  const accuracy = parseAccuracy(reportContent);

  if (!decision) {
    console.error(
      styleText("red", `\nNo valid **Decision: CONTINUE** or **Decision: ROLLBACK** found in ${reportPath}.`)
    );
    process.exit(1);
  }

  // Commit all changes on the hypothesis branch (regardless of decision)
  try {
    git("add", "-A");
    git("commit", "-m", `feat(experiment): hypothesis ${hypId} - ${decision}`);
  } catch {
    // Nothing to commit (no changes made) — that's fine
  }

  // Handle decision
  if (decision === "CONTINUE") {
    bestBranch = hypBranch;
    // Next iteration will branch from this accepted branch
  } else {
    // Backtrack: return to the branch this hypothesis was created from
    git("checkout", bestBranch);
  }

  // Print summary
  const decisionColor = decision === "CONTINUE" ? "green" : "red";
  console.log(`\n${styleText("cyan", "—".repeat(60))}`);
  console.log(
    `${styleText("bold", `[iteration ${i + 1}/${maxIterations}]`)} Hypothesis ${hypId}: ${styleText(decisionColor, decision)} | Accuracy: ${styleText("yellow", accuracy)}`
  );
  console.log(`Best branch: ${styleText("cyan", bestBranch)}`);
  console.log(`${styleText("cyan", "—".repeat(60))}\n`);
}

console.log(styleText("green", "\nOptimization loop complete."));
console.log(`Final best branch: ${styleText("bold", bestBranch)}`);
console.log(`Job artifacts:     ${styleText("cyan", jobDir)}`);
