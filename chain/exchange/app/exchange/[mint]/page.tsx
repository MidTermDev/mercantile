"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ItemImage } from "@/components/ItemImage";
import { CopyAddress } from "@/components/CopyAddress";
import { PriceChart } from "@/components/PriceChart";
import { BuyWidget } from "@/components/BuyWidget";
import { fmtGp } from "@/lib/format";
import type { ItemsFile, ExchangeItem, PricesFile } from "@/lib/types";

export default function ItemDetail() {
  const params = useParams();
  const mint = String(params.mint);
  const [item, setItem] = useState<ExchangeItem | null | undefined>(undefined);
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch("/data/items.json").then((r) => r.json()).then((d: ItemsFile) => {
      setItem(d.items.find((i) => i.mint === mint) ?? null);
    }).catch(() => setItem(null));
    fetch(`/data/prices.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).then((p: PricesFile) => {
      setPrice(p[mint]?.price ?? null);
    }).catch(() => {});
  }, [mint]);

  if (item === undefined) return <main className="max-w-6xl mx-auto px-4 py-16 text-mute">Loading…</main>;
  if (item === null)
    return (
      <main className="max-w-6xl mx-auto px-4 py-16 text-center">
        <p className="text-mute">Item not found.</p>
        <Link href="/exchange" className="gold-text mt-4 inline-block">← Back to the Grand Exchange</Link>
      </main>
    );

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <Link href="/exchange" className="text-mute hover:text-gold text-sm">← Grand Exchange</Link>
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 mt-4">
        <div>
          <div className="card p-6 flex items-center gap-5">
            <ItemImage src={item.imageUri} alt={item.name} size={88} />
            <div className="min-w-0">
              <h1 className="display text-2xl font-bold text-ink">{item.name}</h1>
              <div className="text-mute text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono">{item.symbol}</span>
                {item.members && <span className="text-emerald">Members</span>}
                {item.stackable && <span>stackable</span>}
              </div>
              <div className="mt-2"><CopyAddress address={item.mint} full /></div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-mute text-xs">Price</div>
              <div className="gold-text font-mono text-2xl">{fmtGp(price ?? item.p0GpPerItem)}</div>
              <div className="text-mute text-xs">GP{price == null ? " (start)" : ""}</div>
            </div>
          </div>

          <div className="card p-5 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="display font-bold text-ink">Price history</h2>
              <span className="text-mute text-xs">GP per item</span>
            </div>
            <PriceChart mint={item.mint} p0={item.p0GpPerItem} />
          </div>

          <div className="card p-5 mt-4 text-sm text-mute">
            <h2 className="display font-bold text-ink mb-2">About</h2>
            <p>Starting price was <span className="gold-text font-mono">{fmtGp(item.p0GpPerItem)} GP</span> (0.9× the item’s in-game low-alch of {item.lowalch}).
              This token is paired single-sided to GP in a Meteora DAMM v2 pool; price rises as items are bought and falls as they’re sold back.</p>
            <p className="mt-2">Pool: <CopyAddress address={item.pool} chars={6} /></p>
          </div>
        </div>

        <div className="lg:sticky lg:top-20 h-fit">
          <BuyWidget item={item} />
          <div className="card p-4 mt-4 text-xs text-mute">
            Buying mints GP into the pool and sends you the item token. To use it in-game, deposit it at the Exchange Clerk — it’s burned on-chain and credited to your character.
          </div>
        </div>
      </div>
    </main>
  );
}
