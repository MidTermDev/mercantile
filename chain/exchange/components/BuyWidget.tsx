"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { quoteBuy, buildBuyTx, gpBalance, type BuyQuote } from "@/lib/swap";
import { fmtGp } from "@/lib/format";
import type { ExchangeItem } from "@/lib/types";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

export function BuyWidget({ item }: { item: ExchangeItem }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [qty, setQty] = useState(1);
  const [quote, setQuote] = useState<BuyQuote | null>(null);
  const [gp, setGp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (publicKey) gpBalance(connection, publicKey).then(setGp); else setGp(null); }, [publicKey, connection, msg]);

  useEffect(() => {
    let live = true;
    if (qty <= 0) { setQuote(null); return; }
    setErr(null);
    quoteBuy(connection, item.pool, item.mint, qty, 1)
      .then((q) => { if (live) setQuote(q); })
      .catch(() => { if (live) setQuote(null); });
    return () => { live = false; };
  }, [qty, connection, item.pool, item.mint]);

  async function buy() {
    if (!publicKey) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const tx = await buildBuyTx(connection, item.pool, item.mint, publicKey, qty, 1);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg(`Bought ${qty} ${item.name} — ${sig.slice(0, 8)}…`);
    } catch (e: any) {
      setErr(e?.message?.slice(0, 160) ?? "swap failed");
    } finally { setBusy(false); }
  }

  const notEnough = quote && gp != null && gp < quote.gpIn;

  return (
    <div className="card p-5">
      <h3 className="display font-bold text-lg gold-text mb-3">Buy with GP</h3>
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
        <Row label="Est. cost (max)" value={quote ? `${fmtGp(quote.gpIn)} GP` : "…"} gold />
        {quote && quote.priceImpactPct > 0.01 && <Row label="Price impact" value={`${quote.priceImpactPct.toFixed(2)}%`} />}
        {connected && <Row label="Your GP" value={gp == null ? "…" : fmtGp(gp)} />}
      </div>

      {!connected ? (
        <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />
      ) : (
        <button disabled={busy || !quote || !!notEnough}
          onClick={buy}
          className="w-full py-3 rounded-lg bg-gold text-bg font-bold hover:bg-gold2 transition disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? "Swapping…" : notEnough ? "Not enough GP" : `Buy ${qty} for ~${quote ? fmtGp(quote.gpIn) : "…"} GP`}
        </button>
      )}

      {notEnough && (
        <p className="text-mute text-xs mt-3">
          You need more GP. Get GP by withdrawing coins from the game at the in-game Exchange Clerk, or by selling items into their pools.
        </p>
      )}
      {msg && <p className="text-emerald text-xs mt-3 break-all">{msg}</p>}
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
