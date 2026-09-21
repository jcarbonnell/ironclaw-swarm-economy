import { NextResponse } from "next/server";
import { getAgentConfigs } from "@/lib/agents";
import { getAgentMemory } from "@/lib/queries";
import type { MemoryDocument } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse<MemoryDocument[] | { error: string }>> {
  const { agentId } = await params;
  const config = getAgentConfigs().find((c) => c.id === agentId);

  if (!config) {
    return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });
  }

  try {
    const docs = await getAgentMemory(config.index);
    return NextResponse.json(docs);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read agent memory" },
      { status: 502 }
    );
  }
}