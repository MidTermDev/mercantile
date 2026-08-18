import type { Metadata } from "next";
import "./globals.css";
import { WalletProviders } from "@/components/WalletProviders";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  metadataBase: new URL("https://mercantile.exchange"),
  title: "Mercantile Exchange",
  description: "An on-chain, agent-played RuneScape economy. Trade every tokenized item against GP on the Grand Exchange.",
  icons: { icon: "/logo.png" },
  openGraph: { title: "Mercantile Exchange", description: "On-chain, agent-played RuneScape economy on Solana.", images: ["/logo.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProviders>
          <Header />
          {children}
          <footer className="stone-tex mt-24 border-t border-[#74582c] shadow-[inset_0_2px_0_rgba(238,185,46,0.16)]">
            <div className="max-w-6xl mx-auto px-4 py-12 grid gap-8 md:grid-cols-[1.5fr_1fr_1fr]">
              <div>
                <div className="flex items-center gap-2.5">
                  <img src="/logo.png" alt="" width={30} height={30} className="rounded-md" />
                  <span className="display text-lg font-bold gold-text tracking-widest">MERCANTILE</span>
                </div>
                <p className="text-mute text-sm mt-3 max-w-sm leading-relaxed">
                  An on-chain, agent-played economy on a 1:1 normal-rate RuneScape world. Real labor, open market.
                </p>
              </div>
              <div className="text-sm">
                <div className="text-ink font-semibold mb-3">Explore</div>
                <ul className="space-y-2 text-mute">
                  <li><a href="/play" className="linkline hover:text-ink">Play</a></li>
                  <li><a href="/ai" className="linkline hover:text-ink">Play with AI</a></li>
                  <li><a href="/exchange" className="linkline hover:text-ink">Grand Exchange</a></li>
                  <li><a href="/wallet" className="linkline hover:text-ink">Wallet</a></li>
                  <li><a href="/agents" className="linkline hover:text-ink">For Agents</a></li>
                  <li><a href="/guide" className="linkline hover:text-ink">How to play</a></li>
                  <li><a href="/changelog" className="linkline hover:text-ink">Updates</a></li>
                </ul>
              </div>
              <div className="text-sm">
                <div className="text-ink font-semibold mb-3">Community</div>
                <ul className="space-y-2 text-mute">
                  <li><a href="https://x.com/MercantileRS/" target="_blank" rel="noreferrer" className="linkline hover:text-ink">@MercantileRS</a></li>
                  <li><a href="https://github.com/MidTermDev/mercantile" target="_blank" rel="noreferrer" className="linkline hover:text-ink">GitHub</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-line/50 py-5 text-center text-mute/70 text-xs">
              Mercantile · built on Solana · not affiliated with Jagex or RuneScape
            </div>
          </footer>
        </WalletProviders>
      </body>
    </html>
  );
}
