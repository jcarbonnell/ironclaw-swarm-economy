# IronClaw Agent Onboarding – Swarm Setup

This document records the exact, reproducible onboarding procedure for each IronClaw agent in the `ironclaw-swarm-economy` local prototype. It covers the interactive wizard steps, post-onboarding fixes, and per-agent configuration reference.

Tested with: **IronClaw v0.28.2**, **Docker Compose v2**, **macOS host**, **pgvector/pgvector:pg16**.

---

## Prerequisites

### 1. Password policy

**Use only alphanumeric passwords** for PostgreSQL. Special characters (e.g. `=`, `@`, `#`) break `${VAR}` substitution in compose DATABASE_URLs and cause silent connection failures. Set this once in `agents/.env` and never change it.

```bash
# agents/.env
POSTGRES_USER=ironclaw
POSTGRES_PASSWORD=SimplePass123   # alphanumeric only
POSTGRES_DB=ironclaw
```

### 2. Start infrastructure services

```bash
cd agents
docker compose up -d --build
docker compose ps
# postgres: healthy
# qdrant: running
# ollama: running
# ironclaw-agentX: restarting (expected — onboarding not done yet)
```

### 3. Create per-agent databases

Run once before onboarding any agent:

```bash
docker exec -it ironclaw-postgres psql -U ironclaw -c "
CREATE DATABASE ironclaw_agent1;
CREATE DATABASE ironclaw_agent2;
CREATE DATABASE ironclaw_agent3;
CREATE DATABASE ironclaw_agent4;
CREATE DATABASE ironclaw_agent5;
"
```

---

## Onboarding Command

Run the wizard for each agent **one at a time**. Do not run multiple wizards in parallel.

```bash
docker compose run --rm --entrypoint ironclaw ironclaw-agent1 onboard
docker compose run --rm --entrypoint ironclaw ironclaw-agent2 onboard
docker compose run --rm --entrypoint ironclaw ironclaw-agent3 onboard
docker compose run --rm --entrypoint ironclaw ironclaw-agent4 onboard
docker compose run --rm --entrypoint ironclaw ironclaw-agent5 onboard
```

> **Note**: `docker compose run --rm` creates a temporary container that shares the same Docker network as the services, so `postgres` hostname resolves correctly.

---

## Wizard Answers (Same for All Agents Except Where Noted)

### Step 1 — Deployment Profile

Select `[1] Local` (TUI + background tasks, no Docker sandbox).

Docker sandbox will show as unavailable — this is expected and handled post-onboarding.

### Step 2 — Database

| Field | Value |
|-------|-------|
| Backend | `[1] PostgreSQL` |
| Database URL | See per-agent reference below |

Always include `?sslmode=disable` — without it, sqlx attempts a TLS handshake on loopback and fails.

### Step 3 — Security

| Field | Value |
|-------|-------|
| Secret storage | `[2] Environment variable` |

The wizard generates a `SECRETS_MASTER_KEY` and prints it. **Record this key for each agent** — it must be added to the compose environment block (see compose configuration below).

### Step 4 — Inference Provider

| Field | Value |
|-------|-------|
| Provider | `[5] Anthropic` |
| Auth method | `[1] Direct API Key` |
| API key | Your Anthropic API key |

### Step 5 — Model

| Field | Value |
|-------|-------|
| Model | `[5] Claude Haiku 4.5` |

Haiku keeps per-agent inference costs low during simulation. Upgrade to Sonnet for the orchestrator.

### Step 6 — Embeddings

| Field | Value |
|-------|-------|
| Enable embeddings | `y` |

The wizard warns that no NEAR AI session or OpenAI key is found and skips configuration. **This is expected** — Ollama embeddings are injected via environment variables at runtime, not configured in the wizard.

### Step 7 — Tunnel

| Field | Value |
|-------|-------|
| Configure tunnel | `n` |

No tunnel needed. The VPS is accessed via SSH only.

### Step 8 — Channels

| Field | Value |
|-------|-------|
| HTTP webhook | enabled |
| Port | `8081` |
| Host | `0.0.0.0` |
| Generate webhook secret | `y` |

