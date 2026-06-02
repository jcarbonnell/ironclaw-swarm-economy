# IronClaw Swarm Setup (Local Prototype)

This document describes the exact, reproducible setup used for the first 5 IronClaw agents in the `ironclaw-swarm-economy` project.

Tested with: **IronClaw v0.28.2**, **Docker Compose v2**, **macOS host**, **pgvector/pgvector:pg16**.

---

## Architecture Overview

- **5 IronClaw agents** run in isolated Docker containers.
- Each agent has its **own PostgreSQL database** (inside a shared PostgreSQL + pgvector container).
- A **central Qdrant** instance is used as a lightweight system-level vector store.
- A **shared Ollama** instance provides local embeddings to all agents.
- IronClaw is **built from source** (the official image is not publicly pullable).

### Rationale for Key Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Per-agent storage** | Separate PostgreSQL databases | Strong isolation between agents; full compatibility with IronClaw's expected schema. |
| **System-level store** | Qdrant | Better suited than PostgreSQL for cross-agent vector signals needed by the Agentic Economy Oracle. |
| **IronClaw image** | Built from source | `ghcr.io/nearai/ironclaw:latest` is not publicly pullable. Building from source ensures reproducibility. |
| **Vector search** | Qdrant (central) + pgvector (local) | Local pgvector for each agent's internal memory; Qdrant for system-level signals used by the Oracle. |
| **Embeddings** | Shared Ollama container | Sovereign, zero-cost, no external API key required. One instance serves all 5 agents. |
| **Config persistence** | Environment variables only | Mounting `/home/ironclaw/.ironclaw` causes UID permission failures on macOS (host UID 501 ≠ container UID 1000). All config is injected via compose environment instead. |

---

## Password Policy

**Use only alphanumeric passwords** for PostgreSQL. Special characters (e.g. `=`, `@`, `#`) break `${VAR}` substitution in compose DATABASE_URLs and cause silent connection failures that are very hard to debug.

---

## Final Docker Compose Configuration

File location: `agents/docker-compose.yml`

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: ironclaw-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  qdrant:
    image: qdrant/qdrant:latest
    container_name: ironclaw-qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:6333/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  ollama:
    image: ollama/ollama:latest
    container_name: ironclaw-ollama
    ports:
      - "127.0.0.1:11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped

  ironclaw-agent1:
    build:
      context: https://github.com/nearai/ironclaw.git
      dockerfile: Dockerfile
    container_name: ironclaw-agent1
    command: run --no-onboard
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_started
    environment:
      DATABASE_BACKEND: postgres
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ironclaw_agent1?sslmode=disable
      ONBOARD_COMPLETED: "true"
      SECRETS_MASTER_KEY: "agent1_master_key_here"
      NEAR_NETWORK: testnet
      QDRANT_URL: http://qdrant:6333
      EMBEDDING_PROVIDER: ollama
      EMBEDDING_MODEL: nomic-embed-text
      OLLAMA_BASE_URL: http://ollama:11434
      HTTP_ENABLED: "true"
      HTTP_HOST: "0.0.0.0"
      HTTP_PORT: "8081"
      HTTP_WEBHOOK_SECRET: "agent1_webhook_secret_here"
    volumes:
      - ./data/agent1:/data
    ports:
      - "127.0.0.1:8081:8081"
    restart: unless-stopped

  ironclaw-agent2:
    build:
      context: https://github.com/nearai/ironclaw.git
      dockerfile: Dockerfile
    container_name: ironclaw-agent2
    command: run --no-onboard
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_started
    environment:
      DATABASE_BACKEND: postgres
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ironclaw_agent2?sslmode=disable
      ONBOARD_COMPLETED: "true"
      SECRETS_MASTER_KEY: "agent2_master_key_here"
      NEAR_NETWORK: testnet
      QDRANT_URL: http://qdrant:6333
      EMBEDDING_PROVIDER: ollama
      EMBEDDING_MODEL: nomic-embed-text
      OLLAMA_BASE_URL: http://ollama:11434
      HTTP_ENABLED: "true"
      HTTP_HOST: "0.0.0.0"
      HTTP_PORT: "8081"
      HTTP_WEBHOOK_SECRET: "agent2_webhook_secret_here"
    volumes:
      - ./data/agent2:/data
    ports:
      - "127.0.0.1:8082:8081"
    restart: unless-stopped

  ironclaw-agent3:
    build:
      context: https://github.com/nearai/ironclaw.git
      dockerfile: Dockerfile
    container_name: ironclaw-agent3
    command: run --no-onboard
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_started
    environment:
      DATABASE_BACKEND: postgres
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ironclaw_agent3?sslmode=disable
      ONBOARD_COMPLETED: "true"
      SECRETS_MASTER_KEY: "agent3_master_key_here"
      NEAR_NETWORK: testnet
      QDRANT_URL: http://qdrant:6333
      EMBEDDING_PROVIDER: ollama
      EMBEDDING_MODEL: nomic-embed-text
      OLLAMA_BASE_URL: http://ollama:11434
      HTTP_ENABLED: "true"
      HTTP_HOST: "0.0.0.0"
      HTTP_PORT: "8081"
      HTTP_WEBHOOK_SECRET: "agent3_webhook_secret_here"
    volumes:
      - ./data/agent3:/data
    ports:
      - "127.0.0.1:8083:8081"
    restart: unless-stopped

  ironclaw-agent4:
    build:
      context: https://github.com/nearai/ironclaw.git
      dockerfile: Dockerfile
    container_name: ironclaw-agent4
    command: run --no-onboard
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_started
    environment:
      DATABASE_BACKEND: postgres
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ironclaw_agent4?sslmode=disable
      ONBOARD_COMPLETED: "true"
      SECRETS_MASTER_KEY: "agent4_master_key_here"
      NEAR_NETWORK: testnet
      QDRANT_URL: http://qdrant:6333
      EMBEDDING_PROVIDER: ollama
      EMBEDDING_MODEL: nomic-embed-text
      OLLAMA_BASE_URL: http://ollama:11434
      HTTP_ENABLED: "true"
      HTTP_HOST: "0.0.0.0"
      HTTP_PORT: "8081"
      HTTP_WEBHOOK_SECRET: "agent4_webhook_secret_here"
    volumes:
      - ./data/agent4:/data
    ports:
      - "127.0.0.1:8084:8081"
    restart: unless-stopped

  ironclaw-agent5:
    build:
      context: https://github.com/nearai/ironclaw.git
      dockerfile: Dockerfile
    container_name: ironclaw-agent5
    command: run --no-onboard
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_started
    environment:
      DATABASE_BACKEND: postgres
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ironclaw_agent5?sslmode=disable
      ONBOARD_COMPLETED: "true"
      SECRETS_MASTER_KEY: "agent5_master_key_here"
      NEAR_NETWORK: testnet
      QDRANT_URL: http://qdrant:6333
      EMBEDDING_PROVIDER: ollama
      EMBEDDING_MODEL: nomic-embed-text
      OLLAMA_BASE_URL: http://ollama:11434
      HTTP_ENABLED: "true"
      HTTP_HOST: "0.0.0.0"
      HTTP_PORT: "8081"
      HTTP_WEBHOOK_SECRET: "agent5_webhook_secret_here"
    volumes:
      - ./data/agent5:/data
    ports:
      - "127.0.0.1:8085:8081"
    restart: unless-stopped

