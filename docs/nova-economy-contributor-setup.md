# nova-economy-contributor — Setup & Operation

Documents everything built after the base swarm was deployed and verified. Covers NOVA group setup, the `nova-economy-contributor` skill, credential management, and the first successful end-to-end contributions from all 5 agents.

Tested with: **IronClaw v0.28.2**, **nova-submit v0.1.0**, **NOVA testnet (nova-sdk-6.testnet)**, **macOS host**.

---

## Prerequisites

- 5 IronClaw agents running and HTTP webhooks verified (see `local-swarm-setup.md`)
- NEAR CLI installed (`npm install -g near-cli`)
- NOVA account at `testnet.nova-sdk.com`

---

## 1. NEAR Testnet Accounts

Create one NEAR account per agent plus an owner account. Each is funded with 2 NEAR from the faucet.

```bash
near create-account ironclaw-swarm.testnet --useFaucet
near create-account ironclaw-swarm-agent1.testnet --useFaucet
near create-account ironclaw-swarm-agent2.testnet --useFaucet
near create-account ironclaw-swarm-agent3.testnet --useFaucet
near create-account ironclaw-swarm-agent4.testnet --useFaucet
near create-account ironclaw-swarm-agent5.testnet --useFaucet
```

---

## 2. NOVA Accounts and API Keys

Each agent needs its own NOVA account (distinct from the NEAR account). NOVA accounts follow the pattern `<name>.nova-sdk-6.testnet`.

1. Go to `testnet.nova-sdk.com` and sign in with GitHub for the owner account (`ironclaw-swarm.nova-sdk-6.testnet`)
2. Repeat for each agent account (`ironclaw-swarm-agent1.nova-sdk-6.testnet` through `agent5`)
3. Generate one API key per account — shown only once, store immediately

**Naming distinction:**

| NEAR account | NOVA account |
|---|---|
| `ironclaw-swarm-agent1.testnet` | `ironclaw-swarm-agent1.nova-sdk-6.testnet` |

The NEAR account is for on-chain identity. The NOVA account is for NOVA group membership and API authentication. They are different accounts.

---

## 3. NOVA Group Setup

Create the shared group from `testnet.nova-sdk.com` using the owner account (`ironclaw-swarm.testnet`), then add each agent's **NOVA account** as a member.

Group name: `ironclaw-swarm-economy`

Members to add (NOVA accounts, not bare NEAR accounts):
- `ironclaw-swarm-agent1.nova-sdk-6.testnet`
- `ironclaw-swarm-agent2.nova-sdk-6.testnet`
- `ironclaw-swarm-agent3.nova-sdk-6.testnet`
- `ironclaw-swarm-agent4.nova-sdk-6.testnet`
- `ironclaw-swarm-agent5.nova-sdk-6.testnet`

> **Critical**: add the `.nova-sdk-6.testnet` accounts, not the bare `.testnet` accounts. The NOVA backend calls `is_authorized` using the NOVA account ID — if the bare NEAR account is added instead, all uploads will return 403.

---

## 4. Install nova-submit Tool

`nova-submit` is a WASM tool that performs the full NOVA upload sequence (session token → prepare\_upload → AES-256-GCM encrypt → finalize\_upload) in a single call. The agent's LLM never touches keys or encrypted bytes.

Download on the host (containers have no `curl`):

```bash
curl -fsSL -O https://github.com/jcarbonnell/nova/releases/download/nova-submit-v0.1.0/nova-submit.wasm
curl -fsSL -O https://github.com/jcarbonnell/nova/releases/download/nova-submit-v0.1.0/nova-submit.capabilities.json
```

Install into all 5 containers (both files must be present together):

```bash
for i in 1 2 3 4 5; do
  docker cp nova-submit.wasm ironclaw-agent$i:/home/ironclaw/nova-submit.wasm
  docker cp nova-submit.capabilities.json ironclaw-agent$i:/home/ironclaw/nova-submit.capabilities.json
  docker exec ironclaw-agent$i ironclaw tool install /home/ironclaw/nova-submit.wasm
done
```

Verify:

```bash
docker exec ironclaw-agent1 ironclaw tool list | grep nova-submit
# Expected: nova-submit (190.8 KB, caps: ✓)
```

**Persistence**: `nova-submit` installs into the container's writable layer and is lost on `--force-recreate`. Mount the tools directory as a volume to persist it:

Add to each agent in `docker-compose.yml`:
```yaml
volumes:
  - ./data/agentN:/data
  - ./skills:/home/ironclaw/.ironclaw/skills
  - ./tools:/home/ironclaw/.ironclaw/tools   # add this line
```

Copy the files to the host tools directory:
```bash
mkdir -p agents/tools
cp nova-submit.wasm agents/tools/
cp nova-submit.capabilities.json agents/tools/
```

---

## 5. nova-economy-contributor Skill

The skill instructs the agent to read NOVA credentials from memory, build a simulation payload, call `nova-submit`, and record the result. It is fully autonomous — no user confirmation required.

Install into the shared skills volume (persists across restarts):

```bash
mkdir -p agents/skills/nova-economy-contributor
# copy SKILL.md into agents/skills/nova-economy-contributor/SKILL.md
```

The `agents/skills/` directory is mounted at `/home/ironclaw/.ironclaw/skills/` in all containers via the compose volume mount added in step 4.

Verify discovery after restart:

```bash
docker exec ironclaw-agent1 ironclaw skills list
# Expected: nova-economy-contributor v0.1.0 [trusted]
```

---

## 6. Agent Credentials in Memory

The skill reads `NOVA_ACCOUNT_ID`, `NOVA_GROUP_ID`, and `NOVA_API_KEY` from the agent's memory document at `swarm/config.md`.

**Why memory, not environment variables**: the IronClaw shell tool (used to read env vars) does not inherit the process environment. The LLM cannot access env vars via tools. Memory is the reliable channel for per-agent config the LLM needs to act on.

**Why not secrets store**: `nova-submit` takes credentials as call parameters (not host-injected headers), so the LLM must pass them directly. The secrets store only works with host-injected credentials.

Write config for each agent directly into PostgreSQL:

```bash
docker exec ironclaw-postgres psql -U ironclaw -d ironclaw_agent1 -c \
  "INSERT INTO memory_documents (user_id, path, content)
   VALUES ('default', 'swarm/config.md',
   'NOVA_ACCOUNT_ID=ironclaw-swarm-agent1.nova-sdk-6.testnet
NOVA_GROUP_ID=ironclaw-swarm-economy
NOVA_API_KEY=nova_sk_...')
   ON CONFLICT (user_id, agent_id, path) DO UPDATE SET content = EXCLUDED.content, updated_at = now();"
```

Repeat for agents 2–5 with their respective account IDs and API keys.

Verify all 5:

```bash
for i in 1 2 3 4 5; do
  echo "=== agent$i ==="
  docker exec ironclaw-postgres psql -U ironclaw -d ironclaw_agent$i -c \
    "SELECT left(content, 60) FROM memory_documents WHERE path='swarm/config.md';"
done
```

---

## 7. Compose Environment Variables

Several variables were added to `docker-compose.yml` and `agents/.env` beyond the base setup. The full additions per agent:

```yaml
# In docker-compose.yml, per agent:
NEARAI_API_KEY: "${NEARAI_API_KEY}"          # required for NEAR AI session (ironclaw doctor ✓)
ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"    # direct Anthropic inference
NEARAI_MODEL: "${NEARAI_MODEL}"              # anthropic/claude-haiku-4-5
NOVA_ACCOUNT_ID: "${NOVA_ACCOUNT_ID_AGENT_N}"
NOVA_API_KEY: "${NOVA_API_KEY_AGENT_N}"
NOVA_GROUP_ID: "${NOVA_GROUP_ID}"
```

```dotenv
# In agents/.env:
NEARAI_MODEL=anthropic/claude-haiku-4-5
NEARAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
NOVA_GROUP_ID=ironclaw-swarm-economy
NOVA_ACCOUNT_ID_AGENT_1=ironclaw-swarm-agent1.nova-sdk-6.testnet
NOVA_API_KEY_AGENT_1=nova_sk_...
# repeat for agents 2-5
```

