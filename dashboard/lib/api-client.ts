// ── API client ─────────────────────────────────────────────────────────────────
// Browser-side only. Calls our own Next.js API routes, never external services.
// All secrets stay server-side; this client is entirely public-safe.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (res.status === 401) {
    // Global 401 handler — for v0.1 (no auth) this shouldn't fire,
    // but the interceptor is in place for future auth layers.
    window.dispatchEvent(new CustomEvent("fleet:unauthorized"));
    throw new ApiError("Unauthorized", 401);
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      json.error ?? `Request failed with status ${res.status}`,
      res.status,
      json.code
    );
  }

  return json as T;
}

// ── Typed API surface ──────────────────────────────────────────────────────────

import type {
  AgentEconomySignals,
  AgentState,
  ConversationMessage,
  FleetEvent,
  InfraHealth,
  MacroSignalPoint,
  MemoryDocument,
  NovaContributionsResponse,
  OracleTrainingResponse,
  PluginRegistryEntry,
  PrepareRetrieveResult,
  WebhookResponse,
} from "@/types";

export const api = {
  // Fleet health — full agent states from polling
  agents: {
    list: () => request<AgentState[]>("/agents"),
    send: (agentId: string, content: string) =>
      request<WebhookResponse>(`/agents/${agentId}/send`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    pause: (agentId: string) =>
      request<{ ok: boolean }>(`/agents/${agentId}/pause`, {
        method: "POST",
        body: JSON.stringify({ action: "pause" }),
      }),
    unpause: (agentId: string) =>
      request<{ ok: boolean }>(`/agents/${agentId}/pause`, {
        method: "POST",
        body: JSON.stringify({ action: "unpause" }),
      }),
    restart: (agentId: string) =>
      request<{ ok: boolean }>(`/agents/${agentId}/pause`, {
        method: "POST",
        body: JSON.stringify({ action: "restart" }),
      }),
    logs: (agentId: string, tail?: number) =>
      request<{ logs: string }>(
        `/agents/${agentId}/logs${tail ? `?tail=${tail}` : ""}`
      ),
    memory: (agentId: string) =>
      request<MemoryDocument[]>(`/agents/${agentId}/memory`),
    conversations: (agentId: string, limit?: number) =>
      request<ConversationMessage[]>(
        `/agents/${agentId}/conversations${limit ? `?limit=${limit}` : ""}`
      ),
  },

  // Fleet-wide controls
  fleet: {
    pause: () =>
      request<{ ok: boolean; affected: number; failed: string[] }>("/fleet/pause", {
        method: "POST",
      }),
    resume: () =>
      request<{ ok: boolean; affected: number; failed: string[] }>("/fleet/resume", {
        method: "POST",
      }),
  },

  // Event log
  events: {
    list: (params?: {
      plugin?: string;
      agent?: string;
      kind?: string;
      limit?: number;
      before?: string;
    }) => {
      const qs = params
        ? "?" + new URLSearchParams(
            Object.fromEntries(
              Object.entries(params)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, String(v)])
            )
          ).toString()
        : "";
      return request<FleetEvent[]>(`/events${qs}`);
    },
  },

  // Plugin registry
  plugins: {
    list: () => request<PluginRegistryEntry[]>("/plugins"),

    // Panel data for the agentic-economy-oracle plugin. Namespaced by the
    // plugin's manifest `name` so the route path, the marketplace key, and this
    // client method all agree. As more panels land (NOVA contributions, oracle
    // training), they extend this same namespace.
    agenticEconomyOracle: {
      macroSignals: () =>
        request<MacroSignalPoint[]>(
          "/plugins/agentic-economy-oracle/macro-signals"
        ),

      // List the swarm group's NOVA contributions (server brokers the API key).
      novaContributions: () =>
        request<NovaContributionsResponse>(
          "/plugins/agentic-economy-oracle/nova-contributions"
        ),

      // Broker the key + ciphertext + format for one contribution, so the
      // browser can decrypt + verify it. Server never sees plaintext.
      prepareRetrieve: (ipfsHash: string) =>
        request<PrepareRetrieveResult>(
          "/plugins/agentic-economy-oracle/nova-contributions/prepare-retrieve",
          {
            method: "POST",
            body: JSON.stringify({ ipfs_hash: ipfsHash }),
          }
        ),

      // The orchestrator's training outputs (current model + run history),
      // read from disk by the server route.
      oracleTraining: () =>
        request<OracleTrainingResponse>(
          "/plugins/agentic-economy-oracle/oracle-training"
        ),

      // Per-agent economy signals (latest micro state + recent trades) for the
      // agent detail-page section. Keyed by short agent id (agent1).
      agentSignals: (agentId: string) =>
        request<AgentEconomySignals>(
          `/plugins/agentic-economy-oracle/agent-signals/${agentId}`
        ),
    },
  },

  // Infrastructure health
  infra: {
    health: () => request<InfraHealth>("/infra/health"),
  },
};