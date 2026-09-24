"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { resolvePanel } from "@/lib/plugin-panels";
import type { PluginRegistryEntry } from "@/types";

// ── Plugin host page ─────────────────────────────────────────────────────────
// /plugins/[pluginId] — the manifest-driven panel host.
//
// Reads the plugin's manifest (from the registry list), renders one tab per
// declared top_level_panels ID, and resolves each ID to a component via the
// base resolver. IDs the plugin hasn't built yet render as a "not built yet"
// placeholder — so the manifest (full intent) and the registry (built subset)
// stay visibly in sync. The base has no hardcoded panel knowledge: it renders
// whatever the manifest declares, resolving through the bundle's own registry.

export default function PluginHostPage({
  params,
}: {
  params: Promise<{ pluginId: string }>;
}) {
  const { pluginId } = use(params);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["plugins"],
    queryFn: () => api.plugins.list(),
  });

  const entry: PluginRegistryEntry | undefined = data?.find(
    (p) => p.manifest.name === pluginId
  );

  const panelIds = entry?.manifest.ui_extensions?.top_level_panels ?? [];

  // Active tab: default to the first BUILT panel if there is one, else the first
  // declared panel (so a plugin with only placeholders still shows something).
  const firstBuilt = panelIds.find((id) => resolvePanel(pluginId, id) !== null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ?? firstBuilt ?? panelIds[0] ?? null;

  if (isLoading) {
    return <Frame><Muted>Loading plugin…</Muted></Frame>;
  }

  if (isError) {
    return (
      <Frame>
        <div style={{ color: "var(--offline)", fontSize: 13 }}>
          Failed to load plugins:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </div>
      </Frame>
    );
  }

  if (!entry) {
    return (
      <Frame>
        <Muted>
          No plugin named <code data-mono>{pluginId}</code> found in the registry.
        </Muted>
      </Frame>
    );
  }

  const m = entry.manifest;

  return (
    <Frame>
      {/* header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h1 style={{ fontSize: 18, color: "var(--text-primary)", margin: 0 }}>
            {m.display_name}
          </h1>
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
            }}
          >
            v{m.version}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          {panelIds.length} panel{panelIds.length === 1 ? "" : "s"} declared ·{" "}
          {panelIds.filter((id) => resolvePanel(pluginId, id)).length} built
        </div>
      </div>

      {panelIds.length === 0 ? (
        <Muted>This plugin declares no top-level panels.</Muted>
      ) : (
        <>
          {/* tab bar */}
          <div
            style={{
              display: "flex",
              gap: 2,
              borderBottom: "1px solid var(--border)",
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            {panelIds.map((id) => {
              const built = resolvePanel(pluginId, id) !== null;
              const isActive = id === active;
              return (
                <button
                  key={id}
                  onClick={() => setActiveId(id)}
                  title={built ? undefined : "Not built yet"}
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    color: isActive
                      ? "var(--text-primary)"
                      : built
                      ? "var(--text-secondary)"
                      : "var(--text-muted)",
                    background: isActive ? "var(--bg-elevated)" : "transparent",
                    border: "none",
                    borderBottom: isActive
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    padding: "6px 12px",
                    cursor: "pointer",
                    opacity: built ? 1 : 0.6,
                  }}
                >
                  {panelLabel(id)}
                  {!built && (
                    <span style={{ marginLeft: 6, fontSize: 10 }}>○</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* active panel */}
          {active && <PanelSlot pluginId={pluginId} panelId={active} />}
        </>
      )}
    </Frame>
  );
}

// Renders the resolved component, or a placeholder if the panel isn't built.
function PanelSlot({ pluginId, panelId }: { pluginId: string; panelId: string }) {
  const Component = resolvePanel(pluginId, panelId);

  if (!Component) {
    return (
      <div
        style={{
          border: "1px dashed var(--border)",
          borderRadius: 6,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {panelLabel(panelId)}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          Not built yet. Declared in the manifest; no component registered.
        </div>
      </div>
    );
  }

  return <Component />;
}

// Turn a panel ID ("macro-signals") into a display label ("Macro Signals").
function panelLabel(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 24, maxWidth: 1100 }}>{children}</div>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{children}</div>;
}