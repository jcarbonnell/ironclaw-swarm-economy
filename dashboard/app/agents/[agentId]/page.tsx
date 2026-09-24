"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api-client";
import { MessageLog, type LogColumn } from "@/components/ui/MessageLog";
import { CopyValue } from "@/components/ui/CopyValue";
import { resolveDetailSection } from "@/lib/plugin-panels";
import { formatTimestamp, formatRelativeTime } from "@/lib/utils";
import type { MemoryDocument, ConversationMessage } from "@/types";

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);

  const memoryQuery = useQuery({
    queryKey: ["memory", agentId],
    queryFn: () => api.agents.memory(agentId),
  });

  const convQuery = useQuery({
    queryKey: ["conversations", agentId],
    queryFn: () => api.agents.conversations(agentId),
  });

  // Active plugins that declare agent_detail_sections — the base renders their
  // sections generically via the bundle resolver (no hardcoded plugin knowledge).
  const pluginsQuery = useQuery({
    queryKey: ["plugins"],
    queryFn: () => api.plugins.list(),
  });

  // ── Memory columns ──────────────────────────────────────────────────────────
  const memoryColumns: LogColumn<MemoryDocument>[] = [
    {
      width: 150,
      render: (d) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {formatRelativeTime(d.updated_at)}
        </span>
      ),
    },
    {
      grow: true,
      render: (d) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)" }}>
          {d.path}
        </span>
      ),
    },
  ];

  // ── Conversation columns ────────────────────────────────────────────────────
  const convColumns: LogColumn<ConversationMessage>[] = [
    {
      width: 90,
      render: (m) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {formatTimestamp(m.created_at)}
        </span>
      ),
    },
    {
      width: 90,
      render: (m) => <RoleBadge role={m.role} />,
    },
    {
      grow: true,
      render: (m) => (
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {m.content.replace(/\s+/g, " ").trim()}
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      {/* Back link + title */}
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-muted)",
          textDecoration: "none",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={13} /> fleet
      </Link>

      <h1
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 20px",
        }}
      >
        {agentId}
      </h1>

      {/* Memory section */}
      <Section
        title="Memory"
        subtitle={
          memoryQuery.data
            ? `${memoryQuery.data.length} document${memoryQuery.data.length === 1 ? "" : "s"}`
            : undefined
        }
      >
        {memoryQuery.isLoading && <Loading />}
        {memoryQuery.error && <ErrorLine msg={(memoryQuery.error as Error).message} />}
        {memoryQuery.data && (
          <MessageLog<MemoryDocument>
            rows={memoryQuery.data}
            columns={memoryColumns}
            rowKey={(d) => d.id}
            emptyLabel="No memory documents"
            renderDetail={(d) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  <span>created {formatTimestamp(d.created_at)}</span>
                  <span>updated {formatTimestamp(d.updated_at)}</span>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowX: "auto",
                  }}
                >
                  {d.content}
                </pre>
              </div>
            )}
          />
        )}
      </Section>

      {/* Conversation section */}
      <Section
        title="Conversation History"
        subtitle={
          convQuery.data
            ? `${convQuery.data.length} message${convQuery.data.length === 1 ? "" : "s"} (newest first)`
            : undefined
        }
      >
        {convQuery.isLoading && <Loading />}
        {convQuery.error && <ErrorLine msg={(convQuery.error as Error).message} />}
        {convQuery.data && (
          <MessageLog<ConversationMessage>
            rows={convQuery.data}
            columns={convColumns}
            rowKey={(m) => m.id}
            emptyLabel="No conversation history"
            renderDetail={(m) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  <span>{formatTimestamp(m.created_at)}</span>
                  <CopyValue value={m.conversation_id} display={`conv ${m.conversation_id.slice(0, 8)}…`} />
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowX: "auto",
                  }}
                >
                  {m.content}
                </pre>
              </div>
            )}
          />
        )}
      </Section>

      {/* Plugin-contributed detail sections (agent_detail_sections extension) */}
      {(pluginsQuery.data ?? [])
        .filter((entry) => entry.status !== "errored")
        .flatMap((entry) => {
          const sectionIds = entry.manifest.ui_extensions?.agent_detail_sections ?? [];
          return sectionIds.map((sectionId) => ({
            pluginName: entry.manifest.name,
            pluginDisplay: entry.manifest.display_name,
            sectionId,
          }));
        })
        .map(({ pluginName, pluginDisplay, sectionId }) => {
          const Component = resolveDetailSection(pluginName, sectionId);
          return (
            <Section
              key={`${pluginName}:${sectionId}`}
              title={sectionLabel(sectionId)}
              subtitle={pluginDisplay}
            >
              {Component ? (
                <Component agentId={agentId} />
              ) : (
                <div
                  style={{
                    border: "1px dashed var(--border)",
                    borderRadius: 6,
                    padding: 16,
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  Not built yet. Declared in the manifest; no component registered.
                </div>
              )}
            </Section>
          );
        })}
    </div>
  );
}

// Turn a section id ("agent-economy-signals") into a display label.
function sectionLabel(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Local helpers ───────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          {title}
        </h2>
        {subtitle && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function RoleBadge({ role }: { role: string }) {
  const color =
    role === "assistant" ? "var(--accent)" :
    role === "user" ? "var(--online)" :
    "var(--text-muted)";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color,
        letterSpacing: "0.06em",
      }}
    >
      {role}
    </span>
  );
}

function Loading() {
  return (
    <div style={{ padding: 16, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
      Loading…
    </div>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        color: "var(--offline)",
        background: "var(--offline-dim)",
        border: "1px solid var(--border)",
        borderRadius: 3,
      }}
    >
      {msg}
    </div>
  );
}