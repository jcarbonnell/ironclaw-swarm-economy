import { NextRequest, NextResponse } from "next/server";
import { queryEvents } from "@/lib/events";
import type { FleetEvent } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest
): Promise<NextResponse<FleetEvent[] | { error: string }>> {
  const url = new URL(req.url);

  // All filters optional. Only pass through params that are actually present,
  // so an absent filter means "don't constrain on this dimension".
  const plugin = url.searchParams.get("plugin");
  const agent = url.searchParams.get("agent");
  const kind = url.searchParams.get("kind");
  const before = url.searchParams.get("before");
  const limitParam = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;

  try {
    const events = await queryEvents({
      plugin: plugin ?? undefined,
      agent: agent ?? undefined,
      kind: kind ?? undefined,
      before: before ?? undefined,
      limit,
    });
    return NextResponse.json(events);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to query events" },
      { status: 502 }
    );
  }
}