// Builds registry.json from the game's item configs.
// Usage: bun registry/build-registry.ts [--pilot] [--diff]
//   --pilot  restrict to the hand-picked pilot set (~20 items across price tiers)
//   --diff   compare freshly parsed data against the committed registry and report drift
//            (pool P0 is frozen at creation; cost edits after that do NOT reprice pools)

import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { lowalch, p0String, validateRegistry, type RegistryFile, type RegistryItem } from './schema';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const CONTENT_SCRIPTS = join(REPO_ROOT, 'server', 'content', 'scripts');
const OBJ_PACK = join(REPO_ROOT, 'server', 'content', 'pack', 'obj.pack');
const OUT_PATH = join(import.meta.dir, 'registry.json');

const ENGINE_WEB_URL = process.env.ENGINE_WEB_URL ?? 'http://localhost:8888';
const DAMM_V2_PROGRAM_ID = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';

// Never tokenized regardless of config flags.
const HARD_EXCLUDE = new Set([
    'coins', // GP is its own token with its own mint
    'template_for_cert',
]);

// Pilot set: mix of price tiers, stackables, equipment, and lowalch=1 floor cases.
const PILOT = [
    'lobster',
    'raw_lobster',
    'swordfish',
    'coal',
    'iron_ore',
    'gold_ore',
    'iron_bar',
    'steel_bar',
    'logs',
    'oak_logs',
    'yew_logs',
    'naturerune',
    'lawrune',
    'firerune',
    'bronze_sword',
    'rune_sword',
    'rune_scimitar',
    'rune_platebody',
    'leather_boots', // low-value gear
    'pot_empty', // lowalch=1 floor case
];

interface ParsedItem {
    debugname: string;
    name: string;
    desc: string;
    cost: number;
    costExplicit: boolean;
    tradeable: boolean;
    dummyitem: boolean;
    stackable: boolean;
    members: boolean;
    sourcePath: string;
}

function isConfigFalse(v: string): boolean {
    return v === 'no' || v === 'false' || v === '0';
}

function parseObjFile(content: string, sourcePath: string): ParsedItem[] {
    const items: ParsedItem[] = [];
    let cur: ParsedItem | null = null;
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('//')) continue;
        const section = line.match(/^\[([^\]]+)\]$/);
        if (section) {
            if (cur) items.push(cur);
            cur = {
                debugname: section[1],
                name: '',
                desc: '',
                cost: 1, // engine default when cost= is absent (ObjType.ts)
                costExplicit: false,
                tradeable: true, // default true; only ever negated
                dummyitem: false,
                stackable: false,
                members: false,
                sourcePath,
            };
            continue;
        }
        if (!cur || !line) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        switch (key) {
            case 'name': cur.name = value; break;
            case 'desc': cur.desc = value; break;
            case 'cost': {
                const n = parseInt(value, 10);
                if (!Number.isNaN(n)) { cur.cost = n; cur.costExplicit = true; }
                break;
            }
            case 'tradeable': cur.tradeable = !isConfigFalse(value); break;
            case 'dummyitem': cur.dummyitem = value !== '' && value !== '0'; break;
            case 'stackable': cur.stackable = !isConfigFalse(value) && value !== ''; break;
            case 'members': cur.members = !isConfigFalse(value) && value !== ''; break;
        }
    }
    if (cur) items.push(cur);
    return items;
}

function findObjFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findObjFiles(full));
        else if (entry.name.endsWith('.obj')) results.push(full);
    }
    return results;
}

