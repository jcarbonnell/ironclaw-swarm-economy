# Fleet Dashboard Setup

**Document version**: 1.0
**Status**: Tested and working — v0.1 fleet base complete (six slices shipped)
**Scope**: Standing up the IronClaw Fleet Dashboard against the local 5-agent swarm — dependencies, database setup, environment, and the per-page verification checklist.

Tested with: **Next.js 16.3.5**, **TanStack Query v5**, **Tailwind v4**, **Node.js 22**, **pg 8**, **PostgreSQL 16 (pgvector)**, **Docker Compose v2**, **macOS host**.

---

## Overview

The dashboard is the reusable, experiment-agnostic control plane for the swarm. It runs on the **host** (later the OVH VPS) as a Next.js app and observes the running agent fleet. It is a **control plane, not a data plane**: it manages agents (health, lifecycle, an audit log of operator actions) without ingesting any agent's raw data. Agent data stays in each agent's own PostgreSQL and in the NOVA groups.

Two things it talks to that the other components do not:

| Concern | How the dashboard reaches it |
|---------|------------------------------|
| Agent liveness | HTTP GET to each agent's `/health` route (no auth, no inference cost) |
| Agent messaging | HTTP POST to `/webhook`, HMAC-SHA256 signed **server-side** |
| Agent memory / conversations | Direct read of each agent's PostgreSQL database (`ironclaw_agent1..5`) |
| Agent lifecycle | `docker` CLI (`pause` / `unpause` / `restart` / `logs`) shelled from API routes |
| Audit log | Its own PostgreSQL database, `ironclaw_dashboard` (append-only) |
| Infra health | Qdrant `/healthz`, Ollama `/api/tags`, a `SELECT 1` against the dashboard DB |

The dashboard lives in `dashboard/` inside the project, colocated with the plugins it discovers (`dashboard/plugins/`).

---

## Architecture: the two-layer split

```
┌─────────────────────────────────────────────┐
│ Plugin: Agentic Economy Oracle (+ future)   │  ← experiment-specific
│ (v0.2: MESA panels, oracle, macro signals)  │     panels + signals
├─────────────────────────────────────────────┤
│ IronClaw Fleet Dashboard (v0.1, SHIPPED)    │  ← reusable base
│ fleet view · agent detail · intervention ·  │     (this document)
│ event log · infra · plugin registry         │
└─────────────────────────────────────────────┘
```

The base works with zero plugins loaded. Plugins are discovered from `dashboard/plugins/` by reading each folder's `manifest.json`. In v0.1 the registry only discovers and displays; lifecycle loading and UI injection are v0.2.

---

## Prerequisites

1. **The swarm running.** Five IronClaw agents up via `docker compose up -d` (see `local-swarm-setup.md`), on host ports `8081`–`8085`, each with `/health` and an HMAC `/webhook`. Postgres, Qdrant, Ollama containers healthy.
2. **PostgreSQL reachable from the host on port 5433** (see the port note below).
3. **Docker CLI** available to the user who runs the dashboard.
4. **Node.js 20+** and npm.

### Why host port 5433

A local (Homebrew) PostgreSQL binds `localhost:5432` on IPv4 and IPv6 and shadows the container's Docker port-forward. The dashboard would then connect to the wrong Postgres and fail with `role "ironclaw" does not exist`. The container is therefore mapped to host **5433**:

```yaml
# agents/docker-compose.yml — postgres service
ports:
  - "5433:5432"   # host 5433 → container 5432 (5432 stays internal for agents)
```

The agents themselves are unaffected — inside the Docker network they still reach Postgres at `postgres:5432`. Only host-side clients (the dashboard, host `psql`) use 5433.

---

## Setup steps

### 1. Install dependencies

```bash
cd dashboard
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local` — the important groups:

```bash
RESEARCHER_ID=jcarbonnell

# Agent webhooks (host ports)
AGENT1_URL=http://localhost:8081
# … agent2–5 on 8082–8085 …

# HMAC secrets — only needed for Send Prompt, not health polling.
# Must match each agent's HTTP_WEBHOOK_SECRET.
AGENT1_WEBHOOK_SECRET=...
# … agent2–5 …

# Per-agent Postgres read: base URL, NO trailing database. Port 5433.
POSTGRES_BASE_URL=postgresql://ironclaw:SimplePass123@localhost:5433

# Dashboard audit-log database. Port 5433.
DATABASE_URL=postgresql://ironclaw:SimplePass123@localhost:5433/ironclaw_dashboard

QDRANT_URL=http://localhost:6333
OLLAMA_URL=http://localhost:11434
```

Passwords must be **alphanumeric** (the same rule as the rest of the project — special characters break URL parsing). `.env.local` is gitignored.

### 3. Create the dashboard's event-log database (run once)

Separate from the per-agent databases. Create it and apply the schema:

```bash
# From the project root
docker exec -it ironclaw-postgres \
  psql -U ironclaw -d ironclaw -c "CREATE DATABASE ironclaw_dashboard;"

docker exec -i ironclaw-postgres \
  psql -U ironclaw -d ironclaw_dashboard < dashboard/schema.sql
```

