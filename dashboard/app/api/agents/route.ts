import { NextResponse } from "next/server";
import { getAgentConfigs } from "@/lib/agents";
import { pingAgent } from "@/lib/webhook";
import { getContainerStates, deriveStatus } from "@/lib/docker";
import type { AgentState } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<AgentState[]>> {
  const configs = getAgentConfigs();

  // One docker ps for the whole fleet, in parallel with the health pings.
  const [containerStates, pings] = await Promise.all([
    getContainerStates(),
    Promise.all(
      configs.map(async (config) => ({
        config,
        ping: await pingAgent(config.url),
      }))
    ),
  ]);

  const states: AgentState[] = pings.map(({ config, ping }) => {
    const containerName = `ironclaw-agent${config.index}`;
    const containerState = containerStates.get(containerName);
    const healthOk = ping !== null;
    const status = deriveStatus(containerState, healthOk);

    return {
      ...config,
      agentId: config.id,
      status,
      // Only claim "last seen" when the health check actually passed.
      lastSeenAt: healthOk ? new Date().toISOString() : null,
      latencyMs: ping?.latencyMs ?? null,
      lastSkillInvoked: null,       // enriched from event log in Slice 4
      lastSkillCompletedAt: null,   // enriched from event log in Slice 4
      webhookMessageId: null,
      errorMessage:
        status === "unreachable"
          ? "Container running but /health not responding"
          : status === "stopped"
          ? "Container stopped"
          : null,
    };
  });

  return NextResponse.json(states);
}