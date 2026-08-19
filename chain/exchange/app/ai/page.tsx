import Link from "next/link";
import { GAME_URL, LOCAL_GAME_URL, GITHUB_URL } from "@/lib/constants";

export const metadata = {
  title: "Play with AI · Mercantile",
  description:
    "Let a language model play your Mercantile character right in your browser. Log in, pick any model (Anthropic, OpenAI, DeepSeek…), and steer it with plain-English prompts. Your API key never leaves your browser.",
};

function aiUrl(): string {
  const src = GAME_URL || LOCAL_GAME_URL;
  let origin = src;
  try { origin = new URL(src).origin; } catch { origin = src.replace(/\/rs2\.cgi.*$/, ""); }
  return `${origin}/bot?ai=1`;
}

export default function PlayAi() {
  const url = aiUrl();
  const repo = GITHUB_URL.replace("https://github.com/", "");

  return (
    <main className="max-w-6xl mx-auto px-4">
      {/* Hero */}
      <section className="pt-14 pb-8 text-center flex flex-col items-center">
        <h1 className="display text-4xl md:text-5xl font-extrabold gold-text tracking-wide mt-5">Play with AI</h1>
        <p className="text-ink/85 mt-4 max-w-2xl leading-relaxed">
          Let a language model play your character. Log in below, pick any model — <b className="text-ink">Anthropic,
          OpenAI, DeepSeek</b>, or your own endpoint — paste your API key, and steer it with plain-English prompts like
          <span className="text-ink"> “chop oaks and bank them.”</span> Everything runs in this browser; your key is sent
          only to the provider you choose.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-7">
          <a href={url} target="_blank" rel="noreferrer" className="btn-gold px-6 py-3">Open in a new tab →</a>
          <Link href="/agents" className="btn-ghost px-6 py-3 text-ink">Get an agent key</Link>
          <Link href="/guide" className="btn-ghost px-6 py-3 text-mute hover:text-ink">Full guide</Link>
        </div>
      </section>

      {/* Embedded client */}
      <section className="card p-2 md:p-3 mb-14">
        <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "4 / 3" }}>
          <iframe src={url} title="Mercantile AI player" className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen; clipboard-read; clipboard-write" />
        </div>
        <p className="text-mute/70 text-xs mt-2 px-2 text-center">
          The AI panel appears at the top-right after you log in. If the client doesn&apos;t load here,{" "}
          <a href={url} target="_blank" rel="noreferrer" className="gold-text linkline">open it in a new tab</a>.
        </p>
      </section>

      {/* How it works */}
      <section className="mb-14">
        <div className="flex items-baseline gap-4 mb-6">
          <h2 className="display text-2xl font-bold gold-text">How it works</h2>
          <hr className="rule flex-1" />
        </div>
        <ol className="grid md:grid-cols-2 gap-4">
          {[
            { t: "Log in", d: "Use any character — log in on the client above (accounts create on first login). Playing in the browser like this needs no bot license; that's only for the scripted SDK/gateway path below." },
            { t: "Pick a model", d: "In the AI panel, choose a provider (Anthropic, OpenAI, DeepSeek, or a custom OpenAI-compatible endpoint) and a model. DeepSeek is popular for being fast and cheap." },
            { t: "Paste your API key", d: "Your key is stored only in this browser (local storage) and sent directly to the provider — it never touches our servers." },
            { t: "Prompt & watch", d: "Type a goal and press Start. The model decides each move; the action log shows what it does. Change the goal any time, or hit Stop." },
          ].map((s, i) => (
            <li key={s.t} className="card p-5 flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full btn-gold flex items-center justify-center text-sm">{i + 1}</div>
              <div>
                <h3 className="font-semibold text-ink">{s.t}</h3>
                <p className="text-mute text-sm mt-1 leading-relaxed">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Autonomous note */}
      <section className="card p-6 md:p-8 mb-16 border-gold/40">
        <h2 className="display text-xl font-bold gold-text">Want it running around the clock?</h2>
        <p className="text-mute mt-2 leading-relaxed max-w-3xl">
          This in-browser player runs while the tab is open — perfect for jumping in and steering. For{" "}
          <b className="text-ink">autonomous, background play</b> (keeps grinding when you&apos;re away, scriptable, your
          own logic), clone the SDK and run the one-command harness:
        </p>
        <pre className="rounded-lg border border-line bg-black/30 p-4 font-mono text-xs md:text-sm text-ink overflow-x-auto mt-4">git clone {GITHUB_URL}
bun install
DEEPSEEK_API_KEY=sk-… bun agent/agent.ts &lt;your-character&gt;</pre>
        <p className="text-mute text-sm mt-3">
          It starts the game client, connects the agent, and opens a local watch/prompt console. See the{" "}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="gold-text linkline">{repo}</a> repo and the{" "}
          <Link href="/guide" className="gold-text linkline">guide</Link> for details.
        </p>
        <p className="text-mute text-sm mt-3 rounded-lg border border-gold/30 bg-panel px-3 py-2">
          ⚖ The SDK/gateway path requires a one-time <Link href="/license" className="gold-text linkline">bot license</Link> (~0.1 SOL of GP, burned) on the account it drives — get a key and activate it on the{" "}
          <Link href="/agents" className="gold-text linkline">For Agents</Link> page.
        </p>
      </section>
    </main>
  );
}
