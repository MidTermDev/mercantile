"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { ItemImage } from "@/components/ItemImage";
import { fmtGp } from "@/lib/format";
import { GP_DECIMALS, ITEM_DECIMALS, GP_MINT } from "@/lib/constants";
import type { ItemsFile, ExchangeItem } from "@/lib/types";
import {
  isLinked, linkWallet, linkMessage, linkPageUrl,
  pendingWithdrawals, type PendingRow,
  buildCreateAccountTx, buildDepositTx, notifyDeposit, walletHoldings,
} from "@/lib/bridge";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

type GpInfo = ItemsFile["gp"];

export function WalletPanel() {
  const { connection } = useConnection();
  const { publicKey, connected, signMessage, sendTransaction } = useWallet();

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
  const [holdings, setHoldings] = useState<{ mint: string; base: bigint }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
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
  }, [publicKey, connection]);

  useEffect(() => { if (connected && publicKey) refresh(); else { setLinked(null); setPending([]); setHoldings([]); } }, [connected, publicKey, refresh]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setErr(null); setMsg(null);
    try { await fn(); } catch (e: any) { setErr(e?.message?.slice(0, 200) ?? "failed"); } finally { setBusy(null); }
  }

  // ── link ────────────────────────────────────────────────────────────────
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  function doLink() {
    return run("link", async () => {
      if (!publicKey || !signMessage) throw new Error("connect a wallet that can sign messages");
      if (!username.trim() || !code.trim()) throw new Error("enter your in-game username and link code");
      const sig = await signMessage(new TextEncoder().encode(linkMessage(username.trim(), code.trim())));
      const res = await linkWallet(username.trim(), code.trim(), publicKey.toBase58(), b64(sig));
      if (!res.ok) throw new Error(res.error);
      setMsg(`Linked ${username.trim()} ↔ this wallet.`);
      await refresh();
    });
  }

  // ── create token account (user pays their own rent) ───────────────────────
  function mintFor(debugname: string): string | null {
    if (debugname === "gp") return GP_MINT;
    return byName.get(debugname)?.mint ?? null;
  }
  function createAccount(debugname: string) {
    return run(`create:${debugname}`, async () => {
      if (!publicKey) return;
      const mint = mintFor(debugname);
      if (!mint) throw new Error(`unknown item ${debugname}`);
      const tx = buildCreateAccountTx(publicKey, mint);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg(`Created your ${debugname === "gp" ? "GP" : debugname} account — the withdrawal will land shortly.`);
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
      if (whole > maxWhole) throw new Error(`you only hold ${maxWhole}`);
      const tx = buildDepositTx(publicKey, mint, whole, isGp);
      const sig = await sendTransaction(tx, connection);
      setMsg("Deposit sent — finalizing on-chain…");
      await connection.confirmTransaction(sig, "finalized");
      const n = await notifyDeposit(sig);
      if (!n.ok) throw new Error(`burned, but notify failed: ${n.error} (retry from the CLI with the sig)`);
      setMsg(`Deposited ${whole} ${isGp ? "GP" : byMint.get(mint)?.name ?? "item"} — claim it at the Exchange Clerk in-game.`);
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

  const awaiting = pending.filter((p) => p.state === "awaiting_account");
  const processing = pending.filter((p) => p.state !== "awaiting_account");
  const gpHolding = holdings.find((h) => h.mint === GP_MINT);
  const itemHoldings = holdings.filter((h) => h.mint !== GP_MINT && byMint.has(h.mint));

  return (
    <div className="space-y-6">
      {(msg || err) && (
        <div className={`card p-3 text-sm ${err ? "border-red-500/50 text-red-300" : "border-emerald/50 text-emerald"}`}>
          {err ?? msg}
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
              In game, talk to the Exchange Clerk or type <span className="font-mono text-ink">::linkwallet {publicKey?.toBase58().slice(0, 6)}…</span> to get a code, then sign here.
              {" "}<a href={linkPageUrl()} target="_blank" rel="noreferrer" className="gold-text underline">classic link page ↗</a>
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="in-game username"
                className="bg-panel border border-line rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:border-gold" />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="link code"
                className="bg-panel border border-line rounded-lg px-3 py-2 text-ink text-sm font-mono focus:outline-none focus:border-gold" />
              <button onClick={doLink} disabled={busy === "link"}
                className="px-4 py-2 rounded-lg bg-gold text-bg font-bold text-sm hover:bg-gold2 disabled:opacity-50">
                {busy === "link" ? "signing…" : "Sign & link"}
              </button>
            </div>
          </>
        )}
      </section>

      {/* Pending withdrawals */}
      <section className="card p-5">
        <h2 className="display text-lg font-bold gold-text">2 · Incoming withdrawals</h2>
        {pending.length === 0 ? (
          <p className="text-mute text-sm mt-2">No pending withdrawals. Withdraw items or GP at the in-game Exchange Clerk and they appear here.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {awaiting.map((p, i) => {
              const it = byName.get(p.obj_debugname);
              const label = p.obj_debugname === "gp" ? "GP" : it?.name ?? p.obj_debugname;
              return (
                <div key={`a${i}`} className="flex items-center gap-3 rounded-lg border border-gold/40 bg-panel px-3 py-2">
                  <ItemImage src={p.obj_debugname === "gp" ? gp?.imageUri ?? null : it?.imageUri ?? null} alt={label} size={32} />
                  <div className="text-sm">
                    <div className="text-ink">{p.count} × {label}</div>
                    <div className="text-mute text-xs">needs a token account (~0.002 SOL, refundable, you pay)</div>
                  </div>
                  <button onClick={() => createAccount(p.obj_debugname)} disabled={busy === `create:${p.obj_debugname}`}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-gold text-bg font-bold text-xs hover:bg-gold2 disabled:opacity-50">
                    {busy === `create:${p.obj_debugname}` ? "creating…" : "Create account & receive"}
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
                  <span className="ml-auto text-mute text-xs">minting…</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Holdings / deposit */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="display text-lg font-bold gold-text">3 · Your tokens — deposit back in-game</h2>
          <button onClick={refresh} className="text-mute text-xs hover:text-ink">refresh</button>
        </div>
        <p className="text-mute text-sm mt-2">Depositing burns the tokens and credits the items/GP to your character. Claim at the Exchange Clerk. You pay the network fee (~0.000005 SOL).</p>
        <div className="mt-3 space-y-2">
          {gpHolding && (() => {
            const whole = Number(gpHolding.base) / 10 ** GP_DECIMALS;
            return (
              <DepositRow key="gp" img={gp?.imageUri ?? null} name="GP" have={fmtGp(whole)}
                value={amts[GP_MINT] ?? ""} onChange={(v) => setAmts((a) => ({ ...a, [GP_MINT]: v }))}
                onDeposit={() => deposit(GP_MINT, true, whole)} busy={busy === `deposit:${GP_MINT}`} />
            );
          })()}
          {itemHoldings.map((h) => {
            const it = byMint.get(h.mint)!;
            const whole = Number(h.base) / 10 ** ITEM_DECIMALS;
            return (
              <DepositRow key={h.mint} img={it.imageUri} name={it.name} have={String(whole)}
                value={amts[h.mint] ?? ""} onChange={(v) => setAmts((a) => ({ ...a, [h.mint]: v }))}
                onDeposit={() => deposit(h.mint, false, whole)} busy={busy === `deposit:${h.mint}`} />
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

function DepositRow({ img, name, have, value, onChange, onDeposit, busy }: {
  img: string | null; name: string; have: string; value: string;
  onChange: (v: string) => void; onDeposit: () => void; busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2">
      <ItemImage src={img} alt={name} size={32} />
      <div className="text-sm min-w-0">
        <div className="text-ink truncate">{name}</div>
        <div className="text-mute text-xs">have {have}</div>
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="amount" inputMode="numeric"
        className="ml-auto w-24 bg-panel2 border border-line rounded-lg px-2 py-1.5 text-ink text-sm text-right font-mono focus:outline-none focus:border-gold" />
      <button onClick={onDeposit} disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-gold text-bg font-bold text-xs hover:bg-gold2 disabled:opacity-50">
        {busy ? "…" : "Deposit"}
      </button>
    </div>
  );
}
