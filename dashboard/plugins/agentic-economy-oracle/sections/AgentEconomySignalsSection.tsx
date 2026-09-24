"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { MessageLog, type LogColumn } from "@/components/ui/MessageLog";
import type { AgentTradeSignal } from "@/types";

// ── Agent Economy Signals section ────────────────────────────────────────────
// The agentic-economy-oracle plugin's per-agent detail section. Injected into
// the base agent detail page via the agent_detail_sections extension point.
// Shows the agent's latest economic state (strategy, reputation, utility,
// balance, decision) and its recent trades, read from agent_signals in Qdrant.
//
// Renders for ONE agent — the base passes the short agentId. Pure view: fetches
// via api-client, does no data-wrangling (the route shapes everything).

export function AgentEconomySignalsSection({ agentId }: { agentId: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["plugin", "agentic-economy-oracle", "agent-signals", agentId],
    queryFn: () => api.plugins.agenticEconomyOracle.agentSignals(agentId),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <Muted>Loading economy signals…</Muted>;
  }

  if (isError) {
    return (
      <div style={{ fontSize: 12, color: "var(--offline)" }}>
        Failed to load economy signals:{" "}
        {error instanceof Error ? error.message : "unknown error"}
      </div>
    );
  }

  const latest = data?.latest ?? null;
  const trades = data?.recent_trades ?? [];

  if (!latest && trades.length === 0) {
    return (
      <Muted>
        No economy signals for this agent yet. They appear once the agent runs a
        simulation round and pushes signals to Qdrant.
      </Muted>
    );
  }

  const tradeColumns: LogColumn<AgentTradeSignal>[] = [
    {
      width: 70,
      render: (t) => (
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
          r{t.simulation_round ?? "—"}
        </span>
      ),
    },
    {
      width: 90,
      render: (t) => (
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
          {t.sender_id}→{t.receiver_id}
        </span>
      ),
    },
    {
      width: 80,
      render: (t) => (
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {t.trade_value != null ? t.trade_value.toFixed(2) : "—"}
        </span>
      ),
    },
    {
      width: 60,
      render: (t) => (
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: t.success_flag ? "var(--online)" : "var(--text-muted)",
          }}
        >
          {t.cooperation_score != null ? t.cooperation_score.toFixed(2) : "—"}
        </span>
      ),
    },
    {
      grow: true,
      render: (t) => (
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color:
              (t.trust_delta ?? 0) > 0
                ? "var(--online)"
                : (t.trust_delta ?? 0) < 0
                ? "var(--offline)"
                : "var(--text-muted)",
          }}
        >
          {t.trust_delta != null
            ? `${t.trust_delta > 0 ? "+" : ""}${t.trust_delta.toFixed(2)}`
            : "—"}
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Latest state tiles */}
      {latest && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 8,
          }}
        >
          <Tile label="Strategy" value={latest.strategy_type ?? "—"} />
          <Tile
            label="Reputation"
            value={latest.reputation != null ? latest.reputation.toFixed(3) : "—"}
            mono
          />
          <Tile
            label="Utility"
            value={latest.utility_score != null ? latest.utility_score.toFixed(3) : "—"}
            mono
          />
          <Tile
            label="Balance"
            value={
              latest.resource_balance != null
                ? latest.resource_balance.toFixed(2)
                : "—"
            }
            mono
          />
          <Tile label="Decision" value={latest.decision_type ?? "—"} />
          <Tile
            label="Round"
            value={latest.simulation_round != null ? String(latest.simulation_round) : "—"}
            mono
          />
        </div>
      )}

      {/* Recent trades */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Recent trades ({trades.length}) · round · pair · value · coop · trust Δ
        </div>
        <MessageLog<AgentTradeSignal>
          rows={trades}
          columns={tradeColumns}
          rowKey={(t) => `${t.simulation_round}-${t.sender_id}-${t.receiver_id}-${t.trade_value}`}
          emptyLabel="No trades recorded"
        />
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function Tile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "8px 12px",
        background: "var(--bg-elevated)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-primary)",
          marginTop: 2,
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{children}</div>;
}