import Link from "next/link";
import { notFound } from "next/navigation";
import { isCategory, categoryLabel, readPage, itemToken } from "@/lib/wiki";
import { CopyAddress } from "@/components/CopyAddress";
import { solscan } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  const page = isCategory(category) ? readPage(category, slug) : null;
  return { title: page ? `${page.title} · Wiki · Mercantile` : "Wiki · Mercantile" };
}

export default async function WikiEntryPage({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  if (!isCategory(category)) notFound();
  const page = readPage(category, slug);
  if (!page) notFound();
  const token = category === "items" ? itemToken(slug) : null;

  return (
    <main className="max-w-3xl mx-auto px-4">
      {/* breadcrumb */}
      <section className="pt-10 pb-4 text-sm text-mute">
        <Link href="/wiki" className="hover:text-gold linkline">Wiki</Link>
        <span className="mx-1.5 text-mute/50">/</span>
        <Link href={`/wiki/${category}`} className="hover:text-gold linkline">{categoryLabel(category)}</Link>
      </section>

      {/* on-chain token (items only, when tokenized) */}
      {token && (
        <div className="card p-4 md:p-5 mb-5 border-gold/40">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-mute text-xs uppercase tracking-widest">On-chain token</div>
              <div className="mt-1"><CopyAddress address={token.mint} chars={6} /></div>
            </div>
            <div className="flex gap-2 shrink-0">
              <a href={solscan(token.mint)} target="_blank" rel="noreferrer" className="btn-ghost px-3.5 py-2 text-sm text-mute hover:text-ink">Solscan ↗</a>
              <Link href={`/exchange/${token.mint}`} className="btn-gold px-4 py-2 text-sm">Trade on the Exchange →</Link>
            </div>
          </div>
        </div>
      )}

      {/* the wiki article, on a parchment scroll */}
      <article className="parchment p-6 md:p-9 mb-16">
        <div className="wiki-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
      </article>
    </main>
  );
}
