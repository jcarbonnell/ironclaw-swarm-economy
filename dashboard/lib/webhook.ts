import type { WebhookPayload, WebhookResponse } from "@/types";

// ── HMAC signing ───────────────────────────────────────────────────────────────
// Matches the IronClaw v0.28 wire protocol exactly:
//   Header: X-Hub-Signature-256: sha256=<hmac>
//   Body:   {"user_id":"default","content":"…"}
//   Response: {"message_id":"…","status":"accepted","response":null}

async function hmacSha256(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

// ── Webhook client ─────────────────────────────────────────────────────────────

export class WebhookError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "WebhookError";
  }
}

export async function sendWebhook(
  agentUrl: string,
  secret: string,
  payload: WebhookPayload,
  timeoutMs = 5000
): Promise<WebhookResponse> {
  const body = JSON.stringify(payload);
  const signature = await hmacSha256(secret, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${agentUrl}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature,
      },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new WebhookError(
        `Webhook returned HTTP ${res.status}`,
        res.status
      );
    }

    const json = (await res.json()) as WebhookResponse;

    // Assert the expected shape — don't trust just "didn't throw"
    if (!json.message_id || !json.status) {
      throw new WebhookError(
        `Unexpected webhook response shape: ${JSON.stringify(json)}`
      );
    }

    return json;
  } catch (err) {
    if (err instanceof WebhookError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new WebhookError(`Webhook timed out after ${timeoutMs}ms`);
    }
    throw new WebhookError(
      err instanceof Error ? err.message : "Unknown webhook error"
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── Health ping ────────────────────────────────────────────────────────────────
// GETs the agent's /health route (no HMAC, no inference, no conversation message).
// Response shape (confirmed live): {"status":"healthy","channel":"http"}
// Returns latencyMs on success, null on failure.

export async function pingAgent(
  agentUrl: string,
  timeoutMs = 5000
): Promise<{ latencyMs: number; healthStatus: string } | null> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${agentUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!res.ok) return null;

    // Assert the expected shape, not just "didn't throw"
    const json = (await res.json()) as { status?: string; channel?: string };
    if (json.status !== "healthy") return null;

    return {
      latencyMs: Date.now() - start,
      healthStatus: json.status,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}