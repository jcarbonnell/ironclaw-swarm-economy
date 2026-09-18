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
  AgentState,
  FleetEvent,
  InfraHealth,
  PluginRegistryEntry,
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
      }),
  },

  // Fleet-wide controls
  fleet: {
    pause: () =>
      request<{ ok: boolean; affected: number }>("/fleet/pause", {
        method: "POST",
      }),
    resume: () =>
      request<{ ok: boolean; affected: number }>("/fleet/resume", {
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
  },

  // Infrastructure health
  infra: {
    health: () => request<InfraHealth>("/infra/health"),
  },
};