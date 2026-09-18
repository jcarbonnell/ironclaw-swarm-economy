import type { AgentStatus } from "@/types";

const STATUS_CONFIG: Record <
  AgentStatus,
  { label: string; color: string; dimColor: string; glow: boolean }
> = {
  healthy: {
    label: "online",
    color: "var(--online)",
    dimColor: "var(--online-dim)",
    glow: true,
  },
  degraded: {
    label: "degraded",
    color: "var(--degraded)",
    dimColor: "var(--degraded-dim)",
    glow: false,
  },
  unreachable: {
    label: "offline",
    color: "var(--offline)",
    dimColor: "var(--offline-dim)",
    glow: false,
  },
};

export function StatusDot({ status }: { status: AgentStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div
      title={cfg.label}
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: cfg.color,
        boxShadow: cfg.glow ? `0 0 6px ${cfg.color}` : undefined,
        animation: cfg.glow ? "pulse-online 2.5s ease-in-out infinite" : undefined,
        flexShrink: 0,
      }}
    />
  );
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: cfg.color,
        background: cfg.dimColor,
        border: `1px solid ${cfg.color}22`,
        padding: "2px 6px",
        borderRadius: 2,
        letterSpacing: "0.06em",
      }}
    >
      <StatusDot status={status} />
      {cfg.label}
    </span>
  );
}