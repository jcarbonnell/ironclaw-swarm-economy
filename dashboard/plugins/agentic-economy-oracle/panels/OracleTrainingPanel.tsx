"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { MessageLog, type LogColumn } from "@/components/ui/MessageLog";
import type {
  OracleModel,
  OracleTargetMetrics,
  OracleTrainingRun,
} from "@/types";

// ── Oracle Training panel ────────────────────────────────────────────────────
// Read-only view of the orchestrator's training state: the current model, its
// per-target metrics, the loss curve, and the history of past runs. The
// dashboard observes; it does not train. A "trigger training run" button is
// deferred until the orchestrator exposes a training endpoint (plugin spec §6).
//
// Honest metrics: R² is shown as-is, including negative values. At tiny sample
// sizes a linear model cannot generalize, so a contextual note keyed on
// n_training_graphs warns the reader rather than hiding the caveat.

export function OracleTrainingPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["plugin", "agentic-economy-oracle", "oracle-training"],
    queryFn: () => api.plugins.agenticEconomyOracle.oracleTraining(),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <Frame><Muted>Loading oracle state…</Muted></Frame>;
  }

  if (isError) {
    return (
      <Frame>
        <div style={{ color: "var(--offline)", fontSize: 13 }}>
          Failed to load oracle training state:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </div>
        <button onClick={() => refetch()} style={btnStyle}>Retry</button>
      </Frame>
    );
  }

  const latest = data?.latest ?? null;
  const history = data?.history ?? [];

  if (!latest) {
    return (
      <Frame>
        <Muted>
          No oracle trained yet. Pull graphs and run{" "}
          <code data-mono>train_oracle.py</code> — the model and its metrics will
          appear here.
        </Muted>
      </Frame>
    );
  }

  return (
    <Frame>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Current model · trained {formatDate(latest.trained_at)}
        </span>
        <button onClick={() => refetch()} style={btnStyle} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Summary tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <SummaryTile label="Architecture" value={latest.architecture} mono />
        <SummaryTile label="Training graphs" value={String(latest.n_training_graphs)} />
        <SummaryTile label="Final loss" value={latest.final_loss.toFixed(6)} mono />
        <SummaryTile
          label="Targets"
          value={String(latest.output_labels.length)}
        />
      </div>

      {/* Small-sample caveat, keyed on the real graph count */}
      {latest.n_training_graphs < 10 && (
        <div
          style={{
            fontSize: 11,
            color: "var(--degraded)",
            border: "1px solid var(--degraded)",
            borderRadius: 4,
            padding: "6px 10px",
            marginBottom: 4,
          }}
        >
          n={latest.n_training_graphs} graphs — R² is unreliable at this sample
          size (negative values are expected). Metrics stabilize as more rounds
          accumulate.
        </div>
      )}

      {/* Per-target metrics table */}
      <Section label="Per-target metrics">
        <MetricsTable metrics={latest.eval_metrics} labels={latest.output_labels} />
      </Section>

      {/* Loss curve */}
      <Section label="Loss curve">
        <LossCurve history={latest.loss_history} />
      </Section>

      {/* Training data provenance */}
      <Section label={`Training data (${latest.training_graphs.length} graphs)`}>
        <TrainingGraphs graphs={latest.training_graphs} />
      </Section>

      {/* Run history */}
      <Section label={`Run history (${history.length})`}>
        <RunHistory history={history} />
      </Section>
    </Frame>
  );
}

// ── metrics table ────────────────────────────────────────────────────────────