**Why `0.0.0.0` inside the container?** Each agent is an isolated network namespace. `0.0.0.0` lets Docker's port forwarding reach the process. Restriction to localhost happens at the compose port mapping level, not inside the container.

**Important**: the wizard stores the webhook secret in the encrypted database. Since we do not persist the config directory via volume mount, this secret is lost on container restart. A fresh secret must be generated and injected via the compose environment instead (see compose configuration below).

### Step 9 — Extensions

| Extension | Mode |
|-----------|------|
| GitHub | manual |
| LLM Context | manual |
| Portfolio | manual |
| Web Search | manual |

Additional skills (nova-skill, simulation skills) will be installed post-onboarding.

### Step 10 — Docker Sandbox

Select `y` — the wizard will report Docker unavailable and disable it. This is expected.

### Step 11 — Heartbeat

| Field | Value |
|-------|-------|
| Enable heartbeat | `y` |
| Interval | `30` minutes |

### Confirmation

A successful onboarding ends with:

```
✓ ironclaw is ready
    provider    Anthropic (claude-haiku-4-5)
    database    PostgreSQL
    security    environment variable
──────────────────────────────────────
Start chatting:   ironclaw
Full setup:       ironclaw onboard
```

---

## Compose Configuration (Post-Onboarding)

After onboarding all 5 agents, the compose file must be updated with the values generated during the wizard. This is the complete, verified environment block for each agent:

```yaml
  ironclaw-agentN:
    build:
      context: https://github.com/nearai/ironclaw.git
      dockerfile: Dockerfile
    container_name: ironclaw-agentN
    command: run --no-onboard        # required — bare 'ironclaw' triggers wizard in v0.28+
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_started
    environment:
      # Database
      DATABASE_BACKEND: postgres
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ironclaw_agentN?sslmode=disable

      # Onboarding state
      ONBOARD_COMPLETED: "true"

      # Secrets — copy from wizard output per agent
      SECRETS_MASTER_KEY: "your_generated_key_here"

      # LLM
      NEARAI_MODEL: anthropic/claude-haiku-4-5

      # Embeddings (Ollama)
      EMBEDDING_PROVIDER: ollama
      EMBEDDING_MODEL: nomic-embed-text
      OLLAMA_BASE_URL: http://ollama:11434

      # HTTP channel
      HTTP_ENABLED: "true"
      HTTP_HOST: "0.0.0.0"
      HTTP_PORT: "8081"
      HTTP_WEBHOOK_SECRET: "generate_with_openssl_rand_hex_32"

      # Infrastructure
      NEAR_NETWORK: testnet
      QDRANT_URL: http://qdrant:6333
    volumes:
      - ./data/agentN:/data          # do NOT mount /home/ironclaw/.ironclaw
    ports:
      - "127.0.0.1:808N:8081"        # distinct host port per agent
    restart: unless-stopped
```

> **Critical**: do not mount `./data/agentN/config:/home/ironclaw/.ironclaw`. This causes PID lock permission failures because the mounted directory is owned by the host user (UID 501 on macOS) but ironclaw runs as UID 1000 inside the container. All config is injected via environment variables instead.

Generate webhook secrets:

```bash
for i in {1..5}; do echo "agent$i: $(openssl rand -hex 32)"; done
```

---

## Per-Agent Port Reference

| Agent | Database | Internal Port | Host Port | Container Name |
|-------|----------|---------------|-----------|----------------|
| agent1 | ironclaw_agent1 | 8081 | 8081 | ironclaw-agent1 |
| agent2 | ironclaw_agent2 | 8081 | 8082 | ironclaw-agent2 |
| agent3 | ironclaw_agent3 | 8081 | 8083 | ironclaw-agent3 |
| agent4 | ironclaw_agent4 | 8081 | 8084 | ironclaw-agent4 |
| agent5 | ironclaw_agent5 | 8081 | 8085 | ironclaw-agent5 |

Host ports are bound to `127.0.0.1` only — nothing is exposed to the public interface. SSH tunnel when working remotely:

