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
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
        <div>
          <h1 className="display text-4xl font-extrabold gold-text">Grand Exchange</h1>
          <p className="text-mute text-sm mt-2 flex items-center gap-2">
            <span className="chip">{data ? `${data.items.length.toLocaleString()} markets` : "loading…"}</span>
            priced in GP · click any item to trade
          </p>
        </div>
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items, symbol, or mint…"
          className="w-full md:w-96 bg-panel border border-line rounded-lg px-4 py-2.5 text-ink placeholder:text-mute/60 focus:outline-none focus:border-gold transition" />
      </div>
      <hr className="rule my-5" />

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] md:grid-cols-[2.2fr_1fr_1fr_auto] gap-3 px-5 py-3 text-[11px] uppercase tracking-widest text-mute border-b border-line bg-panel/60 sticky top-16 z-10 backdrop-blur">
          <button className="text-left hover:text-gold transition" onClick={() => toggle("name")}>Item {sort === "name" ? (asc ? "▲" : "▼") : ""}</button>
          <span className="hidden md:block">Mint</span>
          <button className="text-right hover:text-gold transition" onClick={() => toggle("price")}>Price · GP {sort === "price" ? (asc ? "▲" : "▼") : ""}</button>
          <span className="text-right pr-1">Trade</span>
        </div>
        <div className="divide-y divide-line/40 max-h-[72vh] overflow-y-auto">
          {rows.map((i) => {
            const p = prices[i.mint]?.price;
            return (
              <Link key={i.mint} href={`/exchange/${i.mint}`}
                className="group grid grid-cols-[1fr_auto_auto] md:grid-cols-[2.2fr_1fr_1fr_auto] gap-3 px-5 py-2.5 items-center hover:bg-panel2/50 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 rounded-lg bg-panel2/70 border border-line/60 p-1"><ItemImage src={i.imageUri} alt={i.name} size={34} /></div>
                  <div className="min-w-0">
                    <div className="text-ink truncate group-hover:text-gold transition">{i.name}</div>
                    <div className="text-mute text-xs font-mono">{i.symbol}{i.members ? " · members" : ""}</div>
                  </div>
                </div>
                <div className="hidden md:block" onClick={(e) => e.preventDefault()}>
                  <CopyAddress address={i.mint} chars={4} />
                </div>
                <div className="text-right font-mono tnum">
                  <span className={p != null ? "text-ink" : "text-mute"}>{fmtGp(p ?? i.p0GpPerItem)}</span>
                  {p == null && <span className="text-mute/70 text-[10px] ml-1 uppercase">floor</span>}
                </div>
                <div className="text-right"><span className="text-mute group-hover:text-gold transition text-sm">Trade →</span></div>
              </Link>
            );
          })}
          {data && rows.length === 0 && <div className="px-4 py-12 text-center text-mute">No items match “{q}”.</div>}
          {!data && <div className="px-4 py-12 text-center text-mute">Loading markets…</div>}
        </div>
      </div>
    </main>
  );
}
