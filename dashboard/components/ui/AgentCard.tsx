"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Pause, FileText, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

  const sendMutation = useMutation({
    mutationFn: (content: string) => api.agents.send(agent.id, content),
    onSuccess: () => {
      setPromptInput("");
      setShowPrompt(false);
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const shortAccount = agent.nearAccount.split(".")[0]; // "ironclaw-swarm-agent1"

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${agent.status === "healthy" ? "var(--border-active)" : "var(--border)"}`,
        borderTop: `2px solid ${
          agent.status === "healthy"
            ? "var(--online)"
            : agent.status === "degraded"
            ? "var(--degraded)"
            : "var(--offline)"
        }`,
        borderRadius: 4,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      {/* Header: ID + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              fontSize: 13,
              color: "var(--text-primary)",
              marginBottom: 2,
            }}
          >
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
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>
          NEAR ACCOUNT
        </div>
        <CopyValue value={agent.nearAccount} display={shortAccount} mono />
      </div>

      {/* Metrics grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          borderTop: "1px solid var(--border)",
          paddingTop: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>LATENCY</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
            {agent.latencyMs != null ? `${agent.latencyMs}ms` : "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>LAST SEEN</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
            {formatRelativeTime(agent.lastSeenAt)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>LAST SKILL</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
            {agent.lastSkillInvoked ?? "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>STATUS</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
            {agent.status}
          </div>
        </div>
      </div>

      {/* Error message */}
      {agent.errorMessage && (
        <div
          style={{
            fontSize: 11,
            color: "var(--offline)",
            background: "var(--offline-dim)",
            border: "1px solid var(--offline)22",
            padding: "4px 8px",
            borderRadius: 2,
            fontFamily: "var(--font-mono)",
          }}
        >
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
              if (e.key === "Enter" && promptInput.trim()) {
                sendMutation.mutate(promptInput.trim());
              }
              if (e.key === "Escape") setShowPrompt(false);
            }}
            placeholder="message content…"
            autoFocus
            style={{
              flex: 1,
              background: "var(--bg-base)",
              border: "1px solid var(--border-focus)",
              borderRadius: 2,
              padding: "4px 8px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              outline: "none",
            }}
          />
          <button
            onClick={() => promptInput.trim() && sendMutation.mutate(promptInput.trim())}
            disabled={sendMutation.isPending || !promptInput.trim()}
            style={{
              background: "var(--accent-dim)",
              border: "1px solid var(--accent)",
              color: "var(--accent)",
              borderRadius: 2,
              padding: "4px 10px",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              letterSpacing: "0.06em",
            }}
          >
            {sendMutation.isPending ? "…" : "SEND"}
          </button>
        </div>
      )}

      {/* Action row */}
      <div
        style={{
          display: "flex",
          gap: 6,
          borderTop: "1px solid var(--border)",
          paddingTop: 10,
          flexWrap: "wrap",
        }}
      >
        <ActionButton
          icon={<FileText size={11} />}
          label="Detail"
          onClick={() => router.push(`/agents/${agent.id}`)}
        />
        <ActionButton
          icon={<Send size={11} />}
          label="Prompt"
          onClick={() => setShowPrompt((v) => !v)}
          active={showPrompt}
        />
        <ActionButton
          icon={<Pause size={11} />}
          label="Pause"
          onClick={() => api.agents.pause(agent.id).catch(() => {})}
        />
        <ActionButton
          icon={<ExternalLink size={11} />}
          label={`:${agent.port}`}
          onClick={() => window.open(`http://localhost:${agent.port}`, "_blank")}
        />
      </div>

      {/* Send mutation error */}
      {sendMutation.isError && (
        <div style={{ fontSize: 10, color: "var(--offline)", fontFamily: "var(--font-mono)" }}>
          {sendMutation.error?.message ?? "Send failed"}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: active ? "var(--accent-dim)" : "var(--bg-elevated)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border-active)"}`,
        color: active ? "var(--accent)" : "var(--text-secondary)",
        borderRadius: 2,
        padding: "4px 8px",
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        cursor: "pointer",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}