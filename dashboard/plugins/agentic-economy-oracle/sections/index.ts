// ── Detail-section registry (agentic-economy-oracle) ─────────────────────────
// The plugin's own wiring for agent-detail sections, parallel to panels/index.ts.
// Maps the section IDs declared in this plugin's manifest
// (ui_extensions.agent_detail_sections) to the React components that render them.
// Lives INSIDE the plugin bundle — the base stays generic and asks this plugin
// "what component renders detail section X?"; the plugin answers here.
//
// Unlike panels (which take no props and self-fetch by plugin), a detail section
// renders for ONE agent, so section components take an { agentId } prop. The base
// passes the short agent id (agent1); the component fetches that agent's signals.
//
// The manifest is the full statement of intent; this registry is the BUILT
// SUBSET. A manifest section id with no entry here renders as a "not built yet"
// placeholder in the detail page — same declared-vs-built visibility as panels.

import type { ComponentType } from "react";
import { AgentEconomySignalsSection } from "./AgentEconomySignalsSection";

// A detail-section component renders for one agent, addressed by short id.
export type DetailSectionComponent = ComponentType<{ agentId: string }>;

// id (must match a string in manifest ui_extensions.agent_detail_sections)
// → component
export const detailSectionRegistry: Record<string, DetailSectionComponent> = {
  "agent-economy-signals": AgentEconomySignalsSection,
};