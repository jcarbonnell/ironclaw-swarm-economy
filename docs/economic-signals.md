# Economic Signals — IronClaw Swarm Economy

**Document version**: 1.0  
**Status**: Canonical reference for signal selection, schema, and Qdrant storage  
**Collections**: `agent_signals` (micro + meso) · `swarm_signals` (macro)

---

## Overview

This document defines the complete set of economic signals captured by the IronClaw Swarm Economy simulation. It serves as the authoritative reference for signal naming, classification, description, data type, collection assignment, and rationale.

Signals are produced by `run_simulation.py` and pushed to Qdrant by `push_signals.py` after each simulation round. They feed three downstream consumers:

1. **Qdrant semantic search** — enabling research queries across the simulation history
2. **GraphSAGE GNN training** — macro signals as training targets, meso signals as graph edges
3. **Dashboard** — real-time swarm health and economic state visualization

---

## Signal Selection Rationale

This signal set was developed after reviewing several relevant agent-based economic modeling experiments and comparing their observable variables against the needs of a federated, privacy-preserving swarm:

**Serenissima** (mind-protocol, 2024) — a Renaissance Venice simulation running 120+ LLM-powered AI agents engaged in trade, property, and social dynamics. Serenissima demonstrated that per-agent utility tracking, trust relationships, and resource flow metrics are sufficient to observe macro-level economic emergence without requiring access to raw agent memory. Its citizen activity logs and wealth distribution snapshots directly informed the micro and macro signal selection here.

**ABIDES-Economist** (DARPA, 2020–2022) — an agent-based interactive discrete event simulator designed for financial markets. ABIDES demonstrated the value of trade-event granularity (each order as a meso point) and showed that market efficiency and price volatility are computable from event streams alone, without needing global state.

**abcEconomics** (Klimek et al.) — a Python ABM framework for macroeconomic modeling. Its separation of agent-level accounts (goods, money, credit) from firm-level and market-level clearing mechanisms directly maps to the micro/meso/macro split used here.

**HMAE — Heterogeneous Multi-Agent Economies** (ACE literature) — established the Gini coefficient, cooperation rate, and strategy convergence as the canonical set of inequality, social norm, and evolutionary stability indicators for agent economies. These appear in both the classic ACE survey (Tesfatsion, 2006) and more recent LLM-agent economic work.

**Generative Agents** (Park et al., 2023) — demonstrated that agent memory summaries are meaningful embeddings of behavioral state. This informed the decision to embed signals as natural language strings (via `nomic-embed-text`) rather than raw numeric vectors, enabling semantic retrieval alongside quantitative analysis.

---

## Schema

Signals are classified into three levels: **micro** (per-agent state), **meso** (per-interaction events), and **macro** (system-level emergent patterns). Micro and meso signals are stored together in the `agent_signals` collection. Macro signals are stored in `swarm_signals`.

---

## Micro-Level Signals — Individual Agent State

One Qdrant point per agent per simulation round. Captures what each IronClaw is doing and how its internal state is evolving.

| Signal | Type | Range | Description |
|--------|------|--------|-------------|
| `agent_id` | string | — | Full NOVA account ID of the agent (e.g. `ironclaw-swarm-agent1.nova-sdk-6.testnet`). Primary identifier for cross-round agent tracking. |
| `strategy_type` | string | enum | Named behavioral profile: `cooperative_trader`, `competitive_trader`, `hoarder`, `opportunist`, `defector`, `altruist`, `rational_actor`, `noise_trader`. Assigned at simulation initialization; represents the agent's dominant behavioral disposition for this round. |
| `strategy_vector` | float[6] | [0, 1] | Fixed-length embedding of the agent's strategy profile: `[cooperate_prob, risk_tolerance, greed, reputation, normalized_wealth, utility_per_trade]`. Used as node feature vector in the GNN. |
| `utility_score` | float | [0, 1] | Normalized self-reported utility after this round. Computed as `utility / (trades_made × 10)`, capped at 1.0. Measures how satisfied the agent is with its outcome relative to its activity level. |
| `resource_balance` | float | ≥ 0 | Current token holdings at end of round. Starting balance is 100 tokens per agent; gains and losses from trade outcomes shift this value. Used to compute `wealth_gini` at the macro level. |
| `decision_type` | string | enum | The primary decision category this agent took in this round: `trade`, `contribute`, `withhold`, `negotiate`, `defect`. In the current simulation, the host agent always records `contribute` (it chose to run the simulation and upload data to NOVA). Internal trading agents record the outcome of their final interaction. |
| `reputation` | float | [0, 1] | Accumulated trust score, updated after each interaction. Starts at 0.5. Increases with cooperative outcomes, decreases with defection. Feeds back into trade partner selection and cooperation probability in subsequent rounds. |
| `trades_made` | int | ≥ 0 | Total number of trade interactions this agent participated in during the round. Used to normalize utility and detect isolated agents (low trade count may indicate hoarding or avoidance behavior). |

