"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { HistoryPoint } from "@/lib/types";
import { fmtGp } from "@/lib/format";

export function PriceChart({ mint, p0 }: { mint: string; p0: number }) {
  const [pts, setPts] = useState<HistoryPoint[] | null>(null);
  useEffect(() => {
    fetch(`/data/history/${mint}.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then(setPts).catch(() => setPts([]));
  }, [mint]);

  if (pts === null) return <div className="h-64 grid place-items-center text-mute">Loading chart…</div>;
  if (pts.length < 2) {
    return (
      <div className="h-64 grid place-items-center text-center text-mute">
        <div>
          <div className="text-4xl mb-2">📈</div>
          Price history is building.<br />
          <span className="text-sm">Starting price: <span className="gold-text font-mono">{fmtGp(p0)} GP</span></span>
        </div>
      </div>
    );
  }
  const data = pts.map((p) => ({ t: p.t * 1000, price: p.price }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#2c4a3a" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: "#9db3a4", fontSize: 11 }} stroke="#2c4a3a"
            tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
          <YAxis tick={{ fill: "#9db3a4", fontSize: 11 }} stroke="#2c4a3a" width={56}
            tickFormatter={(v) => fmtGp(v)} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "#14241c", border: "1px solid #2c4a3a", borderRadius: 8, color: "#e8e2d0" }}
            labelFormatter={(t) => new Date(t as number).toLocaleString()}
            formatter={(v) => [`${fmtGp(v as number)} GP`, "Price"]} />
          <Line type="monotone" dataKey="price" stroke="#e8b923" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
