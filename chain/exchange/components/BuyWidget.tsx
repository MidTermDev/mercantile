"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import {
  quoteBuy, buildBuyTx, gpBalance, type BuyQuote,
  quoteSell, buildSellTx, tokenBalance, type SellQuote,
} from "@/lib/swap";
import { fmtGp } from "@/lib/format";
import { solscanTx } from "@/lib/constants";
import type { ExchangeItem } from "@/lib/types";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

type Mode = "buy" | "sell";

export function BuyWidget({ item }: { item: ExchangeItem }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [mode, setMode] = useState<Mode>("buy");
  const [qty, setQty] = useState(1);
  const [buyQuote, setBuyQuote] = useState<BuyQuote | null>(null);
  const [sellQuote, setSellQuote] = useState<SellQuote | null>(null);
  const [gp, setGp] = useState<number | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) { setGp(null); setHeld(null); return; }
    gpBalance(connection, publicKey).then(setGp);
    tokenBalance(connection, publicKey, item.mint).then(setHeld);
  }, [publicKey, connection, item.mint, msg]);

  useEffect(() => {
    let live = true;
    setErr(null);
    if (qty <= 0) { setBuyQuote(null); setSellQuote(null); return; }
    if (mode === "buy") {
      quoteBuy(connection, item.pool, item.mint, qty, 1)
        .then((q) => { if (live) setBuyQuote(q); }).catch(() => { if (live) setBuyQuote(null); });
    } else {
      quoteSell(connection, item.pool, item.mint, qty, 1)
        .then((q) => { if (live) setSellQuote(q); }).catch(() => { if (live) setSellQuote(null); });
    }
    return () => { live = false; };
  }, [qty, mode, connection, item.pool, item.mint]);

  async function trade() {
    if (!publicKey) return;
    setBusy(true); setErr(null); setMsg(null); setSig(null);
    try {
      const tx = mode === "buy"
        ? await buildBuyTx(connection, item.pool, item.mint, publicKey, qty, 1)
        : await buildSellTx(connection, item.pool, item.mint, publicKey, qty, 1);
      const s = await sendTransaction(tx, connection);
      await connection.confirmTransaction(s, "confirmed");
      setSig(s);
      setMsg(mode === "buy"
        ? `Bought ${qty} ${item.name}`
        : `Sold ${qty} ${item.name} for ~${fmtGp(sellQuote?.gpOut ?? 0)} GP`);
    } catch (e: any) {
      setErr(e?.message?.slice(0, 160) ?? "swap failed");
    } finally { setBusy(false); }
  }

  const notEnoughGp = mode === "buy" && buyQuote && gp != null && gp < buyQuote.gpIn;
  const notEnoughItems = mode === "sell" && held != null && held < qty;
  const quote = mode === "buy" ? buyQuote : sellQuote;

  return (
    <div className="card p-5">
      <div className="flex rounded-lg bg-panel2 border border-line p-1 mb-4">
        {(["buy", "sell"] as Mode[]).map((m) => (
          <button key={m} onClick={() => { setMode(m); setMsg(null); setErr(null); }}
            className={`flex-1 py-1.5 rounded-md text-sm font-bold capitalize transition ${
              mode === m ? "bg-gold text-bg" : "text-mute hover:text-ink"}`}>
            {m}
          </button>
        ))}
      </div>

      <label className="text-xs text-mute">Quantity (items)</label>
      <div className="flex items-center gap-2 mt-1 mb-3">
        <button className="w-9 h-9 rounded bg-panel2 border border-line hover:border-gold" onClick={() => setQty(Math.max(1, qty - 1))}>–</button>
        <input type="number" min={1} value={qty}
          onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          className="w-full bg-panel border border-line rounded-lg px-3 py-2 text-ink text-center font-mono focus:outline-none focus:border-gold" />
        <button className="w-9 h-9 rounded bg-panel2 border border-line hover:border-gold" onClick={() => setQty(qty + 1)}>+</button>
      </div>

      <div className="text-sm space-y-1.5 mb-4">
        <Row label="Spot price" value={quote ? `${fmtGp(quote.spotPrice)} GP` : "…"} />
        {mode === "buy" ? (
          <Row label="Est. cost (max)" value={buyQuote ? `${fmtGp(buyQuote.gpIn)} GP` : "…"} gold />
        ) : (
          <Row label="Est. receive (min)" value={sellQuote ? `${fmtGp(sellQuote.gpOut)} GP` : "…"} gold />
        )}
        {quote && quote.priceImpactPct > 0.01 && <Row label="Price impact" value={`${quote.priceImpactPct.toFixed(2)}%`} />}
        {connected && mode === "buy" && <Row label="Your GP" value={gp == null ? "…" : fmtGp(gp)} />}
        {connected && mode === "sell" && <Row label={`Your ${item.name}`} value={held == null ? "…" : String(held)} />}
      </div>

      {!connected ? (
        <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />
      ) : (
        <button disabled={busy || !quote || !!notEnoughGp || !!notEnoughItems}
          onClick={trade}
          className="w-full py-3 rounded-lg bg-gold text-bg font-bold hover:bg-gold2 transition disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? "Swapping…"
            : notEnoughGp ? "Not enough GP"
            : notEnoughItems ? `Not enough ${item.name}`
            : mode === "buy"
              ? `Buy ${qty} for ~${buyQuote ? fmtGp(buyQuote.gpIn) : "…"} GP`
              : `Sell ${qty} for ~${sellQuote ? fmtGp(sellQuote.gpOut) : "…"} GP`}
        </button>
      )}

      {notEnoughGp && (
        <p className="text-mute text-xs mt-3">
          You need more GP. Withdraw coins at the in-game Exchange Clerk, or sell items into their pools.
        </p>
      )}
      {notEnoughItems && (
        <p className="text-mute text-xs mt-3">
          You don&apos;t hold enough {item.name}. Withdraw some at the in-game Exchange Clerk, or buy them here first.
        </p>
      )}
      {msg && (
        <p className="text-xs mt-3">
          <span className="text-emerald">{msg}</span>
          {sig && <> · <a href={solscanTx(sig)} target="_blank" rel="noreferrer" className="text-gold linkline font-mono">View on Solscan ↗</a></>}
        </p>
      )}
      {err && <p className="text-err text-xs mt-3 break-all">{err}</p>}
    </div>
  );
}

function Row({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-mute">{label}</span>
      <span className={`font-mono ${gold ? "gold-text" : "text-ink"}`}>{value}</span>
    </div>
  );
}
