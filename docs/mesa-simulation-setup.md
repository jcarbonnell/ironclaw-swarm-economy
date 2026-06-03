# MESA Simulation Setup

**Document version**: 1.0
**Status**: Tested and working
**Scope**: Host-side simulation workflow — running `run_simulation.py` and `push_signals.py` from the repo root on the host machine.

Tested with: **Python 3.13.1**, **mesa 2.3+**, **networkx 3.3+**, **Qdrant latest**, **Ollama + nomic-embed-text**, **macOS host**.

---

## Overview

The simulation layer runs on the **host machine**, not inside the IronClaw containers. This is an intentional architectural choice:

- IronClaw containers are minimal Rust/Debian runtime images with no Python toolchain.
- The simulation is conceptually separate from agent behavior — it is observation infrastructure, not agent sovereignty.
- At scale, the orchestrator (not individual agents) owns the Qdrant write path.

The host-side workflow has two scripts:

| Script | Purpose | Output |
|--------|---------|--------|
| `run_simulation.py` | Runs a MESA economy model (8 trading agents, configurable steps) | `graph_round{N}.json` + `signals_round{N}.json` |
| `push_signals.py` | Reads signals, embeds via Ollama, pushes to Qdrant | Points in `agent_signals` + `swarm_signals` |

The IronClaw skill (`nova-economy-contributor`) reads the graph JSON produced by `run_simulation.py` and uploads it to NOVA. The `nova_cid` returned by the skill is then passed to `push_signals.py` to link every Qdrant point back to its NOVA artifact.

---

## Repository Layout

```
ironclaw-swarm-economy/
├── .venv/                              # Python virtual environment (not committed)
├── agents/
│   ├── data/
│   │   └── simulation/                # Mounted into containers at /data/simulation/
│   │       ├── run_simulation.py
│   │       ├── push_signals.py
│   │       └── outputs/               # Graph + signals files written here
│   │           ├── graph_round0001.json
│   │           └── signals_round0001.json
│   └── docker-compose.yml
└── data/                              # Top-level data dir (not mounted)
```

**Volume mount** in `docker-compose.yml` (each agent service):
```yaml
volumes:
  - ./data/agentN:/data
  - ./data/simulation:/data/simulation   # shared across all agents
```

This means `/data/simulation/outputs/` inside any container maps to `agents/data/simulation/outputs/` on the host. Scripts run on the host write files that the IronClaw skill reads from inside the container.

---

## Prerequisites

### Python virtual environment

Create once at the repo root:

```bash
cd ironclaw-swarm-economy
python3 -m venv .venv
echo ".venv" >> .gitignore
```

Activate before running any simulation script:

```bash
source .venv/bin/activate
```

### Dependencies

```bash
pip install mesa networkx
```

`push_signals.py` uses only Python stdlib (`urllib`, `json`, `uuid`, `pathlib`) — no additional pip installs needed.

### Ollama

`push_signals.py` embeds signals via Ollama running locally. Verify it is running and `nomic-embed-text` is available:

```bash
curl -s http://localhost:11434/api/tags | python3 -m json.tool | grep nomic
# Expected: "name": "nomic-embed-text:latest"
```

If not pulled yet:
```bash
docker compose -f agents/docker-compose.yml exec ollama ollama pull nomic-embed-text
```

### Qdrant

Qdrant runs as a Docker service. Verify it is healthy:

```bash
curl -s http://localhost:6333/healthz
# Expected: healthz check passed
```

---

## Step 1 — Run the simulation

Always run from the **repo root** with the venv activated.

