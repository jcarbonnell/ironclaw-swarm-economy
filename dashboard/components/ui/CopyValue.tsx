"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyValueProps {
  value: string;
  display?: string;
  mono?: boolean;
}

export function CopyValue({ value, display, mono = true }: CopyValueProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      title={value}
    >
      <span
        style={{
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          fontSize: 11,
          color: "var(--text-secondary)",
        }}
      >
        {display ?? value}
      </span>
      <button
        onClick={handleCopy}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 2,
          color: copied ? "var(--online)" : "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          transition: "color 0.15s",
        }}
        title="Copy to clipboard"
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
      </button>
    </span>
  );
}