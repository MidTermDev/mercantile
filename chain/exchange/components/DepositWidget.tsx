"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { tokenBalance } from "@/lib/swap";
import { buildDepositTx, notifyDeposit, isLinked } from "@/lib/bridge";
import { solscanTx } from "@/lib/constants";
import type { ExchangeItem } from "@/lib/types";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

/** Deposit this item's tokens straight back to the linked character (burn → in-game credit). */
export function DepositWidget({ item }: { item: ExchangeItem }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [held, setHeld] = useState<number | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) { setHeld(null); setLinked(null); return; }
    tokenBalance(connection, publicKey, item.mint).then(setHeld);
    isLinked(publicKey.toBase58()).then(setLinked).catch(() => setLinked(null));
  }, [publicKey, connection, item.mint, msg]);

  async function deposit() {
    if (!publicKey) return;
    setBusy(true); setErr(null); setMsg(null); setSig(null);
    try {
      const whole = Number(qty);
      if (!whole || whole <= 0) throw new Error("enter an amount");
      if (!Number.isInteger(whole)) throw new Error("whole items only — no fractions");
      if (held != null && whole > held) throw new Error(`you only hold ${held}`);
      const tx = buildDepositTx(publicKey, item.mint, whole, false);
      const s = await sendTransaction(tx, connection);
      setMsg("Depositing — finalizing on-chain…");
      await connection.confirmTransaction(s, "finalized");
      setSig(s);
      const n = await notifyDeposit(s);
      if (!n.ok) throw new Error(`burned, but notify failed: ${n.error}`);
      setMsg(`Deposited ${whole} ${item.name} — claim it at the Exchange Clerk in-game.`);
      setQty("");
    } catch (e: any) {
      setErr(e?.message?.slice(0, 180) ?? "deposit failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="card p-5 mt-4">
      <h3 className="display font-bold text-lg gold-text mb-1">Deposit to your character</h3>
      <p className="text-mute text-xs mb-4">Burns the token on-chain and credits {item.name} to your linked character (claim at the Exchange Clerk). Whole items only.</p>

      {!connected ? (
        <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />
      ) : (
        <>
          <div className="flex justify-between text-xs text-mute mb-1">
            <span>You hold</span>
            <span className="font-mono text-ink">{held == null ? "…" : `${held} ${item.symbol}`}</span>
          </div>
          <div className="flex items-center gap-2">
            <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="amount" inputMode="numeric"
              className="flex-1 bg-panel border border-line rounded-lg px-3 py-2 text-ink text-right font-mono focus:outline-none focus:border-gold" />
            {held != null && held > 0 && (
              <button onClick={() => setQty(String(Math.floor(held)))} className="text-xs text-mute hover:text-gold px-2">max</button>
            )}
            <button onClick={deposit} disabled={busy || !held}
              className="btn-gold px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? "…" : "Deposit"}
            </button>
          </div>
          {linked === false && <p className="text-mute text-xs mt-2">This wallet isn&apos;t linked to a character yet — <a href="/wallet" className="gold-text linkline">link it first</a> so the deposit can be credited.</p>}
          {msg && (
            <p className="text-xs mt-3">
              <span className="text-emerald">{msg}</span>
              {sig && <> · <a href={solscanTx(sig)} target="_blank" rel="noreferrer" className="text-gold linkline font-mono">Solscan ↗</a></>}
            </p>
          )}
          {err && <p className="text-err text-xs mt-3 break-all">{err}</p>}
        </>
      )}
    </div>
  );
}
