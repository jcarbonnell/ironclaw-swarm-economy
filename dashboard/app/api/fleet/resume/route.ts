import { NextResponse } from "next/server";
import { getAgentConfigs, getResearcherId } from "@/lib/agents";
import { agentAction } from "@/lib/docker";
import { logEventSafe } from "@/lib/events";

export async function POST(): Promise <
  NextResponse<{ ok: boolean; affected: number; failed: string[] }>
> {
  const configs = getAgentConfigs();

  const results = await Promise.allSettled(
    configs.map((c) => agentAction(c.index, "unpause"))
  );

  const failed = configs
    .filter((_, i) => results[i].status === "rejected")
    .map((c) => c.id);

  const affected = configs.length - failed.length;

  await logEventSafe({
    kind: "intervention",
    researcherId: getResearcherId(),
    agent: null,
    payload: { action: "resume_fleet", affected, failed },
  });

  return NextResponse.json({ ok: failed.length === 0, affected, failed });
}