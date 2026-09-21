import { NextResponse } from "next/server";
import { pingDashboardDb } from "@/lib/events";
import type { InfraHealth } from "@/types";

export const dynamic = "force-dynamic";

async function checkQdrant(): Promise<boolean> {
  try {
    const url = process.env.QDRANT_URL ?? "http://localhost:6333";
    const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkOllama(): Promise<boolean> {
  try {
    const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(): Promise<NextResponse<InfraHealth>> {
  const [postgres, qdrant, ollama] = await Promise.all([
    pingDashboardDb(),
    checkQdrant(),
    checkOllama(),
  ]);

  return NextResponse.json({ postgres, qdrant, ollama });
}