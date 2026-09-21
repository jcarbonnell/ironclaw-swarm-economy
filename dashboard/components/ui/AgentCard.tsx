"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Pause, Play, RotateCw, FileText, ScrollText } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "./StatusBadge";
import { CopyValue } from "./CopyValue";
import { api } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";
import type { AgentState } from "@/types";

interface AgentCardProps {
  agent: AgentState;
}

export function AgentCard({ agent }: AgentCardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [promptInput, setPromptInput] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const invalidateAgents = () =>
    queryClient.invalidateQueries({ queryKey: ["agents"] });

  const sendMutation = useMutation({
    mutationFn: (content: string) => api.agents.send(agent.id, content),
    onSuccess: () => {
      setPromptInput("");
      setShowPrompt(false);
      invalidateAgents();
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.agents.pause(agent.id),
    onSuccess: invalidateAgents,
  });
  const unpauseMutation = useMutation({
    mutationFn: () => api.agents.unpause(agent.id),
    onSuccess: invalidateAgents,
  });
  const restartMutation = useMutation({
    mutationFn: () => api.agents.restart(agent.id),
    onSuccess: invalidateAgents,
  });

  const logsQuery = useQuery({
    queryKey: ["logs", agent.id],
    queryFn: () => api.agents.logs(agent.id, 200),
    enabled: showLogs,          // only fetch when the logs panel is open
  });

  const shortAccount = agent.nearAccount.split(".")[0];
  const isPaused = agent.status === "paused";
  const isStopped = agent.status === "stopped";
  const busy =
    pauseMutation.isPending || unpauseMutation.isPending || restartMutation.isPending;

  const topBorderColor =
    agent.status === "healthy"  ? "var(--online)" :
    agent.status === "paused"   ? "var(--accent)" :
    agent.status === "stopped"  ? "var(--text-muted)" :
                                  "var(--offline)";

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${agent.status === "healthy" ? "var(--border-active)" : "var(--border)"}`,
        borderTop: `2px solid ${topBorderColor}`,
        borderRadius: 4,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13, color: "var(--text-primary)", marginBottom: 2 }}>
            {agent.id}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            :{agent.port}
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* NEAR account */}
      <div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>NEAR ACCOUNT</div>
        <CopyValue value={agent.nearAccount} display={shortAccount} mono />
      </div>

      {/* Metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <Metric label="LATENCY" value={agent.latencyMs != null ? `${agent.latencyMs}ms` : "—"} />
        <Metric label="LAST SEEN" value={formatRelativeTime(agent.lastSeenAt)} />
        <Metric label="LAST SKILL" value={agent.lastSkillInvoked ?? "—"} />
        <Metric label="STATUS" value={agent.status} />
      </div>

      {/* Error message */}
      {agent.errorMessage && (
        <div style={{ fontSize: 11, color: agent.status === "stopped" ? "var(--text-muted)" : "var(--offline)", background: agent.status === "stopped" ? "var(--bg-elevated)" : "var(--offline-dim)", border: "1px solid var(--border)", padding: "4px 8px", borderRadius: 2, fontFamily: "var(--font-mono)" }}>
          {agent.errorMessage}
        </div>
      )}

      {/* Send prompt input */}
      {showPrompt && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && promptInput.trim()) sendMutation.mutate(promptInput.trim());
              if (e.key === "Escape") setShowPrompt(false);
            }}
            placeholder="message content…"
            autoFocus
            style={{ flex: 1, background: "var(--bg-base)", border: "1px solid var(--border-focus)", borderRadius: 2, padding: "4px 8px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 11, outline: "none" }}
          />
          <button
            onClick={() => promptInput.trim() && sendMutation.mutate(promptInput.trim())}
            disabled={sendMutation.isPending || !promptInput.trim()}
            style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 2, padding: "4px 10px", fontSize: 10, fontFamily: "var(--font-mono)", cursor: "pointer", letterSpacing: "0.06em" }}
          >
            {sendMutation.isPending ? "…" : "SEND"}
          </button>
        </div>
      )}

      {/* Logs panel */}
      {showLogs && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: "0.06em" }}>
              CONTAINER LOGS · last 200
            </span>
            <button
              onClick={() => logsQuery.refetch()}
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 10, fontFamily: "var(--font-mono)" }}
            >
              refresh
            </button>
          </div>
          <pre style={{ margin: 0, padding: 10, maxHeight: 240, overflow: "auto", fontSize: 10, lineHeight: 1.5, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", background: "var(--bg-base)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {logsQuery.isLoading ? "Loading…" : logsQuery.error ? `Error: ${(logsQuery.error as Error).message}` : logsQuery.data?.logs || "(no output)"}
          </pre>
        </div>
      )}

      {/* Action row */}
      <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10, flexWrap: "wrap" }}>
        <ActionButton icon={<FileText size={11} />} label="Detail" onClick={() => router.push(`/agents/${agent.id}`)} />
        <ActionButton icon={<Send size={11} />} label="Prompt" onClick={() => setShowPrompt((v) => !v)} active={showPrompt} disabled={isPaused || isStopped} />
        {isPaused ? (
          <ActionButton icon={<Play size={11} />} label="Resume" onClick={() => unpauseMutation.mutate()} disabled={busy} accent />
        ) : (
          <ActionButton icon={<Pause size={11} />} label="Pause" onClick={() => pauseMutation.mutate()} disabled={busy || isStopped} />
        )}
        <ActionButton icon={<RotateCw size={11} />} label="Restart" onClick={() => restartMutation.mutate()} disabled={busy} />
        <ActionButton icon={<ScrollText size={11} />} label="Logs" onClick={() => setShowLogs((v) => !v)} active={showLogs} />
      </div>

      {/* Mutation errors */}
      {(sendMutation.isError || pauseMutation.isError || unpauseMutation.isError || restartMutation.isError) && (
        <div style={{ fontSize: 10, color: "var(--offline)", fontFamily: "var(--font-mono)" }}>
          {(sendMutation.error || pauseMutation.error || unpauseMutation.error || restartMutation.error as Error)?.message ?? "Action failed"}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>{value}</div>
    </div>
  );
}

function ActionButton({
  icon, label, onClick, active, disabled, accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  accent?: boolean;
}) {
  const borderColor = disabled ? "var(--border)" : accent || active ? "var(--accent)" : "var(--border-active)";
  const textColor = disabled ? "var(--text-muted)" : accent || active ? "var(--accent)" : "var(--text-secondary)";
  const bg = active || accent ? "var(--accent-dim)" : "var(--bg-elevated)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        background: bg, border: `1px solid ${borderColor}`, color: textColor,
        borderRadius: 2, padding: "4px 8px", fontSize: 10, fontFamily: "var(--font-mono)",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        letterSpacing: "0.04em", whiteSpace: "nowrap", transition: "background 0.1s, color 0.1s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}