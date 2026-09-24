// ── Agent types ────────────────────────────────────────────────────────────────

export type AgentStatus =
  | "healthy"      // container running + /health responds
  | "unreachable"  // container running but /health failed (crashed, hung, booting)
  | "paused"       // container paused via docker pause
  | "stopped"      // container exited or missing
  | "degraded";    // reserved: reachable but erroring (set from event log later)

export interface AgentConfig {
  id: string;           // "agent1" .. "agent5"
  index: number;        // 1 .. 5
  url: string;          // "http://localhost:8081"
  nearAccount: string;  // "ironclaw-swarm-agent1.nova-sdk-7.testnet"
  port: number;         // 8081 .. 8085
}

export interface AgentLiveState {
  agentId: string;
  status: AgentStatus;
  lastSeenAt: string | null;   // ISO timestamp
  latencyMs: number | null;
  lastSkillInvoked: string | null;
  lastSkillCompletedAt: string | null;
  webhookMessageId: string | null;
  errorMessage: string | null;
}

export interface AgentState extends AgentConfig, AgentLiveState {}

// Webhook response from IronClaw (real wire format from setup docs)
export interface WebhookResponse {
  message_id: string;
  status: "accepted" | "rejected" | "error";
  response: string | null;
}

// What we send to the IronClaw webhook
export interface WebhookPayload {
  user_id: "default";
  content: string;
}

// ── Event log types ────────────────────────────────────────────────────────────

export type EventKind =
  | "skill_invoked"
  | "skill_completed"
  | "nova_contribution"
  | "oracle_train"
  | "parameter_change"
  | "intervention"
  | "plugin_lifecycle"
  | "health_check"
  | "custom";

export interface FleetEvent {
  event_id: string;
  timestamp: string;          // ISO
  plugin: string | null;      // "swarm-economy" | null
  agent: string | null;       // "agent1" | null
  kind: EventKind;
  payload: Record<string, unknown>;
  researcher_id: string;
}

// ── Agent database types (per-agent Postgres) ──────────────────────────────────

export interface MemoryDocument {
  id: string;
  user_id: string;
  path: string;               // e.g. "swarm/config.md"
  content: string;
  created_at: string;         // ISO timestamp
  updated_at: string;         // ISO timestamp
  metadata: Record<string, unknown>;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: string;               // "user" | "assistant" | "system" | …
  content: string;
  created_at: string;         // ISO timestamp
}

// ── Session types ──────────────────────────────────────────────────────────────

export interface ResearcherSession {
  researcherId: string;
  startedAt: string;
}

// ── Plugin types (for registry, v0.1 read-only) ────────────────────────────────

export type PluginStatus = "discovered" | "loaded" | "active" | "errored" | "unloaded";

export interface PluginDependencies {
  ironclaw_skills?: string[];
  qdrant_collections?: string[];
  nova_group?: string;
  plugins?: string[];
}

// A role the plugin's fleet template expects. This is what makes a plugin a
// *template* (a fleet shape) rather than just a UI skin — e.g. the "ecommerce
// platform management" template declares manager/accountant/CS/delivery roles.
// Slice 6 only displays these; instantiation from them is future work.
export interface FleetRole {
  role: string;            // "manager" | "delivery" | "trader" | …
  count: number | string;  // exact (4) or a range hint ("1", "30", "8-16")
  description?: string;    // agent-legible: what this role does in the fleet
}

// Declares which parts of the plugin a tenant is expected to customize when
// they instantiate it (agent personalities, a database connection, branding).
// Slice 6 only displays these so a human — or a customer's own agent — can see
// what would need personalizing. No personalization logic is built yet.
export interface PersonalizationPoint {
  key: string;                          // "agent_personalities" | "customer_db" | …
  label: string;                        // human/agent-readable name
  kind: "text" | "connection" | "prompt" | "dataset" | "branding" | "other";
  description?: string;                 // what to provide, in agent-legible prose
  required?: boolean;
}

export interface PluginManifest {
  name: string;
  version: string;
  display_name: string;

  // Agent-legible: rich enough for an LLM to reason "does this match the user's
  // setup?" — a paragraph, not a tagline. This is the field a customer's agent
  // reads when deciding whether to fetch and adapt the template.
  description: string;

  author: string;
  dependencies: PluginDependencies;

  // ── Template-shaped fields (optional; a plain UI plugin may omit them) ──
  // Present when the plugin describes a fleet configuration, not just panels.
  fleet_shape?: FleetRole[];
  personalization?: PersonalizationPoint[];

