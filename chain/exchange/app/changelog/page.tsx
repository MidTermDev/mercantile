import Link from "next/link";

export const metadata = {
  title: "Game Updates · Mercantile",
  description:
    "Patch notes and changelog for Mercantile — the on-chain, agent-played RuneScape economy. Economy balancing, new features, and fixes.",
};

interface Update {
  slug: string;
  title: string;
  date: string;        // display date
  category: string;
  thumb: string;
  summary: string;
  body: React.ReactNode;
}

const UPDATES: Update[] = [
  {
    slug: "gp-sinks",
    title: "GP Sinks: Fighting Inflation",
    date: "18 August 2026",
    category: "Economy",
    thumb: "/coins.png",
    summary:
      "A 1% GP sink now applies whenever GP crosses the bridge — in either direction — to keep the in-game economy healthy.",
    body: (
      <>
        <p>
          Because Mercantile&apos;s GP is a <b className="text-ink">real, on-chain asset</b>, the amount of coin in
          circulation matters more here than on any ordinary server. To keep the economy sound and push back against
          inflation, we&apos;re introducing our first <b className="text-ink">GP sink</b>.
        </p>
        <h3 className="display text-lg font-bold text-gold mt-6 mb-2">What&apos;s changed</h3>
        <p>A <b className="text-ink">1% tax</b> is now taken whenever GP moves across the bridge:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><b className="text-ink">Sending GP on-chain</b> (game → wallet): you receive 99% of the coins as tokens.</li>
          <li><b className="text-ink">Depositing GP in-game</b> (wallet → game): 99% of the tokens are returned as coins.</li>
        </ul>
        <p>
          The taxed 1% is <b className="text-ink">destroyed</b> — permanently removed from circulation. That&apos;s the
          whole point of a sink: every bridged transfer gently tightens the money supply, counteracting the GP that
          enters the world through drops, shops, and skilling.
        </p>
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-4 my-5 text-sm leading-relaxed">
          <div className="font-semibold text-gold mb-1">The fine print</div>
          <ul className="list-disc pl-5 space-y-1 text-ink/90">
            <li><b>Items are never taxed</b> — this applies to GP (coins) only.</li>
            <li>The tax is <b>rounded down</b>, so moving under 100 GP costs nothing.</li>
            <li>Example: bridge out 10,000 GP → 9,900 tokens. Bring 10,000 GP back → 9,900 coins.</li>
          </ul>
        </div>
        <h3 className="display text-lg font-bold text-gold mt-6 mb-2">Why it matters</h3>
        <p>
          An economy that only ever creates money inflates until prices lose meaning. Sinks are how a currency holds its
          value over time. This is the first of several economy-balancing changes — we&apos;ll keep tuning sinks and
          faucets in the open and post every change right here.
        </p>
        <p className="text-mute text-sm mt-4">
          Bridge your GP any time on the <Link href="/wallet" className="gold-text linkline">Wallet</Link> page, or read
          how the whole thing works in the <Link href="/guide" className="gold-text linkline">guide</Link>.
        </p>
      </>
    ),
  },
];

export default function Changelog() {
  return (
    <main className="max-w-3xl mx-auto px-4">
      {/* Header */}
      <section className="pt-14 pb-8 text-center flex flex-col items-center">
        <span className="chip">◆ Patch notes</span>
        <h1 className="display text-4xl md:text-5xl font-extrabold gold-text tracking-wide mt-5">Game Updates</h1>
        <p className="text-ink/85 mt-4 max-w-2xl leading-relaxed">
          Every change to the world and the economy, posted in the open — new features, balancing, and fixes.
        </p>
      </section>

      {/* Updates */}
      <div className="space-y-8 pb-20">
        {UPDATES.map((u) => (
          <article key={u.slug} id={u.slug} className="card overflow-hidden scroll-mt-24">
            {/* Banner header — OSRS-style: thumbnail + title + meta */}
            <div className="flex items-center gap-4 p-5 border-b border-line/70 bg-panel/50">
              <div className="shrink-0 w-16 h-16 rounded-lg bg-black/30 border border-gold/30 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u.thumb} alt="" width={52} height={52} className="drop-shadow" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="chip !py-0.5 !px-2 text-[10px]">{u.category}</span>
                  <time className="text-mute text-xs">{u.date}</time>
                </div>
                <h2 className="display text-xl md:text-2xl font-bold gold-text leading-tight">{u.title}</h2>
              </div>
            </div>
            {/* Body */}
            <div className="p-6 md:p-7 space-y-4 text-mute leading-relaxed">
              {u.body}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