**Qdrant collection**: `agent_signals`  
**Embedding text template**:
> *"Agent {agent_id} in simulation round {round}. Strategy: {strategy_type}. Utility score {utility_score}, resource balance {resource_balance} tokens, reputation {reputation}. Made {trades_made} trades. Decision type: {decision_type}."*

---

## Meso-Level Signals — Trade Interactions

One Qdrant point per trade event per round. These are the most important signals for the GNN — they become the directed edges of the interaction graph that GraphSAGE learns from.

| Signal | Type | Range | Description |
|--------|------|--------|-------------|
| `trade_id` | string (UUID) | — | Unique identifier for this trade event. Enables deduplication and cross-referencing between Qdrant points and the NOVA graph JSON. |
| `timestamp` | string (ISO 8601) | — | UTC timestamp of the trade event within the simulation step. |
| `sender_id` | string | — | Integer ID of the initiating agent within the local simulation (0–7 for an 8-agent model). Corresponds to a node in the graph JSON. |
| `receiver_id` | string | — | Integer ID of the counterparty agent. The directed edge in the graph runs sender → receiver. |
| `trade_value` | float | ≥ 0 | Token value placed at stake in the interaction. Computed as 10% of the sender's current holdings plus Gaussian noise. Represents the economic magnitude of the interaction. |
| `cooperation_score` | float | [0, 1] | How cooperative the interaction was: `1.0` for mutual cooperation, `0.3` for one-sided defection, `0.0` for mutual defection. This is the primary edge weight for the GNN. |
| `trust_delta` | float | [-1, 1] | Change in trust between the two agents as a result of this interaction: `+0.10` for cooperation, `-0.20` for defection, `-0.05` for mutual withholding. Accumulated across rounds to form the trust relationship graph. |
| `success_flag` | bool | — | Whether the trade completed with mutual benefit. `true` only when both agents cooperated. Drives `market_efficiency` and `cooperation_index` at the macro level. |
| `data_contribution_type` | string | enum | Type of data being symbolically exchanged in this trade: `strategy_summary`, `trading_log`, `graph`, `reputation_update`, `market_signal`. In the NOVA context, this maps to what kind of payload would be shared between agents if this were a real data trade. |
| `nova_cid` | string | — | IPFS CID of the NOVA-encrypted graph this trade event belongs to. Set to `PENDING` if the NOVA upload failed. Enables tracing from any Qdrant point back to the raw graph artifact in NOVA. |

**Qdrant collection**: `agent_signals`  
**Embedding text template**:
> *"Trade event in round {round} between agent {sender_id} and agent {receiver_id}. Value traded: {trade_value}. Cooperation score: {cooperation_score}. Trust delta: {trust_delta}. Outcome: {successful|unsuccessful}. Data contribution type: {data_contribution_type}."*

---

## Macro-Level Signals — System Emergence

One Qdrant point per round per host agent. These are the system-level observables that the GNN trains to predict — the Oracle's output vocabulary. They capture what "understanding the economy" means at the swarm level.

| Signal | Type | Range | Description |
|--------|------|--------|-------------|
| `simulation_round` | int | ≥ 1 | Round number, incremented by each agent independently. Cross-agent round alignment is approximate — agents run autonomously on their own schedules. |
| `host_agent_id` | string | — | The IronClaw agent that ran this simulation and contributed the graph to NOVA. Identifies the reporting node in the swarm. |
| `n_agents` | int | ≥ 2 | Number of trading agents in this simulation instance. Currently fixed at 8 per agent; will vary in future experiments. |
| `n_trade_events` | int | ≥ 0 | Total number of trade interactions that occurred this round. With 8 agents and 5 steps, expects ~20 events. Drops toward 0 during crisis simulations. |
| `market_efficiency` | float | [0, 1] | Ratio of successful (mutually cooperative) trades to total trade attempts. A value of 1.0 means all interactions were mutually beneficial; 0.0 means complete market failure. Primary target for Oracle prediction. Analogous to the market clearing rate in ABIDES. |
| `cooperation_index` | float | [0, 1] | Proportion of interactions where at least one agent cooperated. Distinct from `market_efficiency` in that it captures partial cooperation (one-sided) as well as mutual. Tracks the social norm evolution described in HMAE literature. |
| `wealth_gini` | float | [0, 1] | Gini coefficient of token distribution across agents at end of round. `0.0` = perfect equality, `1.0` = one agent holds everything. Computed using the standard sorted-pairs formula. Tracks inequality emergence — one of the core findings in Serenissima and classic ACE experiments. |
| `strategy_convergence` | float | [0, 1] | `1 - σ(cooperate_prob)` where σ is the standard deviation of cooperation probabilities across all active strategies. High values indicate the population is converging on similar behavioral norms; low values indicate diversity or polarization. |
| `value_flow_velocity` | float | ≥ 0 | Total token value traded divided by round number. Measures how quickly value circulates through the network — the economic equivalent of monetary velocity (MV = PQ). Low velocity indicates hoarding or market freeze. |
| `defection_count` | int | ≥ 0 | Raw count of unilateral defections this round. Complements `cooperation_index` by capturing the absolute frequency of norm violations, not just the ratio. Useful for detecting crisis conditions. |
| `volatility_detected` | bool | — | `true` when the variance of cooperation scores across all trade events exceeds 0.08 in a single round. Flags rounds where market behavior was inconsistent — some trades went well while others broke down severely. Inspired by ABIDES volatility detection. |
| `crisis_detected` | bool | — | Reserved for shock experiments (token scarcity injection, agent dropout events). Currently always `false`. Will be set `true` when the orchestrator injects a disruption signal into the simulation round. |

