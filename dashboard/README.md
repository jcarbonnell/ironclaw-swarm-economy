# IronClaw Fleet Dashboard

A sovereignty-preserving control plane for a fleet of [IronClaw](https://docs.ironclaw.com) agents. It lets a single operator see every agent's health, inspect an agent's memory and conversation history, pause/resume/restart agents, read an append-only audit log of every action taken through the dashboard, and discover installed plugins — all without ever ingesting the agents' own data.

The dashboard **manages** the fleet; it never reads the cargo. Health comes from each agent's `/health` route, lifecycle from Docker, and the audit log records only operator actions. Agent data stays in the agents' own PostgreSQL databases and NOVA groups.

Part of the [`ironclaw-swarm-economy`](https://github.com/jcarbonnell/ironclaw-swarm-economy) project. This is the reusable **base**; experiment-specific functionality (the Agentic Economy Oracle) arrives as a plugin.

---

## Status

**v0.1 — fleet base, shipped.** Built in six slices:

1. Shell + session + live fleet view (health polling)
2. Agent detail — memory + conversation history (per-agent Postgres)
3. Intervention controls — pause / resume / restart / logs (Docker)
4. Event log — append-only Postgres audit trail
5. Infrastructure health view
6. Plugin registry — manifest-driven discovery (read-only)

Next: **v0.2** — the plugin framework (lifecycle hooks, parameters, UI extension points) and the first real plugin panels. See `docs/dashboard-setup.md` and the project's `ironclaw_fleet_dashboard_spec.md` for the full roadmap.

---

## Stack

- **Next.js** (App Router) + **TypeScript** (strict)
- **TanStack Query v5** — all read-polling (health, events, infra, plugins)
- **Tailwind v4** (CSS-based config; no `tailwind.config.ts`)
- **PostgreSQL** via `pg` — per-agent databases (read) + the dashboard's own `ironclaw_dashboard` DB (event log)
- Server-side only: Docker CLI (lifecycle), webhook HMAC signing, all DB access

**Security model:** the browser makes zero authenticated calls. Every secret-bearing operation (webhook HMAC, DB credentials, Docker control) runs in a Next.js API route on the server. No secret is ever exposed via `NEXT_PUBLIC_*`.

---

## Prerequisites

The dashboard observes a running IronClaw swarm. Before starting it, you need:

- The 5-agent swarm running via Docker (see `docs/local-swarm-setup.md` in the parent project). Agents on host ports `8081`–`8085`, each exposing a `/health` route and an HMAC-signed `/webhook`.
- **PostgreSQL** reachable from the host. In this project it runs in the `ironclaw-postgres` container, mapped to host port **5433** (not the default 5432 — see the note below).
- **Docker CLI** available to the user running the dashboard (used for pause/resume/restart/logs).
- **Node.js** 20+ and npm.
- Qdrant (`:6333`) and Ollama (`:11434`) running — observed on the Infrastructure page, not required for the base to run.

### Why Postgres is on host port 5433

If you have a local (e.g. Homebrew) PostgreSQL, it binds `localhost:5432` on both IPv4 and IPv6 and will shadow the container's Docker port-forward — the dashboard would connect to the wrong Postgres and fail with `role "ironclaw" does not exist`. To avoid the collision the container is mapped to host **5433**:

```yaml
# agents/docker-compose.yml — postgres service
ports:
  - "5433:5432"   # host 5433 → container 5432
```

If you don't run a local Postgres you can use 5432; just keep `.env.local` in sync.

---

## Setup

### 1. Install

```bash
cd dashboard
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
# Researcher identity (single-operator v0.1; shown in the topbar and event log)
RESEARCHER_ID=your-handle

# Agent webhook base URLs (host ports)
AGENT1_URL=http://localhost:8081
AGENT2_URL=http://localhost:8082
AGENT3_URL=http://localhost:8083
AGENT4_URL=http://localhost:8084
AGENT5_URL=http://localhost:8085

# Per-agent HMAC secrets (only needed for Send Prompt, not for health polling)
# openssl rand -hex 32  — must match each agent's HTTP_WEBHOOK_SECRET
AGENT1_WEBHOOK_SECRET=...
AGENT2_WEBHOOK_SECRET=...
AGENT3_WEBHOOK_SECRET=...
AGENT4_WEBHOOK_SECRET=...
AGENT5_WEBHOOK_SECRET=...

# Agent NEAR/NOVA account IDs (display only)
AGENT1_NEAR_ACCOUNT=ironclaw-swarm-agent1.nova-sdk-6.testnet
# … agent2–5 …

# Per-agent Postgres (read): base URL, no trailing database — the app appends
# /ironclaw_agent{N} per agent. Note port 5433.
POSTGRES_BASE_URL=postgresql://ironclaw:SimplePass123@localhost:5433

# Dashboard's own database (event log). Note port 5433.
DATABASE_URL=postgresql://ironclaw:SimplePass123@localhost:5433/ironclaw_dashboard

# Observed infrastructure (Infrastructure page)
QDRANT_URL=http://localhost:6333
OLLAMA_URL=http://localhost:11434
```

`.env.local` is gitignored — never commit it.

### 3. Create the event-log database (once)

The dashboard's own audit-log database is separate from the per-agent databases. Create it and apply the schema:

```bash
# From the parent project root:
docker exec -it ironclaw-postgres \
  psql -U ironclaw -d ironclaw -c "CREATE DATABASE ironclaw_dashboard;"

docker exec -i ironclaw-postgres \
  psql -U ironclaw -d ironclaw_dashboard < dashboard/schema.sql
```

Both are idempotent-friendly (`IF NOT EXISTS`), so re-running is safe.

### 4. Run

```bash
npm run dev
# → http://localhost:3000
```

The fleet view should show five cards, each `online` with a real latency. If an agent shows `offline`, health-check it directly (`curl http://localhost:808N/health`) to isolate agent vs dashboard.

---

## What each page does

| Page | Route | What it shows |
|------|-------|---------------|
| **Fleet** | `/` | Five agent cards: status (healthy/paused/stopped/unreachable), latency, controls (Prompt / Pause⇄Resume / Restart / Logs). Fleet-wide Pause/Resume in the header. Polls every 5s. |
| **Agent detail** | `/agents/[id]` | One agent's memory documents and conversation history, read from its own Postgres. Expandable rows. |
| **Event Log** | `/events` | Append-only audit trail of dashboard actions (interventions, prompts), filterable by kind and agent. Polls every 10s. |
| **Infrastructure** | `/infra` | Live health of Postgres (real probe), Qdrant, Ollama. Polls every 10s. |
| **Plugins** | `/plugins` | Plugins discovered from `plugins/`, with their manifests rendered (description, fleet shape, personalization points, dependencies). Read-only. |

---

## Status semantics (Fleet view)

Status is derived **fresh from Docker + health every poll** — never cached in the UI, so it can't drift. Pausing an agent from the terminal shows up in the dashboard within one poll cycle, no click required.

| Status | Meaning |
|--------|---------|
| `healthy` | Container running **and** `/health` responds |
| `unreachable` | Container running but `/health` failed (crashed, hung, or booting) |
| `paused` | Container paused via `docker pause` (deliberate — not an error) |
| `stopped` | Container exited or missing |

---

## Plugins

The base ships with the **Agentic Economy Oracle** plugin manifest under `plugins/agentic-economy-oracle/`. In v0.1 the registry only *discovers and displays* manifests — lifecycle loading and UI panels arrive in v0.2.

A plugin is a folder under `plugins/` containing a `manifest.json`. Discovery is fully manifest-driven: the base has no hardcoded knowledge of which plugins exist; it reads whatever folders are present and trusts their manifests. A broken manifest still appears in the registry, marked `errored`, rather than vanishing silently.

The manifest is designed to be **agent-legible and template-shaped** — see `ironclaw_fleet_dashboard_spec.md` §4 (plugin contract) and §8 (commercial vision) for the schema and the reasoning.

---

## Development notes / traps

Hard-won during the v0.1 build; inherit these rather than rediscover them.

- **Tailwind v4, not v3.** Config lives in `app/globals.css` via `@import "tailwindcss"` and `@theme inline`. There is no `tailwind.config.ts`. The scaffold's default `@media (prefers-color-scheme: dark)` block was removed — this console is dark-only.
- **Postgres on 5433** to avoid the Homebrew-Postgres collision (see above). If you get `role "ironclaw" does not exist`, a local Postgres is shadowing the container on 5432.
- **`pg` connection uses explicit fields, not a connection string.** Passing a `connectionString` lets `pg` merge `PG*` environment variables (or fall back to the OS username), which caused a `28000` "role does not exist" against the macOS username. `lib/db.ts` and `lib/events.ts` parse the URL into `host/port/user/password/database` explicitly.
- **Health polling uses `/health` (GET, no auth).** It costs no inference and writes no conversation row. Only **Send Prompt** hits `/webhook` (HMAC-signed, spends inference, writes a row) — use it deliberately.
- **Container lifecycle is `docker` CLI shelled from API routes.** Container names are built from a validated integer agent index (`ironclaw-agent{N}`), never from request input — no injection surface.
- **Postgres restart pitfall:** after an unclean shutdown, the container may fail to start with `bogus data in lock file "postmaster.pid"`. Fix: remove the stale lock file from the volume (`docker run --rm -v agents_postgres_data:/var/lib/postgresql/data busybox rm -f /var/lib/postgresql/data/postmaster.pid`), then start Postgres. Do a clean `docker compose down` before shutting the machine to avoid it.

---

## License

MIT