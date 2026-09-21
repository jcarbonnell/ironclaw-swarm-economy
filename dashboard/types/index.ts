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
  nearAccount: string;  // "ironclaw-swarm-agent1.nova-sdk-6.testnet"
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

export interface PluginManifest {
  name: string;
  version: string;
  display_name: string;
  description: string;
  author: string;
  dependencies: PluginDependencies;
}

export interface PluginRegistryEntry {
  manifest: PluginManifest;
  status: PluginStatus;
  loadedAt: string | null;
  error: string | null;
  manifestPath: string;
}

// ── Infrastructure health ─────────────────────────────────────────────────────

export interface InfraHealth {
  postgres: boolean;
  qdrant: boolean;
  ollama: boolean;
}