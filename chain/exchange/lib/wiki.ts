// Server-only helpers for rendering the repo's wiki/ markdown as site pages.
import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

export const WIKI_CATEGORIES = [
  { key: "items", label: "Items", blurb: "Every tradeable and untradeable object, its stats, and where to get it." },
  { key: "npcs", label: "NPCs", blurb: "Monsters and characters — combat stats, drops, and locations." },
  { key: "skills", label: "Skills", blurb: "How each skill trains, from level 1 to 99." },
  { key: "shops", label: "Shops", blurb: "Every shop, what it stocks, and its prices." },
  { key: "quests", label: "Quests", blurb: "Walkthroughs, requirements, and rewards." },
] as const;

export type WikiCategory = (typeof WIKI_CATEGORIES)[number]["key"];
const CATS = WIKI_CATEGORIES.map((c) => c.key) as string[];

function resolveRoot(): string {
  if (process.env.WIKI_DIR) return path.resolve(process.env.WIKI_DIR);
  for (const p of [path.join(process.cwd(), "..", "..", "wiki"), path.join(process.cwd(), "wiki")]) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return path.join(process.cwd(), "..", "..", "wiki");
}
const WIKI_ROOT = resolveRoot();

export function isCategory(c: string): c is WikiCategory {
  return CATS.includes(c);
}
export function categoryLabel(c: string): string {
  return WIKI_CATEGORIES.find((x) => x.key === c)?.label ?? c;
}

// slug ↔ title
export function prettify(slug: string): string {
  return slug.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
// MUST match wiki/generate-items.ts slugify()
export function slugify(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// cached directory listings (the wiki is static; regenerated rarely)
const entryCache = new Map<string, { slug: string; title: string }[]>();
export function listEntries(category: string): { slug: string; title: string }[] {
  if (!isCategory(category)) return [];
  const cached = entryCache.get(category);
  if (cached) return cached;
  let files: string[] = [];
  try { files = fs.readdirSync(path.join(WIKI_ROOT, category)).filter((f) => f.endsWith(".md")); } catch { files = []; }
  const entries = files
    .map((f) => { const slug = f.slice(0, -3); return { slug, title: prettify(slug) }; })
    .sort((a, b) => a.title.localeCompare(b.title));
  entryCache.set(category, entries);
  return entries;
}

export function entryCount(category: string): number {
  return listEntries(category).length;
}

// Rewrite intra-wiki markdown links (../shops/x.md, y.md) → site routes (/wiki/...).
function rewriteLinks(md: string, category: string): string {
  return md.replace(/\]\(([^)\s]+?\.md)(#[^)]*)?\)/g, (_m, rel: string) => {
    let h = rel.replace(/\.md$/, "").replace(/^(\.\.\/)+/, "").replace(/^\.\//, "");
    const parts = h.split("/");
    const route = CATS.includes(parts[0]) ? `/wiki/${h}` : `/wiki/${category}/${h}`;
    return `](${route})`;
  });
}

export interface WikiPage { title: string; html: string }
export function readPage(category: string, slug: string): WikiPage | null {
  if (!isCategory(category) || !/^[a-z0-9-]+$/.test(slug)) return null;
  const file = path.join(WIKI_ROOT, category, `${slug}.md`);
  let md: string;
  try { md = fs.readFileSync(file, "utf8"); } catch { return null; }
  const h1 = md.match(/^#\s+(.+)$/m);
  const title = h1 ? h1[1].trim() : prettify(slug);
  const html = marked.parse(rewriteLinks(md, category), { gfm: true, breaks: false }) as string;
  return { title, html };
}

// item slug (slugified name) → token info from the exchange's items.json
let tokenMap: Map<string, { mint: string; pool: string | null; name: string }> | null = null;
function loadTokens(): Map<string, { mint: string; pool: string | null; name: string }> {
  if (tokenMap) return tokenMap;
  tokenMap = new Map();
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "items.json"), "utf8"));
    for (const it of j.items ?? []) tokenMap.set(slugify(it.name), { mint: it.mint, pool: it.pool ?? null, name: it.name });
  } catch { /* items.json not present */ }
  return tokenMap;
}
export function itemToken(slug: string): { mint: string; pool: string | null; name: string } | null {
  return loadTokens().get(slug) ?? null;
}
