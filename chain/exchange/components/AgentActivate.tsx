"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { gpBalance } from "@/lib/swap";
import { quoteLicense, notifyLicense, buildLicenseBurnTx, agentLink, agentLinkMessage, type LicenseQuote } from "@/lib/bridge";
import { solscanTx } from "@/lib/constants";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Activate a bot license for a freshly-issued agent account: links the wallet to the account
 *  using its apiKey (no in-game code), then burns ~0.1 SOL of GP to license it. */
export function AgentActivate({ username, apiKey }: { username: string; apiKey: string }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signMessage, connected } = useWallet();
  const [quote, setQuote] = useState<LicenseQuote | null>(null);
  const [gp, setGp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { quoteLicense().then(setQuote).catch(() => setQuote(null)); }, []);
  useEffect(() => {
    if (!publicKey) { setGp(null); return; }
    gpBalance(connection, publicKey).then(setGp).catch(() => setGp(null));
  }, [publicKey, connection, done]);

  async function activate() {
    if (!publicKey || !quote) return;
    setBusy(true); setErr(null); setSig(null);
    try {
      if (!signMessage) throw new Error("connect a wallet that can sign messages");
      if (gp != null && gp < quote.gp) throw new Error(`you need ${quote.gp.toLocaleString()} GP (you hold ${Math.floor(gp).toLocaleString()}) — buy some on the Exchange`);

      setStep("Linking this wallet to your bot…");
      const linkSig = await signMessage(new TextEncoder().encode(agentLinkMessage(username, publicKey.toBase58())));
      const l = await agentLink(username, apiKey, publicKey.toBase58(), b64(linkSig));
      if (!l.ok) throw new Error(`link failed: ${l.error}`);

      setStep(`Burning ${quote.gp.toLocaleString()} GP…`);
      const tx = buildLicenseBurnTx(publicKey, quote.gp);
      const s = await sendTransaction(tx, connection);
      setStep("Finalizing on-chain…");
      await connection.confirmTransaction(s, "finalized");
      setSig(s);
      setStep("Activating license…");
      const n = await notifyLicense(s, username);
      if (!n.ok) throw new Error(`GP burned, but activation failed: ${n.error}`);
      setStep(null);
      setDone(true);
    } catch (e: any) {
      setErr(e?.message?.slice(0, 220) ?? "activation failed");
      setStep(null);
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald/50 bg-panel p-4 text-center">
        <div className="text-3xl mb-1">✓</div>
        <p className="text-emerald font-semibold text-sm"><span className="font-mono text-ink">{username}</span> is licensed — your bot can now connect.</p>
        {sig && <a href={solscanTx(sig)} target="_blank" rel="noreferrer" className="text-gold linkline font-mono text-xs">burn tx on Solscan ↗</a>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gold/50 bg-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-ink font-semibold text-sm">⚖ Required — license this bot to connect</p>
        <span className="chip text-[10px]">{quote ? `${quote.gp.toLocaleString()} GP` : "…"}</span>
      </div>
      <p className="text-mute text-xs leading-relaxed">
        The bot API requires a one-time license per account (~0.1 SOL worth of GP, burned). This links your wallet to{" "}
        <span className="font-mono text-ink">{username}</span> and activates it. <a href="/license" className="gold-text linkline">What&apos;s this?</a>
      </p>
      {!connected ? (
        <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />
      ) : (
        <>
          <div className="flex justify-between text-xs text-mute">
            <span>Your GP</span>
            <span className="font-mono text-ink">{gp == null ? "…" : `${Math.floor(gp).toLocaleString()} GP`}</span>
          </div>
          <button onClick={activate} disabled={busy || !quote}
            className="btn-gold w-full py-2.5 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? (step ?? "Activating…") : `Burn ${quote ? quote.gp.toLocaleString() : "…"} GP & activate`}
          </button>
          {step && !err && <p className="text-xs text-emerald">{step}{sig && <> · <a href={solscanTx(sig)} target="_blank" rel="noreferrer" className="text-gold linkline">Solscan ↗</a></>}</p>}
          <p className="text-mute/70 text-[11px]">No GP? Buy some on the <a href="/exchange" className="gold-text linkline">Exchange</a> first (needs a little SOL for fees).</p>
        </>
      )}
      {err && <p className="text-err text-xs break-all">{err}</p>}
    </div>
  );
}
