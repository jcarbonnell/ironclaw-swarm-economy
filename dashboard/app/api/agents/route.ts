import { NextResponse } from "next/server";
import { getAgentConfigs } from "@/lib/agents";
import { pingAgent } from "@/lib/webhook";
import type { AgentState } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<AgentState[]>> {
  const configs = getAgentConfigs();

  const states = await Promise.all(
    configs.map(async (config): Promise<AgentState> => {
      const result = await pingAgent(config.url);

      if (!result) {
        return {
          ...config,
          agentId: config.id,
          status: "unreachable",
          lastSeenAt: null,
          latencyMs: null,
          lastSkillInvoked: null,
          lastSkillCompletedAt: null,
          webhookMessageId: null,
          errorMessage: "Health check failed",
        };
      }

      return {
        ...config,
        agentId: config.id,
        status: "healthy",
        lastSeenAt: new Date().toISOString(),
        latencyMs: result.latencyMs,
        lastSkillInvoked: null,      // enriched from event log in Slice 4
        lastSkillCompletedAt: null,  // enriched from event log in Slice 4
        webhookMessageId: null,      // no longer from health check
        errorMessage: null,
      };
    })
  );

  return NextResponse.json(states);
}