volumes:
  postgres_data:
  qdrant_data:
  ollama_data:
```

---

## `agents/.env`

```bash
POSTGRES_USER=ironclaw
POSTGRES_PASSWORD=SimplePass123   # alphanumeric only — special chars break URL substitution
POSTGRES_DB=ironclaw
```

---

## Setup Steps

### 1. Create data directories

```bash
mkdir -p agents/data/agent{1,2,3,4,5}
```

### 2. Start infrastructure services

```bash
cd agents
docker compose up -d --build
```

Build takes ~10 minutes on first run (compiles IronClaw from source). Subsequent runs use the cache and are fast.

### 3. Create per-agent databases

Run once before onboarding:

```bash
docker exec -it ironclaw-postgres psql -U ironclaw -c "
CREATE DATABASE ironclaw_agent1;
CREATE DATABASE ironclaw_agent2;
CREATE DATABASE ironclaw_agent3;
CREATE DATABASE ironclaw_agent4;
CREATE DATABASE ironclaw_agent5;
"
```

### 4. Onboard each agent one by one

See `docs/agent-onboarding.md` for the complete wizard walkthrough. The short version:

```bash
docker compose run --rm --entrypoint ironclaw ironclaw-agent1 onboard
# repeat for agent2 through agent5
```

Record the `SECRETS_MASTER_KEY` printed by each wizard run — add it to the compose environment for that agent.

### 5. Generate webhook secrets

```bash
for i in {1..5}; do echo "agent$i: $(openssl rand -hex 32)"; done
```

Add each to the corresponding agent's `HTTP_WEBHOOK_SECRET` in `docker-compose.yml`.

### 6. Pull the Ollama embedding model (once)

```bash
docker compose exec ollama ollama pull nomic-embed-text
```

### 7. Start all services

```bash
docker compose up -d
docker compose ps
# All ironclaw-agentX should show: Up
```

### 8. Verify HTTP webhooks

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

---

## Known Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `denied` pulling `ghcr.io/nearai/ironclaw:latest` | Image not publicly available | Build from source using `context: https://github.com/nearai/ironclaw.git` |
| Agents restart in a loop | Bare `ironclaw` entrypoint triggers setup wizard in v0.28+ | Add `command: run --no-onboard` to each agent service |
| `Permission denied` on PID lock | Config dir volume mount owned by host UID not container UID 1000 | Do not mount `/home/ironclaw/.ironclaw` — inject all config via environment variables |
| DB connection fails silently | Special characters in `POSTGRES_PASSWORD` break URL substitution | Use alphanumeric-only passwords |
| `HTTP_ENABLED=true` YAML error | Using `=` instead of `:` in YAML map | Use `HTTP_ENABLED: "true"` |
| Webhook returns 401 | v0.28 uses HMAC-SHA256, not raw secret header | Compute `X-Hub-Signature-256: sha256=<hmac>` over the request body |
| Webhook returns `missing field 'content'` | Field renamed in v0.28 | Use `{"user_id": "default", "content": "..."}` not `"message"` |
| Qdrant healthcheck `unhealthy` | `curl` not in Qdrant image | Use `wget -qO- http://localhost:6333/healthz || exit 1` |
