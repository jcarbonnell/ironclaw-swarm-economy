import { Pool } from "pg";
import type { FleetEvent, EventKind } from "@/types";

// ── Dashboard event-log access ───────────────────────────────────────────────
// Server-side only. Connects to the dashboard's OWN database (ironclaw_dashboard),
// separate from the per-agent databases in lib/db.ts. Append-only audit log of
// everything that happens through the dashboard.

const DATABASE_URL = process.env.DATABASE_URL;

// Single lazily-created pool, cached for the process lifetime.
let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local " +
        "(e.g. postgresql://ironclaw:SimplePass123@localhost:5433/ironclaw_dashboard)."
    );
  }

  // Parse into explicit fields rather than passing connectionString — same
  // reason as lib/db.ts: avoids PG* env vars / OS-username fallback surprises.
  const parsed = new URL(DATABASE_URL);
  pool = new Pool({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (err) => {
    console.error("[events] pool error:", err.message);
  });

  return pool;
}

// ── Write ────────────────────────────────────────────────────────────────────
// Append one event. Postgres generates event_id and timestamp.
// Logging must never break the action it records — callers wrap in try/catch
// (see logEventSafe below) so a logging failure doesn't fail a pause/prompt.

export interface NewEvent {
  kind: EventKind;
  researcherId: string;
  plugin?: string | null;
  agent?: string | null;
  payload?: Record<string, unknown>;
}

export async function logEvent(event: NewEvent): Promise<FleetEvent> {
  const { rows } = await getPool().query(
    `INSERT INTO events (plugin, agent, kind, payload, researcher_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING event_id, timestamp, plugin, agent, kind, payload, researcher_id`,
    [
      event.plugin ?? null,
      event.agent ?? null,
      event.kind,
      JSON.stringify(event.payload ?? {}),
      event.researcherId,
    ]
  );
  return rows[0] as FleetEvent;
}

// Fire-and-forget wrapper: logs the event, but swallows any error so that a
// logging failure can never break the user-facing action being recorded.
export async function logEventSafe(event: NewEvent): Promise<void> {
  try {
    await logEvent(event);
  } catch (err) {
    console.error("[events] logEvent failed:", err instanceof Error ? err.message : err);
  }
}

// ── Health ─────────────────────────────────────────────────────────────────────
// Cheap liveness probe for the dashboard DB, used by the infra health route.
export async function pingDashboardDb(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch (err) {
    console.error("[events] pingDashboardDb failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────
// Filtered, newest-first. All filters optional; combine with AND.

export interface EventQuery {
  plugin?: string;
  agent?: string;
  kind?: string;
  limit?: number;
  before?: string;   // ISO timestamp — return events strictly older than this (paging)
}

export async function queryEvents(q: EventQuery = {}): Promise<FleetEvent[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (q.plugin !== undefined) {
    params.push(q.plugin);
    conditions.push(`plugin = $${params.length}`);
  }
  if (q.agent !== undefined) {
    params.push(q.agent);
    conditions.push(`agent = $${params.length}`);
  }
  if (q.kind !== undefined) {
    params.push(q.kind);
    conditions.push(`kind = $${params.length}`);
  }
  if (q.before !== undefined) {
    params.push(q.before);
    conditions.push(`timestamp < $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Number.isInteger(q.limit) && q.limit! > 0 ? Math.min(q.limit!, 500) : 100;
  params.push(limit);

  const { rows } = await getPool().query(
    `SELECT event_id, timestamp, plugin, agent, kind, payload, researcher_id
       FROM events
       ${where}
      ORDER BY timestamp DESC
      LIMIT $${params.length}`,
    params
  );
  return rows as FleetEvent[];
}