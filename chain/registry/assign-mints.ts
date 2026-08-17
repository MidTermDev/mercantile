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

const reset = process.argv.includes('--reset');

const reg: RegistryFile = JSON.parse(readFileSync(REGISTRY, 'utf8'));

// Available vanity keys (pubkey == filename stem, all end RSGP).
const vanity = readdirSync(RSGP_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5))
    .sort();
const isVanity = (mint: string | null | undefined): boolean => !!mint && mint.endsWith('RSGP') && vanity.includes(mint);

// Keys already stuck to a debugname (kept across runs).
const used = new Set<string>();
if (!reset) {
    if (isVanity(reg.gp.mint)) used.add(reg.gp.mint!);
    for (const item of Object.values(reg.items)) if (isVanity(item.mint)) used.add(item.mint!);
}
const pool = vanity.filter(k => !used.has(k));
let poolIdx = 0;
const nextKey = (): string => {
    if (poolIdx >= pool.length) throw new Error(`out of vanity keys: need more than ${vanity.length}`);
    return pool[poolIdx++];
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

// Items in sorted debugname order for determinism.
for (const debugname of Object.keys(reg.items).sort()) {
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
// sanity: every assigned mint ends RSGP and has a keypair file
let bad = 0;
const check = (m: string | null) => { if (!m || !m.endsWith('RSGP') || !vanity.includes(m)) bad++; };
check(reg.gp.mint);
for (const item of Object.values(reg.items)) check(item.mint);
if (bad) { console.error(`FATAL: ${bad} mints not backed by an RSGP keypair`); process.exit(1); }
console.log(`all ${1 + Object.keys(reg.items).length} mints end in RSGP and have keypairs ✓`);
