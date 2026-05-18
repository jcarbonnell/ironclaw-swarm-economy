# IronClaw Swarm Economy

> A sovereign multi-IronClaw system for confidential data trading via NOVA and the federated training of system-level AI models on agentic economies.

## Overview

**IronClaw Swarm Economy** is an experimental research project exploring how a fleet of autonomous AI agents can collectively understand and model **agentic economies** while preserving data privacy.

The system runs a population of IronClaw agents that:
- Generate and trade synthetic economic data (interactions, decisions, utilities) through **NOVA** in a fully encrypted and access-controlled way.
- Contribute data to a shared swarm without exposing raw information.
- Participate in the **federated training** of a system-level model (non-LLM) that learns macro patterns of the agentic economy rather than individual agent behavior.

## Vision

Instead of training models on centralized datasets, this project investigates whether a decentralized network of sovereign agents can collaboratively build useful intelligence about economic systems at scale — while keeping data ownership and privacy intact.

The long-term goal is to produce a reusable **Agentic Economy Oracle** — a model that can be queried by other agents to better understand market dynamics, cooperation patterns, and system-level outcomes.

## Architecture 

flowchart TB
    subgraph Infrastructure["Infrastructure Layer"]
        VPS["OVH VPS<br/>(Docker Isolated)"]
        Testnet["NEAR Testnet"]
    end

    subgraph Agents["IronClaw Fleet (10-30 agents)"]
        IronClaw1["IronClaw Agent 1"]
        IronClaw2["IronClaw Agent 2"]
        IronClawN["IronClaw Agent N"]
    end

    subgraph Privacy["Privacy & Data Layer"]
        NOVA["NOVA<br/>(Group Key Management + Access Control)"]
        IPFS["IPFS<br/>(Encrypted Data Storage)"]
    end

    subgraph Orchestration["Orchestration & Training Layer"]
        Coordinator["Central Coordinator<br/>(Federated Orchestrator)"]
        GNN["Agentic Economy Model<br/>"]
    end

    subgraph Management["Management Layer"]
        Dashboard["Fleet Dashboard<br/>"]
    end

    %% Connections
    IronClaw1 & IronClaw2 & IronClawN -->|Generate synthetic data<br/>+ Export interaction graph| NOVA
    NOVA -->|Encrypt + Pin| IPFS
    NOVA -->|Store encrypted keys| KV

    NOVA -->|Authorized access| Coordinator
    IPFS -->|Encrypted contributions| Coordinator
    Coordinator -->|Federated training| GNN

    Dashboard -->|Monitor & Control| IronClaw1 & IronClaw2 & IronClawN
    Dashboard -->|View training progress| Coordinator
    Dashboard -->|Manage NOVA groups| NOVA

    Coordinator -->|Export final model| Marketplace["NEAR AI Marketplace"]

    classDef agent fill:#e0f2fe,stroke:#0369a1
    classDef privacy fill:#fef3c7,stroke:#b45309
    classDef training fill:#dcfce7,stroke:#166534
    classDef infra fill:#f3e8ff,stroke:#6b21a8

    class IronClaw1,IronClaw2,IronClawN agent
    class NOVA,IPFS,KV privacy
    class Coordinator,GNN training
    class VPS,Testnet infra


## Key Components

- **IronClaw Fleet**: Multiple autonomous agents running isolated workloads
- **NOVA**: Confidential data sharing and access control layer
- **Federated Training**: System-level model training without centralizing raw data
- **Central Dashboard**: Lightweight interface to monitor and manage the swarm

## Status

Early research stage. The project aims to produce:
- Reproducible experimental results
- Open datasets and model weights
- A research paper on private federated agent-based economic modeling

---

**License**: MIT
**Status**: Active development