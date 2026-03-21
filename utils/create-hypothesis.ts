import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export interface CreateHypothesisOptions {
  jobDir: string;
  id: string;
  statement: string;
  branchName: string;
}

export interface HypothesisInfo {
  id: string;
  statement: string;
  branchName: string;
  dir: string;
}

export async function createHypothesis(
  options: CreateHypothesisOptions
): Promise<HypothesisInfo> {
  const { jobDir, id, statement, branchName } = options;
  const hypothesisDir = join(jobDir, "hypotheses", id);

  // If hypothesis already exists, return it (idempotent re-runs)
  if (existsSync(hypothesisDir)) {
    return { id, statement, branchName, dir: hypothesisDir };
  }

  await mkdir(hypothesisDir, { recursive: true });

  // Insert into SQLite
  const db = new DatabaseSync(join(jobDir, "results.db"));
  db.prepare(
    `INSERT OR IGNORE INTO hypotheses (id, statement, status, branch_name) VALUES (?, ?, 'pending', ?)`
  ).run(id, statement, branchName);
  db.close();

  return { id, statement, branchName, dir: hypothesisDir };
}