```bash
source .venv/bin/activate

python3 agents/data/simulation/run_simulation.py \
  --agent-id ironclaw-swarm-agent1.nova-sdk-6.testnet \
  --round 1 \
  --n-agents 8 \
  --steps 5 \
  --output-dir agents/data/simulation/outputs
```

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--agent-id` | `ironclaw-swarm-agent0...` | NOVA account ID of the host agent. Must match the agent's `NOVA_ACCOUNT_ID` in memory. |
| `--round` | `1` | Round number. Increment manually per run, or read from the agent's `swarm/last_contribution.md`. |
| `--n-agents` | `8` | Number of trading agents in the simulation. |
| `--steps` | `5` | Number of trading steps per round. Each step randomly pairs all agents → ~20 trade events with 8 agents and 5 steps. |
| `--output-dir` | `/data/simulation/outputs` | Output directory. Always use `agents/data/simulation/outputs` when running from the host. |
| `--seed` | None | Optional random seed for reproducibility. |

### Expected output

```
[sim] round=1 agents=8 trades=20
[sim] market_efficiency=0.35 cooperation=0.35
[sim] wealth_gini=0.0379 convergence=0.7239
[sim] defections=10 volatility=True
GRAPH_FILE=agents/data/simulation/outputs/graph_round0001.json
SIGNALS_FILE=agents/data/simulation/outputs/signals_round0001.json
```

### Output files

**`graph_round{N}.json`** — NetworkX node-link format. Contains 8 nodes (trading agents with strategy vectors) and aggregated directed edges (trade interactions). This is the artifact uploaded to NOVA by the IronClaw skill.

**`signals_round{N}.json`** — Structured economic signals in three blocks:
- `micro` — 8 entries, one per trading agent (strategy, utility, resource balance, reputation)
- `meso` — 20 entries, one per trade event (cooperation score, trust delta, success flag)
- `macro` — 1 entry, system-level signals (market efficiency, gini, convergence, velocity)

---

## Step 2 — Trigger the IronClaw skill (NOVA upload)

After the simulation outputs are written, trigger the agent's `nova-economy-contributor` skill via webhook. The skill reads the graph file from `/data/simulation/outputs/`, uploads it to NOVA, and writes the returned CID to memory.

```bash
BODY='{"user_id": "default", "content": "swarm contribution"}'
SECRET="your_agent_webhook_secret"
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -s -X POST http://localhost:8081/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"
```

Wait ~60 seconds, then retrieve the CID:

```bash
docker exec ironclaw-postgres psql -U ironclaw -d ironclaw_agent1 \
  -c "SELECT content FROM conversation_messages WHERE role='assistant' ORDER BY created_at DESC LIMIT 1;"
```

Parse the `CID:` line from the output. Example: `Qmed98bdc708c272943abd18af370793c0a3610f5f431e`

Alternatively, read it from the agent's memory:

```bash
docker exec ironclaw-postgres psql -U ironclaw -d ironclaw_agent1 \
  -c "SELECT content FROM memory_documents WHERE path='swarm/last_contribution.md';"
```

---

## Step 3 — Push signals to Qdrant

Pass the CID from Step 2 to `push_signals.py`. Run from the repo root with two environment variables pointing to localhost (the defaults point to Docker-internal hostnames).

```bash
QDRANT_URL=http://localhost:6333 \
OLLAMA_BASE_URL=http://localhost:11434 \
python3 agents/data/simulation/push_signals.py \
  --signals-file agents/data/simulation/outputs/signals_round0001.json \
  --nova-cid Qmed98bdc708c272943abd18af370793c0a3610f5f431e \
  --agent-id ironclaw-swarm-agent1.nova-sdk-6.testnet \
  --round 1
```

### Arguments

| Argument | Description |
|----------|-------------|
| `--signals-file` | Path to the signals JSON produced by `run_simulation.py` |
| `--nova-cid` | CID returned by the IronClaw skill after NOVA upload. Use `PENDING` if upload failed. |
| `--agent-id` | NOVA account ID of the host agent. Used to tag all Qdrant points. |
| `--round` | Round number. Must match the round used in Step 1. |

### Environment variables

| Variable | Default | Override for host |
|----------|---------|-------------------|
| `QDRANT_URL` | `http://qdrant:6333` | `http://localhost:6333` |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | `http://localhost:11434` |
| `EMBEDDING_MODEL` | `nomic-embed-text` | No change needed |
| `ERROR_LOG` | `agents/data/simulation/outputs/qdrant_errors.log` | No change needed |

### Expected output

```
[qdrant] Creating collection 'agent_signals' (dim=768, distance=Cosine)   ← first run only
[qdrant] ✓ Collection 'agent_signals' created
[qdrant] Creating collection 'swarm_signals' (dim=768, distance=Cosine)   ← first run only
[qdrant] ✓ Collection 'swarm_signals' created
[qdrant] Pushing 8 micro points → agent_signals
[qdrant]   ✓ micro agent=0
...
[qdrant]   ✓ micro agent=7
[qdrant] Pushing 20 meso points → agent_signals
[qdrant]   ✓ 20 meso events
[qdrant] Pushing 1 macro point → swarm_signals
[qdrant]   ✓ macro round=1
[qdrant] ✓ All signals pushed
MACRO_POINT_ID=7e1d58b8-0b80-465c-ab71-837fa59a5f11
```

### Qdrant collections created

