import Link from "next/link";
import { CopyAddress } from "@/components/CopyAddress";
import { PriceTicker } from "@/components/PriceTicker";
import { PROGRAM_ID, GP_MINT, X_URL, GITHUB_URL } from "@/lib/constants";

export default function Landing() {
  return (
    <main>
      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-10">
        <div className="grid lg:grid-cols-[1.35fr_1fr] gap-10 items-center">
          <div>
            <h1 className="display text-5xl md:text-6xl font-extrabold gold-text mt-5 leading-[1.05]">
              A real economy,<br />on-chain.
            </h1>
            <p className="text-lg text-ink/85 mt-5 max-w-xl leading-relaxed">
              Every tradeable item in a 2004-era Gielinor is a token on Solana — priced by an open market,
              backed by real in-game labor, and traded by humans and AI agents alike.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/play" className="btn-gold px-6 py-3">Play now →</Link>
              <Link href="/exchange" className="btn-ghost px-6 py-3 text-ink">Open the Grand Exchange</Link>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn-ghost px-6 py-3 text-mute hover:text-ink">GitHub</a>
            </div>
            <div className="flex gap-8 mt-9">
              {[["1,374", "item markets"], ["1:1", "authentic XP · 0.6s ticks"], ["∞", "agent-playable"]].map(([n, l]) => (
                <div key={l}>
                  <div className="display text-3xl font-bold text-ink tnum">{n}</div>
                  <div className="text-mute text-xs mt-1 max-w-[9rem] leading-tight">{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative hidden lg:flex justify-center">
            <div className="absolute inset-0 blur-3xl opacity-30" style={{ background: "radial-gradient(circle at 50% 40%, #f2c33d, transparent 60%)" }} />
            <img src="/logo.png" alt="Mercantile" width={320} height={320} className="relative drop-shadow-[0_12px_40px_rgba(0,0,0,0.6)]" />
          </div>
        </div>
      </section>

      <PriceTicker />

      {/* ── Latest update (OSRS-style news, on parchment) ── */}
      <section className="max-w-6xl mx-auto px-4 pt-12">
        <div className="flex items-center gap-4 mb-5">
          <h2 className="banner display text-sm font-bold text-gold uppercase tracking-widest">Latest update</h2>
          <hr className="rule flex-1" />
          <Link href="/changelog" className="linkline text-mute hover:text-gold text-sm shrink-0">All updates →</Link>
        </div>
        <Link href="/changelog#multi-account-wallet" className="parchment block p-5 md:p-6 hover:brightness-[1.03] transition">
          <div className="flex items-center gap-5">
            <div className="shrink-0 w-16 h-16 rounded-md bg-[#00000018] border border-[#93724955] overflow-hidden flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mw-thumb.png" alt="" className="w-full h-full object-contain p-1" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#7a4a12] border border-[#93724977] rounded px-1.5 py-0.5">Wallet</span>
                <span className="text-[#6b5636] text-xs">20 August 2026</span>
              </div>
              <h3 className="display text-xl md:text-2xl font-bold text-[#5a3d0e] leading-tight">One Wallet, Many Characters</h3>
              <p className="text-[#4a3a22] text-sm mt-1 leading-snug">
                Link as many characters as you like to a single wallet, and pick which one to deposit to from a dropdown. Read the patch notes →
              </p>
            </div>
          </div>
        </Link>
      </section>

      {/* ── The pitch: what makes it different ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="banner display text-sm font-bold text-gold uppercase tracking-widest">Not another game token</h2>
          <hr className="rule flex-1" />
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { k: "01", t: "No faucet", d: "There is no printer. A token exists only because someone — a player or an agent — actually mined the ore, caught the fish, or killed the dragon. Withdraw mints it; deposit burns it. Supply mirrors the game." },
            { k: "02", t: "Real rates", d: "1:1 XP and 0.6-second ticks — the authentic 2004 grind, not a fast-track server. Scarcity is real because effort is real, so on-chain prices reflect genuine in-game labor." },
            { k: "03", t: "It plays itself", d: "Mercantile is agent-native. AI agents grab a key, grind, bank, and arbitrage the game's economy against the on-chain market around the clock. The labor force is autonomous." },
          ].map((c) => (
            <div key={c.k} className="card card-hover p-6">
              <div className="font-mono text-gold/70 text-sm">{c.k}</div>
              <h3 className="display text-xl font-bold text-ink mt-2">{c.t}</h3>
              <p className="text-mute text-sm mt-3 leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The bridge ── */}
      <section className="max-w-6xl mx-auto px-4 py-6">
        <div className="card p-8 md:p-10">
          <div className="flex items-center gap-4 mb-8">
            <h2 className="banner display text-sm font-bold text-gold uppercase tracking-widest">How the bridge works</h2>
            <hr className="rule flex-1" />
          </div>
          <div className="grid md:grid-cols-2 gap-10">
            <div>
              <div className="flex items-center gap-2 text-emerald font-semibold"><span className="text-lg">▲</span> Withdraw · game → chain</div>
              <p className="text-mute text-sm mt-3 leading-relaxed">
                At the in-game <span className="text-ink">Exchange Clerk</span>, send an item or GP to your linked wallet.
                The game debits your inventory and the on-chain program records a claimable balance — you mint it to your
                own wallet with a click, ready to trade.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-gold font-semibold"><span className="text-lg">▼</span> Deposit · chain → game</div>
              <p className="text-mute text-sm mt-3 leading-relaxed">
                Bring tokens back and the program <span className="text-ink">burns</span> them; the Clerk credits the items or
                GP into your character in-world. On-chain supply always equals what has left the game — nothing more.
              </p>
            </div>
          </div>
          <hr className="rule my-8" />
          <p className="text-mute text-sm">
            Every mint ends in <span className="font-mono gold-text">RSGP</span>, is a standard SPL token carrying the item's
            real in-game sprite, and is paired single-sided to GP in a Meteora market.
          </p>
        </div>
      </section>

      {/* ── Live on mainnet ── */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="flex items-center gap-4 mb-6">
          <h2 className="banner display text-sm font-bold text-gold uppercase tracking-widest">Live on Solana mainnet</h2>
          <hr className="rule flex-1" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="card p-5 flex flex-col gap-1.5">
            <span className="text-mute text-xs uppercase tracking-wider">Bridge program</span>
            <CopyAddress address={PROGRAM_ID} chars={6} />
          </div>
          <div className="card p-5 flex flex-col gap-1.5">
            <span className="text-mute text-xs uppercase tracking-wider">Gielinor GP</span>
            <CopyAddress address={GP_MINT} chars={6} />
          </div>
        </div>
        <div className="card p-8 mt-8 text-center">
          <h3 className="display text-2xl font-bold gold-text">Come watch the economy wake up.</h3>
          <div className="flex flex-wrap gap-3 justify-center mt-6">
            <Link href="/play" className="btn-gold px-6 py-3">Play now →</Link>
            <Link href="/agents" className="btn-ghost px-6 py-3 text-ink">Bring an agent</Link>
            <a href={X_URL} target="_blank" rel="noreferrer" className="btn-ghost px-6 py-3 text-mute hover:text-ink">@MercantileRS</a>
          </div>
        </div>
      </section>
    </main>
  );
}
