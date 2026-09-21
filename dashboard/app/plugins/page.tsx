"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api-client";
import type { PluginRegistryEntry } from "@/types";

export default function PluginsPage() {
  const { data: plugins, isLoading, error } = useQuery({
    queryKey: ["plugins"],
    queryFn: api.plugins.list,
    refetchInterval: 15000,
  });

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Plugin Registry
        </h1>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 20 }}>
        Discovered from <code data-mono style={{ color: "var(--text-secondary)" }}>plugins/</code> · read-only · lifecycle loading arrives in v0.2
      </p>

      {isLoading && (
        <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          Scanning plugins…
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 12px", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--offline)", background: "var(--offline-dim)", border: "1px solid var(--border)", borderRadius: 3 }}>
          {(error as Error).message}
        </div>
      )}

      {plugins && plugins.length === 0 && (
        <div style={{ padding: "24px", textAlign: "center", border: "1px dashed var(--border-active)", borderRadius: 4, color: "var(--text-muted)", fontSize: 12 }}>
          No plugins discovered. Add a folder with a <code data-mono>manifest.json</code> under <code data-mono>plugins/</code>.
        </div>
      )}

      {plugins && plugins.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {plugins.map((entry) => (
            <PluginCard key={entry.manifest.name} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function PluginCard({ entry }: { entry: PluginRegistryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { manifest, status, error, manifestPath } = entry;
  const isErrored = status === "errored";

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${isErrored ? "var(--offline)" : "var(--border)"}`,
        borderLeft: `2px solid ${isErrored ? "var(--offline)" : "var(--accent)"}`,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {/* Header row (click to expand) */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
      >
        <ChevronRight
          size={14}
          style={{ color: "var(--text-muted)", flexShrink: 0, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
              {manifest.display_name}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: 2 }}>
              v{manifest.version}
            </span>
            <StatusPill status={status} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            {manifest.name}
          </div>
        </div>
        {manifest.tags && manifest.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 240 }}>
            {manifest.tags.map((t) => (
              <span key={t} style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 2 }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 16px 16px 42px", display: "flex", flexDirection: "column", gap: 16 }}>
          {isErrored && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", background: "var(--offline-dim)", border: "1px solid var(--offline)", borderRadius: 3, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--offline)" }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Description */}
          <Section label="DESCRIPTION">
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              {manifest.description}
            </p>
          </Section>

          {/* Author + path */}
          <div style={{ display: "flex", gap: 24, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
            <span>author: <span style={{ color: "var(--text-secondary)" }}>{manifest.author}</span></span>
            <span>manifest: <span style={{ color: "var(--text-secondary)" }}>{manifestPath}</span></span>
          </div>

          {/* Fleet shape */}
          {manifest.fleet_shape && manifest.fleet_shape.length > 0 && (
            <Section label="FLEET SHAPE">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {manifest.fleet_shape.map((role) => (
                  <div key={role.role} style={{ borderLeft: "2px solid var(--border-active)", paddingLeft: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
                      {role.role} <span style={{ color: "var(--accent)" }}>×{role.count}</span>
                    </div>
                    {role.description && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
                        {role.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Personalization */}
          {manifest.personalization && manifest.personalization.length > 0 && (
            <Section label="PERSONALIZATION POINTS">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {manifest.personalization.map((p) => (
                  <div key={p.key} style={{ borderLeft: "2px solid var(--border-active)", paddingLeft: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>{p.label}</span>
                      <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 2 }}>{p.kind}</span>
                      {p.required && <span style={{ fontSize: 9, color: "var(--degraded)", fontFamily: "var(--font-mono)" }}>required</span>}
                    </div>
                    {p.description && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>{p.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Dependencies */}
          <Section label="DEPENDENCIES">
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
              <DepLine label="skills" values={manifest.dependencies.ironclaw_skills} />
              <DepLine label="qdrant" values={manifest.dependencies.qdrant_collections} />
              <DepLine label="nova group" values={manifest.dependencies.nova_group ? [manifest.dependencies.nova_group] : undefined} />
              <DepLine label="plugins" values={manifest.dependencies.plugins} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: "0.1em", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function DepLine({ label, values }: { label: string; values?: string[] }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "var(--text-muted)", minWidth: 80 }}>{label}:</span>
      <span>{values && values.length > 0 ? values.join(", ") : "—"}</span>
    </div>
  );
}

function StatusPill({ status }: { status: PluginRegistryEntry["status"] }) {
  const color =
    status === "errored" ? "var(--offline)" :
    status === "active"  ? "var(--online)" :
                           "var(--text-muted)";
  const dim =
    status === "errored" ? "var(--offline-dim)" :
    status === "active"  ? "var(--online-dim)" :
                           "var(--bg-elevated)";
  return (
    <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color, background: dim, border: `1px solid ${color}22`, padding: "1px 6px", borderRadius: 2, letterSpacing: "0.06em" }}>
      {status}
    </span>
  );
}