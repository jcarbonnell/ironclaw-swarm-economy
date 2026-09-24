// ── Plugin panel resolver (base side) ────────────────────────────────────────
// This is the ONE intentional seam between the base and plugin bundles.
//
// In a static Next build the base cannot dynamically load code it has never seen
// — every component must be reachable from a static import so the bundler can
// compile it. So the base keeps a small map of plugin NAME → that plugin's own
// panel registry. This is the minimum possible base-side knowledge:
//
//   • The base learns THAT a bundle exists and WHERE its registry is.
//   • The base does NOT learn WHAT panels the bundle has — that stays in the
//     bundle's own panels/index.ts (panelRegistry).
//
// Adding a new plugin means adding ONE line here (its name → its registry).
// It never means teaching the base what any individual panel is.
//
// ── v1.0 dynamic-load point ──
// When the hosted, multi-tenant base must load third-party plugins it was not
// built with, THIS is the file that changes: the static import map becomes a
// runtime loader (remote module / iframe / sandboxed bundle per fleet spec §8).
// The contract above it (manifest declares panel IDs; the bundle's registry
// resolves them) stays identical — only this resolver's mechanism changes.
// Keeping the seam this thin is what makes that future swap local.

import type { PanelComponent } from "@/plugins/agentic-economy-oracle/panels";
import { panelRegistry as agenticEconomyOracle } from "@/plugins/agentic-economy-oracle/panels";
import type { DetailSectionComponent } from "@/plugins/agentic-economy-oracle/sections";
import { detailSectionRegistry as agenticEconomyOracleSections } from "@/plugins/agentic-economy-oracle/sections";
export type { DetailSectionComponent };

// plugin name (manifest.name) → that plugin's own panel registry
const bundleRegistries: Record<string, Record<string, PanelComponent>> = {
  "agentic-economy-oracle": agenticEconomyOracle,
};

// plugin name (manifest.name) → that plugin's own detail-section registry
const bundleSectionRegistries: Record <
  string,
  Record<string, DetailSectionComponent>
> = {
  "agentic-economy-oracle": agenticEconomyOracleSections,
};

// Resolve a single panel component for a plugin, or null if the plugin hasn't
// built that panel yet (→ the host renders a "not built yet" placeholder).
// Returns null for an unknown plugin too, so the host degrades gracefully.
export function resolvePanel(
  pluginName: string,
  panelId: string
): PanelComponent | null {
  const registry = bundleRegistries[pluginName];
  if (!registry) return null;
  return registry[panelId] ?? null;
}

// Resolve a single detail-section component for a plugin, or null if the plugin
// hasn't built that section yet (→ the detail page renders a "not built yet"
// placeholder). Same seam as resolvePanel: base knows WHERE each bundle's
// section registry is, not WHAT sections it contains.
export function resolveDetailSection(
  pluginName: string,
  sectionId: string
): DetailSectionComponent | null {
  const registry = bundleSectionRegistries[pluginName];
  if (!registry) return null;
  return registry[sectionId] ?? null;
}