function prettify(debugname: string): string {
    return debugname.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function deriveSymbols(debugnames: string[]): Map<string, string> {
    // Deterministic: sorted iteration, uppercase alnum, truncate to 10, numeric suffix on collision.
    const out = new Map<string, string>();
    const taken = new Set<string>(['GP']);
    for (const d of [...debugnames].sort()) {
        const base = d.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'ITEM';
        let sym = base;
        let n = 2;
        while (taken.has(sym)) {
            const suffix = String(n++);
            sym = base.slice(0, 10 - suffix.length) + suffix;
        }
        taken.add(sym);
        out.set(d, sym);
    }
    return out;
}

// ── main ─────────────────────────────────────────────────────────────────────

const pilotMode = process.argv.includes('--pilot');
const diffMode = process.argv.includes('--diff');

// 1. obj.pack: id=debugname
const packLines = readFileSync(OBJ_PACK, 'utf8').split('\n').filter(l => l.includes('='));
const idByName = new Map<string, number>();
for (const line of packLines) {
    const eq = line.indexOf('=');
    idByName.set(line.slice(eq + 1).trim(), parseInt(line.slice(0, eq), 10));
}

// 2. Parse every .obj file
const objFiles = findObjFiles(CONTENT_SCRIPTS);
const all = new Map<string, ParsedItem>();
let authoredBlocks = 0;
for (const file of objFiles) {
    for (const item of parseObjFile(readFileSync(file, 'utf8'), relative(REPO_ROOT, file))) {
        authoredBlocks++;
        if (all.has(item.debugname)) {
            console.error(`FATAL: duplicate item block [${item.debugname}] in ${item.sourcePath} (already in ${all.get(item.debugname)!.sourcePath})`);
            process.exit(1);
        }
        all.set(item.debugname, item);
    }
}

// 3. Tradeable filter (dummyitem forces non-tradeable at engine load; NODE_MEMBERS=true so members items stay)
const tradeable = [...all.values()].filter(i => i.tradeable && !i.dummyitem && !HARD_EXCLUDE.has(i.debugname));

// 4. Sanity gates — guard against parser regressions after content updates
if (all.size !== authoredBlocks) throw new Error('block count mismatch');
const EXPECTED_TRADEABLE = 1374; // 1375 tradeable base items minus coins
if (!pilotMode && tradeable.length !== EXPECTED_TRADEABLE) {
    console.error(`FATAL: expected ${EXPECTED_TRADEABLE} tradeable items, parsed ${tradeable.length}. ` +
        'Content changed or parser regressed — investigate before rebuilding the registry.');
    process.exit(1);
}
for (const item of tradeable) {
    if (!idByName.has(item.debugname)) {
        console.error(`FATAL: ${item.debugname} not in obj.pack`);
        process.exit(1);
    }
}

// 5. Select set
let selected = tradeable;
if (pilotMode) {
    const missing = PILOT.filter(p => !tradeable.some(t => t.debugname === p));
    if (missing.length) {
        console.error(`FATAL: pilot items not found/tradeable: ${missing.join(', ')}`);
        process.exit(1);
    }
    selected = tradeable.filter(t => PILOT.includes(t.debugname));
}

// 6. Build registry entries
const symbols = deriveSymbols(selected.map(s => s.debugname));
const items: Record<string, RegistryItem> = {};
let lowalch1Count = 0;
for (const item of [...selected].sort((a, b) => a.debugname.localeCompare(b.debugname))) {
    const la = lowalch(item.cost);
    const flags: string[] = [];
    if (la === 1) { flags.push('lowalch1'); lowalch1Count++; }
    if (!item.costExplicit) flags.push('defaultcost');
    const certId = idByName.get(`cert_${item.debugname}`);
    items[item.debugname] = {
        objId: idByName.get(item.debugname)!,
        certObjId: certId ?? null,
        name: item.name || prettify(item.debugname),
        desc: item.desc,
        cost: item.cost,
        lowalch: la,
        p0GpPerItem: Number(p0String(la)),
        symbol: symbols.get(item.debugname)!,
        uri: `${ENGINE_WEB_URL}/bridge/token/${item.debugname}.json`,
        stackable: item.stackable,
        members: item.members,
        mint: null,
        pool: null,
        position: null,
        flags,
    };
}

// 7. Preserve on-chain addresses from an existing registry (runner writes them back)
let prev: RegistryFile | null = null;
if (existsSync(OUT_PATH)) prev = JSON.parse(readFileSync(OUT_PATH, 'utf8'));

if (diffMode) {
    if (!prev) { console.error('no existing registry.json to diff against'); process.exit(1); }
    let drift = 0;
    for (const [d, item] of Object.entries(items)) {
        const old = prev.items[d];
        if (!old) { console.log(`NEW      ${d}`); drift++; continue; }
        if (old.cost !== item.cost) {
            console.log(`REPRICED ${d}: cost ${old.cost} -> ${item.cost} (pool P0 stays frozen at ${old.p0GpPerItem} GP)`);
            drift++;
        }
    }
    for (const d of Object.keys(prev.items)) if (!items[d]) { console.log(`REMOVED  ${d}`); drift++; }
    console.log(drift ? `${drift} drifted entries` : 'no drift');
    process.exit(0);
}

if (prev) {
    for (const [d, item] of Object.entries(items)) {
        const old = prev.items[d];
        if (old?.mint) {
            item.mint = old.mint;
            item.pool = old.pool;
            item.position = old.position;
            // Frozen at pool creation — keep the values the pool was actually created with.
            // (p0 recomputed exactly from the frozen lowalch: pools are priced from
            // lowalch via p0String, so any float artifact in an old stored p0 is display-only.)
            item.cost = old.cost;
            item.lowalch = old.lowalch;
            item.p0GpPerItem = Number(p0String(old.lowalch));
            item.symbol = old.symbol;
        }
    }
}

const registry: RegistryFile = {
    version: 1,
    network: 'devnet',
    programId: DAMM_V2_PROGRAM_ID,
    generatedAt: new Date().toISOString(),
    stats: {
        totalObjIds: idByName.size,
        authoredBlocks,
        tradeableBase: tradeable.length,
        excluded: [...HARD_EXCLUDE],
        lowalch1Count,
    },
    gp: prev?.gp ?? {
        mint: null,
        decimals: 6,
        symbol: 'GP',
        name: 'Gielinor GP',
        totalSupply: '10000000000',
        vaultAta: null,
        treasuryAta: null,
        vaultSupply: '1000000000',
    },
    items,
};

const errors = validateRegistry(registry);
if (errors.length) {
    console.error('FATAL: registry validation failed:');
    for (const e of errors) console.error('  ' + e);
    process.exit(1);
}

writeFileSync(OUT_PATH, JSON.stringify(registry, null, 2) + '\n');
console.log(`registry.json written: ${Object.keys(items).length} items${pilotMode ? ' (pilot)' : ''}`);
console.log(`  obj ids in pack:   ${idByName.size}`);
console.log(`  authored blocks:   ${authoredBlocks}`);
console.log(`  tradeable base:    ${tradeable.length} (excluded: ${[...HARD_EXCLUDE].join(', ')})`);
console.log(`  lowalch=1 flagged: ${lowalch1Count}`);
