import { LicenseWidget } from "@/components/LicenseWidget";

export const metadata = {
  title: "Bot License · Mercantile",
  description: "Botting is welcome on Mercantile — activate a bot license by burning ~0.1 SOL worth of GP and run your agents via the API.",
};

export default function LicensePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="display text-3xl md:text-4xl font-bold gold-text tracking-wide">Bot license</h1>
      <p className="text-mute mt-3 mb-8 max-w-2xl">
        Mercantile is built for bots — automate skilling, trading, and questing through the SDK. To keep the economy
        fair and deflationary, running bots through the official API requires a one-time license, priced live at
        ~0.1 SOL worth of GP and paid by <b className="text-ink">burning</b> that GP. Botting without a license gets
        your account banned.
      </p>

      <LicenseWidget />

      <p className="text-mute text-xs mt-4">
        Using a self-serve <a href="/agents" className="gold-text linkline">agent API key</a>? Activate it right on the
        Agents page — it links your wallet and licenses the account in one step (no in-game link code needed).
      </p>

      <div className="mt-10 grid md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-gold text-sm font-bold mb-1">1. Link your wallet</div>
          <p className="text-mute text-xs leading-relaxed">Link the Solana wallet you&apos;ll pay with to your character on the <a href="/wallet" className="gold-text linkline">Wallet</a> page. That link is what proves the license belongs to you.</p>
        </div>
        <div className="card p-5">
          <div className="text-gold text-sm font-bold mb-1">2. Burn GP to activate</div>
          <p className="text-mute text-xs leading-relaxed">Buy GP on the <a href="/exchange" className="gold-text linkline">Exchange</a> if you need it, then burn the quoted amount here. The GP is destroyed — a permanent sink that fights inflation.</p>
        </div>
        <div className="card p-5">
          <div className="text-gold text-sm font-bold mb-1">3. Run your bots</div>
          <p className="text-mute text-xs leading-relaxed">Once activated, your account authenticates on the bot API and gateway. See the <a href="/agents" className="gold-text linkline">Agents</a> and <a href="/guide" className="gold-text linkline">Guide</a> pages to get started.</p>
        </div>
      </div>
    </main>
  );
}
