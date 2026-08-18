"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ItemImage } from "@/components/ItemImage";
import { CopyAddress } from "@/components/CopyAddress";
import { fmtGp } from "@/lib/format";
import type { ItemsFile, PricesFile, ExchangeItem } from "@/lib/types";

type SortKey = "name" | "price";

export default function GrandExchange() {
  const [data, setData] = useState<ItemsFile | null>(null);
  const [prices, setPrices] = useState<PricesFile>({});
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);

  useEffect(() => {
    fetch("/data/items.json").then((r) => r.json()).then(setData).catch(() => {});
    fetch(`/data/prices.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : {}).then(setPrices).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    let list = data.items.filter((i) =>
      !term || i.name.toLowerCase().includes(term) || i.symbol.toLowerCase().includes(term) || i.mint.toLowerCase().includes(term),
    );
    const price = (i: ExchangeItem) => prices[i.mint]?.price ?? i.p0GpPerItem;
    list = [...list].sort((a, b) => {
      const v = sort === "name" ? a.name.localeCompare(b.name) : price(a) - price(b);
      return asc ? v : -v;
    });
    return list;
  }, [data, prices, q, sort, asc]);

  const toggle = (k: SortKey) => { if (sort === k) setAsc(!asc); else { setSort(k); setAsc(true); } };

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="display text-3xl font-bold gold-text">Grand Exchange</h1>
          <p className="text-mute text-sm mt-1">
            {data ? `${data.items.length.toLocaleString()} tokenized items` : "Loading…"} · priced in GP · click any item to trade
          </p>
        </div>
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items, symbol, or mint…"
          className="w-full md:w-96 bg-panel border border-line rounded-lg px-4 py-2.5 text-ink placeholder:text-mute/70 focus:outline-none focus:border-gold" />
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] md:grid-cols-[2fr_1fr_1fr_auto] gap-3 px-4 py-3 text-xs uppercase tracking-wide text-mute border-b border-line">
          <button className="text-left hover:text-gold" onClick={() => toggle("name")}>Item {sort === "name" ? (asc ? "▲" : "▼") : ""}</button>
          <span className="hidden md:block">Token</span>
          <button className="text-right hover:text-gold" onClick={() => toggle("price")}>Price (GP) {sort === "price" ? (asc ? "▲" : "▼") : ""}</button>
          <span className="text-right pr-1">Trade</span>
        </div>
        <div className="divide-y divide-line/60 max-h-[70vh] overflow-y-auto">
          {rows.map((i) => {
            const p = prices[i.mint]?.price;
            return (
              <Link key={i.mint} href={`/exchange/${i.mint}`}
                className="grid grid-cols-[1fr_auto_auto] md:grid-cols-[2fr_1fr_1fr_auto] gap-3 px-4 py-3 items-center hover:bg-panel2/60 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <ItemImage src={i.imageUri} alt={i.name} size={36} />
                  <div className="min-w-0">
                    <div className="text-ink truncate">{i.name}</div>
                    <div className="text-mute text-xs font-mono">{i.symbol}{i.members ? " · P2P" : ""}</div>
                  </div>
                </div>
                <div className="hidden md:block" onClick={(e) => e.preventDefault()}>
                  <CopyAddress address={i.mint} chars={4} />
                </div>
                <div className="text-right font-mono">
                  <span className={p != null ? "text-ink" : "text-mute"}>{fmtGp(p ?? i.p0GpPerItem)}</span>
                  {p == null && <span className="text-mute text-[10px] ml-1">start</span>}
                </div>
                <div className="text-right"><span className="text-gold text-sm">Buy →</span></div>
              </Link>
            );
          })}
          {data && rows.length === 0 && <div className="px-4 py-10 text-center text-mute">No items match “{q}”.</div>}
        </div>
      </div>
    </main>
  );
}
