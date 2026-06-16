#!/usr/bin/env python3
"""
orchestrator/train_oracle.py
----------------------------
Reads decrypted graph JSONs pulled from NOVA, computes graph-level statistics,
and trains a linear regression oracle predicting 4 macro economic signals.

This is the numpy fallback implementation — no GPU or PyTorch required.
Upgrade path: replace _train_numpy() with _train_pyg() when moving to OVH VPS.

Usage (from repo root, venv activated):
    python3 orchestrator/train_oracle.py

Reads:  orchestrator/data/graphs/*.json
Writes: orchestrator/data/models/oracle_<timestamp>.json
        orchestrator/data/models/oracle_latest.json
        orchestrator/data/training_log.jsonl
"""

import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

GRAPHS_DIR   = Path("orchestrator/data/graphs")
MODELS_DIR   = Path("orchestrator/data/models")
MANIFEST     = Path("orchestrator/data/manifest.json")
TRAINING_LOG = Path("orchestrator/data/training_log.jsonl")

MODELS_DIR.mkdir(parents=True, exist_ok=True)

# ── Macro signal targets ───────────────────────────────────────────────────────
# These are the 4 values the oracle learns to predict from graph structure.
# They come from the swarm_signals Qdrant collection in production.
# Here we derive proxies directly from graph statistics.

TARGET_LABELS = [
    "market_efficiency",
    "cooperation_index",
    "wealth_gini",
    "strategy_convergence",
]

# ── Graph feature extraction ──────────────────────────────────────────────────

def extract_features(graph: dict) -> list | None:
    """
    Extract a fixed-length feature vector from a graph JSON.
    These become the input X for the oracle.

    Features (8-dimensional):
      0. n_nodes — number of trading agents
      1. n_links — number of edges (aggregated trade pairs)
      2. density — links / (n_nodes * (n_nodes - 1))
      3. avg_cooperation_score — mean edge cooperation score
      4. avg_trust_delta — mean edge trust delta (signed)
      5. success_rate — fraction of edges with successes > 0
      6. avg_node_reputation — mean node reputation
      7. avg_node_tokens_normalized — mean tokens / 200
    """
    nodes = graph.get("nodes", [])
    links = graph.get("links", [])

    n = len(nodes)
    m = len(links)

    if n < 2 or m == 0:
        return None

    density = m / max(n * (n - 1), 1)

    coop_scores  = [l.get("cooperation_score", 0.5) for l in links]
    trust_deltas = [l.get("trust_delta", 0.0) for l in links]
    successes    = [1 if l.get("successes", 0) > 0 else 0 for l in links]

    avg_coop      = sum(coop_scores) / m
    avg_trust     = sum(trust_deltas) / m
    success_rate  = sum(successes) / m

    reputations   = [nd.get("reputation", 0.5) for nd in nodes]
    tokens        = [nd.get("tokens", 100.0) for nd in nodes]

    avg_reputation = sum(reputations) / n
    avg_tokens_norm = sum(min(t / 200.0, 1.0) for t in tokens) / n

    return [
        n / 20.0,          # normalized (max 20 agents in current setup)
        m / 50.0,          # normalized (max ~50 edges)
        density,
        avg_coop,
        (avg_trust + 1.0) / 2.0,   # shift [-1,1] → [0,1]
        success_rate,
        avg_reputation,
        avg_tokens_norm,
    ]


def extract_targets(graph: dict) -> list | None:
    """
    Extract macro signal targets from the graph metadata.
    In production these come from Qdrant swarm_signals.
    Here we compute proxies from graph structure.
    """
    nodes = graph.get("nodes", [])
    links = graph.get("links", [])

    n = len(nodes)
    m = len(links)

    if n < 2 or m == 0:
        return None

    # market_efficiency: fraction of successful trade edges
    successes = sum(1 for l in links if l.get("successes", 0) > 0)
    market_efficiency = successes / m

    # cooperation_index: same proxy as market_efficiency for graph-only data
    cooperation_index = market_efficiency

    # wealth_gini: from node token balances
    token_vals = sorted(max(nd.get("tokens", 100.0), 0) for nd in nodes)
    gini_num   = sum((i + 1) * v for i, v in enumerate(token_vals))
    gini_denom = n * sum(token_vals)
    wealth_gini = max(0.0, (2 * gini_num / gini_denom - (n + 1) / n)) if gini_denom > 0 else 0.0

    # strategy_convergence: from strategy vectors — 1 - std(cooperate_prob)
    # strategy_vector[0] = cooperate_prob
    svecs = [nd.get("strategy_vector", [0.5]) for nd in nodes]
    cprobs = [sv[0] for sv in svecs if sv]
    if cprobs:
        mean_cp = sum(cprobs) / len(cprobs)
        std_cp  = math.sqrt(sum((p - mean_cp) ** 2 for p in cprobs) / len(cprobs))
        strategy_convergence = max(0.0, min(1.0, 1.0 - std_cp))
    else:
        strategy_convergence = 0.5

    return [
        round(market_efficiency, 4),
        round(cooperation_index, 4),
        round(wealth_gini, 4),
        round(strategy_convergence, 4),
    ]


