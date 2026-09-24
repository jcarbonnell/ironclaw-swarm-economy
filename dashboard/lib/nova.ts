// ── NOVA access (server-side only) ───────────────────────────────────────────
// Never imported into a client component. This is the ONLY module that touches
// the NOVA API key. It mints a short-lived session token and calls the NOVA MCP
// surface — the same auth flow the orchestrator uses (orchestrator/pull_graphs.mjs),
// ported here so the dashboard's NOVA reads share one server-side broker.
//
// The browser never holds the API key or the session token. It calls our own
// /api/plugins/agentic-economy-oracle/* routes; those routes call this module;
// this module calls NOVA. For the verify path specifically, this module brokers
// the wrapped key + ciphertext (prepare_retrieve) but the DECRYPT happens in the
// browser (lib/nova-decode.ts) — the dashboard server never sees plaintext.
//
// Config from env (never hardcoded). Required:
//   NOVA_API_KEY       — secret; the swarm owner's API key
//   NOVA_ACCOUNT_ID    — e.g. ironclaw-swarm.nova-sdk-7.testnet
//   NOVA_GROUP_ID      — e.g. ironclaw-swarm-economy
// Optional (sensible testnet defaults, matching the orchestrator):
//   NOVA_AUTH_URL      — session-token mint endpoint
//   NOVA_MCP_BASE      — MCP tools base URL

const API_KEY = process.env.NOVA_API_KEY;
const ACCOUNT_ID = process.env.NOVA_ACCOUNT_ID ?? "ironclaw-swarm.nova-sdk-7.testnet";
const GROUP_ID = process.env.NOVA_GROUP_ID ?? "ironclaw-swarm-economy";

const AUTH_URL =
  process.env.NOVA_AUTH_URL ?? "https://nova-sdk.com/api/auth/session-token";
const MCP_BASE =
  process.env.NOVA_MCP_BASE ??
  "https://5a5223f7d1bfe777433c496b9d52ff851e927259-8000.dstack-prod5.phala.network";

import type {
  NovaTransaction,
  PrepareRetrieveResult as NovaPrepareRetrieve,
} from "@/types";

export function novaGroupId(): string {
  return GROUP_ID;
}

function requireApiKey(): string {
  if (!API_KEY) {
    throw new Error(
      "NOVA_API_KEY is not set. Add it to .env.local (server-side only — never NEXT_PUBLIC_)."
    );
  }
  return API_KEY;
}

// Mint a short-lived session token. The API key is sent as X-API-Key and never
// leaves the server. Mirrors pull_graphs.mjs getSessionToken().
async function getSessionToken(): Promise<string> {
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": requireApiKey() },
    body: JSON.stringify({ account_id: ACCOUNT_ID }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`NOVA session-token HTTP ${res.status}: ${detail}`);
  }
  const j = (await res.json()) as { token?: string };
  if (!j.token) throw new Error("NOVA session-token response had no token");
  return j.token;
}

// Call an MCP tool with a freshly-minted session token. Unwraps { result }.
// Mirrors pull_graphs.mjs getGroupTransactions() header set (Authorization +
// x-account-id + x-wallet-id).
async function callMcpTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
  const token = await getSessionToken();
  const res = await fetch(`${MCP_BASE}/tools/${tool}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-account-id": ACCOUNT_ID,
      "x-wallet-id": ACCOUNT_ID,
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`NOVA ${tool} HTTP ${res.status}: ${detail}`);
  }
  const j = (await res.json()) as { result?: T };
  // MCP wraps success as { result: … }; some paths return the bare value.
  return (j.result ?? (j as unknown as T));
}

// List all contributions in the swarm group (active + tombstoned).
export async function getGroupTransactions(): Promise<NovaTransaction[]> {
  return callMcpTool<NovaTransaction[]>("get_group_transactions", {
    group_id: GROUP_ID,
  });
}

// Broker the wrapped key + ciphertext + format for one contribution, so the
// browser can decrypt and verify it. Server sees ciphertext + wrapped key only,
// never plaintext.
export async function prepareRetrieve(ipfsHash: string): Promise<NovaPrepareRetrieve> {
  return callMcpTool<NovaPrepareRetrieve>("prepare_retrieve", {
    group_id: GROUP_ID,
    ipfs_hash: ipfsHash,
  });
}