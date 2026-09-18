import { NextResponse } from "next/server";
import { getResearcherId } from "@/lib/agents";
import type { ResearcherSession } from "@/types";

export async function GET(): Promise<NextResponse<ResearcherSession>> {
  return NextResponse.json({
    researcherId: getResearcherId(),
    startedAt: new Date().toISOString(),
  });
}