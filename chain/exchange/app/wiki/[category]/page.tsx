import Link from "next/link";
import { notFound } from "next/navigation";
import { isCategory, categoryLabel, listEntries, WIKI_CATEGORIES } from "@/lib/wiki";
import { WikiSearch, type WikiEntry } from "@/components/WikiSearch";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return { title: `${categoryLabel(category)} · Wiki · Mercantile` };
}

export default async function WikiCategory({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isCategory(category)) notFound();
  const label = categoryLabel(category);
  const blurb = WIKI_CATEGORIES.find((c) => c.key === category)?.blurb ?? "";
  const entries: WikiEntry[] = listEntries(category).map((e) => ({ ...e, category }));

  return (
    <main className="max-w-5xl mx-auto px-4">
      <section className="pt-12 pb-6">
        <Link href="/wiki" className="text-mute hover:text-gold text-sm linkline">← Wiki</Link>
        <div className="flex items-baseline gap-3 mt-3">
          <h1 className="display text-3xl md:text-4xl font-extrabold gold-text tracking-wide">{label}</h1>
          <span className="text-mute tnum">{entries.length.toLocaleString()}</span>
        </div>
        <p className="text-mute mt-2 max-w-2xl leading-relaxed">{blurb}</p>
      </section>
      <section className="mb-20">
        <WikiSearch entries={entries} placeholder={`Search ${label.toLowerCase()}…`} />
      </section>
    </main>
  );
}