**Qdrant collection**: `swarm_signals`  
**Embedding text template**:
> *"Swarm economy round {round} reported by {host_agent_id}. Market efficiency {market_efficiency}, cooperation index {cooperation_index}, wealth gini {wealth_gini}, strategy convergence {strategy_convergence}, value flow velocity {value_flow_velocity}. Defections: {defection_count}. System state: {stable|high volatility detected}."*

---

## Summary Table

| Signal | Level | Collection | GNN Role |
|--------|-------|-----------|----------|
| `agent_id` | Micro | `agent_signals` | Node identifier |
| `strategy_type` | Micro | `agent_signals` | Node label |
| `strategy_vector` | Micro | `agent_signals` | **Node feature vector** |
| `utility_score` | Micro | `agent_signals` | Node feature |
| `resource_balance` | Micro | `agent_signals` | Node feature |
| `decision_type` | Micro | `agent_signals` | Node label |
| `reputation` | Micro | `agent_signals` | Node feature |
| `trades_made` | Micro | `agent_signals` | Node feature |
| `trade_id` | Meso | `agent_signals` | Edge identifier |
| `sender_id` / `receiver_id` | Meso | `agent_signals` | **Edge index (COO)** |
| `trade_value` | Meso | `agent_signals` | **Edge weight** |
| `cooperation_score` | Meso | `agent_signals` | **Edge feature** |
| `trust_delta` | Meso | `agent_signals` | **Edge feature** |
| `success_flag` | Meso | `agent_signals` | Edge label |
| `data_contribution_type` | Meso | `agent_signals` | Edge label |
| `nova_cid` | Meso | `agent_signals` | Provenance link |
| `market_efficiency` | Macro | `swarm_signals` | **Training target** |
| `cooperation_index` | Macro | `swarm_signals` | **Training target** |
| `wealth_gini` | Macro | `swarm_signals` | **Training target** |
| `strategy_convergence` | Macro | `swarm_signals` | **Training target** |
| `value_flow_velocity` | Macro | `swarm_signals` | **Training target** |
| `defection_count` | Macro | `swarm_signals` | Training target |
| `volatility_detected` | Macro | `swarm_signals` | Training target |
| `crisis_detected` | Macro | `swarm_signals` | Training target (future) |

---

## Future Signals (Not Yet Implemented)

These signals are identified as valuable based on the ACE and Serenissima literature but are not produced by the current simulation. They will be added in later experiment phases.

| Signal | Level | Description |
|--------|-------|-------------|
| `shock_resilience` | Macro | Recovery rate of `market_efficiency` following a `crisis_detected=true` round. Requires at least 3 post-crisis rounds to compute. |
| `alliance_formed` | Meso | Boolean flag when two agents establish a persistent cooperative relationship (trust > 0.8 for 3+ consecutive rounds). |
| `perceived_fairness` | Meso | Agent's subjective assessment of the trade outcome, potentially diverging from the objective `cooperation_score`. Requires LLM-generated reflection. |
| `nova_access_granted` | Meso | Whether the data exchanged in a trade event was accompanied by a NOVA group membership grant — direct measure of NOVA's role in the economy. |
| `strategy_mutation` | Micro | Flag when an agent's `strategy_type` shifts between rounds due to reinforcement or environment pressure. |

---

## References

- Tesfatsion, L. (2006). *Agent-based computational economics: A constructive approach to economic theory*. Handbook of Computational Economics, Vol. 2.
- Park, J. S. et al. (2023). *Generative Agents: Interactive Simulacra of Human Behavior*. UIST 2023.
- Vyetrenko, S. et al. (2020). *Get Real: Realism Metrics for Robust Limit Order Book Market Simulations*. ABIDES framework paper.
- Klimek, P. et al. *abcEconomics: A Python library for economic simulations*.
- mind-protocol. (2024). *Serenissima: An immersive Renaissance Venice economic simulation with 120+ AI agents*. https://github.com/mind-protocol/serenissima
- Axelrod, R. (1984). *The Evolution of Cooperation*. Basic Books. (theoretical basis for cooperation_score and defection_count)
