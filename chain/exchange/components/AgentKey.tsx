"use client";
import { useState } from "react";
import { registerAgent, type AgentKey as Key } from "@/lib/bridge";
import { GITHUB_URL } from "@/lib/constants";

export function AgentKey() {
  const [key, setKey] = useState<Key | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const validName = name === "" || /^[a-zA-Z0-9_ ]{1,12}$/.test(name);

  async function gen() {
    if (!validName) { setErr("name must be 1–12 chars: letters, digits, spaces or underscores"); return; }
    setBusy(true); setErr(null);
    try { setKey(await registerAgent(name)); }
    catch (e: any) { setErr(e?.message?.slice(0, 160) ?? "failed"); }
    finally { setBusy(false); }
  }

  if (!key) {
    return (
      <div className="card p-6 text-center">
        <p className="text-mute text-sm mb-4 max-w-md mx-auto">
          Issue a fresh character + API key. No signup, no email. Pick a name or leave it blank for a random one —
          you get a ready-to-use <span className="font-mono text-ink">bot.env</span> for the rs-sdk.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center items-center max-w-md mx-auto">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) gen(); }}
            placeholder="agent name (optional, max 12)"
            className={`flex-1 min-w-0 w-full bg-panel border rounded-lg px-3 py-3 text-ink text-sm focus:outline-none ${validName ? "border-line focus:border-gold" : "border-err"}`} />
          <button onClick={gen} disabled={busy || !validName}
            className="shrink-0 px-6 py-3 rounded-lg bg-gold text-bg font-bold hover:bg-gold2 transition disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? "Issuing…" : "Get my agent key →"}
          </button>
        </div>
        {err && <p className="text-err text-xs mt-3">{err}</p>}
      </div>
    );
  }

  const botEnv = `BOT_USERNAME=${key.username}\nPASSWORD=${key.apiKey}\nSERVER=${key.server}\n# optional — lets an LLM play; get one at platform.deepseek.com\nDEEPSEEK_API_KEY=`;
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
        <p className="text-ink font-semibold">2 · Let an LLM play it — one command</p>
        <p>Clone the SDK (<a href={GITHUB_URL} target="_blank" rel="noreferrer" className="gold-text underline">{GITHUB_URL.replace("https://github.com/", "")}</a>), drop your <span className="font-mono">DeepSeek</span> key in the <span className="font-mono">bot.env</span> above, then:</p>
        <pre className="rounded-lg border border-line bg-black/30 p-3 font-mono text-xs text-ink overflow-x-auto">bun install
DEEPSEEK_API_KEY=sk-… bun agent/agent.ts {key.username}</pre>
        <p>This starts the game client, connects the agent, skips the tutorial, and opens a <b className="text-ink">watch &amp; prompt console</b> at <span className="font-mono">localhost:8799</span> — steer it live (&ldquo;chop yews and bank them&rdquo;) and watch every action. No key? It still runs in a demo mode so you can see the loop.</p>
        <p className="text-mute/70 text-xs">Prefer to write your own logic? Start the client with <span className="font-mono">bun server/webclient/src/lite/runner.ts {key.username}</span>, then run any <span className="font-mono">bun bots/{key.username}/script.ts</span> against the gateway.</p>
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
