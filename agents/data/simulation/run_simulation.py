#!/usr/bin/env python3
"""
run_simulation.py
-----------------
MESA + NetworkX agent-based economy simulation for the IronClaw Swarm Economy.

Produces two output files:
  graph_round{N}.json   — NetworkX node-link graph (uploaded to NOVA via nova-submit)
  signals_round{N}.json — Structured signals matching the Qdrant schema (micro + meso + macro)

Usage:
    python3 run_simulation.py \
        --agent-id ironclaw-swarm-agent1.nova-sdk-6.testnet \
        --round 1 \
        --output-dir /data/simulation/outputs

All arguments have defaults so the skill can call it with minimal parameters.
"""

import argparse
import json
import math
import os
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path


# ── Strategy profiles ─────────────────────────────────────────────────────────
# Each strategy is a dict of behavioral parameters.
# These map to the agent_strategy_vector in the schema.

STRATEGIES = {
    "cooperative_trader":  {"cooperate_prob": 0.85, "risk_tolerance": 0.4, "greed": 0.2},
    "competitive_trader":  {"cooperate_prob": 0.40, "risk_tolerance": 0.8, "greed": 0.7},
    "hoarder":             {"cooperate_prob": 0.20, "risk_tolerance": 0.2, "greed": 0.9},
    "opportunist":         {"cooperate_prob": 0.60, "risk_tolerance": 0.7, "greed": 0.6},
    "defector":            {"cooperate_prob": 0.10, "risk_tolerance": 0.9, "greed": 1.0},
    "altruist":            {"cooperate_prob": 0.95, "risk_tolerance": 0.3, "greed": 0.1},
    "rational_actor":      {"cooperate_prob": 0.65, "risk_tolerance": 0.5, "greed": 0.5},
    "noise_trader":        {"cooperate_prob": 0.50, "risk_tolerance": 1.0, "greed": 0.5},
}

DATA_CONTRIBUTION_TYPES = [
    "strategy_summary",
    "trading_log",
    "graph",
    "reputation_update",
    "market_signal",
]


# ── Agent ─────────────────────────────────────────────────────────────────────

class TradingAgent:
    def __init__(self, agent_id: int, strategy_name: str, tokens: float = 100.0):
        self.agent_id      = agent_id
        self.strategy_name = strategy_name
        self.strategy      = STRATEGIES[strategy_name]
        self.tokens        = tokens
        self.reputation    = 0.5
        self.utility       = 0.0
        self.trades_made   = 0
        self.trust: dict[int, float] = {}

    def will_cooperate(self, partner_id: int) -> bool:
        trust_bonus = self.trust.get(partner_id, 0.5) * 0.15
        return random.random() < (self.strategy["cooperate_prob"] + trust_bonus)

    def offer_value(self) -> float:
        base  = self.tokens * 0.10
        noise = random.gauss(0, base * 0.15)
        return max(1.0, base + noise)

    def update_trust(self, partner_id: int, delta: float):
        current = self.trust.get(partner_id, 0.5)
        self.trust[partner_id] = max(0.0, min(1.0, current + delta))

    def strategy_vector(self) -> list:
        """6-dimensional float vector for GNN node features."""
        s = self.strategy
        return [
            round(s["cooperate_prob"], 4),
            round(s["risk_tolerance"], 4),
            round(s["greed"], 4),
            round(self.reputation, 4),
            round(min(self.tokens / 200.0, 1.0), 4),
            round(self.utility / max(self.trades_made, 1), 4),
        ]


# ── Model ─────────────────────────────────────────────────────────────────────

