"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { linkWallet, linkMessage } from "@/lib/bridge";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// A clean, guided wallet-linking flow. No in-game address typing: the player gets
// a code from the Exchange Clerk, and the wallet address comes from the connected
// wallet here.
export function LinkModal({ onClose, onLinked }: { onClose: () => void; onLinked: () => void }) {
  const { publicKey, connected, signMessage } = useWallet();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      if (!publicKey || !signMessage) throw new Error("connect a wallet that can sign messages");
      if (!username.trim()) throw new Error("enter your in-game username");
      if (!code.trim()) throw new Error("enter the code from the Exchange Clerk");
      const sig = await signMessage(new TextEncoder().encode(linkMessage(username.trim(), code.trim())));
      const res = await linkWallet(username.trim(), code.trim(), publicKey.toBase58(), b64(sig));
      if (!res.ok) throw new Error(res.error);
      setDone(true);
      onLinked();
    } catch (e: any) {
      setErr(e?.message?.slice(0, 200) ?? "linking failed");
    } finally { setBusy(false); }
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 md:p-7 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-mute hover:text-ink text-xl leading-none">×</button>
        <h2 className="display text-2xl font-bold gold-text mb-1">Link your wallet</h2>
        <p className="text-mute text-sm mb-5">Bind this Solana wallet to your character. Nothing but a signature leaves your wallet — no address typing in-game, no approvals.</p>

        {done ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✓</div>
            <p className="text-emerald font-semibold">Linked!</p>
            <p className="text-mute text-sm mt-1">{username} ↔ {publicKey?.toBase58().slice(0, 4)}…{publicKey?.toBase58().slice(-4)}</p>
            <button onClick={onClose} className="mt-5 px-5 py-2 rounded-lg bg-gold text-bg font-bold hover:bg-gold2">Done</button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Step 1 */}
            <Step n={1} title="Connect this wallet" done={connected}>
              {connected
                ? <p className="text-mute text-sm">Connected as <span className="font-mono text-ink">{publicKey?.toBase58().slice(0, 6)}…{publicKey?.toBase58().slice(-4)}</span></p>
                : <div className="mt-1"><WalletMultiButton /></div>}
            </Step>

            {/* Step 2 */}
            <Step n={2} title="Get your code in-game">
              <p className="text-mute text-sm">
                Log in and talk to the <b className="text-ink">Exchange Clerk</b> at any bank. Choose
                {" "}<b className="text-ink">“Link my Solana wallet”</b> — you&apos;ll get an 8-character code (valid 10 minutes).
                No need to type your address anywhere.
              </p>
            </Step>

            {/* Step 3 */}
            <Step n={3} title="Enter username + code, then sign">
              <div className="flex flex-wrap gap-2 mt-1">
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="in-game username"
                  className="flex-1 min-w-[8rem] bg-panel border border-line rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:border-gold" />
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE"
                  className="w-28 bg-panel border border-line rounded-lg px-3 py-2 text-ink text-sm font-mono tracking-widest text-center focus:outline-none focus:border-gold" />
              </div>
            </Step>

            {err && <p className="text-err text-xs break-all">{err}</p>}
            <button onClick={submit} disabled={busy || !connected}
              className="w-full py-3 rounded-lg bg-gold text-bg font-bold hover:bg-gold2 transition disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? "Signing…" : "Sign & link wallet"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${done ? "bg-emerald text-bg" : "bg-gold text-bg"}`}>
        {done ? "✓" : n}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-ink text-sm">{title}</h3>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}
