import { NextResponse } from "next/server";
import { getAgentConfigs } from "@/lib/agents";
import { agentAction } from "@/lib/docker";

export async function POST(): Promise <
  NextResponse<{ ok: boolean; affected: number; failed: string[] }>
> {
  const configs = getAgentConfigs();

  const results = await Promise.allSettled(
    configs.map((c) => agentAction(c.index, "pause"))
  );

  const failed = configs
    .filter((_, i) => results[i].status === "rejected")
    .map((c) => c.id);

  return NextResponse.json({
    ok: failed.length === 0,
    affected: configs.length - failed.length,
    failed,
  });
}