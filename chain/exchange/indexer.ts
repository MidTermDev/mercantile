// Poll pool prices -> public/data/prices.json + public/data/history/<mint>.json
//   RPC_URL=<mainnet> bun indexer.ts [--once]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import { CpAmm, getPriceFromSqrtPrice } from "@meteora-ag/cp-amm-sdk";

const ROOT = import.meta.dir;
const DATA = join(ROOT, "public", "data");
const HIST = join(DATA, "history");
const GP_DECIMALS = 6, ITEM_DECIMALS = 1, INTERVAL = 60_000, HIST_CAP = 2000;
const RPC = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const once = process.argv.includes("--once");

const conn = new Connection(RPC, "confirmed");
const cpAmm = new CpAmm(conn);
mkdirSync(HIST, { recursive: true });

async function cycle() {
  const items = JSON.parse(readFileSync(join(DATA, "items.json"), "utf8")).items as any[];
  const prices: Record<string, { price: number; ts: number }> = existsSync(join(DATA, "prices.json"))
    ? JSON.parse(readFileSync(join(DATA, "prices.json"), "utf8")) : {};
  const ts = Math.floor(Date.now() / 1000);
  let ok = 0;
  for (const it of items) {
    try {
      const st = await cpAmm.fetchPoolState(new PublicKey(it.pool));
      const price = Number(getPriceFromSqrtPrice(st.sqrtPrice, ITEM_DECIMALS, GP_DECIMALS));
      prices[it.mint] = { price, ts };
      const hf = join(HIST, `${it.mint}.json`);
      const hist: { t: number; price: number }[] = existsSync(hf) ? JSON.parse(readFileSync(hf, "utf8")) : [];
      hist.push({ t: ts, price });
      writeFileSync(hf, JSON.stringify(hist.slice(-HIST_CAP)));
      ok++;
    } catch { /* skip on RPC hiccup */ }
    if (ok % 50 === 0 && ok) writeFileSync(join(DATA, "prices.json"), JSON.stringify(prices));
  }
  writeFileSync(join(DATA, "prices.json"), JSON.stringify(prices));
  console.log(`[indexer] ${new Date().toISOString()} priced ${ok}/${items.length}`);
}

// Self-schedule (not setInterval): pricing 1374 pools can take longer than one
// interval, and overlapping cycles would exhaust RPC connections.
async function loop() {
  try { await cycle(); } catch (e) { console.error("[indexer] cycle failed:", e); }
  if (!once) setTimeout(loop, INTERVAL);
}
await loop();
