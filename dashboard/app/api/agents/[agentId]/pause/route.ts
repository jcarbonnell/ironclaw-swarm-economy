import { NextRequest, NextResponse } from "next/server";
import { getAgentConfigs, getResearcherId } from "@/lib/agents";
import { agentAction, type DockerAction } from "@/lib/docker";
import { logEventSafe } from "@/lib/events";

const VALID_ACTIONS: DockerAction[] = ["pause", "unpause", "restart"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse<{ ok: boolean } | { error: string }>> {
  const { agentId } = await params;
  const config = getAgentConfigs().find((c) => c.id === agentId);

  if (!config) {
    return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as DockerAction | undefined;

  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Expected one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    await agentAction(config.index, action);
    await logEventSafe({
      kind: "intervention",
      researcherId: getResearcherId(),
      agent: config.id,
      payload: { action },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `Failed to ${action} agent` },
      { status: 502 }
    );
  }
}