| Collection | Points per round | Content |
|------------|-----------------|---------|
| `agent_signals` | 28 (8 micro + 20 meso) | Per-agent state + per-trade events |
| `swarm_signals` | 1 | System-level macro signals |

Verify point counts:

```bash
curl -s http://localhost:6333/collections/agent_signals | python3 -m json.tool | grep points_count
curl -s http://localhost:6333/collections/swarm_signals | python3 -m json.tool | grep points_count
```

---

## Full round workflow (all 5 agents)

Run one round per agent sequentially. Use a 30-second gap between NOVA uploads to avoid rate limiting on the NOVA backend.

```bash
source .venv/bin/activate

AGENTS=(
  "ironclaw-swarm-agent1.nova-sdk-6.testnet 8081 agent1_secret"
  "ironclaw-swarm-agent2.nova-sdk-6.testnet 8082 agent2_secret"
  "ironclaw-swarm-agent3.nova-sdk-6.testnet 8083 agent3_secret"
  "ironclaw-swarm-agent4.nova-sdk-6.testnet 8084 agent4_secret"
  "ironclaw-swarm-agent5.nova-sdk-6.testnet 8085 agent5_secret"
)

ROUND=2
BODY='{"user_id": "default", "content": "swarm contribution"}'

for AGENT_STR in "${AGENTS[@]}"; do
  read -r AGENT_ID PORT SECRET <<< "$AGENT_STR"
  DB="ironclaw_agent${PORT: -1}"

  echo ""
  echo "=== $AGENT_ID ==="

  # Step 1: run simulation
  python3 agents/data/simulation/run_simulation.py \
    --agent-id "$AGENT_ID" \
    --round "$ROUND" \
    --n-agents 8 \
    --steps 5 \
    --output-dir agents/data/simulation/outputs

  # Step 2: trigger skill (NOVA upload)
  SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"
  curl -s -X POST "http://localhost:$PORT/webhook" \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: $SIG" \
    -d "$BODY"
  echo ""

  echo "Waiting 60s for agent to complete..."
  sleep 60

  # Step 3: get CID from memory
  CID=$(docker exec ironclaw-postgres psql -U ironclaw -d "$DB" -t \
    -c "SELECT content FROM memory_documents WHERE path='swarm/last_contribution.md';" \
    | grep "cid:" | awk '{print $2}' | tr -d '[:space:]')

  echo "CID: $CID"

  # Step 4: push signals
  QDRANT_URL=http://localhost:6333 \
  OLLAMA_BASE_URL=http://localhost:11434 \
  python3 agents/data/simulation/push_signals.py \
    --signals-file "agents/data/simulation/outputs/signals_round$(printf '%04d' $ROUND).json" \
    --nova-cid "$CID" \
    --agent-id "$AGENT_ID" \
    --round "$ROUND"

  sleep 30
done
```

---

## Known Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `No such file or directory: outputs/` | Output dir not created | `mkdir -p agents/data/simulation/outputs` |
| `No such file or directory: run_simulation.py` | Wrong working directory | Always run from repo root, not from `agents/` |
| `externally-managed-environment` pip error | macOS Homebrew Python | Use `.venv` as documented above |
| `nodename nor servname provided` | Script using Docker hostname on host | Set `QDRANT_URL=http://localhost:6333` and `OLLAMA_BASE_URL=http://localhost:11434` |
| `HTTP Error 400` on Qdrant upsert | Wrong HTTP method (POST vs PUT) | Upsert uses PUT — already fixed in `push_signals.py` |
| Files not visible inside container | Volume not mounted | Confirm `./data/simulation:/data/simulation` in compose |
| `nomic-embed-text` not found | Model not pulled | `docker compose exec ollama ollama pull nomic-embed-text` |

---

## Next Steps

| Item | Notes |
|------|-------|
| Per-agent simulation outputs | Each agent should produce its own round files with a unique seed, rather than all agents sharing the same output. Requires either per-agent output dirs or agent-specific filenames. |
| Automated round triggering | Replace manual workflow with an orchestrator script that loops through agents on a schedule. |
| Orchestrator + GNN training | Pull graph JSONs from NOVA group, build PyG dataset, train GraphSAGE oracle on `swarm_signals`. |
| Round number management | Currently incremented manually. Should read from `swarm/last_contribution.md` via the PostgreSQL memory table. |
| VPS migration | When moving to OVH: set `QDRANT_URL` and `OLLAMA_BASE_URL` to the VPS localhost, run scripts over SSH. Same workflow, different host. |