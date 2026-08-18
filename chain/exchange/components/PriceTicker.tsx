"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ItemImage } from "@/components/ItemImage";
import { fmtGp } from "@/lib/format";
import type { ItemsFile, PricesFile, ExchangeItem } from "@/lib/types";

/** A seamless marquee of real items + live GP prices. */
export function PriceTicker() {
  const [items, setItems] = useState<ExchangeItem[]>([]);
  const [prices, setPrices] = useState<PricesFile>({});

  useEffect(() => {
    fetch("/data/items.json").then((r) => r.json()).then((f: ItemsFile) => {
      // a lively spread: highest-value items first (rares), plus staples
      const withImg = f.items.filter((i) => i.imageUri);
      const price = (i: ExchangeItem) => prices[i.mint]?.price ?? i.p0GpPerItem;
      const top = [...withImg].sort((a, b) => b.p0GpPerItem - a.p0GpPerItem).slice(0, 14);
      const rest = withImg.filter((i) => !top.includes(i)).sort(() => 0.5 - Math.random()).slice(0, 16);
      setItems([...top, ...rest]);
      void price;
    }).catch(() => {});
    fetch(`/data/prices.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).then(setPrices).catch(() => {});
  }, []);

  if (!items.length) return <div className="h-[52px]" />;
  const row = [...items, ...items]; // duplicate for a seamless loop
  return (
    <div className="ticker-mask overflow-hidden border-y border-line/60 bg-panel/40">
      <div className="ticker-track py-2.5">
        {row.map((i, n) => {
          const p = prices[i.mint]?.price ?? i.p0GpPerItem;
          return (
            <Link key={n} href={`/exchange/${i.mint}`}
              className="inline-flex items-center gap-2 px-4 border-r border-line/40 hover:bg-panel2/50 transition">
              <ItemImage src={i.imageUri} alt={i.name} size={26} />
              <span className="text-ink/90 text-sm">{i.name}</span>
              <span className="text-gold font-mono text-sm tnum">{fmtGp(p)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
