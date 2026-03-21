import { parseArgs } from "node:util";
import { readFile, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createHypothesis } from "../utils/create-hypothesis.ts";

const { values } = parseArgs({
  options: {
    id: { type: "string", short: "i" },
  },
  strict: true,
});

if (!values.id) {
  console.error("Usage: node scripts/run-baseline-evals.ts --id <job-id>");
  process.exit(1);
}

const jobId = values.id;
const projectRoot = resolve(import.meta.dirname, "..");
const jobDir = join(projectRoot, "jobs", jobId);

if (!existsSync(jobDir)) {
  console.error(`Error: Job folder not found at ${jobDir}`);
  console.error(`Run: npm run create-job -- --id ${jobId}`);
  process.exit(1);
}

const jobMdPath = join(jobDir, "JOB.md");
const jobMd = await readFile(jobMdPath, "utf-8");

// Parse target repo path and branch from JOB.md
const pathMatch = jobMd.match(/\*\*Path\*\*:\s*(.+)/);
const branchMatch = jobMd.match(/\*\*Branch\*\*:\s*(.+)/);

if (!pathMatch || !branchMatch) {
  console.error(
    "Error: Could not parse Target Repository path or branch from JOB.md"
  );
  console.error(
    "Make sure JOB.md has **Path**: and **Branch**: under Target Repository"
  );
  process.exit(1);
}

const targetRepoRelative = pathMatch[1].trim();
const baseBranch = branchMatch[1].trim();
const targetRepoPath = resolve(jobDir, targetRepoRelative);

if (!existsSync(targetRepoPath)) {
  console.error(`Error: Target repo not found at ${targetRepoPath}`);
  process.exit(1);
}

// Git: checkout base branch as safety check, then create baseline branch
const baselineBranch = `${jobId}-baseline`;

function git(...args: string[]): string {
  return execFileSync("git", args, {
    cwd: targetRepoPath,
    encoding: "utf-8",
  }).trim();
}

console.log(`Checking out base branch "${baseBranch}" in target repo...`);
const currentBranch = git("rev-parse", "--abbrev-ref", "HEAD");
if (currentBranch !== baseBranch) {
  git("checkout", baseBranch);
}
console.log(`On branch: ${git("rev-parse", "--abbrev-ref", "HEAD")}`);

console.log(`Switching to branch "${baselineBranch}"...`);
try {
  git("checkout", "-b", baselineBranch);
} catch {
  git("checkout", baselineBranch);
}
console.log(`On branch: ${git("rev-parse", "--abbrev-ref", "HEAD")}`);

// Create the baseline hypothesis
const hypothesis = await createHypothesis({
  jobDir,
  id: "000-baseline",
  statement:
    "Baseline evaluation — run evals on the current state of the target agent without any changes.",
  branchName: baselineBranch,
});

// Copy the report template into the hypothesis folder
const reportTemplatePath = join(projectRoot, "templates", "REPORT-TEMPLATE.md");
await copyFile(reportTemplatePath, join(hypothesis.dir, "REPORT.md"));

console.log(`Created baseline hypothesis: ${hypothesis.dir}`);
console.log(`Spawning Claude Code to run baseline evals...`);
console.log();

const systemPrompt = `You are an evaluation runner. You run evals on a target repository and update a structured report.

## Context
- Target repository: ${targetRepoPath} (branch: "${baselineBranch}")
- Report file: ${hypothesis.dir}/REPORT.md (already exists from template — update it in place)

## Workflow
Read the job configuration below, run any install/build prerequisites, execute the eval command, then update the report file.

## Rules
1. The system shall not modify any files in the target repository (source code, eval files, golden dataset). This is a read-only baseline run.
2. When a command fails, the system shall capture the error output and include it in the report instead of retrying or attempting fixes.
3. When documenting failing cases, the system shall include the case id, input, expected output, and actual output for every failure.
4. The system shall update the existing REPORT.md file at ${hypothesis.dir}/REPORT.md. The file already contains the template structure — fill in every section, replacing placeholder values with actual data.

## Report Instructions
The report at ${hypothesis.dir}/REPORT.md already has the correct structure. Fill in each section:
- **Hypothesis ID**: Use "000-baseline"
- **Branch**: Use "${baselineBranch}"
- **Hypothesis Statement**: "Baseline evaluation — run evals on the current state of the target agent without any changes."
- **Changes Made**: No changes (this is a baseline run). Write "No changes — baseline evaluation."
- **Metrics**: Fill in all metric values from the eval output. Use "N/A" if a metric is unavailable.
- **Failing Cases**: One subsection per failing case with id, input, expected output, and actual output. If none, write "No failing cases."
- **Summary**: What works, what fails, patterns in failures.
- **Recommendation**: For baseline, always write "Baseline run — no recommendation applicable." and set **Decision: CONTINUE**

VERIFY before finishing:
1. No files in the target repo were created, modified, or deleted.
2. Every failing case is listed with id, input, expected output, and actual output.
3. All metric fields are filled (use "N/A" if a metric is unavailable).
4. The REPORT.md file at the exact path above has been updated with all sections filled in.

## Job Configuration
${jobMd}`;

const userPrompt = `Run the baseline evals for job "${jobId}" and write the report.`;

const claude = spawn(
  "claude",
  [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
    "--system-prompt",
    systemPrompt,
    "--add-dir",
    jobDir,
    "-p",
    userPrompt,
  ],
  {
    cwd: targetRepoPath,
    stdio: ["ignore", "pipe", "inherit"],
  }
);

// Stream NDJSON events and print a human-readable summary for each
claude.stdout.on("data", (chunk: Buffer) => {
  for (const line of chunk.toString().split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (event.type === "assistant" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "text") {
            process.stdout.write(block.text);
          } else if (block.type === "tool_use") {
            console.log(`\n[tool] ${block.name}: ${JSON.stringify(block.input).slice(0, 200)}`);
          }
        }
      } else if (event.type === "result") {
        console.log("\n[done]", event.subtype ?? "");
      }
    } catch {
      // not valid JSON, skip
    }
  }
});

claude.on("close", (code) => {
  if (code === 0) {
    console.log();
    console.log("Baseline evals completed.");
    console.log(`Report: ${hypothesis.dir}/REPORT.md`);
  } else {
    console.error(`Claude Code exited with code ${code}`);
    process.exit(code ?? 1);
  }
});
