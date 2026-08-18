"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { ItemImage } from "@/components/ItemImage";
import { fmtGp } from "@/lib/format";
import { GP_DECIMALS, ITEM_DECIMALS, GP_MINT, solscanTx } from "@/lib/constants";
import type { ItemsFile, ExchangeItem } from "@/lib/types";
import {
  isLinked, pendingWithdrawals, type PendingRow,
  buildRedeemTx, claimBalanceBase, buildDepositTx, notifyDeposit, walletHoldings,
} from "@/lib/bridge";
import { LinkModal } from "@/components/LinkModal";
import { buildSellTx } from "@/lib/swap";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

type GpInfo = ItemsFile["gp"];

export function WalletPanel() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();

  const [items, setItems] = useState<ExchangeItem[]>([]);
  const [gp, setGp] = useState<GpInfo | null>(null);
  const byMint = useMemo(() => {
    const m = new Map<string, ExchangeItem>();
    for (const it of items) m.set(it.mint, it);
    return m;
  }, [items]);
  const byName = useMemo(() => {
    const m = new Map<string, ExchangeItem>();
    for (const it of items) m.set(it.debugname, it);
    return m;
  }, [items]);

  const [linked, setLinked] = useState<boolean | null>(null);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [claimBals, setClaimBals] = useState<Record<string, bigint>>({});
  const [holdings, setHoldings] = useState<{ mint: string; base: bigint }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/items.json")
      .then((r) => r.json())
      .then((f: ItemsFile) => { setItems(f.items); setGp(f.gp); })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    const addr = publicKey.toBase58();
    const [lk, pw, hs] = await Promise.all([
      isLinked(addr).catch(() => false),
      pendingWithdrawals(addr).catch(() => []),
      walletHoldings(connection, publicKey).catch(() => []),
    ]);
    setLinked(lk);
    setPending(pw);
    setHoldings(hs.map((h) => ({ mint: h.mint, base: h.amountBase })));
    // read on-chain claimable balances for the mints that have a claimable row
    const names = [...new Set(pw.filter((p) => p.state === "claimable").map((p) => p.obj_debugname))];
    const bals: Record<string, bigint> = {};
    await Promise.all(names.map(async (dn) => {
      const m = dn === "gp" ? GP_MINT : byName.get(dn)?.mint;
      if (m) bals[dn] = await claimBalanceBase(connection, publicKey!, m).catch(() => 0n);
    }));
    setClaimBals(bals);
  }, [publicKey, connection, byName]);

  useEffect(() => { if (connected && publicKey) refresh(); else { setLinked(null); setPending([]); setHoldings([]); } }, [connected, publicKey, refresh]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setErr(null); setMsg(null); setLastSig(null);
    try { await fn(); } catch (e: any) { setErr(e?.message?.slice(0, 200) ?? "failed"); } finally { setBusy(null); }
  }

  const [showLink, setShowLink] = useState(false);

  // ── claim a withdrawal: the user mints their credited balance to themselves ──
  function mintFor(debugname: string): string | null {
    if (debugname === "gp") return GP_MINT;
    return byName.get(debugname)?.mint ?? null;
  }
  function claim(debugname: string) {
    return run(`claim:${debugname}`, async () => {
      if (!publicKey) return;
      const mint = mintFor(debugname);
      if (!mint) throw new Error(`unknown item ${debugname}`);
      const tx = buildRedeemTx(publicKey, mint);   // creates your account (you pay rent) + mints
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setLastSig(sig);
      setMsg(`Claimed your ${debugname === "gp" ? "GP" : (byName.get(debugname)?.name ?? debugname)} — it's in your wallet.`);
      setTimeout(refresh, 3000);
    });
  }

  // ── deposit (burn -> claim in-game) ───────────────────────────────────────
  const [amts, setAmts] = useState<Record<string, string>>({});
  function deposit(mint: string, isGp: boolean, maxWhole: number) {
    return run(`deposit:${mint}`, async () => {
      if (!publicKey) return;
      const whole = Number(amts[mint] ?? "0");
      if (!whole || whole <= 0) throw new Error("enter an amount");
      // The game can't hold fractions — only whole items/GP can be deposited (a burn
      // of a fractional amount would be rejected in-game AFTER the tokens are gone).
      if (!Number.isInteger(whole)) throw new Error(`whole ${isGp ? "GP" : "items"} only — no fractions`);
      if (whole > maxWhole) throw new Error(`you only hold ${maxWhole}`);
      const tx = buildDepositTx(publicKey, mint, whole, isGp);
      const sig = await sendTransaction(tx, connection);
      setMsg("Deposit sent — finalizing on-chain…");
      await connection.confirmTransaction(sig, "finalized");
      setLastSig(sig);
      const n = await notifyDeposit(sig);
      if (!n.ok) throw new Error(`burned, but notify failed: ${n.error} (retry from the CLI with the sig)`);
      setMsg(`Deposited ${whole} ${isGp ? "GP" : byMint.get(mint)?.name ?? "item"} — claim it at the Exchange Clerk in-game.`);
      setAmts((a) => ({ ...a, [mint]: "" }));
      setTimeout(refresh, 3000);
    });
  }

  // ── sell an item holding into its pool for GP ─────────────────────────────
  function sell(mint: string, pool: string, maxWhole: number) {
    return run(`sell:${mint}`, async () => {
      if (!publicKey) return;
      const whole = Number(amts[mint] ?? "0");
      if (!whole || whole <= 0) throw new Error("enter an amount");
      if (whole > maxWhole) throw new Error(`you only hold ${maxWhole}`);
      const tx = await buildSellTx(connection, pool, mint, publicKey, whole, 1);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setLastSig(sig);
      setMsg(`Sold ${whole} ${byMint.get(mint)?.name ?? "item"} for GP — ${sig.slice(0, 8)}…`);
      setAmts((a) => ({ ...a, [mint]: "" }));
      setTimeout(refresh, 3000);
    });
  }

  if (!connected) {
    return (
      <div className="card p-8 text-center">
        <h2 className="display text-xl font-bold gold-text mb-2">Connect your wallet</h2>
        <p className="text-mute text-sm mb-5 max-w-md mx-auto">
          Connect a Solana wallet to link it to your character and move items and GP between the game and the chain.
        </p>
        <div className="flex justify-center"><WalletMultiButton /></div>
      </div>
    );
  }

  // claimable = withdrawals credited on-chain; drive the UI off the real claim-PDA
  // balance (source of truth) so already-claimed ones disappear.
  const claimableNames = [...new Set(pending.filter((p) => p.state === "claimable").map((p) => p.obj_debugname))]
    .filter((dn) => (claimBals[dn] ?? 0n) > 0n);
  const processing = pending.filter((p) => p.state !== "claimable");
  const gpHolding = holdings.find((h) => h.mint === GP_MINT);
  const itemHoldings = holdings.filter((h) => h.mint !== GP_MINT && byMint.has(h.mint));

  return (
    <div className="space-y-6">
      {(msg || err) && (
        <div className={`card p-3 text-sm ${err ? "border-err/50" : "border-emerald/40"}`}>
          {err ? <span className="text-err">{err}</span> : (
            <span><span className="text-emerald">{msg}</span>
              {lastSig && <> · <a href={solscanTx(lastSig)} target="_blank" rel="noreferrer" className="text-gold linkline font-mono text-xs">View on Solscan ↗</a></>}
            </span>
          )}
        </div>
      )}

      {/* Link status */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="display text-lg font-bold gold-text">1 · Link your character</h2>
          {linked === true && <span className="text-emerald text-sm">✓ linked</span>}
        </div>
        {linked === true ? (
          <p className="text-mute text-sm mt-2">This wallet is linked to a game account. You can bridge below.</p>
        ) : (
          <>
            <p className="text-mute text-sm mt-2">
              Bind this wallet to your character in three quick steps — get a code from the in-game Exchange Clerk,
              then sign here. No address typing in-game.
            </p>
            <button onClick={() => setShowLink(true)}
              className="mt-3 px-5 py-2.5 rounded-lg bg-gold text-bg font-bold text-sm hover:bg-gold2">
              Link wallet →
            </button>
          </>
        )}
      </section>
      {showLink && <LinkModal onClose={() => setShowLink(false)} onLinked={() => { setMsg("Wallet linked!"); refresh(); }} />}

      {/* Pending withdrawals */}
      <section className="card p-5">
        <h2 className="display text-lg font-bold gold-text">2 · Incoming withdrawals</h2>
        {claimableNames.length === 0 && processing.length === 0 ? (
          <p className="text-mute text-sm mt-2">No pending withdrawals. Withdraw items or GP at the in-game Exchange Clerk and they appear here to claim.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {claimableNames.map((dn) => {
              const it = byName.get(dn);
              const label = dn === "gp" ? "GP" : it?.name ?? dn;
              const whole = Number(claimBals[dn]) / (dn === "gp" ? 1e6 : 10);
              return (
                <div key={`c${dn}`} className="flex items-center gap-3 rounded-lg border border-gold/40 bg-panel px-3 py-2">
                  <ItemImage src={dn === "gp" ? gp?.imageUri ?? null : it?.imageUri ?? null} alt={label} size={32} />
                  <div className="text-sm">
                    <div className="text-ink">{whole.toLocaleString()} × {label}</div>
                    <div className="text-mute text-xs">ready to claim — you mint it & pay the fee (~0.002 SOL)</div>
                  </div>
                  <button onClick={() => claim(dn)} disabled={busy === `claim:${dn}`}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-gold text-bg font-bold text-xs hover:bg-gold2 disabled:opacity-50">
                    {busy === `claim:${dn}` ? "claiming…" : "Claim"}
                  </button>
                </div>
              );
            })}
            {processing.map((p, i) => {
              const it = byName.get(p.obj_debugname);
              const label = p.obj_debugname === "gp" ? "GP" : it?.name ?? p.obj_debugname;
              return (
                <div key={`p${i}`} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                  <ItemImage src={p.obj_debugname === "gp" ? gp?.imageUri ?? null : it?.imageUri ?? null} alt={label} size={32} />
                  <span className="text-ink">{p.count} × {label}</span>
                  <span className="ml-auto text-mute text-xs">crediting… (~30s)</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Holdings / deposit */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="display text-lg font-bold gold-text">3 · Your tokens — sell for GP or deposit in-game</h2>
          <button onClick={refresh} className="text-mute text-xs hover:text-ink">refresh</button>
        </div>
        <p className="text-mute text-sm mt-2"><b className="text-ink">Sell</b> swaps items into their GP pool. <b className="text-ink">Deposit</b> burns tokens and credits the items/GP back to your character (claim at the Exchange Clerk). You pay only the network fee (~0.000005 SOL).</p>
        <div className="mt-3 space-y-2">
          {gpHolding && (() => {
            const whole = Number(gpHolding.base) / 10 ** GP_DECIMALS;
            return (
              <DepositRow key="gp" img={gp?.imageUri ?? null} name="GP" have={fmtGp(whole)}
                value={amts[GP_MINT] ?? ""} onChange={(v) => setAmts((a) => ({ ...a, [GP_MINT]: v }))}
                onDeposit={() => deposit(GP_MINT, true, whole)} depositBusy={busy === `deposit:${GP_MINT}`} />
            );
          })()}
          {itemHoldings.map((h) => {
            const it = byMint.get(h.mint)!;
            const whole = Number(h.base) / 10 ** ITEM_DECIMALS;
            return (
              <DepositRow key={h.mint} img={it.imageUri} name={it.name} have={String(whole)}
                value={amts[h.mint] ?? ""} onChange={(v) => setAmts((a) => ({ ...a, [h.mint]: v }))}
                onDeposit={() => deposit(h.mint, false, whole)} depositBusy={busy === `deposit:${h.mint}`}
                onSell={it.pool ? () => sell(h.mint, it.pool, whole) : undefined} sellBusy={busy === `sell:${h.mint}`} />
            );
          })}
          {!gpHolding && itemHoldings.length === 0 && (
            <p className="text-mute text-sm">No bridged tokens in this wallet yet. Withdraw some in-game, or buy on the <a href="/exchange" className="gold-text underline">Grand Exchange</a>.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function DepositRow({ img, name, have, value, onChange, onDeposit, depositBusy, onSell, sellBusy }: {
  img: string | null; name: string; have: string; value: string;
  onChange: (v: string) => void; onDeposit: () => void; depositBusy: boolean;
  onSell?: () => void; sellBusy?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2">
      <ItemImage src={img} alt={name} size={32} />
      <div className="text-sm min-w-0">
        <div className="text-ink truncate">{name}</div>
        <div className="text-mute text-xs">have {have}</div>
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="amount" inputMode="numeric"
        className="ml-auto w-20 bg-panel2 border border-line rounded-lg px-2 py-1.5 text-ink text-sm text-right font-mono focus:outline-none focus:border-gold" />
      {onSell && (
        <button onClick={onSell} disabled={sellBusy}
          className="px-3 py-1.5 rounded-lg border border-gold text-gold font-bold text-xs hover:bg-gold hover:text-bg transition disabled:opacity-50">
          {sellBusy ? "…" : "Sell"}
        </button>
      )}
      <button onClick={onDeposit} disabled={depositBusy}
        className="px-3 py-1.5 rounded-lg bg-gold text-bg font-bold text-xs hover:bg-gold2 disabled:opacity-50">
        {depositBusy ? "…" : "Deposit"}
      </button>
    </div>
  );
}