# ── Dataset loading ───────────────────────────────────────────────────────────

def load_dataset() -> tuple[list, list, list]:
    """
    Load all graph JSONs from GRAPHS_DIR.
    Returns (X, Y, metadata) where:
      X        — list of feature vectors
      Y        — list of target vectors
      metadata — list of dicts with agent_id, round, filename
    """
    graph_files = sorted(GRAPHS_DIR.glob("*.json"))

    if not graph_files:
        print(f"[oracle] ERROR: no graphs found in {GRAPHS_DIR}")
        print(f"         Run: NOVA_API_KEY=... node orchestrator/pull_graphs.mjs")
        sys.exit(1)

    print(f"[oracle] Loading {len(graph_files)} graph(s) from {GRAPHS_DIR}")

    X, Y, meta = [], [], []
    skipped = 0

    for fpath in graph_files:
        try:
            with open(fpath) as f:
                graph = json.load(f)

            features = extract_features(graph)
            targets  = extract_targets(graph)

            if features is None or targets is None:
                skipped += 1
                continue

            X.append(features)
            Y.append(targets)
            meta.append({
                "file":       fpath.name,
                "agent_id":   graph.get("graph", {}).get("host_agent_id", "unknown"),
                "round":      graph.get("graph", {}).get("round", 0),
                "n_nodes":    len(graph.get("nodes", [])),
                "n_links":    len(graph.get("links", [])),
            })

        except Exception as e:
            print(f"[oracle] ⚠  Skipping {fpath.name}: {e}")
            skipped += 1

    print(f"[oracle] Valid samples: {len(X)} | Skipped: {skipped}")
    return X, Y, meta


# ── Numpy linear regression ───────────────────────────────────────────────────

def train_numpy(X: list, Y: list, epochs: int = 200, lr: float = 0.01) -> dict:
    """
    Train a linear regression W, b mapping features → macro targets.
    Uses batch gradient descent (full dataset per step).

    Input dim:  8 features
    Output dim: 4 macro targets
    """
    in_dim  = len(X[0])
    out_dim = len(Y[0])
    n       = len(X)

    # Xavier initialization
    scale = math.sqrt(2.0 / in_dim)
    W = [[((i * 7 + j * 13) % 100 / 100.0 - 0.5) * scale
          for j in range(out_dim)] for i in range(in_dim)]
    b = [0.0] * out_dim

    history = []

    for epoch in range(epochs):
        total_loss = 0.0
        grad_W = [[0.0] * out_dim for _ in range(in_dim)]
        grad_b = [0.0] * out_dim

        for x, y in zip(X, Y):
            # Forward pass
            pred = [sum(x[i] * W[i][j] for i in range(in_dim)) + b[j]
                    for j in range(out_dim)]

            # MSE loss
            loss = sum((pred[j] - y[j]) ** 2 for j in range(out_dim)) / out_dim
            total_loss += loss

            # Gradients
            for j in range(out_dim):
                err = (pred[j] - y[j]) * 2 / out_dim
                for i in range(in_dim):
                    grad_W[i][j] += err * x[i]
                grad_b[j] += err

        # Update weights (batch gradient descent)
        for i in range(in_dim):
            for j in range(out_dim):
                W[i][j] -= lr * grad_W[i][j] / n
        for j in range(out_dim):
            b[j] -= lr * grad_b[j] / n

        avg_loss = total_loss / n
        history.append(round(avg_loss, 8))

        if epoch % 50 == 0 or epoch == epochs - 1:
            print(f"[oracle] epoch {epoch+1:03d}/{epochs} | loss={avg_loss:.6f}")

    return {"W": W, "b": b, "history": history, "final_loss": history[-1]}


