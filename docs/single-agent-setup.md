# Single IronClaw Agent – Fleet Baseline

This document defines the minimal, reproducible configuration for running **one IronClaw agent** that can join the swarm. It focuses on isolation, remote management, and the ability to securely contribute data via NOVA.

## 1. Overview

The goal is to run IronClaw agents as isolated, remotely manageable units that can:
- Participate in encrypted data trading using NOVA
- Be monitored and controlled from a central dashboard
- Run consistently across multiple machines (VPS, local, future clusters)

Each agent runs in its own Docker container with a clean, version-controlled configuration.

## 2. Architecture Decisions for the Swarm

- **Docker containers**: One agent = one container. This ensures strong isolation and easy scaling.
- **Remote management via SSH only**: No web-exposed admin interfaces. All access goes through SSH key authentication.
- **HTTP channel enabled**: Each agent exposes a local HTTP endpoint (`127.0.0.1:8081`) so the central dashboard can query status and trigger actions.
- **NOVA for data contribution**: Agents use NOVA groups to encrypt and share datasets (interaction graphs, simulation outputs) without exposing raw data.
- **Ollama embeddings**: Local embeddings are used for memory and semantic capabilities (sovereign and low-cost).

## 3. Minimal Reproducible Setup (Docker)

### 3.1 Docker Compose Service (Recommended)

Create a `docker-compose.yml` with the following service definition:

```yaml
services:
  ironclaw-agent:
    image: jcarbonnell/ironclaw-swarm-agent:latest   # or your custom image
    container_name: ironclaw-swarm-01
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./data:/data
      - ./ironclaw-data:/opt/ironclaw/.ironclaw
    ports:
      - "127.0.0.1:8081:8081"   # HTTP channel (local only)
    networks:
      - swarm-net
```

### 3.2 Required Environment Variables (.env)

```bash
# Core
DATABASE_BACKEND=postgres
DATABASE_URL=postgresql://ironclaw:password@host/ironclaw?sslmode=disable

# LLM
LLM_BACKEND=nearai
NEARAI_MODEL=anthropic/claude-sonnet-4-5
NEARAI_API_KEY=your_key

# Embeddings (local & sovereign)
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
OLLAMA_BASE_URL=http://ollama:11434

# HTTP Channel (for dashboard)
HTTP_HOST=127.0.0.1
HTTP_PORT=8081
HTTP_WEBHOOK_SECRET=generate-with-openssl-rand-hex-32

# NOVA
NOVA_CONTRACT_ID=nova-sdk.testnet   # or mainnet equivalent
SHADE_API_URL=https://shade-agent-url

# Security
SECRETS_MASTER_KEY=your_master_key
```

**Rationale**: Using an env_file keeps secrets out of the compose file and makes per-agent configuration easy.

## 4. Multi-Agent Communication & Orchestration

Multiple IronClaw instances do not talk directly to each other. Instead, they follow this model:

- Each agent runs independently in its own container.
- Agents contribute encrypted data (simulation graphs, decisions, outcomes) to **shared NOVA groups**.
- A **central orchestrator** (running on the same VPS or another machine) pulls contributions via NOVA and coordinates training of the Agentic Economy Oracle.
- A **central dashboard** polls each agent’s HTTP endpoint (/status) to monitor health, trigger routines, and display fleet-wide metrics.
- Future task distribution and coordination between agents will be handled by the central orchestrator, not by direct peer-to-peer communication.

**Rationale**: This keeps individual agents simple and focused while centralizing intelligence and observability.


