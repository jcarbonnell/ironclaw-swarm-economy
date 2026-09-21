"use client";

import { useSession } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function Topbar() {
  const { session } = useSession();

  // Fleet health summary for topbar
  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: api.agents.list,
    refetchInterval: 5000,
  });

  const online = agents?.filter((a) => a.status === "healthy").length ?? 0;
  const total = agents?.length ?? 5;
  const allHealthy = online === total;
  const someDown = online > 0 && online < total;

  return (
    <header
      style={{
        height: "var(--topbar-height)",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Left: wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            fontSize: 13,
            color: "var(--text-primary)",
            letterSpacing: "0.04em",
          }}
        >
          IRONCLAW
          <span style={{ color: "var(--accent)", marginLeft: 6 }}>FLEET</span>
          DASHBOARD
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            padding: "1px 6px",
            borderRadius: 2,
            letterSpacing: "0.08em",
          }}
        >
          v0.1
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            padding: "1px 6px",
            borderRadius: 2,
            letterSpacing: "0.08em",
          }}
        >
          PERMISSIONED SANDBOX
        </span>
      </div>

      {/* Right: fleet status + researcher identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* Fleet status indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: allHealthy
                ? "var(--online)"
                : someDown
                ? "var(--degraded)"
                : "var(--offline)",
              boxShadow: allHealthy
                ? "0 0 6px var(--online)"
                : someDown
                ? "0 0 6px var(--degraded)"
                : "0 0 6px var(--offline)",
              animation: allHealthy ? "pulse-online 2.5s ease-in-out infinite" : undefined,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-secondary)",
            }}
          >
            {online}/{total} online
          </span>
        </div>

        {/* Researcher identity */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          {session?.researcherId ?? "—"}
        </span>
      </div>
    </header>
  );
}