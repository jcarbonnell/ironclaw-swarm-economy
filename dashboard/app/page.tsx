"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { AgentCard } from "@/components/ui/AgentCard";

export default function FleetPage() {
  const { data: agents, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents.list,
    refetchInterval: 5000,
  });

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
        {dataUpdatedAt > 0 && (
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
            updated {new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour12: false })}
          </span>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                height: 220,
                opacity: 0.5,
                animation: "pulse-online 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{
          background: "var(--offline-dim)",
          border: "1px solid var(--offline)",
          borderRadius: 4,
          padding: "12px 16px",
          color: "var(--offline)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}>
          Failed to reach the dashboard API. Check that the dev server is running.
          <br />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{(error as Error).message}</span>
        </div>
      )}

      {/* Agent grid */}
      {agents && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}>
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}