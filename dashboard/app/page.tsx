"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { api } from "@/lib/api-client";
import { AgentCard } from "@/components/ui/AgentCard";

export default function FleetPage() {
  const queryClient = useQueryClient();

  const { data: agents, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents.list,
    refetchInterval: 5000,
  });

  const invalidateAgents = () =>
    queryClient.invalidateQueries({ queryKey: ["agents"] });

  const pauseFleet = useMutation({
    mutationFn: api.fleet.pause,
    onSuccess: invalidateAgents,
  });
  const resumeFleet = useMutation({
    mutationFn: api.fleet.resume,
    onSuccess: invalidateAgents,
  });

  const anyPaused = agents?.some((a) => a.status === "paused") ?? false;
  const fleetBusy = pauseFleet.isPending || resumeFleet.isPending;

  const lastResult = pauseFleet.data ?? resumeFleet.data;

  return (
    <div style={{ padding: 24 }}>
      {/* Page header */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Agent Fleet
          </h1>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            5 IronClaw agents · polling every 5s
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {dataUpdatedAt > 0 && (
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              updated {new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour12: false })}
            </span>
          )}

          {/* Fleet-wide controls */}
          <div style={{ display: "flex", gap: 6 }}>
            <FleetButton
              icon={<Pause size={12} />}
              label="Pause Fleet"
              onClick={() => pauseFleet.mutate()}
              disabled={fleetBusy}
            />
            <FleetButton
              icon={<Play size={12} />}
              label="Resume Fleet"
              onClick={() => resumeFleet.mutate()}
              disabled={fleetBusy}
              accent={anyPaused}
            />
          </div>
        </div>
      </div>

      {/* Fleet action result */}
      {lastResult && (
        <div style={{ marginBottom: 16, fontSize: 11, fontFamily: "var(--font-mono)", color: lastResult.failed.length ? "var(--degraded)" : "var(--online)" }}>
          {lastResult.failed.length === 0
            ? `✓ ${lastResult.affected} agent${lastResult.affected === 1 ? "" : "s"} affected`
            : `⚠ ${lastResult.affected} affected · failed: ${lastResult.failed.join(", ")}`}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, height: 220, opacity: 0.5, animation: "pulse-online 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: "var(--offline-dim)", border: "1px solid var(--offline)", borderRadius: 4, padding: "12px 16px", color: "var(--offline)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Failed to reach the dashboard API. Check that the dev server is running.
          <br />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{(error as Error).message}</span>
        </div>
      )}

      {/* Grid */}
      {agents && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function FleetButton({
  icon, label, onClick, disabled, accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        background: accent ? "var(--accent-dim)" : "var(--bg-elevated)",
        border: `1px solid ${accent ? "var(--accent)" : "var(--border-active)"}`,
        color: accent ? "var(--accent)" : "var(--text-secondary)",
        borderRadius: 3, padding: "5px 12px", fontSize: 11, fontFamily: "var(--font-mono)",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        letterSpacing: "0.04em", transition: "background 0.1s, color 0.1s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}