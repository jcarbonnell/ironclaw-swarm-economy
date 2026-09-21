"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { MessageLog, type LogColumn } from "@/components/ui/MessageLog";
import { formatTimestamp, formatRelativeTime } from "@/lib/utils";
import type { FleetEvent, EventKind } from "@/types";

// Kind → display label + accent color. Centralized so the badge is consistent.
const KIND_META: Record<string, { label: string; color: string }> = {
  intervention:     { label: "intervention",   color: "var(--accent)" },
  skill_invoked:    { label: "skill invoked",  color: "var(--online)" },
  skill_completed:  { label: "skill done",     color: "var(--online)" },
  nova_contribution:{ label: "nova",           color: "var(--degraded)" },
  oracle_train:     { label: "oracle",         color: "var(--degraded)" },
  parameter_change: { label: "param",          color: "var(--text-secondary)" },
  plugin_lifecycle: { label: "plugin",         color: "var(--text-secondary)" },
  health_check:     { label: "health",         color: "var(--text-muted)" },
  custom:           { label: "custom",         color: "var(--text-muted)" },
};

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { label: kind, color: "var(--text-muted)" };
}

// Filter options for the kind dropdown. Empty value = all.
const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "all kinds" },
  { value: "intervention", label: "interventions" },
  { value: "skill_invoked", label: "prompts sent" },
];

export default function EventsPage() {
  const [kindFilter, setKindFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");

  const { data: events, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["events", kindFilter, agentFilter],
    queryFn: () =>
      api.events.list({
        kind: kindFilter || undefined,
        agent: agentFilter || undefined,
        limit: 200,
      }),
    refetchInterval: 10000,
  });

  const columns: LogColumn<FleetEvent>[] = [
    {
      width: 90,
      render: (e) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {formatTimestamp(e.timestamp)}
        </span>
      ),
    },
    {
      width: 110,
      render: (e) => {
        const m = kindMeta(e.kind);
        return (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: m.color, letterSpacing: "0.04em" }}>
            {m.label}
          </span>
        );
      },
    },
    {
      width: 70,
      render: (e) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
          {e.agent ?? "fleet"}
        </span>
      ),
    },
    {
      grow: true,
      render: (e) => (
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {summarize(e)}
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Event Log
          </h1>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Dashboard actions, newest first · polling every 10s
          </p>
        </div>
        {dataUpdatedAt > 0 && (
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
            updated {new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour12: false })}
          </span>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          style={selectStyle}
        >
          {KIND_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">all agents</option>
          {["agent1", "agent2", "agent3", "agent4", "agent5"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {isLoading && (
        <div style={{ padding: 16, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          Loading…
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 12px", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--offline)", background: "var(--offline-dim)", border: "1px solid var(--border)", borderRadius: 3 }}>
          {(error as Error).message}
        </div>
      )}

      {events && (
        <MessageLog<FleetEvent>
          rows={events}
          columns={columns}
          rowKey={(e) => e.event_id}
          emptyLabel="No events yet — pause an agent or send a prompt to generate one."
          renderDetail={(e) => (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexWrap: "wrap" }}>
                <span>{formatTimestamp(e.timestamp)} ({formatRelativeTime(e.timestamp)})</span>
                <span>kind: {e.kind}</span>
                <span>agent: {e.agent ?? "—"}</span>
                <span>plugin: {e.plugin ?? "base"}</span>
                <span>by: {e.researcher_id}</span>
              </div>
              <pre style={{ margin: 0, padding: 12, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 3, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowX: "auto" }}>
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </div>
          )}
        />
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-active)",
  color: "var(--text-secondary)",
  borderRadius: 3,
  padding: "5px 10px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  cursor: "pointer",
  outline: "none",
};

// One-line human summary of an event, from its payload.
function summarize(e: FleetEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.kind) {
    case "intervention": {
      const action = String(p.action ?? "action");
      if (action === "pause_fleet" || action === "resume_fleet") {
        return `${action.replace("_", " ")} · ${p.affected ?? 0} affected${Array.isArray(p.failed) && p.failed.length ? ` · failed: ${(p.failed as string[]).join(", ")}` : ""}`;
      }
      return `${action} ${e.agent ?? ""}`.trim();
    }
    case "skill_invoked": {
      const content = String(p.content ?? "");
      return content.length > 80 ? content.slice(0, 80) + "…" : content;
    }
    default:
      return JSON.stringify(p).slice(0, 80);
  }
}