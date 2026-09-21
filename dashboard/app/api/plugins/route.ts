import { NextResponse } from "next/server";
import { discoverPlugins } from "@/lib/plugins";
import type { PluginRegistryEntry } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise <
  NextResponse<PluginRegistryEntry[] | { error: string }>
> {
  try {
    const plugins = await discoverPlugins();
    return NextResponse.json(plugins);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to discover plugins" },
      { status: 502 }
    );
  }
}