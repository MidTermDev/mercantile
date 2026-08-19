"use client";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { gpBalance } from "@/lib/swap";
import { quoteLicense, notifyLicense, buildLicenseBurnTx, isLinked, type LicenseQuote } from "@/lib/bridge";
import { solscanTx } from "@/lib/constants";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

/** Buy a bot license: burn ~0.1 SOL worth of GP, which activates the linked game account. */
export function LicenseWidget() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [quote, setQuote] = useState<LicenseQuote | null>(null);
  const [gp, setGp] = useState<number | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { quoteLicense().then(setQuote).catch(() => setQuote(null)); }, []);
  useEffect(() => {
    if (!publicKey) { setGp(null); setLinked(null); return; }
    gpBalance(connection, publicKey).then(setGp).catch(() => setGp(null));
    isLinked(publicKey.toBase58()).then(setLinked).catch(() => setLinked(null));
  }, [publicKey, connection, done]);

  async function activate() {
    if (!publicKey || !quote) return;
    setBusy(true); setErr(null); setMsg(null); setSig(null);
    try {
      if (!username.trim()) throw new Error("enter your in-game username");
      if (gp != null && gp < quote.gp) throw new Error(`you need ${quote.gp.toLocaleString()} GP (you hold ${Math.floor(gp).toLocaleString()})`);
      const tx = buildLicenseBurnTx(publicKey, quote.gp);
      const s = await sendTransaction(tx, connection);
      setMsg("Burning GP — finalizing on-chain…");
      await connection.confirmTransaction(s, "finalized");
      setSig(s);
      const n = await notifyLicense(s, username.trim());
      if (!n.ok) throw new Error(`GP burned, but activation failed: ${n.error}`);
      setMsg(`Bot license active for ${n.username ?? username.trim()}! Your bots can now connect.`);
      setDone(true);
    } catch (e: any) {
      setErr(e?.message?.slice(0, 200) ?? "activation failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="card p-6 md:p-7">
      <h3 className="display text-2xl font-bold gold-text mb-1">Activate a bot license</h3>
      <p className="text-mute text-sm mb-5">
        Botting is welcome here — it just needs a license. Pay once by burning{" "}
        <b className="text-ink">{quote ? `${quote.gp.toLocaleString()} GP` : "…"}</b>
        {quote && <> (≈ {quote.sol} SOL)</>} and your account can run bots via the API. The GP is destroyed — a permanent sink that keeps the economy healthy.
      </p>

      {!connected ? (
        <WalletMultiButton style={{ width: "100%", justifyContent: "center" }} />
      ) : done ? (
        <div className="text-center py-4">
          <div className="text-4xl mb-2">✓</div>
          <p className="text-emerald font-semibold">{msg}</p>
          {sig && <a href={solscanTx(sig)} target="_blank" rel="noreferrer" className="text-gold linkline font-mono text-xs">burn tx on Solscan ↗</a>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between text-xs text-mute">
            <span>License price</span>
            <span className="font-mono text-ink">{quote ? `${quote.gp.toLocaleString()} GP` : "…"}</span>
          </div>
          <div className="flex justify-between text-xs text-mute">
            <span>Your GP</span>
            <span className="font-mono text-ink">{gp == null ? "…" : `${Math.floor(gp).toLocaleString()} GP`}</span>
          </div>
          <div>
            <label className="text-xs text-mute">In-game username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your character name"
              className="w-full mt-1 bg-panel border border-line rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:border-gold" />
          </div>
          {linked === false && (
            <p className="text-mute text-xs">This wallet isn&apos;t linked to a character yet — <a href="/wallet" className="gold-text linkline">link it first</a> so we can activate the right account.</p>
          )}
          <button onClick={activate} disabled={busy || linked === false || !quote}
            className="btn-gold w-full py-3 font-bold disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? "Activating…" : `Burn ${quote ? quote.gp.toLocaleString() : "…"} GP & activate`}
          </button>
          {msg && !done && <p className="text-xs text-emerald">{msg}{sig && <> · <a href={solscanTx(sig)} target="_blank" rel="noreferrer" className="text-gold linkline">Solscan ↗</a></>}</p>}
          {err && <p className="text-err text-xs break-all">{err}</p>}
        </div>
      )}
    </div>
  );
}
