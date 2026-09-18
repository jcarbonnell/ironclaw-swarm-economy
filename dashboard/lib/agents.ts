import type { AgentConfig } from "@/types";

// Agent configs built from env. Never called in browser — only in API routes.
// Secrets (webhook secrets) are accessed only inside API routes, never here.
export function getAgentConfigs(): AgentConfig[] {
  return [1, 2, 3, 4, 5].map((i) => ({
    id: `agent${i}`,
    index: i,
    url: process.env[`AGENT${i}_URL`] ?? `http://localhost:${8080 + i}`,
    nearAccount:
      process.env[`AGENT${i}_NEAR_ACCOUNT`] ??
      `ironclaw-swarm-agent${i}.nova-sdk-6.testnet`,
    port: 8080 + i,
  }));
}

export function getAgentWebhookSecret(agentIndex: number): string {
  const secret = process.env[`AGENT${agentIndex}_WEBHOOK_SECRET`];
  if (!secret) {
    throw new Error(
      `AGENT${agentIndex}_WEBHOOK_SECRET is not set. ` +
        `Copy .env.example to .env.local and fill in the secrets.`
    );
  }
  return secret;
}

export function getResearcherId(): string {
  return process.env.RESEARCHER_ID ?? "researcher";
}