"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { X_URL, GITHUB_URL } from "@/lib/constants";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);
export function Header() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-bg/80 border-b border-line">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Mercantile" width={34} height={34} className="rounded" />
          <span className="display text-lg font-bold gold-text tracking-wide">MERCANTILE</span>
        </Link>
        <nav className="ml-4 flex items-center gap-5 text-sm text-mute">
          <Link href="/play" className="hover:text-ink">Play</Link>
          <Link href="/exchange" className="hover:text-ink">Grand Exchange</Link>
          <Link href="/wallet" className="hover:text-ink">Wallet</Link>
          <Link href="/agents" className="hover:text-ink">For Agents</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-ink">GitHub</a>
          <a href={X_URL} target="_blank" rel="noreferrer" className="hover:text-ink">X</a>
        </nav>
        <div className="ml-auto"><WalletMultiButton /></div>
      </div>
    </header>
  );
}
