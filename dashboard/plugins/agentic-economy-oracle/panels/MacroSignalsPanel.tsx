"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { MacroSignalPoint } from "@/types";

// ── Macro Signals panel ──────────────────────────────────────────────────────
// The five macro signals from swarm_signals, one mini line chart each (small
// multiples). Read-only. Inline SVG, no charting dependency — matches the
// hand-built UI language of the fleet base. Rounds flagged volatility/crisis
// are marked on every chart's round axis.
//
// Data path: swarm_signals (Qdrant) → macro-signals route (shapes + sorts) →
// api-client → this panel (pure view). Metrics may be null for a round; the
// line breaks across the gap rather than plotting a false zero.

// The five macro series this panel renders, with display metadata. Order here
// is the render order of the grid.
const SERIES: {
  key: keyof Pick<
    MacroSignalPoint,
    | "market_efficiency"
    | "cooperation_index"
    | "wealth_gini"
    | "strategy_convergence"
    | "value_flow_velocity"
  >;
  label: string;
  // Fixed domain for [0,1]-bounded signals; null means auto-scale from data
  // (value_flow_velocity is unbounded).
  domain: [number, number] | null;
}[] = [
  { key: "market_efficiency", label: "Market efficiency", domain: [0, 1] },
  { key: "cooperation_index", label: "Cooperation index", domain: [0, 1] },
  { key: "wealth_gini", label: "Wealth Gini", domain: [0, 1] },
  { key: "strategy_convergence", label: "Strategy convergence", domain: [0, 1] },
  { key: "value_flow_velocity", label: "Value flow velocity", domain: null },
];

export function MacroSignalsPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["plugin", "agentic-economy-oracle", "macro-signals"],
    queryFn: () => api.plugins.agenticEconomyOracle.macroSignals(),
    // Signals update as the swarm runs rounds; a slow poll keeps the panel live
    // without hammering Qdrant. Manual refetch button is also provided.
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <PanelFrame><Muted>Loading macro signals…</Muted></PanelFrame>;
  }

  if (isError) {
    return (
      <PanelFrame>
        <div style={{ color: "var(--offline)", fontSize: 13 }}>
          Failed to load macro signals:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </div>
        <button onClick={() => refetch()} style={btnStyle}>
          Retry
        </button>
      </PanelFrame>
    );
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <PanelFrame>
        <Muted>
          No macro signals yet. Run a simulation round and push signals to
          Qdrant (swarm_signals) — they will appear here.
        </Muted>
      </PanelFrame>
    );
  }

  const rounds = rows.map((r) => r.round);
  const roundMin = Math.min(...rounds);
  const roundMax = Math.max(...rounds);

  return (
    <PanelFrame>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {rows.length} round{rows.length === 1 ? "" : "s"} · round {roundMin}–
          {roundMax}
        </span>
        <button onClick={() => refetch()} style={btnStyle} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {SERIES.map((s) => (
          <MiniChart
            key={s.key}
            label={s.label}
            rows={rows}
            valueKey={s.key}
            domain={s.domain}
          />
        ))}
      </div>
    </PanelFrame>
  );
}

// ── One small-multiple line chart ────────────────────────────────────────────

const CHART_W = 280;
const CHART_H = 120;
const PAD = { top: 10, right: 8, bottom: 20, left: 32 };