  // Free-form tags for future marketplace filtering ("research", "ecommerce",
  // "logistics", "finance"). Display-only in Slice 6.
  tags?: string[];

  // Where the plugin injects UI. Optional — a headless plugin may declare none.
  // The panel host reads ui_extensions.top_level_panels to build its tabs.
  ui_extensions?: UiExtensions;
}

// ── UI extension points (manifest ui_extensions block) ───────────────────────
// Declares where a plugin injects UI into the base layout. These are the four
// extension points from the fleet spec §4.3. Each is a list of string IDs; the
// plugin's own panel registry (plugins/<name>/panels/index.ts) resolves an ID
// to a React component. The base renders a tab/slot per declared ID and shows a
// "not built yet" placeholder for any ID the plugin hasn't registered a
// component for — so the manifest is the full statement of intent, and the
// registry is the built subset.
export interface UiExtensions {
  top_level_panels?: string[];
  agent_card_fields?: string[];
  agent_detail_sections?: string[];
  sidebar_slots?: string[];
}

export interface PluginRegistryEntry {
  manifest: PluginManifest;
  status: PluginStatus;
  loadedAt: string | null;
  error: string | null;         // set when a manifest.json failed to parse/validate
  manifestPath: string;
}

// ── Plugin: agentic-economy-oracle ───────────────────────────────────────────
// Types owned by the Swarm Economy plugin's panels. Kept here in the shared
// types module (single source of truth) so the API route, api-client, and panel
// component share one contract. When plugins become independently packaged
// (v1.0), these move into the plugin's own types module.
 
// One simulation round's macro signals, as read from the swarm_signals Qdrant
// collection and shaped by the macro-signals route. Metrics are number | null:
// null means the signal was absent for that round (render a gap, not a zero).
export interface MacroSignalPoint {
  round: number;
  market_efficiency: number | null;
  cooperation_index: number | null;
  wealth_gini: number | null;
  strategy_convergence: number | null;
  value_flow_velocity: number | null;
  volatility_detected: boolean;
  crisis_detected: boolean;
  timestamp: string | null;
}

// ── NOVA contributions (agentic-economy-oracle panel) ────────────────────────
// Shared contracts for the NOVA Contributions panel. Defined here (not in
// lib/nova.ts) because lib/nova.ts is server-only — the browser, api-client, and
// badge all need these shapes, so they live in the shared source of truth.
// lib/nova.ts should import these from @/types rather than redefining them, so
// the server and browser agree on one contract.
 
// A tombstone record: null ⇒ the contribution is active (not deleted).
export interface NovaDeletionRecord {
  deleted_at: string;
  deleted_by: string;
  reason:
    | "MemberRevocation"
    | "OwnerRequest"
    | "RetentionPolicy"
    | "ComplianceRequest";
}
 
// One NOVA group contribution, as returned by get_group_transactions.
// Field names are ground truth — do not rename:
//   • ipfs_hash is the RETRIEVE key (a CID or FastFS path), not "cid"
//   • file_hash is the on-chain SHA-256 of the PLAINTEXT (what the badge checks)
//   • timestamp is ns-since-epoch as a string (÷1e6 → ms); null on legacy rows
export interface NovaTransaction {
  trans_id: string;
  group_id: string;
  user_id: string;
  file_hash: string;
  ipfs_hash: string;
  backend: "FastFS" | "Ipfs" | null;
  timestamp: string | null;
  deleted: NovaDeletionRecord | null;
}
 
// The GET contributions route's response envelope.
export interface NovaContributionsResponse {
  group_id: string;
  contributions: NovaTransaction[];
}
 
// The material the prepare-retrieve route brokers to the browser so it can
// decrypt + verify one contribution. `format` null ⇒ v0/legacy.
export interface PrepareRetrieveResult {
  key: string;
  encrypted_b64: string;
  ipfs_hash: string;
  location: string;
  group_id: string;
  format: { version: 1; compression?: "deflate" } | null;
}
 
// Per-contribution verify outcome, tracked in the panel keyed by trans_id.
// Mirrors the NOVA dashboard's VerifyState: idle rows have no entry; a row moves
// verifying → verified(match) | error.
export type VerifyState =
  | { status: "verifying" }
  | { status: "verified"; match: boolean; recomputed: string }
  | { status: "error"; message: string };

// ── Infrastructure health ─────────────────────────────────────────────────────

export interface InfraHealth {
  postgres: boolean;
  qdrant: boolean;
  ollama: boolean;
}