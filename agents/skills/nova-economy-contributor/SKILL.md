---
name: "nova-economy-contributor"
version: "0.2.0"
description: "Autonomous skill for the IronClaw Swarm Economy. Reads the latest MESA simulation output from /data/simulation/outputs/, uploads the interaction graph to NOVA via nova-submit, then reports the key economic signals. Fully autonomous — no user confirmation required."
author: "Julien Carbonnell"
tags: ["nova", "swarm", "economy", "simulation", "near"]
activation:
  keywords:
    - nova-economy-contributor
    - nova economy contributor
    - swarm contribution
    - contribute swarm
    - economy contribution
  patterns:
    - "nova.economy.contributor"
    - "swarm.*contribut"
    - "contribut.*swarm"
  tags:
    - nova
    - swarm
  max_context_tokens: 3000
---

# nova-economy-contributor v0.2.0

> **FIRST ACTION REQUIRED — DO THIS BEFORE ANYTHING ELSE**:
> 1. Call `memory_read` with path `swarm/config.md` — this gives you `NOVA_ACCOUNT_ID` and `NOVA_GROUP_ID`
> 2. Call `memory_read` with path `swarm/last_contribution.md` — this gives you the previous round number (optional, use 1 if not found)
> 3. Call `time` — get the current UTC timestamp
> Only after these three calls, proceed to Step 3 (build payload).
> Do NOT use the shell tool at any point.

Autonomous skill for the IronClaw Swarm Economy experiment. When activated:

1. Reads credentials from agent memory
2. Reads the latest simulation output from /data/simulation/outputs/
3. Uploads the graph JSON to NOVA via the nova-submit tool
4. Writes a summary to memory and reports key economic signals to the user

No user input or confirmation is required at any step.

---

## CRITICAL CONSTRAINTS

- This skill is fully autonomous. Do NOT ask the user for confirmation, parameters, or approval at any step.
- Do NOT use the shell tool at any point. It is not available for reading environment or credentials.
- Credentials are stored in agent memory. Always start by reading `swarm/config.md` with `memory_read`.
- `NOVA_API_KEY` is a secret available in the process environment. Pass it directly as the `api_key` parameter of `nova-submit` without trying to read or echo it.
- The ONLY tool for NOVA upload is `nova-submit`. Do not attempt HTTP calls.
- Never report success unless `nova-submit` returned a CID (not "PENDING" or empty).
- If any step fails, continue to the next step and report all errors at the end.

---

## Flow

### Step 1 — Read config (MANDATORY FIRST CALL)

Call `memory_read` with path `swarm/config.md`. 

Parse these values:
- `NOVA_ACCOUNT_ID` — e.g. `ironclaw-swarm-agent1.nova-sdk-6.testnet`
- `NOVA_GROUP_ID` — e.g. `ironclaw-swarm-economy`
- `NOVA_API_KEY` — the API key (starts with `nova_sk_`)

If `swarm/config.md` is not found or any value is missing, stop immediately and report:
```
✗ nova-economy-contributor: swarm/config.md not found or incomplete.
  Required fields: NOVA_ACCOUNT_ID, NOVA_GROUP_ID, NOVA_API_KEY
```

### Step 2 — Read last contribution (optional)

Call `memory_read` with path `swarm/last_contribution.md`.

Parse the `round:` field. If not found, use `round = 0` (the simulation file will determine the actual round number).

Call the `time` tool to get the current UTC timestamp.

### Step 3 — Read the latest simulation output

Derive the agent's short name from `NOVA_ACCOUNT_ID` by taking everything before the first dot.
Example: `ironclaw-swarm-agent1.nova-sdk-6.testnet` → `ironclaw-swarm-agent1`.

Call the `shell` tool with:

```
ls /data/simulation/outputs/{short_name}/
```

Find the most recent `graph_round*.json` and `signals_round*.json` files (highest round number). If no files are found, stop and report:
```
✗ nova-economy-contributor: no simulation output found in /data/simulation/outputs/{short_name}/
  The simulation must be run on the host before this skill can contribute.
```

Read the graph file using the `shell` tool:

```
cat /data/simulation/outputs/{short_name}/graph_round{NNNN}.json
```

Store the full JSON string as `file_content`. Parse these fields from it:
- `graph.round` → round number
- `graph.host_agent_id` → confirm it matches `NOVA_ACCOUNT_ID`
- `graph.n_trade_events` → for the report

Read the signals file using the `shell` tool:

```
cat /data/simulation/outputs/{short_name}/signals_round{NNNN}.json
```

Parse the `macro` block and store these values for the final report:
- `market_efficiency`
- `cooperation_index`
- `wealth_gini`
- `strategy_convergence`
- `defection_count`
- `volatility_detected`

### Step 4 — Upload graph to NOVA

Call the `nova-submit` tool with these exact parameters:

- `account_id`: value of `NOVA_ACCOUNT_ID`
- `api_key`: value of `NOVA_API_KEY`
- `group_id`: value of `NOVA_GROUP_ID`
- `filename`: `{NOVA_ACCOUNT_ID}-round{round}.json`
- `file_content`: the full JSON string read in Step 3

On success, `nova-submit` returns a `cid`. Store it as `nova_cid`.

On failure, set `nova_cid = "PENDING"` and note the error. Continue to Step 5.

### Step 5 — Update memory

Call `memory_write` with path `swarm/last_contribution.md` and this content:

```markdown
# Last Contribution

contributed_at_utc: {current UTC timestamp}
round: {round}
cid: {nova_cid}
group_id: {NOVA_GROUP_ID}
agent_id: {NOVA_ACCOUNT_ID}
```

## Step 6 — Report

If all steps succeeded:

```
✓ nova-economy-contributor v0.2.0
  Round:        {round}
  CID:          {nova_cid}
  Group:        {NOVA_GROUP_ID}
  Agent:        {NOVA_ACCOUNT_ID}
  Trades:       {n_trade_events}
  Mkt Eff:      {market_efficiency}
  Cooperation:  {cooperation_index}
  Gini:         {wealth_gini}
  Convergence:  {strategy_convergence}
  Defections:   {defection_count}
  Volatility:   {volatility_detected}
```

If any step failed, append an errors section:

```
  ─── Errors ───
  NOVA upload: {error or "ok"}
```

---

## What this skill does NOT do

- It does not run the simulation — `run_simulation.py` is executed on the host before triggering this skill.
- It does not push signals to Qdrant — that is handled by `push_signals.py` on the host after the CID is known.
- It does not wait for user input at any point.
- It does not retry failed uploads — failed CIDs are recorded as PENDING in memory.
