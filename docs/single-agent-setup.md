# Single IronClaw Agent – Fleet Baseline

This document defines the minimal, reproducible configuration for running **one IronClaw agent** that can join the swarm. It focuses on isolation, remote management, and the ability to securely contribute data via NOVA.

Tested with: **IronClaw v0.28.2**, **Docker Compose v2**.

---

## 1. Overview

The goal is to run IronClaw agents as isolated, remotely manageable units that can:
- Participate in encrypted data trading using NOVA
- Be monitored and controlled from a central dashboard
- Run consistently across multiple machines (VPS, local, future clusters)

Each agent runs in its own Docker container with a clean, version-controlled configuration.

---

## 2. Architecture Decisions for the Swarm

- **Docker containers**: One agent = one container. Strong isolation and easy scaling.
- **Remote management via SSH only**: No web-exposed admin interfaces. All access goes through SSH key authentication.
- **HTTP channel enabled**: Each agent exposes a local HTTP endpoint on port `8081` (inside the container) so the central dashboard can send messages and trigger actions.
- **NOVA for data contribution**: Agents use NOVA groups to encrypt and share datasets (interaction graphs, simulation outputs) without exposing raw data.
- **Ollama embeddings**: Shared local Ollama instance provides sovereign, zero-cost embeddings to all agents.
- **Config via environment variables only**: Do not mount `/home/ironclaw/.ironclaw` as a volume — this causes UID permission failures on macOS and Linux hosts where the host user UID differs from the container's ironclaw user (UID 1000). All configuration is injected via compose environment variables.

---

## 3. Minimal Reproducible Setup (Docker)

### 3.1 Docker Compose Service

```yaml
services:
  ironclaw-agent:
    build:
      context: https://github.com/nearai/ironclaw.git
      dockerfile: Dockerfile
    container_name: ironclaw-swarm-01
    command: run --no-onboard
    restart: unless-stopped
    environment:
      # Database
      DATABASE_BACKEND: postgres
      DATABASE_URL: postgresql://ironclaw:SimplePass123@postgres:5432/ironclaw_agent1?sslmode=disable

      # Onboarding state
      ONBOARD_COMPLETED: "true"
      SECRETS_MASTER_KEY: "your_master_key_from_wizard"

      # Embeddings
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
      - ./data:/data                 # agent data only — do NOT mount ironclaw config dir
    ports:
      - "127.0.0.1:8081:8081"        # local only — restrict to localhost on host
```

> **Note**: `image: jcarbonnell/ironclaw-swarm-agent:latest` is not yet published. Build from source using `context: https://github.com/nearai/ironclaw.git`.

### 3.2 Key Environment Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_BACKEND` | `postgres` | Required explicitly in v0.28+ |
| `DATABASE_URL` | `postgresql://...?sslmode=disable` | Alphanumeric password only; always include `?sslmode=disable` |
| `ONBOARD_COMPLETED` | `"true"` | Prevents wizard from running on startup |
| `SECRETS_MASTER_KEY` | from wizard | Generated during `ironclaw onboard`; must be in compose env |
| `EMBEDDING_PROVIDER` | `ollama` | Wizard cannot configure Ollama — set via env instead |
| `EMBEDDING_MODEL` | `nomic-embed-text` | 274MB, purpose-built for RAG |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | Docker service name, not localhost |
| `HTTP_ENABLED` | `"true"` | Required — channel does not start without this |
| `HTTP_HOST` | `"0.0.0.0"` | Bind inside container; restriction happens at port mapping level |
| `HTTP_PORT` | `"8081"` | Same inside every container; host port differs per agent |
| `HTTP_WEBHOOK_SECRET` | from `openssl rand -hex 32` | Used for HMAC-SHA256 request signing |

Generate a webhook secret:
```bash
openssl rand -hex 32
```

---

## 4. HTTP Webhook API

The dashboard communicates with each agent via the HTTP webhook channel. In v0.28, authentication uses **HMAC-SHA256** (`X-Hub-Signature-256` header), not a raw secret header.

### Sending a message

```bash
SECRET="your_webhook_secret"
BODY='{"user_id": "default", "content": "your message here"}'
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -X POST http://localhost:8081/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"
```

### Response

```json
{"message_id": "<uuid>", "status": "accepted", "response": null}
```

### Payload fields

| Field | Required | Description |
|-------|----------|-------------|
| `user_id` | yes | Always `"default"` for swarm agents |
| `content` | yes | Message content (note: `message` field from older docs is wrong in v0.28) |
| `conversation_id` | no | Continue an existing conversation |

---

## 5. Multi-Agent Communication & Orchestration

Multiple IronClaw instances do not talk directly to each other. Instead:

- Each agent runs independently in its own container.
- Agents contribute encrypted data (simulation graphs, decisions, outcomes) to **shared NOVA groups**.
- A **central orchestrator** pulls contributions via NOVA and coordinates training of the Agentic Economy Oracle.
- A **central dashboard** sends messages to each agent via the HTTP webhook and displays fleet-wide metrics.
- Coordination between agents is handled by the orchestrator, not by direct peer-to-peer communication.

This keeps individual agents simple and focused while centralizing intelligence and observability.

---

## 6. Remote Access (VPS Deployment)

All agent ports are bound to `127.0.0.1` on the host — nothing is exposed to the public interface. Access remotely via SSH tunnel:

```bash
# Tunnel all 5 agent ports to your local machine
ssh -L 8081:localhost:8081 \
    -L 8082:localhost:8082 \
    -L 8083:localhost:8083 \
    -L 8084:localhost:8084 \
    -L 8085:localhost:8085 \
    user@vps-ip
```

The dashboard then reaches agents at `http://localhost:8081` through `http://localhost:8085` from your local machine.