# ── Evaluation ────────────────────────────────────────────────────────────────

def evaluate(W, b, X, Y) -> dict:
    """Compute per-target MAE and R² on the training set."""
    in_dim  = len(W)
    out_dim = len(W[0])
    n       = len(X)

    preds = []
    for x in X:
        pred = [sum(x[i] * W[i][j] for i in range(in_dim)) + b[j]
                for j in range(out_dim)]
        preds.append(pred)

    metrics = {}
    for j, label in enumerate(TARGET_LABELS):
        actuals    = [Y[k][j] for k in range(n)]
        predicted  = [preds[k][j] for k in range(n)]
        mean_act   = sum(actuals) / n
        mae        = sum(abs(predicted[k] - actuals[k]) for k in range(n)) / n
        ss_res     = sum((predicted[k] - actuals[k]) ** 2 for k in range(n))
        ss_tot     = sum((actuals[k] - mean_act) ** 2 for k in range(n))
        r2         = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
        metrics[label] = {"mae": round(mae, 6), "r2": round(r2, 6)}

    return metrics


# ── Save model ────────────────────────────────────────────────────────────────

def save_model(model_data: dict, metrics: dict, meta: list) -> Path:
    ts         = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    model_path = MODELS_DIR / f"oracle_{ts}.json"

    artifact = {
        "schema_version":  "1.0",
        "trained_at":      datetime.now(timezone.utc).isoformat(),
        "architecture":    "linear_regression_numpy",
        "input_dim":       8,
        "output_dim":      4,
        "input_labels":    [
            "n_nodes_norm", "n_links_norm", "density",
            "avg_cooperation", "avg_trust_norm", "success_rate",
            "avg_reputation", "avg_tokens_norm"
        ],
        "output_labels":   TARGET_LABELS,
        "n_training_graphs": len(meta),
        "training_graphs": meta,
        "weights":         model_data["W"],
        "bias":            model_data["b"],
        "final_loss":      model_data["final_loss"],
        "loss_history":    model_data["history"],
        "eval_metrics":    metrics,
        "upgrade_path":    "Replace with PyTorch Geometric GraphSAGE on OVH VPS",
    }

    with open(model_path, "w") as f:
        json.dump(artifact, f, indent=2)

    # Also save as latest
    latest_path = MODELS_DIR / "oracle_latest.json"
    import shutil
    shutil.copy2(model_path, latest_path)

    return model_path


def log_training_run(model_path: Path, metrics: dict, n_graphs: int):
    entry = {
        "timestamp":  datetime.now(timezone.utc).isoformat(),
        "model_path": str(model_path),
        "n_graphs":   n_graphs,
        "metrics":    metrics,
    }
    with open(TRAINING_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "═" * 50)
    print("  Agentic Economy Oracle — Training")
    print("  Architecture: Linear Regression (numpy)")
    print("═" * 50 + "\n")

    # Load dataset
    X, Y, meta = load_dataset()

    if len(X) < 2:
        print(f"[oracle] Need at least 2 graphs to train. Have {len(X)}.")
        print(f"         Run more simulation rounds and pull again.")
        sys.exit(1)

    print(f"\n[oracle] Dataset: {len(X)} samples | Features: {len(X[0])} | Targets: {len(Y[0])}")
    print(f"[oracle] Agents seen: {list({m['agent_id'] for m in meta})}")
    print(f"[oracle] Rounds seen: {sorted({m['round'] for m in meta})}\n")

    # Train
    print("[oracle] Training...\n")
    model_data = train_numpy(X, Y, epochs=200, lr=0.01)

    # Evaluate
    metrics = evaluate(model_data["W"], model_data["b"], X, Y)
    print("\n[oracle] Evaluation (training set):")
    for label, m in metrics.items():
        print(f"  {label:<25} MAE={m['mae']:.4f}  R²={m['r2']:.4f}")

    # Save
    model_path = save_model(model_data, metrics, meta)
    log_training_run(model_path, metrics, len(X))

    print(f"\n[oracle] ✓ Model saved → {model_path}")
    print(f"[oracle] ✓ Latest    → {MODELS_DIR}/oracle_latest.json")
    print(f"[oracle] ✓ Training log appended → {TRAINING_LOG}")

    print("\n" + "═" * 50)
    print(f"  Training complete | Loss: {model_data['final_loss']:.6f}")
    print("═" * 50 + "\n")


if __name__ == "__main__":
    main()
