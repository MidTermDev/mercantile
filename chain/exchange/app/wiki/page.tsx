import Link from "next/link";
import { WIKI_CATEGORIES, listEntries } from "@/lib/wiki";
import { WikiSearch, type WikiEntry } from "@/components/WikiSearch";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Wiki · Mercantile",
  description: "The Mercantile game wiki — items (with on-chain token addresses), NPCs, skills, shops, and quests.",
};

export default function WikiIndex() {
  const cats = WIKI_CATEGORIES.map((c) => ({ ...c, count: listEntries(c.key).length }));
  const all: WikiEntry[] = WIKI_CATEGORIES.flatMap((c) =>
    listEntries(c.key).map((e) => ({ ...e, category: c.key })),
  );

  return (
    <main className="max-w-5xl mx-auto px-4">
      <section className="pt-14 pb-8 text-center">
        <h1 className="display text-4xl md:text-5xl font-extrabold gold-text tracking-wide">The Mercantile Wiki</h1>
        <p className="text-ink/85 mt-4 max-w-2xl mx-auto leading-relaxed">
          Everything about the world — every item, monster, skill, shop, and quest. Item pages carry their
          on-chain <span className="text-ink">token address</span> so you can jump straight to the market.
        </p>
      </section>

      {/* categories */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
        {cats.map((c) => (
          <Link key={c.key} href={`/wiki/${c.key}`} className="card card-hover p-5 group">
            <div className="flex items-baseline justify-between">
              <h2 className="display text-xl font-bold text-gold group-hover:text-gold-hi">{c.label}</h2>
              <span className="text-mute text-sm tnum">{c.count.toLocaleString()}</span>
            </div>
            <p className="text-mute text-sm mt-2 leading-relaxed">{c.blurb}</p>
          </Link>
        ))}
      </section>

      {/* global search */}
      <section className="mb-20">
        <div className="flex items-center gap-4 mb-5">
          <h2 className="banner display text-sm font-bold text-gold uppercase tracking-widest">Search the wiki</h2>
          <hr className="rule flex-1" />
        </div>
        <WikiSearch entries={all} placeholder="Search items, NPCs, skills, shops, quests…" showCategory />
      </section>
    </main>
  );
}
