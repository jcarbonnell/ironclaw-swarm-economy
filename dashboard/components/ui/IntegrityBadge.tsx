"use client";

// ── IntegrityBadge ───────────────────────────────────────────────────────────
// A pure, presentational verification-verdict primitive (handoff §1.5).
// It is DUMB about what is being compared: it takes a state and renders a
// verdict + tooltip. No fetching, no crypto, no domain imports — that is what
// makes it reusable across any (expected, actual) integrity check, not just
// NOVA. The caller does the work (decrypt, hash, compare) and hands in the
// result; the badge only shows it.
//
// States mirror a generic verify lifecycle:
//   idle       → an actionable "Verify" affordance (caller wires onVerify)
//   verifying  → in-progress
//   match      → ✓ verified (expected === actual)
//   mismatch   → ✗ verified but values differ
//   error      → could not verify (caller supplies the message)
//   na         → verification not applicable (e.g. nothing to compare)

import { useState } from "react";

export type IntegrityState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "match"; expected: string; actual: string }
  | { kind: "mismatch"; expected: string; actual: string }
  | { kind: "error"; message: string }
  | { kind: "na"; reason?: string };

export function IntegrityBadge({
  state,
  onVerify,
  verifyLabel = "Verify",
}: {
  state: IntegrityState;
  onVerify?: () => void;
  verifyLabel?: string;
}) {
  switch (state.kind) {
    case "idle":
      return (
        <button
          type="button"
          onClick={onVerify}
          disabled={!onVerify}
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--accent)",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "2px 10px",
            cursor: onVerify ? "pointer" : "default",
          }}
        >
          {verifyLabel}
        </button>
      );

    case "verifying":
      return (
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
          }}
        >
          verifying…
        </span>
      );

    case "match":
      return (
        <Pill
          color="var(--online)"
          dot
          label="byte-identical"
          tooltip={`Recomputed hash matches the on-chain value.\nexpected: ${state.expected}\nactual:   ${state.actual}`}
        />
      );

    case "mismatch":
      return (
        <Pill
          color="var(--offline)"
          dot
          label="mismatch"
          tooltip={`Recomputed hash does NOT match the on-chain value.\nexpected: ${state.expected}\nactual:   ${state.actual}`}
        />
      );

    case "error":
      return (
        <span
          title={state.message}
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--offline)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ✗ failed
          {onVerify && (
            <button
              type="button"
              onClick={onVerify}
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                background: "transparent",
                border: "none",
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              retry
            </button>
          )}
        </span>
      );

    case "na":
      return (
        <span
          title={state.reason}
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
          }}
        >
          —
        </span>
      );
  }
}

// A small colored status pill with an optional leading dot. Tooltip via the
// native title attribute (multi-line via \n) — no dependency, consistent with
// the hand-built UI.
function Pill({
  color,
  label,
  dot,
  tooltip,
}: {
  color: string;
  label: string;
  dot?: boolean;
  tooltip?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      title={tooltip}
      onClick={
        tooltip
          ? () => {
              navigator.clipboard?.writeText(tooltip).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => {}
              );
            }
          : undefined
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        color,
        background: "transparent",
        border: `1px solid ${color}`,
        borderRadius: 999,
        padding: "2px 8px",
        cursor: tooltip ? "pointer" : "default",
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
      )}
      {copied ? "copied" : label}
    </span>
  );
}