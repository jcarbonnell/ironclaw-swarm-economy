import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { AgentStatus } from "@/types";

const execAsync = promisify(exec);

// ── Docker CLI wrapper ───────────────────────────────────────────────────────
// Server-side only. Shells out to the `docker` CLI, which is already installed
// and authenticated for the user running the dashboard.
//
// SECURITY: container names are ALWAYS derived from the agent index via
// containerName(), never from request input. The index is validated to be an
// integer before use, so there is no shell-injection surface.

function containerName(agentIndex: number): string {
  if (!Number.isInteger(agentIndex) || agentIndex < 1 || agentIndex > 99) {
    throw new Error(`Invalid agent index: ${agentIndex}`);
  }
  return `ironclaw-agent${agentIndex}`;
}

// ── Container state (one call for the whole fleet) ───────────────────────────
// `docker ps` with a format template returns every container's name + state in
// one shot. We parse it into a map the agents poll can look up per agent.
// Docker's "State" is one of: running | paused | exited | created | restarting | dead

export type ContainerState =
  | "running"
  | "paused"
  | "exited"
  | "created"
  | "restarting"
  | "dead"
  | "missing"; // not returned by docker ps at all

export async function getContainerStates(): Promise<Map<string, ContainerState>> {
  const states = new Map<string, ContainerState>();
  try {
    // --all so we also see exited/created containers, not just running ones.
    // Format: "<name>\t<state>" per line.
    const { stdout } = await execAsync(
      `docker ps --all --filter "name=ironclaw-agent" --format "{{.Names}}\t{{.State}}"`,
      { timeout: 4000 }
    );
    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;
      const [name, state] = line.split("\t");
      if (name) states.set(name, (state as ContainerState) ?? "missing");
    }
  } catch (err) {
    // If docker itself is unreachable, return an empty map — the poll will
    // fall back to health-only status. Don't throw; the dashboard degrades
    // gracefully rather than blanking the fleet view.
    console.error("[docker] getContainerStates failed:", err instanceof Error ? err.message : err);
  }
  return states;
}

// Map a Docker container state → our AgentStatus, given whether /health passed.
// Health is only meaningful when the container is actually running.
export function deriveStatus(
  containerState: ContainerState | undefined,
  healthOk: boolean
): AgentStatus {
  switch (containerState) {
    case "paused":
      return "paused";
    case "exited":
    case "created":
    case "dead":
    case "missing":
      return "stopped";
    case "restarting":
      return "unreachable";
    case "running":
      return healthOk ? "healthy" : "unreachable";
    default:
      // Unknown/undefined container state: trust the health check alone.
      return healthOk ? "healthy" : "unreachable";
  }
}

// ── Lifecycle actions ────────────────────────────────────────────────────────

export type DockerAction = "pause" | "unpause" | "restart";

export async function agentAction(
  agentIndex: number,
  action: DockerAction
): Promise<{ ok: true }> {
  const name = containerName(agentIndex);
  const cmd =
    action === "pause"   ? `docker pause ${name}` :
    action === "unpause" ? `docker unpause ${name}` :
                           `docker restart ${name}`;
  await execAsync(cmd, { timeout: 15000 }); // restart can take a few seconds
  return { ok: true };
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export async function getContainerLogs(
  agentIndex: number,
  tail = 200
): Promise<string> {
  const name = containerName(agentIndex);
  const safeTail = Number.isInteger(tail) && tail > 0 ? Math.min(tail, 1000) : 200;
  // docker logs writes to stderr as well as stdout; capture both.
  const { stdout, stderr } = await execAsync(
    `docker logs --tail ${safeTail} ${name}`,
    { timeout: 8000, maxBuffer: 5 * 1024 * 1024 }
  );
  return (stderr ? stderr + "\n" : "") + stdout;
}