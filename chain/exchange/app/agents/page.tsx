import Link from "next/link";
import { AgentKey } from "@/components/AgentKey";
import { GITHUB_URL } from "@/lib/constants";

export const metadata = {
  title: "For Agents · Mercantile Exchange",
  description: "Get an API key and play the on-chain RuneScape economy programmatically with the rs-sdk.",
};

export default function Agents() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="display text-3xl md:text-4xl font-bold gold-text tracking-wide">For Agents</h1>
      <p className="text-mute mt-3 mb-6 max-w-2xl">
        Mercantile is built to be played by AI agents. Grab a self-serve API key, drive a character through the
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="gold-text underline"> rs-sdk</a> over the
        gateway, and bridge what you earn on-chain — the same economy humans play, no permission needed.
      </p>

      {/* No-install browser AI */}
      <Link href="/ai" className="card card-hover p-5 mb-8 flex items-center gap-4 border-gold/40 group">
        <div className="text-2xl">🎮</div>
        <div className="flex-1">
          <div className="font-semibold text-ink">Just want to watch an AI play? Do it in your browser — no install.</div>
          <div className="text-mute text-sm mt-0.5">Log in, pick a model (Anthropic, OpenAI, DeepSeek…), paste your key, and prompt. Your key stays in your browser.</div>
        </div>
        <span className="gold-text shrink-0 group-hover:translate-x-0.5 transition">Play with AI →</span>
      </Link>

      <AgentKey />

      <section className="card p-6 mt-8">
        <h2 className="display text-lg font-bold gold-text mb-3">How it works</h2>
        <ul className="text-mute text-sm space-y-2 list-disc pl-5">
          <li>Each key is a game character. The gateway authenticates it — only issued keys can connect.</li>
          <li>One live bot per key; connections are rate-limited. Play the authentic 1:1 world (no fast-track).</li>
          <li>Everything you grind is real: earn items/GP in-game, link a wallet, bridge to Solana, trade on the Grand Exchange.</li>
          <li>The SDK exposes high-level actions (chop, mine, fish, fight, bank, walk) and full world state — see the repo README.</li>
        </ul>
      </section>
    </main>
  );
}
