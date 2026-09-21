import { NextResponse } from "next/server";
import { getAgentConfigs } from "@/lib/agents";
import { getAgentConversations } from "@/lib/queries";
import type { ConversationMessage } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse<ConversationMessage[] | { error: string }>> {
  const { agentId } = await params;
  const config = getAgentConfigs().find((c) => c.id === agentId);

  if (!config) {
    return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });
  }

  // Optional ?limit= query param, clamped to a sane range
  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 500)
      : 100;

  try {
    const messages = await getAgentConversations(config.index, limit);
    return NextResponse.json(messages);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read conversations" },
      { status: 502 }
    );
  }
}