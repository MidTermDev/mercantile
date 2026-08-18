"use client";
import { useState } from "react";
import { truncAddr } from "@/lib/format";
import { solscan } from "@/lib/constants";
export function CopyAddress({ address, chars = 4, full = false }: { address: string; chars?: number; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <a href={solscan(address)} target="_blank" rel="noreferrer" className="hover:text-gold" title={address}>
        {full ? address : truncAddr(address, chars)}
      </a>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        className="text-mute hover:text-gold" title="Copy">
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}
