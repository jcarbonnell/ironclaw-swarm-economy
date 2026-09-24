import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import type { OracleModel, OracleTrainingRun } from "@/types";

// GET /api/plugins/agentic-economy-oracle/oracle-training
//
// Reads the orchestrator's training outputs from disk and returns them shaped
// for the Oracle Training panel:
//   • latest  — orchestrator/data/models/oracle_latest.json (the current model)
//   • history — orchestrator/data/training_log.jsonl (one run per line, newest last)
//
// Server-side only (filesystem read, like lib/plugins.ts reads plugin manifests).
// The dashboard OBSERVES the orchestrator's outputs; it never trains. When the
// orchestrator later exposes an HTTP training endpoint (for a "trigger run"
// button), this read could move to that endpoint — for read-only display, disk
// is simplest and correct.
//
// Path is configurable (ORCHESTRATOR_DATA_DIR), defaulting to the sibling-folder
// layout the repo uses now (dashboard/ and orchestrator/ under the repo root).
// process.cwd() is the dashboard root under `next dev`/`next start`, so the
// default resolves to ../orchestrator/data. On the VPS, set the env var.

function orchestratorDataDir(): string {
  const configured = process.env.ORCHESTRATOR_DATA_DIR;
  if (configured && configured.length > 0) {
    return isAbsolute(configured) ? configured : join(process.cwd(), configured);
  }
  // Default: sibling folder, one level up from the dashboard root.
  return join(process.cwd(), "..", "orchestrator", "data");
}

async function readLatestModel(dataDir: string): Promise<OracleModel | null> {
  const path = join(dataDir, "models", "oracle_latest.json");
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as OracleModel;
  } catch (err) {
    // No model yet (orchestrator hasn't trained) is a valid empty state, not an
    // error. Any other read/parse failure is surfaced by the caller.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function readHistory(dataDir: string): Promise<OracleTrainingRun[]> {
  const path = join(dataDir, "training_log.jsonl");
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  // One JSON object per non-empty line. Skip malformed lines rather than failing
  // the whole read — a single bad append shouldn't blank the history.
  const runs: OracleTrainingRun[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      runs.push(JSON.parse(trimmed) as OracleTrainingRun);
    } catch {
      // skip malformed line
    }
  }
  // Newest first for display.
  runs.reverse();
  return runs;
}

export async function GET() {
  try {
    const dataDir = orchestratorDataDir();
    const [latest, history] = await Promise.all([
      readLatestModel(dataDir),
      readHistory(dataDir),
    ]);
    return NextResponse.json({ latest, history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}