The `--auto-approve` flag must be added to each agent's run command to allow autonomous tool execution:

```yaml
command: run --no-onboard --auto-approve
```

Without `--auto-approve`, the agent accepts webhook messages but never invokes tools — the job system silently blocks all tool calls waiting for interactive approval.

---

## 8. Verification

Send a contribution trigger to all 5 agents sequentially (30s gap to avoid NOVA backend rate limits):

```bash
BODY='{"user_id": "default", "content": "swarm contribution"}'

declare -A SECRETS
SECRETS[8081]="agent1_webhook_secret"
SECRETS[8082]="agent2_webhook_secret"
SECRETS[8083]="agent3_webhook_secret"
SECRETS[8084]="agent4_webhook_secret"
SECRETS[8085]="agent5_webhook_secret"

for port in 8081 8082 8083 8084 8085; do
  SECRET="${SECRETS[$port]}"
  SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"
  curl -s -X POST http://localhost:$port/webhook \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: $SIG" \
    -d "$BODY"
  echo
  sleep 30
done
```

Check results after 60s per agent:

```bash
for i in 1 2 3 4 5; do
  echo "=== agent$i ==="
  docker exec ironclaw-postgres psql -U ironclaw -d ironclaw_agent$i -c \
    "SELECT content FROM conversation_messages WHERE role='assistant' ORDER BY created_at DESC LIMIT 1;"
done
```

Expected output per agent:
```
✓ nova-economy-contributor
  Round:   N
  CID:     Qm...
  Group:   ironclaw-swarm-economy
  Agent:   ironclaw-swarm-agentN.nova-sdk-6.testnet
```

---

## Known Issues

| Issue | Cause | Fix |
|---|---|---|
| `nova-submit` disappears after `--force-recreate` | Tool installs into ephemeral container layer | Mount `./tools:/home/ironclaw/.ironclaw/tools` as a volume |
| Skill not injected into LLM context (3 input tokens) | `--auto-approve` flag missing; agent silently blocks all tool calls | Add `--auto-approve` to `command: run --no-onboard --auto-approve` |
| NEAR AI session not found (`ironclaw doctor` fails) | `NEARAI_API_KEY` not in compose environment | Add `NEARAI_API_KEY` to compose and `agents/.env` |
| Skill not discovered after restart | Skill was installed into container layer, not mounted volume | Use `./skills:/home/ironclaw/.ironclaw/skills` volume mount |
| 403 on `prepare_upload` | Agent's bare NEAR account added to group instead of NOVA account | Add `agentN.nova-sdk-6.testnet` accounts to group, not `agentN.testnet` |
| 500 on simultaneous contributions | NOVA backend overloaded by concurrent calls | Send contributions sequentially with 30s gap between agents |
| `NOVA_API_KEY` not readable by skill | Leak detector redacts `nova_sk_...` pattern before LLM sees it via shell | Store API key in agent memory (`swarm/config.md`) instead |
| Skill reads env vars via shell (fails) | Shell tool does not inherit process environment | Remove all shell-based env reading from skill; use `memory_read` only |

---

## Next Steps

| Item | Priority | Notes |
|---|---|---|
| Contribution backlog / queue | High | Prevents simultaneous NOVA calls; models real blockchain mempool dynamics |
| `nova-submit` v0.2.0 | Medium | Move credentials out of call parameters into host-injected secrets via `capabilities.json` `credentials` block — currently `api_key` is passed plaintext through the LLM, violating IronClaw's security model where secrets never enter the WASM sandbox |
| MESA simulation layer | High | Replace static payload in skill with real MESA + NetworkX simulation output |
| Qdrant signal push | High | Push micro/meso/macro signals after each contribution |
| Orchestrator + GNN training | High | Pull contributions from NOVA group, train GraphSAGE oracle |
| Dashboard | Medium | FastAPI + minimal frontend polling agent webhooks |
| Mainnet migration | Low | Switch `NOVA_CONTRACT_ID` and regenerate API keys when moving to production |
