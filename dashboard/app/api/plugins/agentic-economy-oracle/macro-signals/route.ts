import { NextResponse } from "next/server";
import { scrollCollection } from "@/lib/qdrant";
import type { MacroSignalPoint } from "@/types";

// GET /api/plugins/agentic-economy-oracle/macro-signals
//
// Reads the macro layer from the swarm_signals Qdrant collection — one point
// per simulation round, written by push_signals.py. Returns a clean, round-
// sorted array so the panel component is a pure view (no client-side wrangling).
//
// Server-side only (imports the server-only Qdrant helper). The browser reaches
// this via api-client, never Qdrant directly.

// The subset of the swarm_signals payload this panel needs. The collection
// carries more fields (defection_count, host_agent_id, embed_text, …); we read
// only what the five macro time series and their annotations require.
interface SwarmSignalPayload {
  simulation_round?: number;
  market_efficiency?: number;
  cooperation_index?: number;
  wealth_gini?: number;
  strategy_convergence?: number;
  value_flow_velocity?: number;
  volatility_detected?: boolean;
  crisis_detected?: boolean;
  timestamp?: string;
}

export async function GET() {
  try {
    const points = await scrollCollection<SwarmSignalPayload>("swarm_signals");

    // Shape into display-ready rows. Drop points with no round number (they
    // can't be placed on the round axis). Coerce missing metrics to null so the
    // panel can render gaps honestly rather than showing 0 as if it were data.
    const rows: MacroSignalPoint[] = points
      .filter((p) => typeof p.payload.simulation_round === "number")
      .map((p) => {
        const s = p.payload;
        return {
          round: s.simulation_round as number,
          market_efficiency: numOrNull(s.market_efficiency),
          cooperation_index: numOrNull(s.cooperation_index),
          wealth_gini: numOrNull(s.wealth_gini),
          strategy_convergence: numOrNull(s.strategy_convergence),
          value_flow_velocity: numOrNull(s.value_flow_velocity),
          volatility_detected: s.volatility_detected === true,
          crisis_detected: s.crisis_detected === true,
          timestamp: typeof s.timestamp === "string" ? s.timestamp : null,
        };
      })
      .sort((a, b) => a.round - b.round);

    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Surface the real message (honest failure) with a 502 — the dashboard is
    // up, but its upstream (Qdrant) failed.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}