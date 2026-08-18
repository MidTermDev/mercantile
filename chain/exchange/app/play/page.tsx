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
        <h1 className="display text-4xl md:text-5xl font-bold gold-text tracking-wide">Play Mercantile</h1>
        <p className="text-mute mt-4 max-w-2xl">
          A reverse-engineered 2004-era Gielinor, running at <b className="text-ink">authentic 1:1 XP and 0.6s tick
          rates</b>. Play free in your browser — no download. Link a Solana wallet at the in-game{" "}
          <b className="text-ink">Exchange Clerk</b> to move items and GP on-chain.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-7">
          <a
            href={playUrl}
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 rounded-lg bg-gold text-bg font-bold hover:bg-gold2 transition"
          >
            Open the game in a new tab →
          </a>
          <Link href="/exchange" className="px-6 py-3 rounded-lg border border-line hover:border-gold transition">
            Grand Exchange
          </Link>
        </div>
        {!hosted && (
          <p className="text-mute/70 text-xs mt-4 max-w-xl">
            This build points at a local world (<span className="font-mono">{LOCAL_GAME_URL}</span>). Once the public
            world is live, the button above opens it directly.
          </p>
        )}
      </section>

      {/* Embedded client */}
      <section className="card p-2 md:p-3 mb-12">
        <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: "4 / 3" }}>
          <iframe
            src={playUrl}
            title="Mercantile game client"
            className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen; clipboard-read; clipboard-write"
          />
        </div>
        <p className="text-mute/70 text-xs mt-2 px-2 text-center">
          If the client doesn&apos;t load here, use{" "}
          <a href={playUrl} target="_blank" rel="noreferrer" className="gold-text underline">
            open in a new tab
          </a>{" "}
          — some browsers block cross-origin game canvases in an iframe.
        </p>
      </section>

      {/* Getting started */}
      <section className="card p-6 md:p-8 mb-12">
        <h2 className="display text-2xl font-bold gold-text mb-6">Getting started</h2>
        <ol className="space-y-5">
          {[
            {
              t: "Create a character",
              d: "Open the game and log in — accounts are created automatically on first login. You spawn on Tutorial Island; complete or skip it to reach the mainland.",
            },
            {
              t: "Play the authentic grind",
              d: "Everything runs at 2004 rates — normal XP, normal tick speed, members content on. Chop, mine, fish, fight, and bank exactly as the game was meant to be played. Scarcity and effort are real, which is what gives the on-chain prices meaning.",
            },
            {
              t: "Find the Exchange Clerk",
              d: "Head to the Varrock west bank. The Exchange Clerk stands among the bankers — this is the bridge between your character and the chain.",
            },
            {
              t: "Link your Solana wallet",
              d: "See the wallet-linking steps below. One wallet per character; re-linking replaces the old one.",
            },
            {
              t: "Bridge in both directions",
              d: "Use an item on the Clerk (or pick GP) to withdraw — the game debits your inventory and the on-chain program mints matching tokens to your wallet. Deposit tokens back and they’re burned, returning the goods in-world.",
            },
          ].map((s, i) => (
            <li key={s.t} className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-gold text-bg font-bold flex items-center justify-center">
                {i + 1}
              </div>
              <div>
                <h3 className="font-semibold text-ink">{s.t}</h3>
                <p className="text-mute text-sm mt-1 leading-relaxed">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Link wallet */}
      <section className="card p-6 md:p-8 mb-12">
        <h2 className="display text-2xl font-bold gold-text mb-4">Linking your wallet</h2>
        <p className="text-mute text-sm mb-5">
          Linking proves you control both the character and the wallet. Nothing but a signature ever leaves your wallet
          — the bridge never asks for a private key or a token approval to link.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-ink flex items-center gap-2">
              <span className="text-gold">1</span> Request a code in-game
            </h3>
            <p className="text-mute text-sm mt-2">
              Talk to the Exchange Clerk and choose <b className="text-ink">Link wallet</b>, or type this command in the
              chat box:
            </p>
            <div className="mt-3 rounded-lg border border-line bg-black/30 px-3 py-2 font-mono text-sm text-ink">
              ::linkwallet &lt;your-wallet-address&gt;
            </div>
            <p className="text-mute text-sm mt-2">
              The Clerk hands back a short one-time code (valid ~10 minutes).
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-ink flex items-center gap-2">
              <span className="text-gold">2</span> Confirm from your wallet
            </h3>
            <p className="text-mute text-sm mt-2">
              Open the bridge link page (<span className="font-mono">/bridge/link</span> on the game host), connect your
              Solana wallet, and sign the linking message with the code. Once verified, your character and wallet are
              bound and the Clerk’s withdraw/deposit options unlock.
            </p>
          </div>
        </div>
      </section>

      {/* Authentic rates reminder */}
      <section className="card p-6 md:p-7 mb-16 border-gold/40">
        <div className="flex items-start gap-4">
          <div className="text-3xl">⚖️</div>
          <div>
            <h2 className="display text-xl font-bold gold-text">Real rates, real market</h2>
            <p className="text-mute mt-2">
              Mercantile is a <b className="text-ink">1:1 normal-rate</b> world — not a high-XP shortcut server. What you
              withdraw to the chain took genuine in-game labor to earn, so the Grand Exchange price of an item reflects
              real scarcity. Build wealth in-world, bridge it out, and let the market decide what it’s worth.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
