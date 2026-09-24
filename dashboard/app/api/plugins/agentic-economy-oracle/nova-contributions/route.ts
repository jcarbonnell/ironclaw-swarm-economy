import { NextResponse } from "next/server";
import { getGroupTransactions, novaGroupId } from "@/lib/nova";

// GET /api/plugins/agentic-economy-oracle/contributions
//
// Lists the swarm group's NOVA contributions (active + tombstoned) via the
// server-side broker. The API key never leaves the server; this route returns
// the transaction list to the browser for display. Verification (decrypt + hash)
// is a separate, on-demand browser action — this route only lists.
//
// Returns { group_id, contributions } so the panel can show which group it's
// reading without re-deriving it.

export async function GET() {
  try {
    const contributions = await getGroupTransactions();
    return NextResponse.json({
      group_id: novaGroupId(),
      contributions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // NOVA down / auth failed / group unreadable → 502 with the real message
    // (the dashboard is up; its upstream failed). Honest failure surfacing.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}