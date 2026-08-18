import Link from "next/link";
import { GAME_URL, LOCAL_GAME_URL } from "@/lib/constants";

export const metadata = {
  title: "Play · Mercantile Exchange",
  description:
    "Play the authentic 2004-rate RuneScape world in your browser, link a Solana wallet, and bridge items and GP on-chain.",
};

export default function Play() {
  const hosted = GAME_URL.length > 0;
  const playUrl = hosted ? GAME_URL : LOCAL_GAME_URL;

  return (
    <main className="max-w-6xl mx-auto px-4">
      {/* Hero */}
      <section className="pt-14 pb-8 text-center flex flex-col items-center">
        <h1 className="display text-4xl md:text-5xl font-extrabold gold-text tracking-wide mt-5">Play Mercantile</h1>
        <p className="text-ink/85 mt-4 max-w-2xl leading-relaxed">
          A reverse-engineered 2004-era Gielinor at <b className="text-ink">authentic 1:1 XP and 0.6s ticks</b>. Play in
          your browser, then link a Solana wallet at the in-game <b className="text-ink">Exchange Clerk</b> — found at
          every bank — to move items and GP on-chain.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-7">
          <a href={playUrl} target="_blank" rel="noreferrer" className="btn-gold px-6 py-3">Open the game in a new tab →</a>
          <Link href="/ai" className="btn-ghost px-6 py-3 text-ink">Let an AI play →</Link>
          <Link href="/exchange" className="btn-ghost px-6 py-3 text-mute hover:text-ink">Grand Exchange</Link>
        </div>
        {!hosted && (
          <p className="text-mute/70 text-xs mt-4 max-w-xl">
            This build points at a local world (<span className="font-mono">{LOCAL_GAME_URL}</span>).
          </p>
        )}
      </section>

      {/* Embedded client */}
      <section className="card p-2 md:p-3 mb-14">
        <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "4 / 3" }}>
          <iframe src={playUrl} title="Mercantile game client" className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen; clipboard-read; clipboard-write" />
        </div>
        <p className="text-mute/70 text-xs mt-2 px-2 text-center">
          If the client doesn&apos;t load here, <a href={playUrl} target="_blank" rel="noreferrer" className="gold-text linkline">open it in a new tab</a> — some browsers block cross-origin game canvases in an iframe.
        </p>
      </section>

      {/* Getting started */}
      <section className="mb-14">
        <div className="flex items-baseline gap-4 mb-6">
          <h2 className="display text-2xl font-bold gold-text">Getting started</h2>
          <hr className="rule flex-1" />
        </div>
        <ol className="grid md:grid-cols-2 gap-4">
          {[
            { t: "Create a character", d: "Open the game and log in — accounts create automatically on first login. You start on Tutorial Island; complete or skip it to reach the mainland." },
            { t: "Play the authentic grind", d: "Everything runs at 2004 rates — normal XP, normal ticks, members content on. Chop, mine, fish, fight, cook, and bank as the game was meant to be. Scarcity and effort are real — that's what gives the on-chain prices meaning." },
            { t: "Find the Exchange Clerk", d: "There's a Clerk at every bank in the game. She's the bridge between your character and the chain — talk to her, or use an item on her to send it on-chain." },
            { t: "Link your Solana wallet", d: "Do it from the Wallet page in three clicks (see below). One wallet per character; re-linking replaces the old one." },
            { t: "Bridge both ways", d: "Use an item on the Clerk (or pick GP) to withdraw → it becomes a claimable token you mint to your wallet. Deposit tokens back and they're burned, returning the goods in-world." },
            { t: "Trade on the Grand Exchange", d: "Buy and sell any tokenized item for GP on an open market — or let an AI agent do it. Prices reflect real in-game labor." },
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

      {/* Link wallet (current flow) */}
      <section className="card p-6 md:p-8 mb-14">
        <div className="flex items-baseline gap-4 mb-4">
          <h2 className="display text-2xl font-bold gold-text">Linking your wallet</h2>
          <hr className="rule flex-1" />
        </div>
        <p className="text-mute text-sm mb-6">
          Linking proves you control both the character and the wallet. Nothing but a signature leaves your wallet — no
          private key, no token approval, and <b className="text-ink">no typing your address in-game</b>.
        </p>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { n: "1", t: "Get a code in-game", d: <>Talk to the <b className="text-ink">Exchange Clerk</b> at any bank and choose <b className="text-ink">“Link my Solana wallet.”</b> She hands back a short one-time code (valid ~10 min).</> },
            { n: "2", t: "Open the Wallet page", d: <>Come to the <Link href="/wallet" className="gold-text linkline">Wallet</Link> page and connect your Solana wallet — the address is read from your wallet, so there's nothing to copy.</> },
            { n: "3", t: "Enter code & sign", d: <>Type your username + the code and click <b className="text-ink">Sign &amp; link</b>. Your character and wallet are bound, and the Clerk's withdraw/deposit options unlock.</> },
          ].map((s) => (
            <div key={s.n}>
              <div className="font-mono text-gold/70 text-sm">0{s.n}</div>
              <h3 className="font-semibold text-ink mt-1">{s.t}</h3>
              <p className="text-mute text-sm mt-2 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link href="/wallet" className="btn-gold px-5 py-2.5 inline-block">Go to the Wallet page →</Link>
        </div>
      </section>

      {/* Authentic rates */}
      <section className="card p-6 md:p-7 mb-16 border-gold/40">
        <h2 className="display text-xl font-bold gold-text">Real rates, real market</h2>
        <p className="text-mute mt-2 leading-relaxed max-w-3xl">
          Mercantile is a <b className="text-ink">1:1 normal-rate</b> world — not a high-XP shortcut server. What you
          bridge to the chain took genuine in-game labor to earn, so the Grand Exchange price of an item reflects real
          scarcity. Build wealth in-world, bridge it out, and let the market decide what it&apos;s worth.
        </p>
      </section>
    </main>
  );
}
