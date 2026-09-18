import { NextRequest, NextResponse } from "next/server";
import { getAgentConfigs, getAgentWebhookSecret } from "@/lib/agents";
import { sendWebhook, WebhookError } from "@/lib/webhook";
import type { WebhookResponse } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse<WebhookResponse | { error: string }>> {
  const { agentId } = await params;
  const configs = getAgentConfigs();
  const config = configs.find((c) => c.id === agentId);

  if (!config) {
    return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content : "ping";

  let secret: string;
  try {
    secret = getAgentWebhookSecret(config.index);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Secret not configured" },
      { status: 503 }
    );
  }

  try {
    const result = await sendWebhook(config.url, secret, {
      user_id: "default",
      content,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WebhookError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}