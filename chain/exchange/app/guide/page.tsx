import Link from "next/link";
import { GAME_URL, LOCAL_GAME_URL, GITHUB_URL } from "@/lib/constants";

export const metadata = {
  title: "How to Play · Mercantile",
  description:
    "A plain-English guide to Mercantile: play the authentic 2004-rate RuneScape world by hand or with an AI agent, link a Solana wallet, and move items and GP on-chain — no crypto experience needed.",
};

const TOC = [
  { id: "what", label: "What is Mercantile" },
  { id: "start", label: "Start playing" },
  { id: "onchain", label: "What “on-chain” means" },
  { id: "link", label: "Link your wallet" },
  { id: "withdraw", label: "Send items out (withdraw)" },
  { id: "exchange", label: "Trade on the Exchange" },
  { id: "deposit", label: "Bring items back (deposit)" },
  { id: "agents", label: "Play with an AI agent" },
  { id: "faq", label: "FAQ" },
];

export default function Guide() {
  const playUrl = GAME_URL.length > 0 ? GAME_URL : LOCAL_GAME_URL;
  const repo = GITHUB_URL.replace("https://github.com/", "");

  return (
    <main className="max-w-4xl mx-auto px-4">
      {/* Hero */}
      <section className="pt-14 pb-6 text-center flex flex-col items-center">
        <span className="chip">◆ The complete guide</span>
        <h1 className="display text-4xl md:text-5xl font-extrabold gold-text tracking-wide mt-5">How to play Mercantile</h1>
        <p className="text-ink/85 mt-4 max-w-2xl leading-relaxed">
          Mercantile is a faithful 2004-era RuneScape world where the economy is real and on-chain. Play it by hand or
          let an AI agent play for you — either way, what you earn can move to a Solana wallet and trade on an open
          market. No crypto background needed; this page walks through everything.
        </p>
      </section>

      {/* Table of contents */}
      <nav aria-label="Contents" className="card p-4 md:p-5 mb-14">
        <div className="text-xs uppercase tracking-[0.2em] text-mute mb-3">On this page</div>
        <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {TOC.map((t, i) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="linkline text-mute hover:text-gold">
                <span className="font-mono text-gold/60 mr-2">{String(i + 1).padStart(2, "0")}</span>{t.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 1. What is Mercantile */}
      <Section id="what" n="01" title="What is Mercantile">
        <p>
          It’s the RuneScape most people remember — chopping trees, mining, fishing, fighting, cooking, banking — running
          at the original <b className="text-ink">1:1 experience rate and 0.6-second ticks</b>. Nothing is sped up. That
          slowness is the point: because everything takes genuine effort to earn, the prices things fetch actually mean
          something.
        </p>
        <p>
          The twist is the economy. Every tradeable item and the game’s currency (GP) exist as tokens on the Solana
          blockchain. You can pull what you earn out of the game into your own wallet, trade it on the
          {" "}<Link href="/exchange" className="gold-text linkline">Grand Exchange</Link> for GP, and push tokens back
          in to get the goods returned in-world. The game is the referee for what’s real; the chain is just where value
          is held and traded.
        </p>
        <Callout>
          You can ignore the chain entirely and just play. Linking a wallet is optional — only do it when you want to
          take something out or trade on the open market.
        </Callout>
      </Section>

      {/* 2. Start playing */}
      <Section id="start" n="02" title="Start playing (by hand)">
        <Steps
          steps={[
            { t: "Open the game", d: <>Head to the <Link href="/play" className="gold-text linkline">Play</Link> page and launch the client in your browser — or <a href={playUrl} target="_blank" rel="noreferrer" className="gold-text linkline">open it directly</a>. There’s nothing to download.</> },
            { t: "Log in — your account is created automatically", d: <>Pick a username and password on the login screen. First login creates the account; there’s no email or signup form.</> },
            { t: "Do or skip the tutorial", d: <>You start on Tutorial Island. Follow the guides to learn the controls, or skip ahead to the mainland once you know your way around.</> },
            { t: "Play the authentic grind", d: <>Chop, mine, fish, fight, cook, craft, and bank exactly as the game intends. Levels and wealth come from real time invested — that’s what gives on-chain prices meaning.</> },
          ]}
        />
        <Callout>
          New to RuneScape? Start in Lumbridge: cut trees for logs, catch shrimp at the river, and kill goblins for a
          few coins. Bank often. Everything you gather is a tradeable item with a live market price.
        </Callout>
      </Section>

      {/* 3. What on-chain means */}
      <Section id="onchain" n="03" title="What “on-chain” actually means">
        <p>
          A blockchain is a shared ledger that no single party can quietly edit. On Mercantile, each item type (a
          lobster, a rune platebody, a party hat…) and the currency GP are represented as <b className="text-ink">tokens</b>
          {" "}on Solana. A <b className="text-ink">wallet</b> (like Phantom or Solflare — free browser apps) is where you
          hold those tokens.
        </p>
        <p>
          Moving value between the game and the chain is called <b className="text-ink">bridging</b>, and it’s done through
          the <b className="text-ink">Exchange Clerk</b> — an NPC standing in <b className="text-ink">every bank in the
          game</b>. Withdraw to turn in-game goods into wallet tokens; deposit to turn tokens back into in-game goods.
        </p>
        <div className="grid sm:grid-cols-3 gap-4 mt-5">
          <MiniCard title="Play" body="Earn items and GP in the world through normal gameplay." />
          <MiniCard title="Bridge" body="At any bank, the Exchange Clerk moves goods to/from your wallet." />
          <MiniCard title="Trade" body="Buy and sell tokens for GP on the Grand Exchange, 24/7." />
        </div>
      </Section>

      {/* 4. Link wallet */}
      <Section id="link" n="04" title="Link your Solana wallet">
        <p>
          Linking proves you control both a character and a wallet. <b className="text-ink">Nothing but a signature ever
          leaves your wallet</b> — no private key, no token approval, and no typing your address in the game chat.
        </p>
        <Steps
          steps={[
            { t: "Get a code in-game", d: <>Log in, walk to <b className="text-ink">any bank</b>, and talk to the <b className="text-ink">Exchange Clerk</b>. Choose <b className="text-ink">“Link my Solana wallet.”</b> She gives you a short one-time code (good for about 10 minutes).</> },
            { t: "Open the Wallet page & connect", d: <>Go to the <Link href="/wallet" className="gold-text linkline">Wallet</Link> page and connect your Solana wallet. Your address is read from the wallet — nothing to copy.</> },
            { t: "Enter username + code and sign", d: <>Type your in-game username and the code, then click <b className="text-ink">Sign &amp; link</b>. Approve the signature in your wallet. Done — your character and wallet are now bound.</> },
          ]}
        />
        <Callout>One wallet per character. Re-linking simply replaces the old wallet — your items and GP are unaffected.</Callout>
      </Section>

      {/* 5. Withdraw */}
      <Section id="withdraw" n="05" title="Send items or GP to your wallet (withdraw)">
        <p>Once linked, you can pull goods out of the game as tokens:</p>
        <Steps
          steps={[
            { t: "Visit the Exchange Clerk", d: <>At any bank, talk to the Clerk — or, for an item, simply <b className="text-ink">use the item on her</b>. For coins, choose <b className="text-ink">“Withdraw GP.”</b></> },
            { t: "Confirm the amount", d: <>Pick how many to send out. The items or GP leave your character immediately — that’s the game side of the trade.</> },
            { t: "Claim it in your wallet", d: <>Come to the <Link href="/wallet" className="gold-text linkline">Wallet</Link> page and hit <b className="text-ink">Claim</b>. Your wallet mints the tokens and pays the tiny Solana network fee. The tokens are now yours to hold or trade.</> },
          ]}
        />
        <Callout tone="warn">
          You can only bridge <b>whole</b> items and whole GP — no fractions. A lobster is one lobster.
        </Callout>
      </Section>

      {/* 6. Exchange */}
      <Section id="exchange" n="06" title="Trade on the Grand Exchange">
        <p>
          The <Link href="/exchange" className="gold-text linkline">Grand Exchange</Link> is an always-open market. Every
          tokenized item has its own pool priced in GP, so you can:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-mute">
          <li><b className="text-ink">Buy</b> an item with GP — handy if grinding it yourself would take forever.</li>
          <li><b className="text-ink">Sell</b> items you’ve bridged out for GP.</li>
          <li>Watch prices move as players and agents trade. Prices reflect real in-game scarcity and labor.</li>
        </ul>
        <p>
          You trade the <b className="text-ink">tokens in your wallet</b> here. So a typical loop is: grind an item →
          withdraw it at the Clerk → claim it → sell it on the Exchange for GP (or buy something else with that GP).
        </p>
      </Section>

      {/* 7. Deposit */}
      <Section id="deposit" n="07" title="Bring tokens back into the game (deposit)">
        <p>Anything in your wallet can go back into the world:</p>
        <Steps
          steps={[
            { t: "Deposit from the website", d: <>On the <Link href="/wallet" className="gold-text linkline">Wallet</Link> page (or an item’s page on the Exchange), choose <b className="text-ink">Deposit</b> and the amount. Your tokens are burned on-chain — that’s the proof.</> },
            { t: "Collect it in-game", d: <>Log in and talk to the <b className="text-ink">Exchange Clerk</b> at any bank to claim the returned items or GP into your inventory.</> },
          ]}
        />
        <Callout>Depositing and withdrawing are exact opposites and use the same Clerk — one bridge, both directions.</Callout>
      </Section>

      {/* 8. Agents */}
      <Section id="agents" n="08" title="Play with an AI agent">
        <p>
          Don’t want to grind by hand? Let a language model play your character. Mercantile was built for this — you can
          spin up an agent, <b className="text-ink">watch it live</b>, and <b className="text-ink">steer it with
          plain-English prompts</b> (“chop yews and bank them”, “fish shrimp for a while”, “go kill goblins”). Use
          <b className="text-ink"> Anthropic, OpenAI, DeepSeek</b>, or any OpenAI-compatible model — you bring your own key.
        </p>

        <Callout>
          <b className="text-ink">Easiest way — no install:</b> open <Link href="/ai" className="gold-text linkline">Play with AI</Link>,
          log in, pick a model, paste your key, and prompt. Your key stays in your browser. The steps below are for
          <b className="text-ink"> autonomous / background</b> play (keeps running when you’re away).
        </Callout>

        <h3 className="display text-lg font-bold text-gold mt-7 mb-2">Get set up (autonomous)</h3>
        <Steps
          steps={[
            { t: "Grab an agent key", d: <>On the <Link href="/agents" className="gold-text linkline">For Agents</Link> page, choose a name (or leave it blank for a random one) and click <b className="text-ink">Get my agent key</b>. You’ll get a ready-made <span className="font-mono">bot.env</span> — save it, the key is shown only once.</> },
            { t: "Get the code", d: <>Install <a href="https://bun.sh" target="_blank" rel="noreferrer" className="gold-text linkline">Bun</a>, then clone the SDK: <span className="font-mono">git clone {GITHUB_URL}</span> and run <span className="font-mono">bun install</span>.</> },
            { t: "Add your bot.env + DeepSeek key", d: <>Save the file to <span className="font-mono">bots/&lt;name&gt;/bot.env</span> and paste your DeepSeek key into the <span className="font-mono">DEEPSEEK_API_KEY=</span> line (get one at <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer" className="gold-text linkline">platform.deepseek.com</a>).</> },
          ]}
        />

        <h3 className="display text-lg font-bold text-gold mt-7 mb-2">Run it — one command</h3>
        <pre className="rounded-lg border border-line bg-black/30 p-4 font-mono text-xs md:text-sm text-ink overflow-x-auto">DEEPSEEK_API_KEY=sk-… bun agent/agent.ts &lt;name&gt;</pre>
        <p className="mt-3">
          That single command starts the game client, connects the agent, skips the tutorial, and opens a
          {" "}<b className="text-ink">watch &amp; prompt console</b> at <span className="font-mono">http://localhost:8799</span>.
          Open it in your browser to see the character’s live state (position, health, inventory, what’s nearby) and a
          running action log. Type a goal in the box to redirect the agent any time, or hit <b className="text-ink">Pause</b>.
        </p>
        <Callout>No DeepSeek key yet? It still runs in a simple demo mode so you can watch the loop before committing a key.</Callout>

        <h3 className="display text-lg font-bold text-gold mt-7 mb-2">Take your agent on-chain</h3>
        <p>
          An agent’s character is a normal character. <Link href="#link" className="gold-text linkline">Link a wallet</Link> to
          it, let it grind, then withdraw and trade exactly as a human would — the agent does the playing, you handle the
          bridging and trading (or script that too).
        </p>

        <h3 className="display text-lg font-bold text-gold mt-7 mb-2">Advanced: write your own logic</h3>
        <p>
          Want full control instead of an LLM? Start the headless client with
          {" "}<span className="font-mono">bun server/webclient/src/lite/runner.ts &lt;name&gt;</span>, then run any script
          against the SDK with <span className="font-mono">bun bots/&lt;name&gt;/script.ts</span>. The SDK exposes
          high-level actions (walk, chop, mine, fish, fight, bank) and the full world state — see the
          {" "}<a href={GITHUB_URL} target="_blank" rel="noreferrer" className="gold-text linkline">{repo}</a> README.
        </p>
      </Section>

      {/* FAQ */}
      <Section id="faq" n="09" title="FAQ">
        <div className="space-y-5">
          <Faq q="Is it free to play?">
            Yes. Playing the game costs nothing. The only fees are Solana’s tiny network fees when you claim or deposit
            on-chain — a fraction of a cent — paid from your own wallet.
          </Faq>
          <Faq q="Do I need crypto to play?">
            No. You can play, level up, and enjoy the whole game without ever touching a wallet. The chain only comes in
            if you choose to take items out or trade on the open market.
          </Faq>
          <Faq q="Is my wallet safe when I link it?">
            Linking only asks your wallet to sign a message — it can never move your funds. Claiming and depositing are
            explicit transactions you approve yourself. We never ask for your private key or a spending approval.
          </Faq>
          <Faq q="What’s a “claim”?">
            When you withdraw, the game credits you and the tokens become claimable. You finalize by clicking Claim in
            your wallet, which mints the tokens to you and pays the small network fee. It puts you in control of the last
            step.
          </Faq>
          <Faq q="Why can’t I deposit half an item?">
            The game only understands whole items and whole GP, so the bridge enforces whole amounts in both directions.
          </Faq>
          <Faq q="Which AI model should my agent use?">
            Any OpenAI-compatible model. DeepSeek is popular for being fast and inexpensive; you bring your own key so you
            control the cost.
          </Faq>
        </div>
      </Section>

      <div className="flex flex-wrap gap-3 justify-center my-16">
        <Link href="/play" className="btn-gold px-6 py-3">Start playing →</Link>
        <Link href="/agents" className="btn-ghost px-6 py-3 text-ink">Get an agent key</Link>
        <Link href="/exchange" className="btn-ghost px-6 py-3 text-mute hover:text-ink">Grand Exchange</Link>
      </div>
    </main>
  );
}

/* ── small presentational helpers ──────────────────────────────────────────── */
function Section({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-16 scroll-mt-24">
      <div className="flex items-baseline gap-4 mb-5">
        <span className="font-mono text-gold/50 text-sm">{n}</span>
        <h2 className="display text-2xl md:text-3xl font-bold gold-text">{title}</h2>
        <hr className="rule flex-1" />
      </div>
      <div className="space-y-4 text-mute leading-relaxed">{children}</div>
    </section>
  );
}

function Steps({ steps }: { steps: { t: string; d: React.ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.t} className="card p-5 flex gap-4">
          <div className="shrink-0 w-8 h-8 rounded-full btn-gold flex items-center justify-center text-sm">{i + 1}</div>
          <div>
            <h3 className="font-semibold text-ink">{s.t}</h3>
            <p className="text-mute text-sm mt-1 leading-relaxed">{s.d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function MiniCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-gold text-sm">{title}</h3>
      <p className="text-mute text-sm mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

function Callout({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  const warn = tone === "warn";
  return (
    <div className={`rounded-lg border p-4 text-sm leading-relaxed ${warn ? "border-gold/50 bg-gold/5 text-ink/90" : "border-line bg-panel/60 text-mute"}`}>
      <span className={`font-semibold mr-1 ${warn ? "text-gold" : "text-ink"}`}>{warn ? "⚠ Note:" : "Tip:"}</span>
      {children}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line/50 pb-5">
      <h3 className="font-semibold text-ink">{q}</h3>
      <p className="text-mute text-sm mt-1.5 leading-relaxed">{children}</p>
    </div>
  );
}
