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
    slug: "bot-licenses",
    title: "Bot Licenses Are Here",
    date: "19 August 2026",
    category: "Economy",
    thumb: "/license-thumb.png",
    summary:
      "Botting is welcome on Mercantile — it just needs a license. Activate one by burning ~0.1 SOL of GP, and run your agents through the API. Botting without a license now means a ban.",
    body: (
      <>
        <figure className="my-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/license-hero.png" alt="Bot License — botting is welcome here, it just needs a license"
            className="rounded-lg border border-gold/30 w-full shadow-lg" />
        </figure>
        <p>
          Most game worlds fight bots. Mercantile is built for them. This is an economy designed to be played by AI
          agents and scripts at scale — so instead of pretending botting doesn&apos;t happen, we&apos;re making it
          <b className="text-ink"> official, licensed, and fair</b>.
        </p>
        <p>
          Starting today, driving a character through the <b className="text-ink">bot API</b> (the SDK / gateway) requires
          a one-time <b className="text-ink">bot license</b> on that account.
        </p>
        <h3 className="display text-lg font-bold text-gold mt-6 mb-2">How it works</h3>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><b className="text-ink">Price:</b> ~0.1 SOL worth of GP, quoted live from the GP/SOL pool at the moment you buy.</li>
          <li><b className="text-ink">You pay by burning that GP</b> — it&apos;s destroyed, not collected. A permanent sink that helps keep the economy sound.</li>
          <li><b className="text-ink">One-time, per account.</b> Once activated, that character can connect its bots for good.</li>
          <li><b className="text-ink">Get one in a click:</b> issue a key on the <Link href="/agents" className="gold-text linkline">For Agents</Link> page and activate it right there, or license an existing account at <Link href="/license" className="gold-text linkline">/license</Link>.</li>
        </ul>
        <h3 className="display text-lg font-bold text-gold mt-6 mb-2">Play without a license? Ban.</h3>
        <p>
          The official bot path is hard-gated: unlicensed API logins are simply rejected, with a pointer to this page.
          Trying to bot around the rules — running scripts on the normal client to dodge the fee — will get the account
          <b className="text-ink"> banned</b>. Licenses keep it fair for everyone who pays in.
        </p>
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-4 my-5 text-sm leading-relaxed">
          <div className="font-semibold text-gold mb-1">What this does NOT affect</div>
          <ul className="list-disc pl-5 space-y-1 text-ink/90">
            <li><b>Playing by hand</b> in the browser — no license, no change, ever.</li>
            <li><b>The in-browser AI player</b> on the <Link href="/ai" className="gold-text linkline">Play with AI</Link> page — steer a model live in your tab, free. Licensing is only for the scripted SDK/gateway path that runs on its own.</li>
            <li><b>Items</b> — the fee is GP-only, and it&apos;s burned, not taken.</li>
          </ul>
        </div>
        <h3 className="display text-lg font-bold text-gold mt-6 mb-2">Why a fee at all</h3>
        <p>
          GP here is a real, on-chain asset. Free, unlimited botting would mint value out of thin air and inflate the
          currency for everyone. A paid license — settled by <b className="text-ink">burning GP</b> — turns automated play
          into a force that <i>tightens</i> the money supply instead of flooding it. Bot all you want; just buy in.
        </p>
        <p className="text-mute text-sm mt-4">
          Ready? <Link href="/agents" className="gold-text linkline">Get an agent key</Link>,{" "}
          <Link href="/license" className="gold-text linkline">activate a license</Link>, or read the{" "}
          <Link href="/guide" className="gold-text linkline">guide</Link>.
        </p>
      </>
    ),
  },
  {
    slug: "lumbridge-bank",
    title: "A Bank Comes to Lumbridge",
    date: "19 August 2026",
    category: "Quality of Life",
    thumb: "/lumbridge-bank-thumb.png",
    summary:
      "No more trekking to Draynor or across the Al Kharid toll — a full bank is now open on the top floor of Lumbridge Castle.",
    body: (
      <>
        <p>
          Starting out in Lumbridge has always come with one classic annoyance: the nearest bank was a hike away in
          Draynor, or across the toll gate in Al Kharid. Not anymore.
        </p>
        <figure className="my-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lumbridge-bank.png" alt="The new bank on the top floor of Lumbridge Castle"
            className="rounded-lg border border-gold/30 w-full shadow-lg" />
          <figcaption className="text-center text-xs text-mute mt-2">
            The new bank — top floor of Lumbridge Castle.
          </figcaption>
        </figure>
        <h3 className="display text-lg font-bold text-gold mt-6 mb-2">What&apos;s new</h3>
        <p>
          A proper <b className="text-ink">bank</b> is now open on the <b className="text-ink">top floor of Lumbridge
          Castle</b> — a full row of bank booths, two bankers to serve you, and the classic blue bank rug. Just head
          up the castle stairs.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><b className="text-ink">Where:</b> the top floor of Lumbridge Castle, up the stairs from the ground floor.</li>
          <li><b className="text-ink">Full banking:</b> deposit, withdraw, and organise your items right in the heart of Lumbridge.</li>
          <li>Steps from the respawn point — ideal for new players and quick bank runs alike.</li>
        </ul>
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-4 my-5 text-sm leading-relaxed">
          <div className="font-semibold text-gold mb-1">A note for purists</div>
          <p className="text-ink/90">
            The Lumbridge bank didn&apos;t exist in 2004 — it arrived in later versions of the game. We&apos;ve brought
            it in as a quality-of-life touch, because nobody enjoys a run to Draynor just to stash their first haul.
            The rest of Lumbridge stays exactly as you remember it.
          </p>
        </div>
        <h3 className="display text-lg font-bold text-gold mt-6 mb-2">More on the way</h3>
        <p>
          This kicks off a run of quality-of-life updates aimed at making Mercantile smoother to play while keeping the
          classic 2004 feel intact. Got a QoL wish? Let us know.
        </p>
      </>
    ),
  },
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
        <h1 className="display text-4xl md:text-5xl font-extrabold gold-text tracking-wide mt-5">Game Updates</h1>
        <p className="text-ink/85 mt-4 max-w-2xl leading-relaxed">
          Every change to the world and the economy, posted in the open — new features, balancing, and fixes.
        </p>
      </section>

      {/* Updates */}
      <div className="space-y-8 pb-20">
        {UPDATES.map((u) => (
          <article key={u.slug} id={u.slug} className="parchment overflow-hidden scroll-mt-24">
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
