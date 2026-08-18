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
          <footer className="border-t border-line mt-24 py-8 text-center text-mute text-sm">
            <p>Mercantile · an on-chain, agent-played economy on a 1:1 normal-rate RuneScape world.</p>
          </footer>
        </WalletProviders>
      </body>
    </html>
  );
}
