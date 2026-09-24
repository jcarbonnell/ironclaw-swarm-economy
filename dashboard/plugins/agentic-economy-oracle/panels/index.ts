// ── Panel registry (agentic-economy-oracle) ──────────────────────────────────
// The plugin's own wiring: maps the panel IDs declared in this plugin's
// manifest (ui_extensions.top_level_panels) to the React components that render
// them. This lives INSIDE the plugin bundle, not in the base — the base stays
// generic and has no hardcoded knowledge of what "macro-signals" is. The base
// asks this plugin "what component renders panel X?"; the plugin answers here.
//
// The manifest is the full statement of intent (six panels). This registry is
// the BUILT SUBSET (v0.1: just macro-signals). Any manifest ID with no entry
// here renders as a "not built yet" placeholder in the host — so the gap
// between declared and built is visible, not hidden.
//
// When more panels land (NOVA Contributions, Oracle Training, …), register them
// here alongside their manifest ID. No base change is ever needed.

import type { ComponentType } from "react";
import { MacroSignalsPanel } from "./MacroSignalsPanel";
import { NovaContributionsPanel } from "./NovaContributionsPanel";
import { OracleTrainingPanel } from "./OracleTrainingPanel";

// A panel component takes no required props for now — each panel fetches its own
// data via api-client, keyed by the plugin. If panels later need context (the
// active plugin id, a selected round), widen this type in one place.
export type PanelComponent = ComponentType;

// id (must match a string in manifest ui_extensions.top_level_panels) → component
export const panelRegistry: Record<string, PanelComponent> = {
  "macro-signals": MacroSignalsPanel,
  "nova-contributions": NovaContributionsPanel,
  "oracle-training": OracleTrainingPanel,
};