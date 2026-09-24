// ── Qdrant read access ───────────────────────────────────────────────────────
// Server-side only. Never imported into a client component.
// Reads the vector collections that the swarm writes to (swarm_signals,
// agent_signals) via Qdrant's REST API. We use fetch against the REST endpoint
// rather than a Qdrant SDK — this matches how push_signals.py and the infra
// health probe already talk to Qdrant (stdlib HTTP, no extra dependency), and
// keeps the browser bundle free of any Qdrant client.
//
// We only ever READ here. Signal writes are owned by the simulation pipeline
// (push_signals.py), never by the dashboard.

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";

// A single Qdrant point as returned by the scroll API. The payload shape is
// collection-specific; callers narrow it to the fields they need.
export interface QdrantPoint<P = Record<string, unknown>> {
  id: string | number;
  payload: P;
  vector?: number[] | null;
}

interface ScrollResponse<P> {
  result: {
    points: QdrantPoint<P>[];
    next_page_offset: string | number | null;
  };
}

// Scroll a collection's points (payloads only, no vectors by default).
// Qdrant's scroll endpoint is the read-all-points primitive: it pages through
// the collection with an opaque offset cursor. We page internally up to a hard
// cap so a caller gets a bounded, complete-enough result without an unbounded
// loop. Vectors are excluded — the dashboard never needs the raw embeddings,
// only the structured payloads.
export async function scrollCollection<P = Record<string, unknown>>(
  collection: string,
  opts: { pageSize?: number; maxPoints?: number } = {}
): Promise<QdrantPoint<P>[]> {
  const pageSize = opts.pageSize ?? 256;
  const maxPoints = opts.maxPoints ?? 5_000;

  const points: QdrantPoint<P>[] = [];
  let offset: string | number | null = null;

  // Page until the collection is exhausted (next_page_offset === null) or we
  // hit the safety cap. The cap protects the process from a runaway collection;
  // if it's ever hit in practice, the caller should filter server-side instead.
  while (points.length < maxPoints) {
    const body: Record<string, unknown> = {
      limit: pageSize,
      with_payload: true,
      with_vector: false,
    };
    if (offset !== null) body.offset = offset;

    let res: Response;
    try {
      res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // Never cache — signal data changes as the swarm runs.
        cache: "no-store",
      });
    } catch (err) {
      // Network-level failure (Qdrant down / unreachable). Surface a clear,
      // actionable message rather than a generic fetch error.
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Qdrant unreachable at ${QDRANT_URL}: ${msg}`);
    }

    if (res.status === 404) {
      // Collection does not exist yet (no signals pushed so far). Treat as
      // empty rather than an error — a fresh swarm legitimately has no data.
      return [];
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Qdrant scroll failed for '${collection}': ${res.status} ${detail}`
      );
    }

    const json = (await res.json()) as ScrollResponse<P>;
    points.push(...json.result.points);

    offset = json.result.next_page_offset;
    if (offset === null || offset === undefined) break;
  }

  return points;
}

// Return the point count for a collection, or null if it doesn't exist yet.
// Uses the lightweight collection-info endpoint rather than scrolling.
export async function collectionCount(collection: string): Promise<number | null> {
  let res: Response;
  try {
    res = await fetch(`${QDRANT_URL}/collections/${collection}`, {
      cache: "no-store",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Qdrant unreachable at ${QDRANT_URL}: ${msg}`);
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Qdrant info failed for '${collection}': ${res.status} ${detail}`);
  }

  const json = (await res.json()) as { result?: { points_count?: number } };
  return json.result?.points_count ?? 0;
}