Confirm the table:

```bash
docker exec -it ironclaw-postgres \
  psql -U ironclaw -d ironclaw_dashboard -c "\d events"
```

Expected: an `events` table with `event_id, timestamp, plugin, agent, kind, payload, researcher_id` and three indexes.

### 4. Run

```bash
npm run dev          # http://localhost:3000
# or
npm run build && npm run start
```

---

## Verification checklist

Work through each page against the live swarm.

### Fleet (`/`)

- Five cards, each `online` with a real latency number.
- Pause an agent → within ~5s its badge turns blue `paused`, the button becomes **Resume**, Prompt greys out. Confirm with `docker ps` (`… (Paused)`).
- Resume → back to `online`.
- Restart → briefly `unreachable` (container cycling), then `online`.
- **Cross-check:** `docker pause ironclaw-agent4` from a terminal → the dashboard shows it paused within one poll, no click. This proves status is read from Docker, not tracked in the UI.
- Pause Fleet / Resume Fleet → all five together; the result line reports affected count and any failures.

### Agent detail (`/agents/agent1`)

- Memory documents listed (including `swarm/config.md`, `swarm/last_contribution.md`), each expandable to full content.
- Conversation history, newest first, each message expandable.

### Event Log (`/events`)

- After a pause and a prompt, two events appear (newest first) with server-generated UUIDs/timestamps.
- Filters (kind, agent) narrow the feed.
- Expanding a row shows the raw payload JSON.

### Infrastructure (`/infra`)

- Postgres, Qdrant, Ollama all `reachable`. (Postgres is a real `SELECT 1` probe; Qdrant may show `unhealthy` in `docker ps` due to the curl-in-image quirk but reads `reachable` here because the dashboard probes `/healthz` directly.)

### Plugins (`/plugins`)

- One card: **Agentic Economy Oracle**, `discovered`. Expanding shows description, fleet shape (`economy_agent ×5`), personalization points, dependencies, tags.

---

## Send Prompt vs health polling (cost note)

- **Health polling** (`/health`, every 5s) is free — no inference, no database write.
- **Send Prompt** (`/webhook`, HMAC-signed) spends a Haiku inference call and writes a row to the agent's `conversation_messages`. Use it deliberately, not for liveness checks.

---

## Known Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `role "ironclaw" does not exist` (code 28000) | A local (Homebrew) Postgres shadows the container on `localhost:5432` | Map the container to host 5433 and point `POSTGRES_BASE_URL` / `DATABASE_URL` at 5433 |
| `role "ironclaw" does not exist` even on 5433 | `pg` merged a `PG*` env var / fell back to the OS username | Already handled: `lib/db.ts` and `lib/events.ts` parse the URL into explicit host/port/user/password/database fields |
| `ECONNRESET` / "server closed connection" on the DB | Compose port mapped `5433:5433` (container side wrong) | Must be `5433:5432` — Postgres listens on 5432 inside the container |
| Postgres container won't start: `bogus data in lock file "postmaster.pid"` | Unclean shutdown left a stale lock file | `docker run --rm -v agents_postgres_data:/var/lib/postgresql/data busybox rm -f /var/lib/postgresql/data/postmaster.pid`, then start Postgres. Prevent with a clean `docker compose down`. |
| `/infra`, `/agents/[id]`, etc. return 404 | A `page.tsx` was created under `app/api/…` instead of `app/…` | Pages live at `app/<route>/page.tsx`; API routes at `app/api/<route>/route.ts`. Move the page out of `api/`. |
| Tailwind classes / fonts not applying | Used v3 syntax (`@tailwind` directives, `tailwind.config.ts`) | v4: `@import "tailwindcss"` + `@theme inline` in `globals.css`; no config file |
| MetaMask errors in the dev console | A browser wallet extension injecting into the page | Not a dashboard bug — ignore, or use a browser profile without the extension |
| Agent shows `unreachable` but container is `Up` | The agent's `/health` isn't responding (booting, hung, or crashed) | Check `docker logs ironclaw-agentN`; distinct from `paused` (deliberate) |

---

## Next Steps

| Item | Notes |
|------|-------|
| v0.2 plugin framework | Lifecycle hooks (`init`/`activate`/`deactivate`/`on_*`), parameter system (JSON-Schema-driven UI), the four UI extension points, override-next-action modal |
| Agentic Economy Oracle plugin panels | MESA internals, macro-signal time series, NOVA contribution flow, oracle training state — reads existing `agent_signals`/`swarm_signals` and the coordinator's outputs |
| Real Postgres probe already done | `/infra` now queries `ironclaw_dashboard`; extend to per-agent DBs if useful |
| Multi-tenancy (v1.0) | The single-researcher session is the seam; see `ironclaw_fleet_dashboard_spec.md` §8 for the hosted-service vision |
| VPS migration | Same setup, host = VPS; SSH-tunnel the agent ports and the dashboard, or serve behind auth. Update all `localhost` URLs to the VPS host. |
| Plugin sandboxing | Prerequisite for hosting third-party plugins — WASM / process isolation / capability-scoped APIs (v1.0) |