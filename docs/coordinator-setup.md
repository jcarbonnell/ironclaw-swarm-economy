# Coordinator Setup

**Document version**: 1.0
**Status**: Tested and working
**Scope**: Per-agent simulation output isolation, NOVA graph pull (`pull_graphs.mjs`), and oracle training (`train_oracle.py`).

Tested with: **Python 3.13.1**, **Node.js v22.11.0**, **nova-sdk-js 1.1.0**, **NOVA testnet (nova-sdk-6.testnet)**, **macOS host**.

---

## Overview

The coordinator is the central intelligence layer of the swarm. It runs on the host (later the OVH VPS) and is responsible for:

1. Pulling encrypted graph contributions from the shared NOVA group
2. Decrypting them using the group owner's credentials
3. Training an oracle model on the aggregated graph data

It is entirely separate from the IronClaw agents. Agents contribute autonomously; the coordinator observes and learns.

The coordinator has two scripts:

| Script | Language | Purpose |
|--------|----------|---------|
| `pull_graphs.mjs` | Node.js | Lists NOVA group transactions, retrieves and decrypts new graph JSONs, writes to `orchestrator/data/graphs/` |
| `train_oracle.py` | Python | Loads decrypted graphs, extracts features, trains a linear regression oracle predicting macro signals |

The current oracle is a **numpy linear regression** — a deliberate choice for the local prototype phase. The upgrade path to GraphSAGE (PyTorch Geometric) is a single function swap, documented in Next Steps.

---

## Repository Layout

```
ironclaw-swarm-economy/
├── orchestrator/
│   ├── pull_graphs.mjs
│   ├── train_oracle.py
│   ├── .env                        # NOVA credentials (not committed)
│   └── data/
│       ├── graphs/                 # Decrypted graph JSONs from NOVA
│       ├── models/                 # Trained oracle weights
│       │   ├── oracle_<ts>.json
│       │   └── oracle_latest.json
│       ├── pull_registry.json      # CIDs already pulled (skip on next run)
│       ├── manifest.json           # Written after each pull run
│       └── training_log.jsonl      # One entry per training run
├── agents/
│   └── data/
│       └── simulation/
│           └── outputs/
│               ├── agent1/         # Per-agent simulation outputs
│               ├── agent2/
│               ├── agent3/
│               ├── agent4/
│               └── agent5/
└── tests/
    └── test_nova_retrieve.mjs      # NOVA round-trip test (testnet)
```

---

## Prerequisites

### Node.js dependencies

From the repo root:

```bash
npm install nova-sdk-js dotenv
```

### NOVA credentials

Create `orchestrator/.env`:

```bash
NOVA_API_KEY=nova_sk_...
NOVA_ACCOUNT_ID=ironclaw-swarm.nova-sdk-6.testnet
NOVA_GROUP_ID=ironclaw-swarm-economy
```

Add to `.gitignore`:

```bash
echo "orchestrator/.env" >> .gitignore
```

**Important**: API keys are single-use. Generating a new key at testnet.nova-sdk.com invalidates the previous one. If authentication fails with 401, generate a fresh key and update `.env`.

Verify the key is valid before running:

```bash
curl -s -X POST https://nova-sdk.com/api/auth/session-token \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $NOVA_API_KEY" \
  -d '{"account_id":"ironclaw-swarm.nova-sdk-6.testnet"}'
# Expected: {"token":"eyJ...","expires_in":"24h"}
```

---

## Per-Agent Simulation Output Isolation

Before the coordinator can pull meaningfully distinct graphs from each agent, each agent must write its simulation outputs to its own subdirectory. This was not in the original setup — all agents shared a single output folder and uploaded identical graphs.

### Create per-agent output directories

```bash
mkdir -p agents/data/simulation/outputs/agent{1,2,3,4,5}
```

### Update the docker-compose.yml volume mount

The simulation directory was not mounted in the original compose file. Add this line to every agent service's `volumes` block:

```yaml
volumes:
  - ./data/agentN:/data
  - ./data/simulation:/data/simulation    # add this line
  - ./skills:/home/ironclaw/.ironclaw/skills
  - ./tools:/home/ironclaw/.ironclaw/tools
```

Restart to apply:

```bash
docker compose up -d
```

Verify the mount is active:

```bash
docker exec ironclaw-agent1 ls /data/simulation/outputs/
# Expected: agent1  agent2  agent3  agent4  agent5
```

### Run simulations into per-agent directories

Always run from the repo root with the venv activated. Pass the agent-specific `--output-dir` and `--agent-id`:

```bash
source .venv/bin/activate

for i in 1 2 3 4 5; do
  python3 agents/data/simulation/run_simulation.py \
    --agent-id ironclaw-swarm-agent$i.nova-sdk-6.testnet \
    --round 1 \
    --n-agents 8 \
    --steps 5 \
    --output-dir agents/data/simulation/outputs/agent$i
done
```

Each agent now has its own graph with independent random seeds and distinct economic outcomes. The IronClaw skill reads from `/data/simulation/outputs/{short_name}/` — it derives the short name from the agent's NOVA account ID by taking everything before the first dot.

### Update the skill to read from the per-agent subdirectory

In `agents/skills/nova-economy-contributor/SKILL.md`, Step 3 instructs the agent to derive its short name and list:

```
ls /data/simulation/outputs/{short_name}/
```

where `short_name` is `ironclaw-swarm-agent1` from `ironclaw-swarm-agent1.nova-sdk-6.testnet`.

---

## Step 1 — Pull graphs from NOVA

```bash
node orchestrator/pull_graphs.mjs
```

The script:
1. Reads credentials from `orchestrator/.env`
2. Fetches a session token from `nova-sdk.com/api/auth/session-token`
3. Calls `get_group_transactions` on the NOVA MCP server to list all contributions
4. Filters out CIDs already in `orchestrator/data/pull_registry.json`
5. Retrieves and decrypts each new CID via `sdk.retrieve()`
6. Validates the decrypted content is a graph JSON (nodes + links)
7. Writes valid graphs to `orchestrator/data/graphs/`
8. Updates the registry and writes a manifest

### Expected output (first run)

```
🔗 NOVA Graph Pull — ironclaw-swarm-economy

   Account:  ironclaw-swarm.nova-sdk-6.testnet
   Group:    ironclaw-swarm-economy
   Already pulled: 0 CID(s)

📋 Fetching group transaction log...
   Found 15 total contribution(s)
   New (not yet pulled): 15

   Retrieving [1/15] Qm...
   ⚠  Skipped (legacy payload — not JSON)
   ...
   Retrieving [13/15] Qmd4e01b1a2d7995ef20b3c6e53bc4123c96f7d0f67e5f
   ✅ ironclaw-swarm-agent1.nova-sdk-6.testnet | round=1 | nodes=8 | links=17

══════════════════════════════════════════════════
Pull complete
  ✅ Success: 3
  ⚠  Skipped: 12
  ❌ Failed:  0
  Total in registry: 15
══════════════════════════════════════════════════
```

### Subsequent runs

The registry skips already-pulled CIDs without making network calls. Only new contributions are fetched. A run with nothing new completes in under 2 seconds:

```
Already pulled: 15 CID(s)
New (not yet pulled): 0
✓ Nothing new to pull.
```

### Legacy payloads

Contributions made by skill v0.1.0 contain Markdown text, not graph JSON. These are automatically detected, registered as seen, and skipped. They do not appear on subsequent runs.

### NOVA testnet confirmation

NOVA testnet uses **real IPFS storage** via Pinata — not mocks. Confirmed by retrieving a graph CID and decrypting 4,557 bytes of valid graph JSON with correct node and link structure. The full privacy claim holds: agents upload encrypted graphs, only authorized group members can decrypt them, the coordinator (group owner) retrieves all contributions.

---

## Step 2 — Train the oracle

```bash
source .venv/bin/activate
python3 orchestrator/train_oracle.py
```

The script:
1. Loads all graph JSONs from `orchestrator/data/graphs/`
2. Extracts an 8-dimensional feature vector per graph (density, cooperation score, trust delta, success rate, reputation, token distribution)
3. Computes 4 macro target values per graph (market efficiency, cooperation index, wealth gini, strategy convergence) from graph structure
4. Trains a batch gradient descent linear regression for 200 epochs
5. Evaluates MAE and R² per target on the training set
6. Saves timestamped weights + `oracle_latest.json`
7. Appends a line to `orchestrator/data/training_log.jsonl`

### Expected output

