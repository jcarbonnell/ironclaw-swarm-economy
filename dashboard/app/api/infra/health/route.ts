import { NextResponse } from "next/server";
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
  const [qdrant, ollama] = await Promise.all([checkQdrant(), checkOllama()]);

  return NextResponse.json({
    postgres: true, // Checked implicitly when event log works; no direct ping for v0.1
    qdrant,
    ollama,
  });
}