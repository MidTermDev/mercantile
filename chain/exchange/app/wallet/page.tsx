import { WalletPanel } from "@/components/WalletPanel";

export const metadata = {
  title: "Wallet · Mercantile Exchange",
  description: "Link your Solana wallet to your character and bridge items and GP between the game and the chain.",
};

export default function WalletPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="display text-3xl md:text-4xl font-bold gold-text tracking-wide">Your wallet</h1>
      <p className="text-mute mt-3 mb-8 max-w-2xl">
        Link a Solana wallet to your character, then move items and GP both ways. Receiving is free once your
        token account exists; you pay only your own account rent (refundable — it&apos;s your deposit) and the tiny
        network fee. We never take custody and never pay rent on your behalf.
      </p>
      <WalletPanel />
    </main>
  );
}
