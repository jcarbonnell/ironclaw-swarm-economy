import { NextResponse } from "next/server";
import { scrollCollection } from "@/lib/qdrant";
import { getAgentConfigs } from "@/lib/agents";
import type { AgentEconomySignals } from "@/types";

// GET /api/plugins/agentic-economy-oracle/agent-signals/[agentId]
//
// Per-agent economy signals from the agent_signals Qdrant collection, for one
// agent's detail-page section. Returns the latest micro point (strategy,
// reputation, utility, tokens, decision) and the agent's recent meso points
// (trades). Server-side only (reads Qdrant via the server-only helper).
//
// The collection is keyed by the agent's full NEAR account
// (ironclaw-swarm-agent1.nova-sdk-6.testnet), but the dashboard addresses agents
// by short id (agent1). We map id → account via lib/agents.ts so callers pass
// the short id and never need to know the account form.

// The subset of an agent_signals payload we read. The collection carries more
// (embed_text, nova_cid, …); we take what the section renders.
interface MicroPayload {
  signal_type?: string;
  agent_id?: string; // full NEAR account (micro) — the host agent
  simulation_agent_index?: string; // the in-sim integer id, as a string
  strategy_type?: string;
  utility_score?: number;
  resource_balance?: number;
  reputation?: number;
  trades_made?: number;
  decision_type?: string;
  simulation_round?: number;
  nova_cid?: string;
}

interface MesoPayload {
  signal_type?: string;
  sender_id?: string;
  receiver_id?: string;
  trade_value?: number;
  cooperation_score?: number;
  trust_delta?: number;
  success_flag?: boolean;
  data_contribution_type?: string;
  simulation_round?: number;
  nova_cid?: string;
}

const MAX_RECENT_TRADES = 25;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  // Resolve short id → full NEAR account. Unknown id → 404.
  const cfg = getAgentConfigs().find((a) => a.id === agentId);
  if (!cfg) {
    return NextResponse.json(
      { error: `Unknown agent: ${agentId}` },
      { status: 404 }
    );
  }
  const nearAccount = cfg.nearAccount;

  try {
    // agent_signals holds both micro and meso points for all agents. Pull the
    // collection and filter to this agent. (When volume grows this should become
    // a server-side Qdrant filter by agent_id + payload index; see lib/qdrant.ts
    // note. For the current scale, scroll + filter is fine.)
    const points = await scrollCollection<MicroPayload & MesoPayload>(
      "agent_signals"
    );

    // Micro points for this agent (keyed by the host NEAR account).
    const micro = points
      .map((p) => p.payload as MicroPayload)
      .filter((p) => p.signal_type === "micro" && p.agent_id === nearAccount);

    // Latest micro point by round.
    const latestMicro =
      micro.length > 0
        ? micro.reduce((a, b) =>
            (b.simulation_round ?? 0) > (a.simulation_round ?? 0) ? b : a
          )
        : null;

    // Meso points (trades) contributed under this agent's rounds. Meso payloads
    // carry the host via nova_cid/round rather than agent_id, so we associate by
    // the CIDs this agent produced. Simplest correct association at current
    // scale: meso points whose nova_cid matches any of this agent's micro CIDs.
    const agentCids = new Set(
      micro.map((m) => m.nova_cid).filter((c): c is string => Boolean(c))
    );
    const meso = points
      .map((p) => p.payload as MesoPayload)
      .filter(
        (p) =>
          p.signal_type === "meso" &&
          p.nova_cid !== undefined &&
          agentCids.has(p.nova_cid)
      )
      .sort((a, b) => (b.simulation_round ?? 0) - (a.simulation_round ?? 0))
      .slice(0, MAX_RECENT_TRADES);

    const result: AgentEconomySignals = {
      agent_id: agentId,
      near_account: nearAccount,
      latest: latestMicro
        ? {
            strategy_type: latestMicro.strategy_type ?? null,
            utility_score: numOrNull(latestMicro.utility_score),
            resource_balance: numOrNull(latestMicro.resource_balance),
            reputation: numOrNull(latestMicro.reputation),
            trades_made: numOrNull(latestMicro.trades_made),
            decision_type: latestMicro.decision_type ?? null,
            simulation_round: numOrNull(latestMicro.simulation_round),
          }
        : null,
      recent_trades: meso.map((m) => ({
        sender_id: m.sender_id ?? "—",
        receiver_id: m.receiver_id ?? "—",
        trade_value: numOrNull(m.trade_value),
        cooperation_score: numOrNull(m.cooperation_score),
        trust_delta: numOrNull(m.trust_delta),
        success_flag: m.success_flag === true,
        simulation_round: numOrNull(m.simulation_round),
      })),
      rounds_seen: micro.length,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}