```bash
ssh -L 8081:localhost:8081 -L 8082:localhost:8082 \
    -L 8083:localhost:8083 -L 8084:localhost:8084 \
    -L 8085:localhost:8085 user@vps-ip
```

---

## Verification

### 1. All agents running

```bash
docker compose ps
# All ironclaw-agentX should show: Up (not Restarting)
```

### 2. Agent startup log

```bash
docker logs ironclaw-agent1 2>&1 | tail -10
# Expected:
# ironclaw v0.28.2
# model       claude-haiku-4-5  via anthropic
# channels    tui  http
# features    db:postgres  tools:57  routines  heartbeat:30m  skills
# ready in Xs
```

### 3. HTTP webhook responding

The webhook uses HMAC-SHA256 authentication (`X-Hub-Signature-256` header), not a raw secret header:

```bash
SECRET="your_agent1_webhook_secret"
BODY='{"user_id": "default", "content": "ping"}'
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -X POST http://localhost:8081/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"

# Expected: {"message_id":"<uuid>","status":"accepted","response":null}
```

Test all 5 agents:

```bash
declare -A SECRETS
SECRETS[8081]="agent1_secret"
SECRETS[8082]="agent2_secret"
SECRETS[8083]="agent3_secret"
SECRETS[8084]="agent4_secret"
SECRETS[8085]="agent5_secret"

BODY='{"user_id": "default", "content": "ping"}'

for port in 8081 8082 8083 8084 8085; do
  SECRET="${SECRETS[$port]}"
  SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"
  echo -n "agent port $port: "
  curl -s -X POST http://localhost:$port/webhook \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: $SIG" \
    -d "$BODY"
  echo
done
```

### 4. Pull Ollama embedding model (run once)

```bash
docker compose exec ollama ollama pull nomic-embed-text
```

---

## Known Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Agents restart in a loop after `docker compose up` | Bare `ironclaw` entrypoint triggers setup wizard in v0.28+ which fails non-interactively | Add `command: run --no-onboard` to each agent service |
| `no configuration file provided: not found` | ironclaw wizard running non-interactively with no TTY | Same fix: `command: run --no-onboard` |
| `Permission denied` on PID lock or `.env` | Config directory volume mount owned by host UID (501) not container UID (1000) | Remove the `/home/ironclaw/.ironclaw` volume mount entirely; inject all config via environment variables |
| `Connection pool error` after fixing PID lock | `${POSTGRES_PASSWORD}` not resolving correctly in DATABASE_URL | Check `agents/.env` has the correct password; ensure no special characters |
| `SECRETS_MASTER_KEY` error on startup | Key stored in wizard's ephemeral container layer, lost on restart | Add `SECRETS_MASTER_KEY` explicitly to compose environment block |
| `Empty reply from server` on curl to port 808X | `HTTP_ENABLED` not set; channel registered but not listening | Add `HTTP_ENABLED: "true"` to compose environment |
| `HTTP_ENABLED=true` causes YAML error | Using `=` instead of `:` in YAML map | Use `HTTP_ENABLED: "true"` (colon syntax) |
| Webhook returns 401 with `X-Webhook-Secret` header | v0.28 uses HMAC-SHA256 (`X-Hub-Signature-256`), not raw secret header | Compute `sha256=<hmac>` signature over the request body |
| Webhook returns `missing field 'content'` | Payload uses `message` field; v0.28 expects `content` | Use `{"user_id": "default", "content": "your message"}` |
| Special characters in postgres password break DATABASE_URL | `=` or `@` in password corrupts URL substitution | Use alphanumeric-only passwords (e.g. `SimplePass123`) |
| Embeddings not configured after onboarding | Wizard skips Ollama (no NEAR AI/OpenAI key found) | Add `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `OLLAMA_BASE_URL` to compose environment |
| `denied` pulling `ghcr.io/nearai/ironclaw:latest` | Image is not publicly available | Build from source via `context: https://github.com/nearai/ironclaw.git` in compose |
| Qdrant healthcheck `unhealthy` | `curl` not available in Qdrant image | Use `wget -qO- http://localhost:6333/healthz || exit 1` in healthcheck test |
