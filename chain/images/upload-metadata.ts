// Upload each item's icon PNG + a Metaplex-style metadata JSON to Pinata (IPFS),
// matching the dbc-launcher format, and record the URIs in registry.json.
// Idempotent: an uploads cache (images/uploads.json) is keyed by debugname so
// re-runs skip already-pinned assets. Requires PINATA_JWT (chain/.env).
//
//   bun images/upload-metadata.ts [--only-file registry/staples.txt]
//
// Metadata JSON: { name, symbol, description, image, showName: true }

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RegistryFile } from '../registry/schema';

const OUT_DIR = join(import.meta.dir, 'out');
const CACHE = join(import.meta.dir, 'uploads.json');
const REGISTRY = join(import.meta.dir, '..', 'registry', 'registry.json');
const IPFS_GATEWAY = 'https://ipfs.io/ipfs';

const loadRegistry = (): RegistryFile => JSON.parse(readFileSync(REGISTRY, 'utf8'));
const saveRegistry = (r: RegistryFile) => writeFileSync(REGISTRY, JSON.stringify(r, null, 2) + '\n');

// load PINATA_JWT from chain/.env (direct file read; value is base64 with dots)
const envPath = join(import.meta.dir, '..', '.env');
const JWT = existsSync(envPath)
    ? readFileSync(envPath, 'utf8').split('\n').find(l => l.startsWith('PINATA_JWT='))?.slice('PINATA_JWT='.length).trim()
    : undefined;
if (!JWT) { console.error('PINATA_JWT not set (chain/.env)'); process.exit(1); }

const onlyFileArg = process.argv.indexOf('--only-file');
const only = onlyFileArg !== -1
    ? new Set(readFileSync(process.argv[onlyFileArg + 1], 'utf8').split(/\s+/).map(s => s.trim()).filter(Boolean))
    : null;

interface CacheEntry { imageCid: string; imageUri: string; metadataCid: string; metadataUri: string }
const cache: Record<string, CacheEntry> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const saveCache = () => writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');

async function pinFile(bytes: Uint8Array, filename: string, contentType: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: contentType }), filename);
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: { Authorization: `Bearer ${JWT}` },
        body: form
    });
    if (!res.ok) throw new Error(`Pinata ${res.status}: ${await res.text()}`);
    return (await res.json() as { IpfsHash: string }).IpfsHash;
}

const reg: RegistryFile = loadRegistry();

function describe(name: string, isGp: boolean): string {
    if (isGp) return 'Gielinor GP — the on-chain currency of the Mercantile RuneScape economy. 1 GP = 1 in-game coin, redeemable via the Exchange Clerk.';
    return `${name} — a tradeable RuneScape item on the Mercantile economy, redeemable in-game via the Exchange Clerk.`;
}

async function pinItem(debugname: string, name: string, symbol: string, isGp: boolean): Promise<void> {
    if (cache[debugname]) return; // already pinned
    const pngPath = join(OUT_DIR, `${debugname}.png`);
    if (!existsSync(pngPath)) { console.warn(`no png for ${debugname}, skipping`); return; }

    const imageCid = await pinFile(new Uint8Array(readFileSync(pngPath)), `${debugname}.png`, 'image/png');
    const imageUri = `${IPFS_GATEWAY}/${imageCid}`;

    const metadata = { name, symbol, description: describe(name, isGp), image: imageUri, showName: true };
    const metaCid = await pinFile(new TextEncoder().encode(JSON.stringify(metadata, null, 2)), `${debugname}.json`, 'application/json');
    const metadataUri = `${IPFS_GATEWAY}/${metaCid}`;

    cache[debugname] = { imageCid, imageUri, metadataCid: metaCid, metadataUri };
    saveCache();
    console.log(`pinned ${debugname}: img ${imageCid.slice(0, 12)}… meta ${metaCid.slice(0, 12)}…`);
}

// GP
if (!only || only.has('gp')) {
    await pinItem('gp', reg.gp.name, reg.gp.symbol, true);
    reg.gp.imageUri = cache['gp']?.imageUri ?? reg.gp.imageUri;
    reg.gp.uri = cache['gp']?.metadataUri ?? reg.gp.uri;
}

let done = 0;
for (const [debugname, item] of Object.entries(reg.items)) {
    if (only && !only.has(debugname)) continue;
    await pinItem(debugname, item.name, item.symbol, false);
    if (cache[debugname]) {
        item.imageUri = cache[debugname].imageUri;
        item.uri = cache[debugname].metadataUri;
        done++;
    }
    if (done % 50 === 0 && done) { saveRegistry(reg); console.log(`  ${done} items updated in registry`); }
    await new Promise(r => setTimeout(r, 120)); // gentle pacing for Pinata
}

saveRegistry(reg);
console.log(`done: ${done} items + gp uploaded/recorded. Registry URIs updated.`);
process.exit(0);