function MiniChart({
  label,
  rows,
  valueKey,
  domain,
}: {
  label: string;
  rows: MacroSignalPoint[];
  valueKey: keyof MacroSignalPoint;
  domain: [number, number] | null;
}) {
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const rounds = rows.map((r) => r.round);
  const roundMin = Math.min(...rounds);
  const roundMax = Math.max(...rounds);
  const roundSpan = roundMax - roundMin || 1;

  // Numeric values present for this series (nulls excluded from domain calc).
  const values = rows
    .map((r) => r[valueKey])
    .filter((v): v is number => typeof v === "number");

  // Y domain: fixed if provided, else auto from data with a little headroom.
  let yMin: number;
  let yMax: number;
  if (domain) {
    [yMin, yMax] = domain;
  } else if (values.length > 0) {
    yMin = Math.min(...values, 0);
    yMax = Math.max(...values);
    if (yMax === yMin) yMax = yMin + 1; // avoid zero-height domain
  } else {
    yMin = 0;
    yMax = 1;
  }
  const ySpan = yMax - yMin || 1;

  const x = (round: number) =>
    PAD.left + ((round - roundMin) / roundSpan) * plotW;
  const y = (val: number) => PAD.top + (1 - (val - yMin) / ySpan) * plotH;

  // Build the line as segments, breaking across null gaps so a missing round
  // is an honest discontinuity rather than a straight line through it.
  const segments: string[] = [];
  let current: string[] = [];
  for (const r of rows) {
    const v = r[valueKey];
    if (typeof v === "number") {
      const cmd = current.length === 0 ? "M" : "L";
      current.push(`${cmd}${x(r.round).toFixed(1)},${y(v).toFixed(1)}`);
    } else if (current.length > 0) {
      segments.push(current.join(" "));
      current = [];
    }
  }
  if (current.length > 0) segments.push(current.join(" "));

  // Rounds flagged as volatile / crisis — thin vertical markers.
  const flagged = rows.filter((r) => r.volatility_detected || r.crisis_detected);

  const latest = values.length > 0 ? values[values.length - 1] : null;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 8,
        background: "var(--bg-elevated)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 2,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{label}</span>
        <span
          style={{
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
          }}
        >
          {latest === null ? "—" : formatValue(latest, domain)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        role="img"
        aria-label={`${label} over rounds ${roundMin} to ${roundMax}`}
        style={{ display: "block" }}
      >
        {/* y-axis min/max ticks */}
        <text x={PAD.left - 4} y={PAD.top + 4} textAnchor="end" style={tickStyle}>
          {formatTick(yMax, domain)}
        </text>
        <text
          x={PAD.left - 4}
          y={PAD.top + plotH}
          textAnchor="end"
          style={tickStyle}
        >
          {formatTick(yMin, domain)}
        </text>

        {/* baseline + top gridline */}
        <line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={PAD.left + plotW}
          y2={PAD.top + plotH}
          stroke="var(--border)"
          strokeWidth={1}
        />
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left + plotW}
          y2={PAD.top}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.5}
        />

        {/* flagged-round markers */}
        {flagged.map((r, i) => (
          <line
            key={`flag-${r.round}-${i}`}
            x1={x(r.round)}
            y1={PAD.top}
            x2={x(r.round)}
            y2={PAD.top + plotH}
            stroke={r.crisis_detected ? "var(--offline)" : "var(--degraded)"}
            strokeWidth={1}
            opacity={0.4}
          />
        ))}

        {/* value line (one path per non-null segment) */}
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* x-axis round labels (min and max) */}
        <text x={PAD.left} y={CHART_H - 6} textAnchor="start" style={tickStyle}>
          {roundMin}
        </text>
        <text
          x={PAD.left + plotW}
          y={CHART_H - 6}
          textAnchor="end"
          style={tickStyle}
        >
          {roundMax}
        </text>
      </svg>
    </div>
  );
}

// ── small helpers / styles ───────────────────────────────────────────────────

function PanelFrame({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{children}</div>;
}

function formatValue(v: number, domain: [number, number] | null): string {
  // [0,1] signals read naturally as percentages; unbounded ones as fixed-2.
  return domain && domain[0] === 0 && domain[1] === 1
    ? `${(v * 100).toFixed(1)}%`
    : v.toFixed(2);
}

function formatTick(v: number, domain: [number, number] | null): string {
  return domain && domain[0] === 0 && domain[1] === 1
    ? v.toFixed(1)
    : v.toFixed(0);
}

const tickStyle: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "var(--font-mono)",
  fill: "var(--text-secondary)",
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