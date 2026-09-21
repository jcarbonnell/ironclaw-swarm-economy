import { agentQuery } from "./db";
import type { MemoryDocument, ConversationMessage } from "@/types";

// ── Agent database queries ───────────────────────────────────────────────────
// Server-side only (imports lib/db). All values go through parameterized
// placeholders via agentQuery — never string-interpolated.

// Memory documents for one agent, most-recently-updated first.
// This is where swarm/config.md and swarm/last_contribution.md live.
export async function getAgentMemory(
  agentIndex: number
): Promise<MemoryDocument[]> {
  return agentQuery<MemoryDocument>(
    agentIndex,
    `SELECT id, user_id, path, content, created_at, updated_at, metadata
       FROM memory_documents
      ORDER BY updated_at DESC`
  );
}

// Recent conversation messages for one agent, newest first, capped.
// conversation_messages has no direct agent column — each agent has its own DB,
// so every row here belongs to this agent. We order by created_at and limit.
export async function getAgentConversations(
  agentIndex: number,
  limit = 100
): Promise<ConversationMessage[]> {
  return agentQuery<ConversationMessage>(
    agentIndex,
    `SELECT id, conversation_id, role, content, created_at
       FROM conversation_messages
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
}