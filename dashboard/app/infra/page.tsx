"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

const INFRA_ITEMS = [
  { label: "Postgres  :5433", key: "postgres" as const },
  { label: "Qdrant  :6333", key: "qdrant" as const },
  { label: "Ollama  :11434", key: "ollama" as const },
];

export default function InfraPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["infra"],
    queryFn: api.infra.health,
    refetchInterval: 10000,
  });

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
        Infrastructure
      </h1>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 20 }}>
        Shared services · polling every 10s
      </p>

      {isLoading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
          Checking…
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
          {INFRA_ITEMS.map(({ label, key }) => {
            const up = data?.[key] ?? false;
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "var(--bg-surface)",
                  border: `1px solid ${up ? "var(--border-active)" : "var(--border)"}`,
                  borderLeft: `2px solid ${up ? "var(--online)" : "var(--offline)"}`,
                  borderRadius: 3,
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
                  {label}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: up ? "var(--online)" : "var(--offline)" }}>
                  {up ? "● reachable" : "● unreachable"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ marginTop: 20, fontSize: 11, color: "var(--text-muted)" }}>
        Agent webhook health is shown on the Fleet view. Postgres check queries the dashboard database.
      </p>
    </div>
  );
}