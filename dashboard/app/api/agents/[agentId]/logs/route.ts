import { NextRequest, NextResponse } from "next/server";
import { getAgentConfigs } from "@/lib/agents";
import { getContainerLogs } from "@/lib/docker";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse<{ logs: string } | { error: string }>> {
  const { agentId } = await params;
  const config = getAgentConfigs().find((c) => c.id === agentId);

  if (!config) {
    return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });
  }

  const url = new URL(req.url);
  const tailParam = Number(url.searchParams.get("tail"));
  const tail =
    Number.isFinite(tailParam) && tailParam > 0 ? Math.min(tailParam, 1000) : 200;

  try {
    const logs = await getContainerLogs(config.index, tail);
    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read logs" },
      { status: 502 }
    );
  }
}