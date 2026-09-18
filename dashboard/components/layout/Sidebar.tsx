"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  ScrollText,
  Puzzle,
  Activity,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Fleet", icon: LayoutGrid },
  { href: "/events", label: "Event Log", icon: ScrollText },
  { href: "/plugins", label: "Plugins", icon: Puzzle },
  { href: "/infra", label: "Infrastructure", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: "var(--sidebar-width)",
        minWidth: "var(--sidebar-width)",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Navigation */}
      <nav style={{ flex: 1, padding: "12px 0" }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: active ? "var(--bg-elevated)" : "transparent",
                borderLeft: active
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                transition: "background 0.1s, color 0.1s",
              }}
            >
              <Icon
                size={14}
                style={{
                  color: active ? "var(--accent)" : "var(--text-muted)",
                  flexShrink: 0,
                }}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: BetaWeb stage indicator */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "12px 16px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            marginBottom: 6,
          }}
        >
          BETAWEB STAGE
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {["Silos", "Pilot", "Assisted", "Hybrid", "Autonomous"].map(
            (stage, i) => (
              <div
                key={stage}
                title={stage}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: i === 1 ? "var(--accent)" : "var(--border-active)",
                }}
              />
            )
          )}
        </div>
        <div
          style={{
            marginTop: 5,
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--accent)",
          }}
        >
          Pilot Decentralization
        </div>
      </div>
    </aside>
  );
}