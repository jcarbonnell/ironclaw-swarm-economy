import { Pool } from "pg";

// ── Per-agent Postgres access ────────────────────────────────────────────────
// Server-side only. Never imported into a client component.
// Each agent has its own database (ironclaw_agent1 … ironclaw_agent5) inside the
// one ironclaw-postgres container. We derive each agent's DB URL from a single
// base connection string (POSTGRES_BASE_URL, no trailing database) and append
// the agent's database name — mirroring how lib/agents.ts derives per-agent config.

const BASE_URL = process.env.POSTGRES_BASE_URL;

// One pool per database, created lazily and cached for the process lifetime.
// pg pools are long-lived by design; recreating them per request leaks connections.
const pools = new Map<string, Pool>();

function agentDbName(agentIndex: number): string {
  return `ironclaw_agent${agentIndex}`;
}

function getPool(dbName: string): Pool {
  const existing = pools.get(dbName);
  if (existing) return existing;

  if (!BASE_URL) {
    throw new Error(
      "POSTGRES_BASE_URL is not set. Add it to .env.local " +
        "(e.g. postgresql://ironclaw:SimplePass123@localhost:5432 — no trailing database)."
    );
  }

  // Parse the base URL into explicit fields rather than passing a connection
  // string. node-postgres merges connectionString with PG* environment vars,
  // which on some shells overrides the user with the OS username (causing a
  // 28000 "role does not exist" against, e.g., your macOS username). Explicit
  // fields take precedence and make the connection deterministic.
  const parsed = new URL(`${BASE_URL.replace(/\/$/, "")}/${dbName}`);
  const pool = new Pool({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    max: 4,                       // small — this is a single-researcher console
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Surface pool-level errors instead of crashing the process on a dropped backend
  pool.on("error", (err) => {
    console.error(`[db] pool error on ${dbName}:`, err.message);
  });

  pools.set(dbName, pool);
  return pool;
}

// Run a parameterized query against a specific agent's database.
// Always use parameters ($1, $2, …) — never string-interpolate values.
export async function agentQuery<T = Record<string, unknown>>(
  agentIndex: number,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const dbName = agentDbName(agentIndex);
  try {
    const pool = getPool(dbName);
    const result = await pool.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    console.error(`[db] query failed on ${dbName}:`, err);
    throw err;
  }
}