function MetricsTable({
  metrics,
  labels,
}: {
  metrics: Record<string, OracleTargetMetrics>;
  labels: string[];
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 4,
        overflow: "hidden",
        fontSize: 12,
      }}
    >
      {/* header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 90px 90px",
          gap: 8,
          padding: "6px 12px",
          background: "var(--bg-elevated)",
          color: "var(--text-muted)",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <span>Target</span>
        <span style={{ textAlign: "right" }}>MAE</span>
        <span style={{ textAlign: "right" }}>R²</span>
      </div>
      {labels.map((label) => {
        const m = metrics[label];
        return (
          <div
            key={label}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 90px 90px",
              gap: 8,
              padding: "6px 12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <span style={{ color: "var(--text-primary)" }}>{prettyLabel(label)}</span>
            <span
              style={{
                textAlign: "right",
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
              }}
            >
              {m ? m.mae.toFixed(4) : "—"}
            </span>
            <span
              style={{
                textAlign: "right",
                fontFamily: "var(--font-mono)",
                // R² < 0 means worse than predicting the mean — flag it red.
                color: !m
                  ? "var(--text-muted)"
                  : m.r2 < 0
                  ? "var(--offline)"
                  : m.r2 > 0.5
                  ? "var(--online)"
                  : "var(--text-secondary)",
              }}
            >
              {m ? m.r2.toFixed(4) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── loss curve (inline SVG sparkline) ────────────────────────────────────────

const LOSS_W = 600;
const LOSS_H = 100;
const LOSS_PAD = { top: 8, right: 8, bottom: 18, left: 44 };

function LossCurve({ history }: { history: number[] }) {
  if (!history || history.length < 2) {
    return <Muted>Not enough epochs to plot.</Muted>;
  }

  const plotW = LOSS_W - LOSS_PAD.left - LOSS_PAD.right;
  const plotH = LOSS_H - LOSS_PAD.top - LOSS_PAD.bottom;

  const n = history.length;
  const yMax = Math.max(...history);
  const yMin = Math.min(...history);
  const ySpan = yMax - yMin || 1;

  const x = (i: number) => LOSS_PAD.left + (i / (n - 1)) * plotW;
  const y = (v: number) => LOSS_PAD.top + (1 - (v - yMin) / ySpan) * plotH;

  const d = history
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${LOSS_W} ${LOSS_H}`}
      width="100%"
      role="img"
      aria-label={`Training loss over ${n} epochs`}
      style={{ display: "block" }}
    >
      {/* y ticks */}
      <text x={LOSS_PAD.left - 4} y={LOSS_PAD.top + 4} textAnchor="end" style={tickStyle}>
        {yMax.toFixed(3)}
      </text>
      <text x={LOSS_PAD.left - 4} y={LOSS_PAD.top + plotH} textAnchor="end" style={tickStyle}>
        {yMin.toFixed(3)}
      </text>
      {/* baseline */}
      <line
        x1={LOSS_PAD.left}
        y1={LOSS_PAD.top + plotH}
        x2={LOSS_PAD.left + plotW}
        y2={LOSS_PAD.top + plotH}
        stroke="var(--border)"
        strokeWidth={1}
      />
      {/* loss line */}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" />
      {/* x labels: epoch 1 and n */}
      <text x={LOSS_PAD.left} y={LOSS_H - 4} textAnchor="start" style={tickStyle}>
        epoch 1
      </text>
      <text x={LOSS_PAD.left + plotW} y={LOSS_H - 4} textAnchor="end" style={tickStyle}>
        {n}
      </text>
    </svg>
  );
}

// ── training graphs provenance ───────────────────────────────────────────────

function TrainingGraphs({ graphs }: { graphs: OracleModel["training_graphs"] }) {
  const columns: LogColumn<OracleModel["training_graphs"][number]>[] = [
    {
      width: 200,
      render: (g) => (
        <span title={g.agent_id} style={{ fontSize: 12, color: "var(--accent)" }}>
          {displayName(g.agent_id)}
        </span>
      ),
    },
    {
      width: 70,
      render: (g) => (
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          round {g.round}
        </span>
      ),
    },
    {
      grow: true,
      render: (g) => (
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {g.n_nodes} nodes · {g.n_links} links
        </span>
      ),
    },
  ];
  return (
    <MessageLog
      rows={graphs}
      columns={columns}
      rowKey={(g) => g.file}
      emptyLabel="No training graphs"
    />
  );
}

// ── run history ──────────────────────────────────────────────────────────────

function RunHistory({ history }: { history: OracleTrainingRun[] }) {
  const columns: LogColumn<OracleTrainingRun>[] = [
    {
      width: 180,
      render: (r) => (
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {formatDate(r.timestamp)}
        </span>
      ),
    },
    {
      width: 90,
      render: (r) => (
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {r.n_graphs} graphs
        </span>
      ),
    },
    {
      grow: true,
      render: (r) => (
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {Object.keys(r.metrics).length} targets
        </span>
      ),
    },
  ];

  const renderDetail = (r: OracleTrainingRun) => (
    <MetricsTable metrics={r.metrics} labels={Object.keys(r.metrics)} />
  );

  return (
    <MessageLog
      rows={history}
      columns={columns}
      renderDetail={renderDetail}
      rowKey={(r) => r.timestamp}
      emptyLabel="No training runs logged"
    />
  );
}

// ── small helpers ────────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "8px 12px",
        background: "var(--bg-elevated)",
      }}
    >
      <div style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function displayName(id: string): string {
  return id ? id.split(".")[0] : "unknown";
}

function prettyLabel(id: string): string {
  return id
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{children}</div>;
}

const tickStyle: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "var(--font-mono)",
  fill: "var(--text-muted)",
};

const btnStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--text-secondary)",
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
};