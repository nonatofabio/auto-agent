import { parseArgs, styleText } from "node:util";
import { mkdir, copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const { values } = parseArgs({
  options: {
    id: { type: "string", short: "i" },
  },
  strict: true,
});

if (!values.id) {
  console.error(
    styleText("red", "Usage: node scripts/create-job.ts --id <job-id>")
  );
  process.exit(1);
}

const jobId: string = values.id;
const projectRoot: string = resolve(import.meta.dirname, "..");
const jobDir: string = join(projectRoot, "jobs", jobId);

if (existsSync(jobDir)) {
  console.error(
    styleText("red", `Error: Job folder already exists at ${jobDir}`)
  );
  process.exit(1);
}

await mkdir(jobDir, { recursive: true });
await mkdir(join(jobDir, "hypotheses"), { recursive: true });

const templatesDir: string = join(projectRoot, "templates");

await copyFile(
  join(templatesDir, "JOB-TEMPLATE.md"),
  join(jobDir, "JOB.md")
);

await copyFile(
  join(templatesDir, "MEMORY-TEMPLATE.md"),
  join(jobDir, "MEMORY.md")
);

console.log(styleText("green", `Job "${jobId}" created at: ${jobDir}`));
console.log();
console.log(styleText("bold", "Created:"));
console.log(`  ${styleText("cyan", join(jobDir, "JOB.md"))}           — fill in job config`);
console.log(`  ${styleText("cyan", join(jobDir, "MEMORY.md"))}        — optionally seed with prior knowledge`);
console.log(`  ${styleText("cyan", join(jobDir, "hypotheses/"))}      — hypothesis folders will go here`);
console.log();
console.log(styleText("bold", "Next steps:"));
console.log(`  1. Open ${styleText("cyan", join(jobDir, "JOB.md"))} and fill in the job details`);
console.log(`  2. Optionally seed ${styleText("cyan", join(jobDir, "MEMORY.md"))} with prior knowledge`);
console.log(`  3. Run: ${styleText("yellow", `npm run run-job -- --id ${jobId}`)}`);