```
══════════════════════════════════════════════════
  Agentic Economy Oracle — Training
  Architecture: Linear Regression (numpy)
══════════════════════════════════════════════════

[oracle] Loading 3 graph(s) from orchestrator/data/graphs
[oracle] Valid samples: 3 | Skipped: 0
[oracle] Dataset: 3 samples | Features: 8 | Targets: 4
[oracle] Agents seen: ['ironclaw-swarm-agent1...', 'ironclaw-swarm-agent2...']
[oracle] Rounds seen: [1, 2]

[oracle] Training...
[oracle] epoch 001/200 | loss=0.287395
[oracle] epoch 051/200 | loss=0.088565
[oracle] epoch 101/200 | loss=0.031127
[oracle] epoch 151/200 | loss=0.014488
[oracle] epoch 200/200 | loss=0.009672

[oracle] Evaluation (training set):
  market_efficiency         MAE=0.1370  R²=-0.0056
  cooperation_index         MAE=0.1233  R²=0.1913
  wealth_gini               MAE=0.0052  R²=-0.1113
  strategy_convergence      MAE=0.0414  R²=0.0000

[oracle] ✓ Model saved → orchestrator/data/models/oracle_20260603T095433.json
[oracle] ✓ Latest    → orchestrator/data/models/oracle_latest.json
[oracle] ✓ Training log appended → orchestrator/data/training_log.jsonl

══════════════════════════════════════════════════
  Training complete | Loss: 0.009672
══════════════════════════════════════════════════
```

### On R² values with few graphs

With 3 graphs, R² values near zero are expected — a linear model cannot generalize from 3 samples. R² improves as more rounds accumulate across agents. Target: 50+ graphs for meaningful signal, 200+ for stable training.

---

## Full coordinator loop

The standard sequence after each set of swarm contributions:

```bash
# Pull new graphs from NOVA
node orchestrator/pull_graphs.mjs

# Train oracle on all accumulated graphs
source .venv/bin/activate
python3 orchestrator/train_oracle.py
```

Run this after every multi-agent simulation round, or on a schedule via cron once the swarm is on the VPS.

---

## Verification

```bash
# Graphs pulled
ls orchestrator/data/graphs/

# Latest model
cat orchestrator/data/models/oracle_latest.json | python3 -m json.tool | grep -E "trained_at|n_training|final_loss"

# Training history
cat orchestrator/data/training_log.jsonl
```

---

## Known Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `401 Invalid API key` | Key rotated or expired | Generate a new key at testnet.nova-sdk.com → Manage Account → Generate API Key. Update `orchestrator/.env`. One key per account — generating a new one invalidates the old one. |
| `Account not found` on retrieve | SDK defaulting to mainnet MCP | Ensure `contractId: 'nova-sdk-6.testnet'` is passed to `NovaSdk` constructor. Do not pass `mcpUrl` — it overrides the correct URL derived from `contractId`. |
| `session-token HTTP 401` from standalone fetch | Using testnet key against mainnet auth endpoint | Use `https://nova-sdk.com/api/auth/session-token` — testnet accounts authenticate against the same mainnet auth server. |
| `Shade key fetch failed: 500` | Transient TEE error on NOVA backend | Retry on next pull run. Do not register these CIDs as seen — they contain real data. |
| Legacy payloads skipped | Contributions from skill v0.1.0 contain Markdown, not graph JSON | Expected. These are automatically detected and registered so they never appear again. |
| R² near zero | Insufficient training data | Expected with fewer than 10 graphs. Accumulate more rounds before interpreting metrics. |
| `No module named mesa` | venv not activated | `source .venv/bin/activate` before running any Python script. |
| Files not visible in container after adding volume mount | Container not restarted after compose change | `docker compose up -d` to apply new volume mounts. |

---

## Next Steps

| Item | Notes |
|------|-------|
| GraphSAGE upgrade | Replace `_train_numpy()` in `train_oracle.py` with a PyTorch Geometric GraphSAGE implementation. Node features are the 6-dim strategy vectors already in each graph. Edge features are cooperation score and trust delta. Training targets are the 4 macro signals. The data loading and evaluation code stays identical. Requires `torch` and `torch_geometric` — install on the OVH VPS with GPU. |
| Automated coordinator loop | Cron job or systemd timer running `pull_graphs.mjs && train_oracle.py` on the VPS after each simulation epoch. |
| Round number management | Currently incremented manually per simulation run. Should read `round` from the agent's `swarm/last_contribution.md` PostgreSQL record and auto-increment. |
| Oracle versioning | Tag model files with the number of training graphs and swarm round range for reproducibility. |
| VPS migration | Set `QDRANT_URL` and `OLLAMA_BASE_URL` to VPS localhost. Run `pull_graphs.mjs` and `train_oracle.py` over SSH. No other changes required. |
| Oracle export to NEAR AI Marketplace | Once the model is stable, serialize `oracle_latest.json` weights to ONNX format and publish to the NEAR AI agent marketplace as a queryable `Agent Economy Oracle`. |
