"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { MessageLog, type LogColumn } from "@/components/ui/MessageLog";
import { IntegrityBadge, type IntegrityState } from "@/components/ui/IntegrityBadge";
import { decodeFile, sha256Hex, type FileFormat } from "@/lib/nova-decode";
import type { NovaTransaction, VerifyState } from "@/types";

// ── NOVA Contributions panel ─────────────────────────────────────────────────
// Lists the swarm group's encrypted graph contributions and verifies each on
// demand. The list comes from the server-side broker (API key server-only). The
// VERIFY happens in the browser: the server brokers the wrapped key + ciphertext
// (prepare-retrieve), the browser decrypts (nova-decode) and recomputes SHA-256,
// comparing to the on-chain file_hash. The server never sees plaintext — the
// privacy property this whole path preserves. This is the NOVA demo, scoped to
// one group.

// ── formatting helpers (mirror the NOVA dashboard) ───────────────────────────

function displayName(id: string): string {
  return id ? id.split(".")[0] : "unknown";
}

function shortHash(h: string): string {
  return h ? `${h.slice(0, 10)}…` : "—";
}

// timestamp is ns-since-epoch as a string; null on legacy rows. ÷1e6 → ms.
function formatDate(ts: string | null): string {
  if (!ts) return "—";
  const ms = Number(ts) / 1e6;
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString();
}

// Map the panel's per-row VerifyState → the badge's IntegrityState. A row with
// no verify entry is idle; a tombstoned row is not applicable.
function toIntegrityState(
  tx: NovaTransaction,
  v: VerifyState | undefined
): IntegrityState {
  if (tx.deleted) {
    return { kind: "na", reason: "Tombstoned — ciphertext destroyed, nothing to verify" };
  }
  if (!v) return { kind: "idle" };
  if (v.status === "verifying") return { kind: "verifying" };
  if (v.status === "error") return { kind: "error", message: v.message };
  // verified
  return v.match
    ? { kind: "match", expected: tx.file_hash, actual: v.recomputed }
    : { kind: "mismatch", expected: tx.file_hash, actual: v.recomputed };
}

export function NovaContributionsPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["plugin", "agentic-economy-oracle", "nova-contributions"],
    queryFn: () => api.plugins.agenticEconomyOracle.novaContributions(),
    refetchInterval: 30_000,
  });

  // Per-contribution verify state, keyed by trans_id.
  const [verify, setVerify] = useState<Record<string, VerifyState>>({});

  // Verify one contribution: broker → decrypt (browser) → hash → compare.
  const verifyOne = useCallback(async (tx: NovaTransaction) => {
    setVerify((v) => ({ ...v, [tx.trans_id]: { status: "verifying" } }));
    try {
      const material = await api.plugins.agenticEconomyOracle.prepareRetrieve(
        tx.ipfs_hash
      );
      const plaintext = await decodeFile(
        material.encrypted_b64,
        material.key,
        material.format as FileFormat | null
      );
      const recomputed = await sha256Hex(plaintext);
      const match = recomputed.toLowerCase() === tx.file_hash.toLowerCase();
      setVerify((v) => ({
        ...v,
        [tx.trans_id]: { status: "verified", match, recomputed },
      }));
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
          ? e.message
          : "Verification failed";
      setVerify((v) => ({
        ...v,
        [tx.trans_id]: { status: "error", message },
      }));
    }
  }, []);

  if (isLoading) {
    return <Frame><Muted>Loading contributions…</Muted></Frame>;
  }

  if (isError) {
    return (
      <Frame>
        <div style={{ color: "var(--offline)", fontSize: 13 }}>
          Failed to load NOVA contributions:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </div>
        <button onClick={() => refetch()} style={btnStyle}>Retry</button>
      </Frame>
    );
  }

  const contributions = data?.contributions ?? [];
  const groupId = data?.group_id ?? "—";

  if (contributions.length === 0) {
    return (
      <Frame>
        <Muted>
          No contributions in group <code data-mono>{groupId}</code> yet. Agents
          upload encrypted graphs via the nova-economy-contributor skill; they
          appear here once on-chain.
        </Muted>
      </Frame>
    );
  }

  // Columns: uploader · file hash · backend · date · status · integrity.
  const columns: LogColumn<NovaTransaction>[] = [
    {
      width: 140,
      render: (tx) => (
        <span
          title={tx.user_id}
          style={{ fontSize: 12, color: "var(--accent)" }}
        >
          {displayName(tx.user_id)}
        </span>
      ),
    },
    {
      width: 110,
      render: (tx) => (
        <span
          title={tx.file_hash}
          style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}
        >
          {shortHash(tx.file_hash)}
        </span>
      ),
    },
    {
      width: 70,
      render: (tx) => <BackendBadge tx={tx} />,
    },
    {
      grow: true,
      render: (tx) => (
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          {formatDate(tx.timestamp)}
        </span>
      ),
    },
    {
      width: 70,
      render: (tx) =>
        tx.deleted ? (
          <span style={{ fontSize: 10, color: "var(--offline)" }}>deleted</span>
        ) : (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>active</span>
        ),
    },
    {
      width: 150,
      // Verify cell — stop clicks from toggling the row's expand.
      render: (tx) => (
        <span onClick={(e) => e.stopPropagation()}>
          <IntegrityBadge
            state={toIntegrityState(tx, verify[tx.trans_id])}
            onVerify={tx.deleted ? undefined : () => verifyOne(tx)}
          />
        </span>
      ),
    },
  ];

  const renderDetail = (tx: NovaTransaction) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontFamily: "var(--font-mono)" }}>
      <DetailRow label="trans_id" value={tx.trans_id} />
      <DetailRow label="ipfs_hash" value={tx.ipfs_hash} />
      <DetailRow label="file_hash" value={tx.file_hash} />
      <DetailRow label="uploader" value={tx.user_id} />
      <DetailRow label="backend" value={tx.backend ?? "legacy"} />
      <DetailRow label="timestamp" value={formatDate(tx.timestamp)} />
      {tx.deleted && (
        <>
          <DetailRow label="deleted_by" value={tx.deleted.deleted_by} />
          <DetailRow label="deleted_at" value={formatDate(tx.deleted.deleted_at)} />
          <DetailRow label="reason" value={tx.deleted.reason} />
        </>
      )}
    </div>
  );

  return (
    <Frame>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {contributions.length} contribution
          {contributions.length === 1 ? "" : "s"} · group{" "}
          <code data-mono>{groupId}</code>
        </span>
        <button onClick={() => refetch()} style={btnStyle} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <MessageLog<NovaTransaction>
        rows={contributions}
        columns={columns}
        renderDetail={renderDetail}
        rowKey={(tx) => tx.trans_id}
        emptyLabel="No contributions"
      />
    </Frame>
  );
}

// ── small helpers ────────────────────────────────────────────────────────────

function BackendBadge({ tx }: { tx: NovaTransaction }) {
  const isFastFS = tx.backend === "FastFS";
  return (
    <span
      style={{
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        color: isFastFS ? "var(--accent)" : "var(--text-muted)",
        border: `1px solid ${isFastFS ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 999,
        padding: "1px 6px",
      }}
    >
      {isFastFS ? "FastFS" : "Legacy"}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "var(--text-muted)", minWidth: 90 }}>{label}:</span>
      <span style={{ color: "var(--text-secondary)", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{children}</div>;
}

const btnStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--text-secondary)",
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
};