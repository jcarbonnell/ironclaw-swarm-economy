import { NextResponse } from "next/server";
import type { PluginRegistryEntry } from "@/types";

// Slice 1 stub — discovers plugins from filesystem in Slice 6.
export async function GET(): Promise<NextResponse<PluginRegistryEntry[]>> {
  return NextResponse.json([]);
}