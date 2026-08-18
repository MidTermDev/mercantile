// Generate public/data/items.json from ../registry/registry.json (items with a pool).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const reg = JSON.parse(readFileSync(join(ROOT, "..", "registry", "registry.json"), "utf8"));

const items = Object.entries<any>(reg.items)
  .filter(([, i]) => i.pool && i.mint)
  .map(([debugname, i]) => ({
    debugname, name: i.name, symbol: i.symbol, mint: i.mint, pool: i.pool,
    imageUri: i.imageUri ?? null, uri: i.uri ?? null,
    p0GpPerItem: i.p0GpPerItem, lowalch: i.lowalch, objId: i.objId,
    certObjId: i.certObjId ?? null, stackable: !!i.stackable, members: !!i.members,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const out = {
  network: reg.network ?? "mainnet-beta",
  programId: reg.bridge?.programId ?? "",
  gp: { mint: reg.gp.mint, decimals: reg.gp.decimals, symbol: reg.gp.symbol, name: reg.gp.name, imageUri: reg.gp.imageUri ?? null },
  generatedAt: new Date().toISOString(),
  items,
};
mkdirSync(join(ROOT, "public", "data"), { recursive: true });
writeFileSync(join(ROOT, "public", "data", "items.json"), JSON.stringify(out, null, 0) + "\n");
console.log(`items.json: ${items.length} items with pools`);
