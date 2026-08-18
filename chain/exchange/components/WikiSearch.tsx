"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface WikiEntry { slug: string; title: string; category: string }

const CAP = 400; // don't render thousands of DOM nodes at once

export function WikiSearch({ entries, placeholder = "Search…", showCategory = false }: {
  entries: WikiEntry[];
  placeholder?: string;
  showCategory?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => e.title.toLowerCase().includes(needle) || e.slug.includes(needle));
  }, [q, entries]);
  const shown = filtered.slice(0, CAP);

  return (
    <div>
      <div className="relative mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-panel border border-line rounded px-4 py-3 text-ink placeholder:text-mute/60 focus:outline-none focus:border-gold"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-mute text-xs tnum">
          {filtered.length.toLocaleString()}{filtered.length !== entries.length && ` / ${entries.length.toLocaleString()}`}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {shown.map((e) => (
          <Link
            key={e.category + "/" + e.slug}
            href={`/wiki/${e.category}/${e.slug}`}
            className="card card-hover px-3.5 py-2.5 flex items-center justify-between gap-2 group"
          >
            <span className="text-ink text-sm truncate group-hover:text-gold transition">{e.title}</span>
            {showCategory && <span className="text-[10px] uppercase tracking-wider text-mute shrink-0">{e.category}</span>}
          </Link>
        ))}
      </div>
      {filtered.length > CAP && (
        <p className="text-mute/70 text-xs mt-4 text-center">Showing the first {CAP.toLocaleString()} — refine your search to narrow it down.</p>
      )}
      {filtered.length === 0 && <p className="text-mute text-sm mt-6 text-center">No matches.</p>}
    </div>
  );
}
