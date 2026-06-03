#!/usr/bin/env python3
"""
push_signals.py
---------------
Reads a signals JSON produced by run_simulation.py and pushes points to Qdrant.

Two collections:
  agent_signals  — micro (per-agent state) + meso (per-trade events)
  swarm_signals  — macro (system-level, one point per round)

The embedding vector (768-dim, nomic-embed-text via Ollama) is generated from
a natural language summary of each point, enabling semantic queries like
"find rounds where cooperation collapsed" across the research dataset.

Usage:
    python3 push_signals.py \
        --signals-file /data/simulation/outputs/signals_round0001.json \
        --nova-cid Qm... \
        --agent-id ironclaw-swarm-agent1.nova-sdk-6.testnet \
        --round 1
"""

import argparse
import json
import os
import sys
import uuid
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

QDRANT_URL  = os.environ.get("QDRANT_URL", "http://qdrant:6333")
OLLAMA_URL  = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
EMBED_MODEL = os.environ.get("EMBEDDING_MODEL", "nomic-embed-text")
EMBED_DIM   = 768

AGENT_COLLECTION = "agent_signals"
SWARM_COLLECTION = "swarm_signals"

ERROR_LOG = Path(os.environ.get("ERROR_LOG", "agents/data/simulation/outputs/qdrant_errors.log"))


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def http_post(url: str, payload: dict, timeout: int = 20) -> dict:
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def http_put(url: str, payload: dict, timeout: int = 20) -> dict:
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"},
        method="PUT"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())

def http_get(url: str, timeout: int = 10) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


# ── Qdrant helpers ────────────────────────────────────────────────────────────

def ensure_collection(name: str):
    """Create the Qdrant collection if it does not exist."""
    try:
        http_get(f"{QDRANT_URL}/collections/{name}")
        return  # already exists
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise

    print(f"[qdrant] Creating collection '{name}' (dim={EMBED_DIM}, distance=Cosine)")
    http_put(f"{QDRANT_URL}/collections/{name}", {
        "vectors": {"size": EMBED_DIM, "distance": "Cosine"}
    })
    print(f"[qdrant] ✓ Collection '{name}' created")


def embed(text: str) -> list:
    """Get embedding vector from Ollama."""
    result = http_post(
        f"{OLLAMA_URL}/api/embeddings",
        {"model": EMBED_MODEL, "prompt": text},
        timeout=30,
    )
    return result["embedding"]


def upsert(collection: str, point_id: str, vector: list, payload: dict):
    http_put(
        f"{QDRANT_URL}/collections/{collection}/points?wait=true",
        {"points": [{"id": point_id, "vector": vector, "payload": payload}]},
    )


# ── Embedding text builders ───────────────────────────────────────────────────
# These produce the natural language text that gets embedded.
# Consistent wording matters for semantic search quality.

def micro_text(m: dict, round_num: int) -> str:
    return (
        f"Agent {m['agent_id']} in simulation round {round_num}. "
        f"Strategy: {m['strategy_type']}. "
        f"Utility score {m['utility_score']:.3f}, "
        f"resource balance {m['resource_balance']:.2f} tokens, "
        f"reputation {m['reputation']:.3f}. "
        f"Made {m['trades_made']} trades. "
        f"Decision type: {m['decision_type']}."
    )


def meso_text(e: dict, round_num: int) -> str:
    outcome = "successful" if e["success_flag"] else "unsuccessful"
    return (
        f"Trade event in round {round_num} between agent {e['sender_id']} "
        f"and agent {e['receiver_id']}. "
        f"Value traded: {e['trade_value']:.2f}. "
        f"Cooperation score: {e['cooperation_score']:.2f}. "
        f"Trust delta: {e['trust_delta']:+.2f}. "
        f"Outcome: {outcome}. "
        f"Data contribution type: {e['data_contribution_type']}."
    )


