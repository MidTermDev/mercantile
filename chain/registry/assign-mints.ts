// Deterministically assign a vanity RSGP mint keypair (from chain/.keys/rsgp/) to
// GP and every registry item, recording the mint pubkey in registry.json. The
// keypair file for a mint is .keys/rsgp/<pubkey>.json.
//
// Sticky: an existing RSGP assignment is kept; only unassigned items draw from the
// unused key pool (sorted), so adding items later never reshuffles prior mints.
// Non-RSGP mints (old M1/M2 Token-2022 mints) are treated as unassigned and
// replaced — this revision recreates genesis under the on-chain program.
// Also clears pool/position (pools are recreated with the new mints).
//
//   bun registry/assign-mints.ts [--reset]   (--reset drops ALL assignments first)

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RegistryFile } from './schema';

const CHAIN_ROOT = join(import.meta.dir, '..');
const REGISTRY = join(CHAIN_ROOT, 'registry', 'registry.json');
const RSGP_DIR = join(CHAIN_ROOT, '.keys', 'rsgp');
const BURNED = join(CHAIN_ROOT, 'registry', 'burned-mints.txt');

const reset = process.argv.includes('--reset');

const reg: RegistryFile = JSON.parse(readFileSync(REGISTRY, 'utf8'));

// Burned = mint addresses already used on-chain that must never be assigned again
// (e.g. abandoned 0-decimal mints). An item currently holding a burned mint is
// forced to get a fresh key.
import { existsSync } from 'node:fs';
const burned = new Set<string>(existsSync(BURNED)
    ? readFileSync(BURNED, 'utf8').split(/\s+/).map(s => s.trim()).filter(Boolean)
    : []);

// Available vanity keys (pubkey == filename stem, all end RSGP), excluding burned.
const vanity = readdirSync(RSGP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5))
    .filter(k => !burned.has(k))
    .sort();
const isVanity = (mint: string | null | undefined): boolean => !!mint && !burned.has(mint) && mint.endsWith('RSGP') && vanity.includes(mint);

// Keys already stuck to a debugname (kept across runs).
const onlyFileArgEarly = process.argv.indexOf('--only-file');
const onlySet = onlyFileArgEarly !== -1
    ? new Set(readFileSync(process.argv[onlyFileArgEarly + 1], 'utf8').split(/\s+/).map(s => s.trim()).filter(Boolean))
    : null;

const used = new Set<string>();
if (!reset) {
    if (isVanity(reg.gp.mint)) used.add(reg.gp.mint!);
    for (const item of Object.values(reg.items)) if (isVanity(item.mint)) used.add(item.mint!);
}
const pool = vanity.filter(k => !used.has(k)); // truly-unassigned keys
let poolIdx = 0;

// When --only-file is set and the spare pool runs dry, reclaim keys from items
// OUTSIDE the only-set that are NOT created on-chain (pool == null) — null their
// mint so they get reassigned in a later (post-grind) pass. Never touches created
// pools or burned mints.
const reclaimable: string[] = [];
if (onlySet && !reset) {
    for (const [d, item] of Object.entries(reg.items)) {
        if (onlySet.has(d)) continue;
        if (item.pool == null && isVanity(item.mint)) reclaimable.push(d);
    }
}
let reclaimIdx = 0;
const nextKey = (): string => {
    if (poolIdx < pool.length) return pool[poolIdx++];
    if (reclaimIdx < reclaimable.length) {
        const d = reclaimable[reclaimIdx++];
        const key = reg.items[d].mint!;
        reg.items[d].mint = null; // released; reassign later
        return key;
    }
    throw new Error(`out of vanity keys: need more than ${vanity.length} (grind more RSGP keypairs)`);
};

let assigned = 0;
let kept = 0;

// GP first (deterministic: gp always takes the lowest unused key on first assign).
if (reset || !isVanity(reg.gp.mint)) {
    reg.gp.mint = nextKey();
    reg.gp.vaultAta = null;
    reg.gp.treasuryAta = null;
    assigned++;
} else kept++;

// Optionally restrict (re)assignment to a subset of debugnames (--only-file),
// leaving others untouched. Lets the pilot proceed without grinding keys for all
// 1,374 (only the pilot set needs fresh non-burned keys right now).
const onlyFileArg = process.argv.indexOf('--only-file');
const only = onlyFileArg !== -1
    ? new Set(readFileSync(process.argv[onlyFileArg + 1], 'utf8').split(/\s+/).map(s => s.trim()).filter(Boolean))
    : null;

// Items in sorted debugname order for determinism.
for (const debugname of Object.keys(reg.items).sort()) {
    if (only && !only.has(debugname)) continue;
    const item = reg.items[debugname];
    if (reset || !isVanity(item.mint)) {
        item.mint = nextKey();
        item.pool = null;
        item.position = null;
        assigned++;
    } else {
        kept++;
    }
}

writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
console.log(`vanity mints: ${assigned} newly assigned, ${kept} kept; ${pool.length - poolIdx} keys left in pool (${vanity.length} total)`);
console.log(`gp mint: ${reg.gp.mint}`);
// sanity: every ASSIGNED mint ends RSGP and has a keypair (null = intentionally
// unassigned, e.g. keys released for the pilot; those get keys in a later pass).
let bad = 0, unassigned = 0;
const check = (m: string | null) => {
    if (m == null) { unassigned++; return; }
    if (!m.endsWith('RSGP') || !vanity.includes(m)) bad++;
};
check(reg.gp.mint);
for (const item of Object.values(reg.items)) check(item.mint);
if (bad) { console.error(`FATAL: ${bad} assigned mints not backed by an RSGP keypair`); process.exit(1); }
console.log(`assigned mints all end RSGP ✓  (${unassigned} items currently unassigned — grind more keys + rerun for the full rollout)`);
