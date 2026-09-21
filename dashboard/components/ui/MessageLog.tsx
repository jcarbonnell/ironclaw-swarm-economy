"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

// ── Generic expandable log renderer ──────────────────────────────────────────
// The handover note's most-reused primitive: a list of rows, each collapsible
// to a one-line summary and expandable to full detail. Domain-free — it takes
// rows + render functions, knowing nothing about what the rows represent.

export interface LogColumn<T> {
  // A short label shown in the collapsed row, left to right.
  render: (row: T) => React.ReactNode;
  // Optional fixed width; otherwise flexes.
  width?: number | string;
  // Optional: this column takes remaining space and truncates.
  grow?: boolean;
}

interface MessageLogProps<T> {
  rows: T[];
  columns: LogColumn<T>[];
  // Full detail shown when a row is expanded. If omitted, rows don't expand.
  renderDetail?: (row: T) => React.ReactNode;
  // Stable unique key per row.
  rowKey: (row: T) => string;
  // Shown when rows is empty.
  emptyLabel?: string;
}

export function MessageLog<T>({
  rows,
  columns,
  renderDetail,
  rowKey,
  emptyLabel = "No entries",
}: MessageLogProps<T>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: "16px",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      {rows.map((row) => {
        const key = rowKey(row);
        const isOpen = expanded.has(key);
        const canExpand = Boolean(renderDetail);

        return (
          <div key={key} style={{ borderBottom: "1px solid var(--border)" }}>
            {/* Collapsed row */}
            <div
              onClick={canExpand ? () => toggle(key) : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px",
                cursor: canExpand ? "pointer" : "default",
                background: isOpen ? "var(--bg-elevated)" : "transparent",
                transition: "background 0.1s",
              }}
            >
              {canExpand && (
                <ChevronRight
                  size={12}
                  style={{
                    color: "var(--text-muted)",
                    flexShrink: 0,
                    transform: isOpen ? "rotate(90deg)" : "none",
                    transition: "transform 0.15s",
                  }}
                />
              )}
              {columns.map((col, i) => (
                <div
                  key={i}
                  style={{
                    width: col.width,
                    flex: col.grow ? 1 : col.width ? "none" : undefined,
                    minWidth: 0,
                    overflow: col.grow ? "hidden" : undefined,
                    textOverflow: col.grow ? "ellipsis" : undefined,
                    whiteSpace: col.grow ? "nowrap" : undefined,
                  }}
                >
                  {col.render(row)}
                </div>
              ))}
            </div>

            {/* Expanded detail */}
            {isOpen && renderDetail && (
              <div
                style={{
                  padding: "12px",
                  background: "var(--bg-base)",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {renderDetail(row)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}