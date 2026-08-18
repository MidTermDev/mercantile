import Link from "next/link";
import { CopyAddress } from "@/components/CopyAddress";
import { PROGRAM_ID, GP_MINT, X_URL, GITHUB_URL } from "@/lib/constants";

export default function Landing() {
  return (
    <main className="max-w-6xl mx-auto px-4">
      {/* Hero */}
      <section className="pt-16 pb-14 text-center flex flex-col items-center">
        <img src="/logo.png" alt="Mercantile" width={140} height={140} className="drop-shadow-[0_6px_24px_rgba(0,0,0,0.5)]" />
        <h1 className="display text-5xl md:text-6xl font-bold gold-text mt-6 tracking-wide">Mercantile</h1>
        <p className="text-xl text-ink/90 mt-3 max-w-2xl">The on-chain, agent-played RuneScape economy.</p>
        <p className="text-mute mt-4 max-w-2xl">
          Every tradeable item in a 2004-era Gielinor is a token on Solana, priced against tokenized
          <span className="gold-text"> GP</span> in automated market-maker pools. Players and AI agents move value
          between the game and the chain — and the market decides what everything is worth.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-8">
          <Link href="/exchange" className="px-6 py-3 rounded-lg bg-gold text-bg font-bold hover:bg-gold2 transition">
            Open the Grand Exchange →
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="px-6 py-3 rounded-lg border border-line hover:border-gold transition">GitHub</a>
          <a href={X_URL} target="_blank" rel="noreferrer" className="px-6 py-3 rounded-lg border border-line hover:border-gold transition">@MercantileRS</a>
        </div>
      </section>

      {/* Normal-rates banner */}
      <section className="card p-6 md:p-7 mb-12 border-gold/40">
        <div className="flex items-start gap-4">
          <div className="text-3xl">⚖️</div>
          <div>
            <h2 className="display text-xl font-bold gold-text">A real economy — 1:1, normal rates</h2>
            <p className="text-mute mt-2">
              Mercantile runs on <b className="text-ink">standard XP rates and standard game tick rates</b> — the authentic
              2004 grind. This is <b className="text-ink">not</b> a fast-track / high-XP private server. Scarcity is real, effort is real,
              so the on-chain price of a rune platebody or a lobster reflects genuine in-game labor rather than an inflated shortcut.
            </p>
          </div>
        </div>
      </section>

      {/* Vision */}
      <section className="grid md:grid-cols-3 gap-4 mb-12">
        {[
          { t: "An open economy", d: "Anyone — human or agent — can play, earn, and trade. Item and GP markets are permissionless AMM pools; price is discovered by participants, not set by an operator." },
          { t: "Built for agents", d: "The world is a reverse-engineered RuneScape (Lost City) driven by the rs-sdk bot framework. AI agents grind, bank, and arbitrage between the game and the chain as first-class players." },
          { t: "Game ⇄ chain, both ways", d: "Withdraw items or GP from the game and they’re minted on Solana. Deposit tokens back and they’re burned, returning the goods in-world. The game stays the source of truth." },
        ].map((c) => (
          <div key={c.t} className="card p-5">
            <h3 className="display font-bold text-lg text-ink">{c.t}</h3>
            <p className="text-mute text-sm mt-2 leading-relaxed">{c.d}</p>
          </div>
        ))}
      </section>

      {/* How the bridge works */}
      <section className="card p-6 md:p-8 mb-12">
        <h2 className="display text-2xl font-bold gold-text mb-6">How the bridge works</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-ink flex items-center gap-2"><span className="text-emerald">▲</span> Withdraw — game → chain (mint)</h3>
            <p className="text-mute text-sm mt-2">Visit the in-game <b className="text-ink">Exchange Clerk</b>, link your Solana wallet, and withdraw items or GP.
              The game debits your inventory and the on-chain program <b className="text-ink">mints</b> the matching tokens to your wallet — ready to trade on the Grand Exchange.</p>
          </div>
          <div>
            <h3 className="font-semibold text-ink flex items-center gap-2"><span className="text-gold">▼</span> Deposit — chain → game (burn)</h3>
            <p className="text-mute text-sm mt-2">Bring tokens back by depositing them. The program <b className="text-ink">burns</b> them on-chain, and the Clerk credits the
              items or GP back into your character in-world. Supply on Solana always mirrors what has left the game.</p>
          </div>
        </div>
        <p className="text-mute text-sm mt-6">
          Every token’s mint address ends in <span className="gold-text font-mono">RSGP</span>, is a standard SPL token with Metaplex
          metadata and the item’s real in-game sprite, and is paired single-sided to GP in a Meteora DAMM v2 pool.
        </p>
      </section>

      {/* Live on mainnet */}
      <section className="card p-6 md:p-8 mb-16">
        <h2 className="display text-2xl font-bold gold-text mb-4">Live on Solana mainnet</h2>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-mute">Bridge program</span>
            <CopyAddress address={PROGRAM_ID} chars={6} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-mute">Gielinor GP token</span>
            <CopyAddress address={GP_MINT} chars={6} />
          </div>
        </div>
        <Link href="/exchange" className="inline-block mt-6 px-5 py-2.5 rounded-lg bg-gold text-bg font-bold hover:bg-gold2 transition">
          Browse all item markets →
        </Link>
      </section>
    </main>
  );
}
