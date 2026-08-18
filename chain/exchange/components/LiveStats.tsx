"use client";
import { useEffect, useState } from "react";
import { gameOrigin } from "@/lib/bridge";

/** Live "N online · M players" pill — polls the game host's /agent/stats. */
export function LiveStats({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState<{ online: number; registered: number } | null>(null);

  useEffect(() => {
    let live = true;
    const tick = () =>
      fetch(`${gameOrigin()}/agent/stats`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (live && d) setS(d); })
        .catch(() => {});
    tick();
    const id = setInterval(tick, 20_000);
    return () => { live = false; clearInterval(id); };
  }, []);

  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs" title="Live world stats">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald" />
      </span>
      <span className="text-ink font-mono tnum">{s.online.toLocaleString()}</span>
      <span className="text-mute">online</span>
      {!compact && (
        <span className="text-mute/70 hidden lg:inline">· {s.registered.toLocaleString()} players</span>
      )}
    </span>
  );
}
