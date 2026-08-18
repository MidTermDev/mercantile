// Place a reachable Exchange Clerk (npc 1359) at every bank.
//
// Banks are found by clustering banker NPC spawns across the map files. For each
// bank we pick a WALKABLE tile nearest the bankers (the open floor where players
// stand) so the clerk is talk-reachable — never behind the counter. --apply edits
// the maps; without it, prints the plan for review.
//
//   bun server/content/place-clerks.ts            # dry-run (print plan)
//   bun server/content/place-clerks.ts --apply    # edit the .jm2 NPC sections

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { initPathfinding, isTileWalkable, isZoneLikelyLand } from '../../sdk/pathfinding';

const CLERK = 1359;
const BANKER_IDS = new Set([166, 494, 495, 496, 497, 498, 499, 902, 953, 1036]);
const MAPS = join(import.meta.dir, 'maps');
const APPLY = process.argv.includes('--apply');

initPathfinding();

interface Spawn { level: number; x: number; z: number; }        // world coords
interface MapFile { name: string; mapX: number; mapZ: number; }

// ── parse every map's NPC section for banker + existing clerk spawns ──────────
const files = readdirSync(MAPS).filter(f => /^m\d+_\d+\.jm2$/.test(f));
const bankers: Spawn[] = [];
const existingClerkFiles = new Set<string>();
for (const name of files) {
    const m = name.match(/^m(\d+)_(\d+)\.jm2$/)!;
    const mapX = +m[1], mapZ = +m[2];
    const text = readFileSync(join(MAPS, name), 'utf8');
    let inNpc = false;
    for (const line of text.split('\n')) {
        if (line.trim().startsWith('====')) { inNpc = line.trim() === '==== NPC ===='; continue; }
        if (!inNpc) continue;
        const mm = line.match(/^(\d+)\s+(\d+)\s+(\d+):\s*(\d+)/);
        if (!mm) continue;
        const level = +mm[1], lx = +mm[2], lz = +mm[3], id = +mm[4];
        const x = mapX * 64 + lx, z = mapZ * 64 + lz;
        if (BANKER_IDS.has(id)) bankers.push({ level, x, z });
        if (id === CLERK) existingClerkFiles.add(name);
    }
}

// ── cluster bankers into banks (same bank if within 12 tiles, same level) ─────
const banks: Spawn[][] = [];
for (const b of bankers) {
    const near = banks.find(g => g.some(o => o.level === b.level && Math.abs(o.x - b.x) <= 12 && Math.abs(o.z - b.z) <= 12));
    if (near) near.push(b); else banks.push([b]);
}

// ── for each bank, find the walkable tile nearest the banker centroid ─────────
// Openness = walkable tiles in the surrounding 5x5. Bankers stand on a 1-wide strip
// behind the counter (low openness); the player lobby is a broad walkable area (high
// openness). Pick the most-open reachable tile near the bankers → the lobby, not the
// teller strip — so the clerk is talk-reachable.
function openness(level: number, x: number, z: number): number {
    let n = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
        if (isTileWalkable(level, x + dx, z + dz)) n++;
    return n;
}
function nearestWalkable(level: number, cx: number, cz: number): Spawn | null {
    let best: Spawn | null = null, bestScore = -Infinity;
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
        const x = cx + dx, z = cz + dz;
        if (!isTileWalkable(level, x, z) || !isZoneLikelyLand(level, x, z)) continue;
        const open = openness(level, x, z);
        if (open < 14) continue;                        // require real open floor (≥14/25)
        const dist = Math.abs(dx) + Math.abs(dz);
        const score = open * 10 - dist;                 // most open, then closest
        if (score > bestScore) { bestScore = score; best = { level, x, z }; }
    }
    return best;
}

const plan: { mapX: number; mapZ: number; level: number; lx: number; lz: number; wx: number; wz: number }[] = [];
for (const bank of banks) {
    const cx = Math.round(bank.reduce((s, b) => s + b.x, 0) / bank.length);
    const cz = Math.round(bank.reduce((s, b) => s + b.z, 0) / bank.length);
    const level = bank[0].level;
    const tile = nearestWalkable(level, cx, cz);
    if (!tile) { console.warn(`no walkable tile near bank at ${cx},${cz} (${bank.length} bankers) — SKIP`); continue; }
    const mapX = Math.floor(tile.x / 64), mapZ = Math.floor(tile.z / 64);
    plan.push({ mapX, mapZ, level, lx: tile.x % 64, lz: tile.z % 64, wx: tile.x, wz: tile.z });
}

console.log(`banks=${banks.length}  clerk-tiles=${plan.length}  (existing clerk spawns in: ${[...existingClerkFiles].join(', ') || 'none'})`);
for (const p of plan) console.log(`  m${p.mapX}_${p.mapZ}.jm2  L${p.level} ${p.lx} ${p.lz}  (world ${p.wx},${p.wz})`);

if (!APPLY) { console.log('\n(dry-run — pass --apply to edit maps)'); process.exit(0); }

// ── apply: remove all existing clerk spawns, add the planned ones ─────────────
const byMap = new Map<string, typeof plan>();
for (const p of plan) {
    const key = `m${p.mapX}_${p.mapZ}.jm2`;
    (byMap.get(key) ?? byMap.set(key, []).get(key)!).push(p);
}
// Scan ALL maps: strip every existing clerk spawn (cleans earlier ad-hoc placements),
// then add the planned lobby spawns.
for (const name of files) {
    let text = readFileSync(join(MAPS, name), 'utf8');
    const lines = text.split('\n');
    // drop old clerk spawns
    const out = lines.filter(l => !new RegExp(`^\\d+\\s+\\d+\\s+\\d+:\\s*${CLERK}(\\s|$)`).test(l));
    // insert new clerk spawns right after the ==== NPC ==== header
    const adds = (byMap.get(name) ?? []).map(p => `${p.level} ${p.lx} ${p.lz}: ${CLERK}`);
    const removed = lines.length - out.length;
    if (adds.length) {
        const hdr = out.findIndex(l => l.trim() === '==== NPC ====');
        if (hdr !== -1) out.splice(hdr + 1, 0, ...adds);
    }
    if (adds.length || removed) {
        writeFileSync(join(MAPS, name), out.join('\n'));
        console.log(`edited ${name}: +${adds.length} clerk(s), -${removed} old`);
    }
}
console.log('done. rebuild the content pack + restart the engine.');
