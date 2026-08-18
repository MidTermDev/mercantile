"use client";
import { useState } from "react";
import { registerAgent, type AgentKey as Key } from "@/lib/bridge";
import { GITHUB_URL } from "@/lib/constants";

export function AgentKey() {
  const [key, setKey] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function gen() {
    setBusy(true); setErr(null);
    try { setKey(await registerAgent()); }
    catch (e: any) { setErr(e?.message?.slice(0, 160) ?? "failed"); }
    finally { setBusy(false); }
  }

  if (!key) {
    return (
      <div className="card p-6 text-center">
        <p className="text-mute text-sm mb-4 max-w-md mx-auto">
          One click issues a fresh character + API key. No signup, no email. You get a ready-to-use
          <span className="font-mono text-ink"> bot.env</span> for the rs-sdk.
        </p>
        <button onClick={gen} disabled={busy}
          className="px-6 py-3 rounded-lg bg-gold text-bg font-bold hover:bg-gold2 transition disabled:opacity-50">
          {busy ? "Issuing…" : "Generate my agent key →"}
        </button>
        {err && <p className="text-err text-xs mt-3">{err}</p>}
      </div>
    );
  }

  const botEnv = `BOT_USERNAME=${key.username}\nPASSWORD=${key.apiKey}\nSERVER=${key.server}`;
  return (
    <div className="card p-6 space-y-4">
      <div className="rounded-lg border border-gold/50 bg-panel p-4">
        <p className="text-xs text-mute">⚠ Save this now — the key is shown only once.</p>
        <div className="mt-3 grid gap-2 text-sm">
          <Field label="Username" value={key.username} />
          <Field label="API key (password)" value={key.apiKey} />
          <Field label="Server" value={key.server} />
        </div>
      </div>

      <div>
        <p className="text-sm text-ink font-semibold mb-1">1 · Drop this into <span className="font-mono">bots/{key.username}/bot.env</span></p>
        <Copyable text={botEnv} />
      </div>

      <div className="text-sm text-mute space-y-1">
        <p className="text-ink font-semibold">2 · Run a bot</p>
        <p>Clone the SDK (<a href={GITHUB_URL} target="_blank" rel="noreferrer" className="gold-text underline">{GITHUB_URL.replace("https://github.com/", "")}</a>), then:</p>
        <pre className="rounded-lg border border-line bg-black/30 p-3 font-mono text-xs text-ink overflow-x-auto">bun install
bun bots/{key.username}/script.ts   # drives your bot via the gateway</pre>
        <p className="text-ink font-semibold mt-3">3 · Go on-chain (optional)</p>
        <p>Link a Solana wallet to this character on the <a href="/wallet" className="gold-text underline">Wallet</a> page, then withdraw items/GP and trade on the <a href="/exchange" className="gold-text underline">Grand Exchange</a> — same bridge as human players.</p>
      </div>

      <button onClick={() => setKey(null)} className="text-mute text-xs hover:text-ink">← issue another</button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-mute">{label}</span>
      <button onClick={() => navigator.clipboard?.writeText(value)} title="copy"
        className="font-mono text-ink text-xs truncate max-w-[60%] hover:text-gold">{value}</button>
    </div>
  );
}

function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="rounded-lg border border-line bg-black/30 p-3 font-mono text-xs text-ink overflow-x-auto whitespace-pre">{text}</pre>
      <button onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-panel2 border border-line hover:border-gold text-mute">
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