def macro_text(m: dict) -> str:
    volatility = "high volatility detected" if m["volatility_detected"] else "stable"
    return (
        f"Swarm economy round {m['simulation_round']} reported by {m['host_agent_id']}. "
        f"Market efficiency {m['market_efficiency']:.1%}, "
        f"cooperation index {m['cooperation_index']:.1%}, "
        f"wealth gini {m['wealth_gini']:.4f}, "
        f"strategy convergence {m['strategy_convergence']:.4f}, "
        f"value flow velocity {m['value_flow_velocity']:.2f}. "
        f"Defections: {m['defection_count']}. "
        f"System state: {volatility}."
    )


# ── Push functions ────────────────────────────────────────────────────────────

def push_micro(micro_list: list, round_num: int, nova_cid: str, agent_id: str):
    print(f"[qdrant] Pushing {len(micro_list)} micro points → {AGENT_COLLECTION}")
    for m in micro_list:
        text     = micro_text(m, round_num)
        vector   = embed(text)
        point_id = str(uuid.uuid4())
        payload  = {
            **m,
            "agent_id":         agent_id,
            "simulation_agent_index": m["agent_id"],
            "signal_type":      "micro",
            "simulation_round": round_num,
            "nova_cid":         nova_cid,
            "embed_text":       text,
        }
        # Strip None values — Qdrant rejects null fields
        payload = {k: v for k, v in payload.items() if v is not None}
        upsert(AGENT_COLLECTION, point_id, vector, payload)
        print(f"[qdrant]   ✓ micro agent={m['agent_id']}")


def push_meso(meso_list: list, round_num: int, nova_cid: str):
    print(f"[qdrant] Pushing {len(meso_list)} meso points → {AGENT_COLLECTION}")
    for e in meso_list:
        e_with_cid = {**e, "nova_cid": nova_cid}
        text       = meso_text(e_with_cid, round_num)
        vector     = embed(text)
        point_id   = str(uuid.uuid4())
        payload    = {
            **e_with_cid,
            "signal_type":      "meso",
            "simulation_round": round_num,
            "embed_text":       text,
        }
        payload = {k: v for k, v in payload.items() if v is not None}
        upsert(AGENT_COLLECTION, point_id, vector, payload)
    print(f"[qdrant]   ✓ {len(meso_list)} meso events")


def push_macro(macro: dict, nova_cid: str):
    print(f"[qdrant] Pushing 1 macro point → {SWARM_COLLECTION}")
    text     = macro_text(macro)
    vector   = embed(text)
    point_id = str(uuid.uuid4())
    payload  = {
        **macro,
        "signal_type": "macro",
        "nova_cid":    nova_cid,
        "embed_text":  text,
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    upsert(SWARM_COLLECTION, point_id, vector, payload)
    print(f"[qdrant]   ✓ macro round={macro['simulation_round']}")
    return point_id


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Push simulation signals to Qdrant")
    parser.add_argument("--signals-file", required=True, type=Path)
    parser.add_argument("--nova-cid",     default="PENDING")
    parser.add_argument("--agent-id",     default=os.environ.get("AGENT_ID", "unknown"))
    parser.add_argument("--round",        type=int, default=1)
    args = parser.parse_args()

    if not args.signals_file.exists():
        print(f"[qdrant] ERROR: {args.signals_file} not found", file=sys.stderr)
        sys.exit(1)

    with open(args.signals_file) as f:
        signals = json.load(f)

    micro = signals.get("micro", [])
    meso  = signals.get("meso",  [])
    macro = signals.get("macro", {})

    try:
        ensure_collection(AGENT_COLLECTION)
        ensure_collection(SWARM_COLLECTION)

        push_micro(micro, args.round, args.nova_cid, args.agent_id)
        push_meso(meso,   args.round, args.nova_cid)
        macro_id = push_macro(macro, args.nova_cid)

        print(f"[qdrant] ✓ All signals pushed")
        print(f"MACRO_POINT_ID={macro_id}")

    except Exception as e:
        msg = f"[{datetime.now(timezone.utc).isoformat()}] agent={args.agent_id} round={args.round}: {e}\n"
        ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(ERROR_LOG, "a") as log:
            log.write(msg)
        print(f"[qdrant] ERROR: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
