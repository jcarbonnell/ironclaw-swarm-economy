import { NextResponse } from "next/server";
import type { FleetEvent } from "@/types";

// Slice 1 stub — returns empty array until Postgres event log is wired in Slice 4.
// The API contract is correct; only the backing store is missing.
export async function GET(): Promise<NextResponse<FleetEvent[]>> {
  return NextResponse.json([]);
}