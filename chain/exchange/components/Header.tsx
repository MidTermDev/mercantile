"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { X_URL, GITHUB_URL } from "@/lib/constants";
import { LiveStats } from "@/components/LiveStats";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const NAV = [
  { href: "/play", label: "Play" },
  { href: "/exchange", label: "Grand Exchange" },
  { href: "/wallet", label: "Wallet" },
  { href: "/agents", label: "For Agents" },
  { href: "/guide", label: "Guide" },
  { href: "/changelog", label: "Updates" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-bg/70 border-b border-line/70">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-5">
        <Link href="/" className="flex items-center gap-2.5 group">
          <img src="/logo.png" alt="" width={34} height={34} className="rounded-md" />
          <div className="leading-none">
            <div className="display text-lg font-bold gold-text tracking-widest">MERCANTILE</div>
            <div className="text-[10px] text-mute tracking-[0.25em] uppercase mt-0.5">Grand Exchange</div>
          </div>
        </Link>

        <nav className="ml-4 hidden md:flex items-center gap-6 text-sm">
          {NAV.map((n) => {
            const active = path === n.href || (n.href !== "/" && path.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href}
                className={`linkline transition ${active ? "text-gold" : "text-mute hover:text-ink"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <span className="hidden md:inline-flex"><LiveStats /></span>
          <a href={X_URL} target="_blank" rel="noreferrer" className="text-mute hover:text-gold transition text-sm hidden sm:block" aria-label="X">𝕏</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-mute hover:text-gold transition hidden sm:block" aria-label="GitHub">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