class EconomyModel:
    def __init__(self, n_agents: int, host_agent_id: str, round_num: int, seed: int = None):
        if seed is not None:
            random.seed(seed)

        self.host_agent_id = host_agent_id
        self.round_num     = round_num
        self.trade_events  = []   # meso-level records
        self.defection_count = 0

        # Distribute strategies evenly across agents
        strategy_names = list(STRATEGIES.keys())
        pool = (strategy_names * math.ceil(n_agents / len(strategy_names)))[:n_agents]
        random.shuffle(pool)

        self.agents = [TradingAgent(i, pool[i]) for i in range(n_agents)]

    def run(self, steps: int = 5):
        """Run N steps. Each step randomly pairs agents to trade."""
        for _ in range(steps):
            self._step()

    def _step(self):
        shuffled = self.agents[:]
        random.shuffle(shuffled)
        for i in range(0, len(shuffled) - 1, 2):
            self._trade(shuffled[i], shuffled[i + 1])

    def _trade(self, a: TradingAgent, b: TradingAgent):
        a_coop = a.will_cooperate(b.agent_id)
        b_coop = b.will_cooperate(a.agent_id)
        value  = a.offer_value()
        ts     = datetime.now(timezone.utc).isoformat()
        data_type = random.choice(DATA_CONTRIBUTION_TYPES)

        if a_coop and b_coop:
            gain = value * 0.5 * (1 + b.reputation)
            a.tokens  += gain * 0.4;  b.tokens  += gain * 0.6
            a.utility += gain * 0.5;  b.utility += gain * 0.5
            cooperation_score = 1.0
            trust_delta       = 0.10
            success           = True
            decision_a        = "trade"
            decision_b        = "trade"

        elif a_coop and not b_coop:
            loss = value * 0.3
            a.tokens  -= loss;  b.tokens  += loss * 0.5
            a.utility -= loss
            cooperation_score = 0.3
            trust_delta       = -0.20
            success           = False
            decision_a        = "trade"
            decision_b        = "defect"
            self.defection_count += 1

        elif not a_coop and b_coop:
            gain = value * 0.3
            a.tokens  += gain * 0.5;  b.tokens  -= gain
            b.utility -= gain
            cooperation_score = 0.3
            trust_delta       = -0.20
            success           = False
            decision_a        = "defect"
            decision_b        = "trade"
            self.defection_count += 1

        else:
            friction = value * 0.05
            a.tokens -= friction;  b.tokens -= friction
            cooperation_score = 0.0
            trust_delta       = -0.05
            success           = False
            decision_a        = "withhold"
            decision_b        = "withhold"

        a.update_trust(b.agent_id, trust_delta)
        b.update_trust(a.agent_id, trust_delta)
        a.reputation = max(0.0, min(1.0, a.reputation + trust_delta * 0.1))
        b.reputation = max(0.0, min(1.0, b.reputation + trust_delta * 0.1))
        a.trades_made += 1
        b.trades_made += 1

        self.trade_events.append({
            "trade_id":              str(uuid.uuid4()),
            "timestamp":             ts,
            "sender_id":             a.agent_id,
            "receiver_id":           b.agent_id,
            "trade_value":           round(value, 4),
            "cooperation_score":     round(cooperation_score, 4),
            "trust_delta":           round(trust_delta, 4),
            "success_flag":          success,
            "data_contribution_type": data_type,
            "decision_sender":       decision_a,
            "decision_receiver":     decision_b,
        })

    # ── Exports ───────────────────────────────────────────────────────────────

    def export_graph(self) -> dict:
        """
        NetworkX node-link format.
        Nodes = trading agents with strategy vectors as features.
        Edges = aggregated trade relationships.
        This is the artifact uploaded to NOVA and consumed by the GNN.
        """
        nodes = []
        for ag in self.agents:
            nodes.append({
                "id": ag.agent_id,
                "strategy_type":    ag.strategy_name,
                "strategy_vector":  ag.strategy_vector(),
                "tokens":           round(ag.tokens, 4),
                "reputation":       round(ag.reputation, 4),
                "utility":          round(ag.utility, 4),
                "trades_made":      ag.trades_made,
            })

        # Aggregate edges: sum value, average cooperation per pair
        edge_map: dict[tuple, dict] = {}
        for ev in self.trade_events:
            key = (ev["sender_id"], ev["receiver_id"])
            if key not in edge_map:
                edge_map[key] = {
                    "source":            ev["sender_id"],
                    "target":            ev["receiver_id"],
                    "weight":            0.0,
                    "cooperation_score": 0.0,
                    "trust_delta":       0.0,
                    "interactions":      0,
                    "successes":         0,
                    "data_contribution_type": ev["data_contribution_type"],
                }
            e = edge_map[key]
            e["weight"]            += ev["trade_value"]
            e["cooperation_score"] += ev["cooperation_score"]
            e["trust_delta"]       += ev["trust_delta"]
            e["interactions"]      += 1
            e["successes"]         += int(ev["success_flag"])

        links = []
        for e in edge_map.values():
            n = e["interactions"]
            links.append({
                "source":            e["source"],
                "target":            e["target"],
                "weight":            round(e["weight"], 4),
                "cooperation_score": round(e["cooperation_score"] / n, 4),
                "trust_delta":       round(e["trust_delta"] / n, 4),
                "interactions":      n,
                "successes":         e["successes"],
                "data_contribution_type": e["data_contribution_type"],
            })

        return {
            "directed":        True,
            "multigraph":      False,
            "graph": {
                "host_agent_id":   self.host_agent_id,
                "round":           self.round_num,
                "timestamp":       datetime.now(timezone.utc).isoformat(),
                "n_agents":        len(self.agents),
                "n_trade_events":  len(self.trade_events),
            },
            "nodes": nodes,
            "links": links,
        }

    def export_signals(self) -> dict:
        """
        Structured signals matching the confirmed Qdrant schema.
        Returns micro (per-agent), meso (per-trade), and macro (system-level) dicts.
        """
        agents = self.agents
        events = self.trade_events
        ts     = datetime.now(timezone.utc).isoformat()
        n_ev   = len(events)

        # ── Micro ──────────────────────────────────────────────────────────
        micro = []
        for ag in agents:
            micro.append({
                "agent_id":           ag.agent_id,
                "strategy_type":      ag.strategy_name,
                "strategy_vector":    ag.strategy_vector(),
                "utility_score":      round(max(0.0, min(1.0, ag.utility / max(ag.trades_made * 10, 1))), 4),
                "resource_balance":   round(ag.tokens, 4),
                "decision_type":      "contribute",   # this agent chose to run the simulation
                "reputation":         round(ag.reputation, 4),
                "trades_made":        ag.trades_made,
            })

        # ── Meso ───────────────────────────────────────────────────────────
        # Pass through each trade event directly — these become individual Qdrant points
        meso = []
        for ev in events:
            meso.append({
                "trade_id":               ev["trade_id"],
                "timestamp":              ev["timestamp"],
                "sender_id":              str(ev["sender_id"]),
                "receiver_id":            str(ev["receiver_id"]),
                "trade_value":            ev["trade_value"],
                "cooperation_score":      ev["cooperation_score"],
                "trust_delta":            ev["trust_delta"],
                "success_flag":           ev["success_flag"],
                "data_contribution_type": ev["data_contribution_type"],
                "nova_cid":               "PENDING",   # filled in by push_signals.py after upload
            })

        # ── Macro ──────────────────────────────────────────────────────────
        n_success  = sum(1 for e in events if e["success_flag"])
        n_defect   = self.defection_count
        token_vals = [ag.tokens for ag in agents]

        market_efficiency = n_success / max(n_ev, 1)
        cooperation_index = n_success / max(n_ev, 1)

        # Gini coefficient
        sorted_t = sorted(max(t, 0) for t in token_vals)
        n = len(sorted_t)
        gini_num   = sum((i + 1) * v for i, v in enumerate(sorted_t))
        gini_denom = n * sum(sorted_t)
        wealth_gini = round(
            (2 * gini_num / gini_denom - (n + 1) / n) if gini_denom > 0 else 0.0, 4
        )

        # Strategy convergence: 1 - normalised std dev of cooperate_prob
        probs    = [STRATEGIES[ag.strategy_name]["cooperate_prob"] for ag in agents]
        mean_p   = sum(probs) / len(probs)
        std_p    = math.sqrt(sum((p - mean_p) ** 2 for p in probs) / len(probs))
        strategy_convergence = round(1.0 - std_p, 4)

        # Value flow velocity: total value traded / round
        total_value = sum(e["trade_value"] for e in events)
        value_flow_velocity = round(total_value / max(self.round_num, 1), 4)

        # Volatility: high variance in cooperation scores this round
        if events:
            coop_scores = [e["cooperation_score"] for e in events]
            mean_c = sum(coop_scores) / len(coop_scores)
            var_c  = sum((c - mean_c) ** 2 for c in coop_scores) / len(coop_scores)
            volatility_detected = var_c > 0.08
        else:
            volatility_detected = False

        macro = {
            "simulation_round":     self.round_num,
            "timestamp":            ts,
            "host_agent_id":        self.host_agent_id,
            "n_agents":             len(agents),
            "n_trade_events":       n_ev,
            "market_efficiency":    round(market_efficiency, 4),
            "cooperation_index":    round(cooperation_index, 4),
            "wealth_gini":          wealth_gini,
            "strategy_convergence": strategy_convergence,
            "value_flow_velocity":  value_flow_velocity,
            "defection_count":      n_defect,
            "volatility_detected":  volatility_detected,
            "crisis_detected":      False,   # reserved for shock experiments
        }

        return {
            "schema_version": "1.0",
            "micro":          micro,
            "meso":           meso,
            "macro":          macro,
        }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="IronClaw Swarm Economy simulation")
    parser.add_argument("--agent-id",   default=os.environ.get("AGENT_ID", "ironclaw-swarm-agent0.nova-sdk-6.testnet"))
    parser.add_argument("--round",      type=int, default=1)
    parser.add_argument("--n-agents",   type=int, default=8)
    parser.add_argument("--steps",      type=int, default=5,  help="Trading steps per round")
    parser.add_argument("--output-dir", default="/data/simulation/outputs")
    parser.add_argument("--seed",       type=int, default=None)
    args = parser.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    model = EconomyModel(
        n_agents=args.n_agents,
        host_agent_id=args.agent_id,
        round_num=args.round,
        seed=args.seed,
    )
    model.run(steps=args.steps)

    graph   = model.export_graph()
    signals = model.export_signals()

    graph_file   = out / f"graph_round{args.round:04d}.json"
    signals_file = out / f"signals_round{args.round:04d}.json"

    with open(graph_file, "w") as f:
        json.dump(graph, f, indent=2)
    with open(signals_file, "w") as f:
        json.dump(signals, f, indent=2)

    m = signals["macro"]
    print(f"[sim] round={args.round} agents={args.n_agents} trades={m['n_trade_events']}")
    print(f"[sim] market_efficiency={m['market_efficiency']} cooperation={m['cooperation_index']}")
    print(f"[sim] wealth_gini={m['wealth_gini']} convergence={m['strategy_convergence']}")
    print(f"[sim] defections={m['defection_count']} volatility={m['volatility_detected']}")
    print(f"GRAPH_FILE={graph_file}")
    print(f"SIGNALS_FILE={signals_file}")


if __name__ == "__main__":
    main()
